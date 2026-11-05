import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiErrorBody } from '@/types/api';
import { tokenStore } from './tokenStore';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/**
 * Shared Axios instance.
 * - `withCredentials` so the httpOnly refresh cookie is sent to /auth routes.
 * - A request interceptor attaches the in-memory access token.
 * - A response interceptor transparently refreshes the access token once on a
 *   401 and retries the original request (single-flight to avoid stampedes).
 */
export const apiClient = axios.create({
  baseURL,
  timeout: 15_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// A bare client used ONLY for the refresh call, so it bypasses the
// interceptors below and cannot cause a refresh→401→refresh loop.
const refreshClient = axios.create({ baseURL, withCredentials: true });

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface NormalizedApiError {
  status: number;
  message: string;
  details?: unknown;
}

function normalize(error: AxiosError<ApiErrorBody>): NormalizedApiError {
  return {
    status: error.response?.status ?? 0,
    message:
      error.response?.data?.error?.message ??
      error.message ??
      'Network error. Please check your connection and try again.',
    details: error.response?.data?.error?.details,
  };
}

/** Called when a refresh succeeds/fails so AuthContext can react. */
type AuthListener = (event: 'refreshed' | 'logout', token?: string) => void;
let authListener: AuthListener | null = null;
export function setAuthListener(fn: AuthListener | null): void {
  authListener = fn;
}

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/auth/refresh')
      .then((res) => {
        const token = res.data?.data?.accessToken as string | undefined;
        tokenStore.set(token ?? null);
        if (token) authListener?.('refreshed', token);
        return token ?? null;
      })
      .catch(() => {
        tokenStore.clear();
        authListener?.('logout');
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retry?: boolean; url?: string })
      | undefined;

    const isAuthEndpoint =
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh');

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthEndpoint
    ) {
      original._retry = true;
      const newToken = await doRefresh();
      if (newToken) {
        original.headers = {
          ...original.headers,
          Authorization: `Bearer ${newToken}`,
        };
        return apiClient(original);
      }
    }

    return Promise.reject(normalize(error));
  },
);
