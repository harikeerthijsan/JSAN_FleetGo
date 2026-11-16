import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../../config';
import type {
  SaveFileInput,
  StoredFile,
  StorageProvider,
} from './StorageProvider';

/**
 * Local-disk implementation of the storage abstraction, intended for
 * development. Files are written under `STORAGE_LOCAL_PATH` using an opaque,
 * collision-resistant key. Only the key/metadata is persisted in PostgreSQL by
 * callers; the bytes live here on disk.
 *
 * A production S3/GCS provider will implement the same interface, after which
 * `getUrl` can return signed URLs. Downloads in FleetGo go through an
 * authorized API endpoint that calls `read()`, so files are never exposed via
 * an unauthenticated static path.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(basePath: string = config.storage.localPath) {
    this.basePath = path.resolve(basePath);
  }

  private buildKey(folder: string | undefined, originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const unique = `${Date.now()}-${randomUUID()}${ext}`;
    return folder ? `${folder.replace(/\/+$/, '')}/${unique}` : unique;
  }

  /** Resolve a storage key to an absolute path, guarding against traversal. */
  private resolvePath(key: string): string {
    const full = path.resolve(this.basePath, key);
    if (!full.startsWith(this.basePath)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async save(input: SaveFileInput): Promise<StoredFile> {
    const key = this.buildKey(input.folder, input.originalName);
    const full = this.resolvePath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.buffer);
    return {
      key,
      url: await this.getUrl(key),
      size: input.buffer.length,
      contentType: input.contentType,
    };
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolvePath(key));
    } catch (err) {
      // Ignore "file not found"; anything else is unexpected but non-fatal.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async getUrl(key: string): Promise<string> {
    // Local files are served through the authorized download endpoint, so the
    // stored "url" is just the opaque key reference.
    return key;
  }
}
