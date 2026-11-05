import type { AuthenticatedUser } from './auth';

/**
 * Augment Express' Request with the authenticated principal. Populated by the
 * `authenticate` middleware; undefined on public routes.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
