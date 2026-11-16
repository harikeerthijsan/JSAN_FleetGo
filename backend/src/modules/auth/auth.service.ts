import { config } from '../../config';
import { prisma } from '../../database/prisma';
import { loadAuthenticatedUser } from '../../middlewares/auth';
import type { AuthenticatedUser } from '../../types/auth';
import { ApiError } from '../../utils/ApiError';
import { writeAudit } from '../../utils/audit';
import { accessToken } from '../../utils/jwt';
import { password } from '../../utils/password';
import {
  durationToMs,
  expiresInMs,
  generateOpaqueToken,
  hashToken,
} from '../../utils/tokens';
import type {
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
} from './auth.validators';

interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthTokens {
  accessToken: string;
  /** Raw refresh token — delivered to the client via httpOnly cookie only. */
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthenticatedUser;
}

const REFRESH_TTL_MS = durationToMs(config.auth.refreshExpiresIn);

/** Issue a new refresh-token session row and return the raw token. */
async function issueRefreshToken(
  userId: string,
  ctx: ClientContext,
): Promise<string> {
  const raw = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: expiresInMs(REFRESH_TTL_MS),
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    },
  });
  return raw;
}

export const authService = {
  async login(input: LoginInput, ctx: ClientContext): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    // Uniform failure handling to avoid user enumeration / timing hints.
    const invalid = () => ApiError.unauthorized('Invalid email or password');

    if (!user) {
      await writeAudit({
        action: 'LOGIN_FAILED',
        metadata: { email: input.email, reason: 'user_not_found' },
        ...ctx,
      });
      // Perform an equivalent-cost hash to equalize response timing and avoid
      // revealing (via latency) whether the email exists.
      await password.hash(input.password);
      throw invalid();
    }

    const passwordOk = await password.verify(input.password, user.passwordHash);
    if (!passwordOk) {
      await writeAudit({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        metadata: { reason: 'bad_password' },
        ...ctx,
      });
      throw invalid();
    }

    if (user.status !== 'ACTIVE') {
      await writeAudit({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        metadata: { reason: 'inactive_account' },
        ...ctx,
      });
      throw ApiError.forbidden('Your account is not active');
    }

    const refreshToken = await issueRefreshToken(user.id, ctx);
    const token = accessToken.sign(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await writeAudit({ actorId: user.id, action: 'LOGIN_SUCCESS', ...ctx });

    const authUser = await loadAuthenticatedUser(user.id);
    if (!authUser) throw ApiError.internal('Failed to load user profile');

    return { accessToken: token, refreshToken, user: authUser };
  },

  async refresh(rawToken: string | undefined, ctx: ClientContext): Promise<LoginResult> {
    if (!rawToken) throw ApiError.unauthorized('No active session');

    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw ApiError.unauthorized('Session expired. Please sign in again.');
    }

    const authUser = await loadAuthenticatedUser(existing.userId);
    if (!authUser) throw ApiError.unauthorized('Account is inactive');

    // Rotate: revoke the used token and issue a fresh one.
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const refreshToken = await issueRefreshToken(existing.userId, ctx);
    const token = accessToken.sign(existing.userId);

    return { accessToken: token, refreshToken, user: authUser };
  },

  async logout(
    rawToken: string | undefined,
    ctx: ClientContext,
  ): Promise<void> {
    let actorId: string | null = null;
    if (rawToken) {
      const record = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
        select: { userId: true },
      });
      actorId = record?.userId ?? null;
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await writeAudit({ actorId, action: 'LOGOUT', ...ctx });
  },

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    ctx: ClientContext,
  ): Promise<AuthTokens> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.unauthorized('Account not found');

    const ok = await password.verify(input.currentPassword, user.passwordHash);
    if (!ok) throw ApiError.badRequest('Current password is incorrect');

    const newHash = await password.hash(input.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all existing sessions, then issue a fresh one for this device so
    // the current session continues but every other device is signed out.
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const refreshToken = await issueRefreshToken(userId, ctx);
    const token = accessToken.sign(userId);

    await writeAudit({ actorId: userId, action: 'PASSWORD_CHANGED', ...ctx });

    return { accessToken: token, refreshToken };
  },

  /**
   * Begins a password reset. Always resolves (never reveals whether the email
   * exists). In non-production environments the raw token is returned so the
   * flow can be tested without an email provider.
   */
  async forgotPassword(
    email: string,
    ctx: ClientContext,
  ): Promise<{ devToken?: string }> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.status === 'ACTIVE') {
      const raw = generateOpaqueToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: expiresInMs(config.auth.passwordResetTtlMin * 60_000),
        },
      });
      await writeAudit({
        actorId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        ...ctx,
      });
      // A real email would be sent here by a Notifications module in a later
      // phase. For development we surface the token to the caller.
      if (!config.app.isProduction) return { devToken: raw };
    }

    return {};
  },

  async resetPassword(
    input: ResetPasswordInput,
    ctx: ClientContext,
  ): Promise<void> {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw ApiError.badRequest('Invalid or expired reset token');
    }

    const newHash = await password.hash(input.newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: newHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate every active session after a reset.
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await writeAudit({
      actorId: record.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      ...ctx,
    });
  },
};
