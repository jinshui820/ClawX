/**
 * OS-encrypted at-rest storage for enrollment secrets (device token, LiteLLM key).
 *
 * Uses Electron safeStorage (Windows DPAPI / macOS Keychain / Linux libsecret).
 * File: <userData>/secure/enrollment.bin, with a 1-byte prefix marking the
 * payload as encrypted (0x01) or plaintext fallback (0x00, only when OS
 * encryption is unavailable — logged loudly).
 *
 * NOTE: unlike ClawX's existing electron-store provider secrets (plaintext),
 * this is encrypted at rest. See docs/customizations/device-enrollment.md.
 */
import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '../../utils/logger';

function storePath(): string {
  return join(app.getPath('userData'), 'secure', 'enrollment.bin');
}

export function readSecureBlob<T>(): T | null {
  const p = storePath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p);
    if (raw.length < 2) return null;
    const marker = raw[0];
    const body = raw.subarray(1);
    let json: string;
    if (marker === 1) {
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn('[enrollment] secure blob is encrypted but OS encryption is unavailable; cannot read.');
        return null;
      }
      json = safeStorage.decryptString(body);
    } else {
      json = body.toString('utf8');
    }
    return JSON.parse(json) as T;
  } catch (err) {
    logger.warn('[enrollment] failed to read secure store:', err);
    return null;
  }
}

export function writeSecureBlob(data: unknown): void {
  const p = storePath();
  mkdirSync(dirname(p), { recursive: true });
  const json = JSON.stringify(data);
  let out: Buffer;
  if (safeStorage.isEncryptionAvailable()) {
    out = Buffer.concat([Buffer.from([1]), safeStorage.encryptString(json)]);
  } else {
    logger.warn('[enrollment] OS encryption unavailable; storing enrollment secrets UNENCRYPTED.');
    out = Buffer.concat([Buffer.from([0]), Buffer.from(json, 'utf8')]);
  }
  writeFileSync(p, out);
}

export function clearSecureBlob(): void {
  try {
    const p = storePath();
    if (existsSync(p)) rmSync(p, { force: true });
  } catch (err) {
    logger.warn('[enrollment] failed to clear secure store:', err);
  }
}
