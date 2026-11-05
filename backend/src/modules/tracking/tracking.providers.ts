import type { GPSProviderConfiguration } from "@prisma/client";
import { observation, type Observation } from "./tracking.validators";
import { ApiError } from "../../utils/ApiError";
/** Provider adapters normalize third-party wire payloads; all downstream logic consumes Observation. */
export interface GPSProviderAdapter {
  normalize(payload: unknown): Observation[];
  pull?(provider: GPSProviderConfiguration): Promise<Observation[]>;
}
const generic: GPSProviderAdapter = {
  normalize(payload) {
    const values = Array.isArray(payload) ? payload : [payload];
    if (!values.length || values.length > 100)
      throw ApiError.badRequest("GPS batch requires 1–100 observations");
    return values.map((value) => {
      const r = observation.safeParse(value);
      if (!r.success)
        throw ApiError.unprocessable("Invalid GPS observation", r.error.issues);
      return r.data;
    });
  },
  async pull(provider) {
    const endpoint = provider.apiUrlEnv
      ? process.env[provider.apiUrlEnv]
      : undefined;
    const token = provider.apiTokenEnv
      ? process.env[provider.apiTokenEnv]
      : undefined;
    if (!endpoint || !token)
      throw ApiError.badRequest(
        "Provider API environment credentials are not configured",
      );
    const url = new URL(endpoint);
    if (url.protocol !== "https:")
      throw ApiError.badRequest("Provider API requires HTTPS");
    const allowed = (process.env.GPS_API_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!allowed.includes(url.hostname))
      throw ApiError.badRequest(
        "Provider API hostname is not in the server allowlist",
      );
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("PROVIDER_HTTP_" + response.status);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("EMPTY_PROVIDER_BODY");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const out = await reader.read();
      if (out.done) break;
      size += out.value.length;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
      }
      chunks.push(out.value);
    }
    return generic.normalize(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  },
};
export function providerAdapter(name: string): GPSProviderAdapter {
  if (["SIMULATION", "GENERIC_WEBHOOK", "GENERIC_API"].includes(name))
    return generic;
  throw ApiError.badRequest("Provider adapter is not installed");
}
export function providerPublic(p: GPSProviderConfiguration, admin = false) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    mode: p.mode,
    adapter: p.adapter,
    isActive: p.isActive,
    lastErrorAt: p.lastErrorAt,
    lastErrorCode: p.lastErrorCode,
    credentialsConfigured:
      (p.mode === "SIMULATED" && p.adapter === "SIMULATION") ||
      Boolean(
        p.adapter === "GENERIC_API"
          ? p.apiUrlEnv &&
              p.apiTokenEnv &&
              process.env[p.apiUrlEnv] &&
              process.env[p.apiTokenEnv]
          : p.webhookSecretEnv && process.env[p.webhookSecretEnv],
      ),
    ...(admin
      ? {
          webhookSecretEnv: p.webhookSecretEnv,
          apiUrlEnv: p.apiUrlEnv,
          apiTokenEnv: p.apiTokenEnv,
        }
      : {}),
  };
}
