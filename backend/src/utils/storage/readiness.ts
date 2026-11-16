import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../../config';

/** Prove uploads can be persisted before accepting traffic. Never exposes the path. */
export async function checkStorage(): Promise<boolean> {
  if (config.storage.driver !== 'local') return false;
  const root = path.resolve(config.storage.localPath);
  if (config.app.isProduction && process.env.RAILWAY_ENVIRONMENT_ID) {
    const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (!mount) return false;
    const relative = path.relative(path.resolve(mount), root);
    if (
      relative === '..' ||
      relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative)
    )
      return false;
  }
  const probe = path.join(root, '.health-' + randomUUID());
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(probe, 'ok', { flag: 'wx', mode: 0o600 });
    await fs.unlink(probe);
    return true;
  } catch {
    await fs.unlink(probe).catch(() => {});
    return false;
  }
}
