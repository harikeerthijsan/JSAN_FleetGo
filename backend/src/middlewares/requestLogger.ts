import morgan from 'morgan';
import { config } from '../config';
import { logger } from '../utils/logger';

// Reset links and signed parameters must not enter access logs.
morgan.token('safe-path',req=>req.url?.split('?')[0]??'/');

/**
 * HTTP request logging. Uses a concise, colorless format in production and the
 * more verbose `dev` format locally. All output is piped through the central
 * logger's `http` level so request logs share the same formatting/transport
 * as the rest of the application.
 */
export const requestLogger = morgan(
  config.app.isProduction
    ? ':remote-addr :method :safe-path :status :res[content-length] - :response-time ms'
    : ':method :url :status :response-time ms - :res[content-length]',
  { stream: logger.stream },
);
