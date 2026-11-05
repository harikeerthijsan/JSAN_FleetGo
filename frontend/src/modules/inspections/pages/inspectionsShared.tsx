import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, ErrorState, Spinner, StatusBadge } from "@/components";
import type { BadgeTone } from "@/components";
import { inspectionsApi as api } from "@/services/inspectionsService";

export const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString() : "Not recorded";

export const human = (s: string | null | undefined) =>
  s
    ? s
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (v) => v.toUpperCase())
    : "—";

export const errText = (e: unknown) =>
  (e as { message?: string })?.message ?? "Request failed. Please try again.";

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  COMPLETED: "success",
  REPORTED: "warning",
  CONFIRMED: "danger",
  DISPUTED: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};
export function StatusTag({ status }: { status: string }) {
  return (
    <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>
      {human(status)}
    </StatusBadge>
  );
}

const SEVERITY_TONE: Record<string, BadgeTone> = {
  MINOR: "neutral",
  MODERATE: "info",
  MAJOR: "warning",
  CRITICAL: "danger",
};
export function SeverityTag({ severity }: { severity: string }) {
  return (
    <StatusBadge tone={SEVERITY_TONE[severity] ?? "neutral"}>
      {human(severity)}
    </StatusBadge>
  );
}

export function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? (
        <p role="alert" className="fg-insp__error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="fg-insp__ok">
          {success}
        </p>
      ) : null}
    </>
  );
}

/** Authenticated image: inspection photos are only served via authorized
 * download endpoints, so we fetch a blob and render an object URL. */
export function AuthedImage({
  path,
  alt,
  onClick,
}: {
  path: string;
  alt: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string>("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let created = "";
    setFailed(false);
    api
      .blobUrl(path)
      .then((u) => {
        if (active) {
          created = u;
          setUrl(u);
        } else URL.revokeObjectURL(u);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);
  if (failed)
    return <div className="fg-insp__thumb fg-insp__thumb--err">Unavailable</div>;
  if (!url) return <div className="fg-insp__thumb fg-insp__thumb--load" />;
  return (
    <img
      className="fg-insp__thumb"
      src={url}
      alt={alt}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    />
  );
}

export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const gen = useRef(0);
  const load = useCallback(async () => {
    const req = ++gen.current;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const d = await api.get<T>(path);
      if (req === gen.current) setData(d);
    } catch (e) {
      if (req === gen.current) setError(errText(e));
    } finally {
      if (req === gen.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
    return () => {
      gen.current++;
    };
  }, [load]);
  return { data, error, loading, load, setData };
}

export function Boundary({
  loading,
  error,
  data,
  load,
  children,
}: {
  loading: boolean;
  error: string;
  data: unknown;
  load: () => void;
  children: ReactNode;
}) {
  if (loading && !data) return <Spinner block label="Loading…" />;
  if (error && !data)
    return (
      <ErrorState
        title="Could not load"
        description={error}
        action={<Button onClick={load}>Retry</Button>}
      />
    );
  return <>{children}</>;
}

export const INSPECTION_TYPES: { value: string; label: string }[] = [
  { value: "INITIAL_RECEIPT", label: "Initial CTS receipt" },
  { value: "PRE_DISPATCH", label: "Pre-dispatch" },
  { value: "RECEIVING", label: "Receiving" },
  { value: "RETURN", label: "Return" },
];

export const PHOTO_CATEGORIES = [
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
  "INTERIOR",
  "DASHBOARD",
  "ODOMETER",
  "TYRES",
  "GLASS",
  "LIGHTS",
  "ACCESSORIES",
  "KEYS_DOCUMENTS",
  "EXISTING_DAMAGE",
  "OTHER",
];

export const DISCREPANCY_CATEGORIES = [
  "NEW_SCRATCH",
  "DENT",
  "BROKEN_GLASS",
  "TYRE_DAMAGE",
  "MISSING_ACCESSORY",
  "MISSING_DOCUMENT",
  "INTERIOR_DAMAGE",
  "MECHANICAL_ISSUE",
  "ODOMETER_DISCREPANCY",
  "OTHER",
];
export const SEVERITIES = ["MINOR", "MODERATE", "MAJOR", "CRITICAL"];
export const RECEIVING_OUTCOMES = [
  "FULL",
  "WITH_DISCREPANCIES",
  "DAMAGED",
  "PARTIAL",
  "REJECTED",
];
