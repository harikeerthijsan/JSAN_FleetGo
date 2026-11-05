import { config } from '../../config';
import { logger } from '../logger';
import { LocalStorageProvider } from './LocalStorageProvider';
import type { StorageProvider } from './StorageProvider';

/**
 * Storage factory. Returns the concrete provider selected by STORAGE_DRIVER.
 * Only the local provider exists in Phase 1; s3/gcs fall back to local with a
 * warning until their providers are implemented in a later phase.
 */
function createStorageProvider(): StorageProvider {
  switch (config.storage.driver) {
    case 'local':
      return new LocalStorageProvider();
    case 's3':
    case 'gcs':
      logger.warn(
        `Storage driver "${config.storage.driver}" is not implemented yet; ` +
          'falling back to local storage. Implement it before production use.',
      );
      return new LocalStorageProvider();
    default:
      return new LocalStorageProvider();
  }
}

export const storage: StorageProvider = createStorageProvider();
export type {
  SaveFileInput,
  StoredFile,
  StorageProvider,
} from './StorageProvider';
