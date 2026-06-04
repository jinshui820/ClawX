/**
 * Stable per-machine identifier for device enrollment binding.
 *
 * We report the SHA-256 of node-machine-id (never the raw hardware id) so the
 * server can bind a device token to this machine without seeing the raw id.
 * See docs/customizations/device-enrollment.md.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);

let cachedHash: string | null = null;

/** SHA-256 hex of the stable machine id. Cached for the process lifetime. */
export function getMachineHash(): string {
  if (cachedHash) return cachedHash;
  // node-machine-id is CommonJS and may lack bundled types; require defensively.
  const { machineIdSync } = require('node-machine-id') as {
    machineIdSync: (original?: boolean) => string;
  };
  const raw = machineIdSync(true);
  cachedHash = createHash('sha256').update(raw).digest('hex');
  return cachedHash;
}
