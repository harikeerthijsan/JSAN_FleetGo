import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';

/**
 * Access-token (JWT) helpers. Access tokens are short-lived and carry only the
 * subject (user id) plus a token type marker. Authorization data (role,
 * permissions, organization) is loaded fresh from the database on each request
 * so that deactivations and permission changes take effect immediately.
 */
export interface AccessTokenPayload {
  sub: string;
  type: 'access';
}

export const accessToken = {
  sign(userId: string): string {
    const options: SignOptions = {
      expiresIn: config.auth.accessExpiresIn as SignOptions['expiresIn'],
    };
    return jwt.sign({ type: 'access' }, config.auth.accessSecret, {
      subject: userId,
      ...options,
    });
  },

  verify(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, config.auth.accessSecret);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      (decoded as { type?: unknown }).type !== 'access'
    ) {
      throw new Error('Invalid access token');
    }
    return decoded as AccessTokenPayload;
  },
};
