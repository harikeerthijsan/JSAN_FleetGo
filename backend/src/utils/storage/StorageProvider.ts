/**
 * Storage abstraction (READINESS ONLY — no uploads are implemented in Phase 1).
 *
 * Every future module that needs to persist files (vehicle receiving photos,
 * dispatch/receiving condition photos, inspection images, proof-of-delivery,
 * supporting documents) will depend on this interface rather than a concrete
 * provider. This lets FleetGo switch between local disk (dev) and object
 * storage such as S3/GCS (production) without touching business code.
 *
 * IMPORTANT: Binary files are NEVER stored in PostgreSQL. Only the metadata
 * returned by `save()` (key, url, size, contentType) is persisted by the
 * relevant modules when they are implemented.
 */
export interface StoredFile {
  /** Opaque storage key/path used to retrieve or delete the object later. */
  key: string;
  /** Resolvable URL (or signed URL for private buckets). */
  url: string;
  size: number;
  contentType: string;
}

export interface SaveFileInput {
  buffer: Buffer;
  originalName: string;
  contentType: string;
  /** Logical folder, e.g. "vehicles/receiving" or "inspections". */
  folder?: string;
}

export interface StorageProvider {
  /** Persist a file and return its metadata. */
  save(input: SaveFileInput): Promise<StoredFile>;
  /** Read a previously stored file's bytes by key (for authorized download). */
  read(key: string): Promise<Buffer>;
  /** Remove a previously stored file by key. */
  remove(key: string): Promise<void>;
  /** Resolve a (possibly signed) URL for a stored key. */
  getUrl(key: string): Promise<string>;
}
