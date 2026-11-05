import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';

/**
 * File-upload middleware for vehicle documents and photos.
 *
 * Uses in-memory storage so the buffer can be handed to the storage
 * abstraction (local disk now, S3/GCS later). Enforces an allow-list of MIME
 * types and a max size (STORAGE_MAX_FILE_SIZE). Binary bytes are never stored
 * in PostgreSQL — only metadata/references are persisted by the service.
 */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxFileSize, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(415, `Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * Media uploader for evidence (ticket attachments, etc.) — allows images and
 * short videos with a larger size limit than document uploads. Video can be
 * large, so this permits up to 100 MB per file.
 */
const ALLOWED_MEDIA_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]);
const MEDIA_MAX_SIZE = 104_857_600; // 100 MB

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_MAX_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MEDIA_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(415, `Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * Returns a middleware that accepts a single file in `field`, translating
 * multer errors into the standard ApiError envelope.
 */
export function uploadSingle(field: string) {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const mb = (config.storage.maxFileSize / 1_048_576).toFixed(1);
          return next(ApiError.badRequest(`File exceeds the ${mb} MB limit`));
        }
        return next(ApiError.badRequest(err.message));
      }
      return next(err);
    });
  };
}

/** Like uploadSingle but accepts images + video up to 100 MB (evidence media). */
export function uploadMediaSingle(field: string) {
  const handler = mediaUpload.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const mb = (MEDIA_MAX_SIZE / 1_048_576).toFixed(0);
          return next(ApiError.badRequest(`File exceeds the ${mb} MB limit`));
        }
        return next(ApiError.badRequest(err.message));
      }
      return next(err);
    });
  };
}
