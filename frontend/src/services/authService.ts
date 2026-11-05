import type { ApiSuccess } from '@/types/api';
import type { AuthUser } from '@/types/auth';
import { apiClient } from './apiClient';
import { tokenStore } from './tokenStore';

interface SessionPayload {
  accessToken: string;
  user: AuthUser;
}

/**
 * Authentication API. Access tokens returned by login/refresh/change-password
 * are stored in memory via tokenStore; refresh tokens are handled by the
 * backend through an httpOnly cookie.
 */
export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const res = await apiClient.post<ApiSuccess<SessionPayload>>(
      '/auth/login',
      { email, password },
    );
    tokenStore.set(res.data.data.accessToken);
    return res.data.data.user;
  },

  /** Silent re-authentication using the refresh cookie (used on app load). */
  async bootstrap(): Promise<AuthUser | null> {
    try {
      const res = await apiClient.post<ApiSuccess<SessionPayload>>(
        '/auth/refresh',
      );
      tokenStore.set(res.data.data.accessToken);
      return res.data.data.user;
    } catch {
      tokenStore.clear();
      return null;
    }
  },

  async me(): Promise<AuthUser> {
    const res = await apiClient.get<ApiSuccess<{ user: AuthUser }>>('/auth/me');
    return res.data.data.user;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      tokenStore.clear();
    }
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const res = await apiClient.post<ApiSuccess<{ accessToken: string }>>(
      '/auth/change-password',
      { currentPassword, newPassword },
    );
    tokenStore.set(res.data.data.accessToken);
  },

  async forgotPassword(email: string): Promise<{ devToken?: string }> {
    const res = await apiClient.post<ApiSuccess<{ devToken?: string }>>(
      '/auth/forgot-password',
      { email },
    );
    return res.data.data;
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/reset-password', { token, newPassword });
  },
};
