import type { CookieOptions, Request, Response } from 'express';
import { config } from '../../config';
import { ApiError } from '../../utils/ApiError';
import { ApiResponse } from '../../utils/ApiResponse';
import { requestContext } from '../../utils/audit';
import { asyncHandler } from '../../utils/asyncHandler';
import { durationToMs } from '../../utils/tokens';
import { authService } from './auth.service';

const REFRESH_COOKIE = config.auth.cookie.name;
const REFRESH_PATH = `${config.app.apiPrefix}/auth`;

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.auth.cookie.secure,
    sameSite: config.auth.cookie.sameSite,
    path: REFRESH_PATH,
    maxAge: durationToMs(config.auth.refreshExpiresIn),
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

export const authController = {
  // POST /auth/login
  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body, requestContext(req));
    setRefreshCookie(res, result.refreshToken);
    ApiResponse.success(
      res,
      { accessToken: result.accessToken, user: result.user },
      'Signed in successfully',
    );
  }),

  // POST /auth/refresh
  refresh: asyncHandler(async (req: Request, res: Response) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await authService.refresh(raw, requestContext(req));
    setRefreshCookie(res, result.refreshToken);
    ApiResponse.success(
      res,
      { accessToken: result.accessToken, user: result.user },
      'Session refreshed',
    );
  }),

  // POST /auth/logout
  logout: asyncHandler(async (req: Request, res: Response) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await authService.logout(raw, requestContext(req));
    clearRefreshCookie(res);
    ApiResponse.success(res, null, 'Signed out successfully');
  }),

  // GET /auth/me
  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    ApiResponse.success(res, { user: req.user }, 'Current user');
  }),

  // POST /auth/change-password
  changePassword: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const tokens = await authService.changePassword(
      req.user.id,
      req.body,
      requestContext(req),
    );
    setRefreshCookie(res, tokens.refreshToken);
    ApiResponse.success(
      res,
      { accessToken: tokens.accessToken },
      'Password changed successfully',
    );
  }),

  // POST /auth/forgot-password
  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.forgotPassword(
      req.body.email,
      requestContext(req),
    );
    ApiResponse.success(
      res,
      // devToken is only present in non-production for testing.
      result,
      'If an account exists for that email, reset instructions have been issued.',
    );
  }),

  // POST /auth/reset-password
  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.resetPassword(req.body, requestContext(req));
    ApiResponse.success(
      res,
      null,
      'Password has been reset. You can now sign in with your new password.',
    );
  }),
};
