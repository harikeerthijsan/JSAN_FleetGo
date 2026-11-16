import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFound, requestLogger } from './middlewares';
import { apiV1Router } from './routes';
import { ApiResponse } from './utils/ApiResponse';

/**
 * Builds and configures the Express application. Kept separate from the HTTP
 * server bootstrap (`server.ts`) so it can be imported directly by tests.
 */
export function createApp(): Application {
  const app = express();

  // --- Security & parsing -------------------------------------------------
  app.set('trust proxy', 1);
  // CSP is disabled because this service also serves the built SPA (hashed
  // assets, web workers and external map tiles); the default policy would block
  // them. Other helmet protections stay on.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.cors.origins.length > 0 ? config.cors.origins : true,
      credentials: true,
    }),
  );
  app.use(`${config.app.apiPrefix}/inventory/import`, express.json({ limit: '5mb' }));
  app.use(`${config.app.apiPrefix}/tracking/webhooks`, express.raw({type:'application/json',limit:'256kb'}));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(compression());

  // --- Observability ------------------------------------------------------
  app.use(requestLogger);

  // Is a built SPA present? When yes, this service also hosts the UI (single-
  // service hosting, e.g. Railway) and the bare `/` should serve the app rather
  // than the API welcome. `FRONTEND_DIST` overrides the location (set in the
  // Docker image); otherwise it resolves next to the compiled backend.
  const distDir =
    process.env.FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');
  const serveSpa = fs.existsSync(path.join(distDir, 'index.html'));

  // --- Root info endpoint (API-only mode) ---------------------------------
  // Only when we are NOT serving the SPA; otherwise the SPA owns `/`.
  if (!serveSpa) {
    app.get('/', (_req: Request, res: Response) => {
      ApiResponse.success(
        res,
        {
          name: config.app.name,
          description: 'FleetGo — Enterprise Fleet Logistics Management Platform',
          apiPrefix: config.app.apiPrefix,
          docs: `${config.app.apiPrefix}/health`,
        },
        'Welcome to the FleetGo API',
      );
    });
  }

  // --- Versioned API routes ----------------------------------------------
  app.use(config.app.apiPrefix, apiV1Router);

  // --- Static frontend (single-service hosting) ---------------------------
  if (serveSpa) {
    app.use(express.static(distDir));
    // SPA fallback: serve index.html for non-API GET routes so client-side
    // routing works on refresh/deep-links; API paths fall through to the JSON 404.
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith(config.app.apiPrefix)) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // --- 404 + centralized error handling (must be last) --------------------
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
