/**
 * Device enrollment + remote key retrieval.
 *
 * Flow (see docs/customizations/device-enrollment.md):
 *   enroll(code) → POST /enroll {code, machineHash} → store deviceToken
 *   refreshClientConfig() → GET /client-config (Bearer) → store LiteLLM key
 *   getLiteLLMKey() → injected as LITELLM_API_KEY into the gateway env at launch
 *
 * Endpoint base is RESERVED + default-off: empty CLAWX_ENROLL_BASE_URL /
 * DEFAULT_ENROLL_BASE_URL means enrollment is disabled (no network, no errors),
 * mirroring the update-feed reservation. Set it (build-time or runtime) to your
 * server when ready.
 */
import { app } from 'electron';
import { logger } from '../../utils/logger';
import { getMachineHash } from './machine-id';
import { clearSecureBlob, readSecureBlob, writeSecureBlob } from './secure-store';

const DEFAULT_ENROLL_BASE_URL = '';
const ENROLL_BASE_URL = (process.env.CLAWX_ENROLL_BASE_URL || DEFAULT_ENROLL_BASE_URL).trim();

interface EnrollmentState {
  deviceToken?: string;
  deviceId?: string;
  litellmKey?: string;
  litellmBaseUrl?: string;
  ttlSeconds?: number;
  configFetchedAt?: number;
}

export interface EnrollmentStatus {
  configured: boolean;
  enrolled: boolean;
  hasKey: boolean;
  deviceId?: string;
  configFetchedAt?: number;
}

function load(): EnrollmentState {
  return readSecureBlob<EnrollmentState>() ?? {};
}

function save(state: EnrollmentState): void {
  writeSecureBlob(state);
}

export function isEnrollmentConfigured(): boolean {
  return ENROLL_BASE_URL.length > 0;
}

export function getEnrollmentStatus(): EnrollmentStatus {
  const s = load();
  return {
    configured: isEnrollmentConfigured(),
    enrolled: !!s.deviceToken,
    hasKey: !!s.litellmKey,
    deviceId: s.deviceId,
    configFetchedAt: s.configFetchedAt,
  };
}

/** Exchange a one-time enrollment code for a device token bound to this machine. */
export async function enroll(code: string, deviceName?: string): Promise<void> {
  if (!isEnrollmentConfigured()) {
    throw new Error('Enrollment endpoint not configured (CLAWX_ENROLL_BASE_URL unset).');
  }
  const trimmed = code.trim();
  if (!trimmed) throw new Error('Enrollment code is empty.');

  const res = await fetch(`${ENROLL_BASE_URL}/enroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: trimmed,
      machineHash: getMachineHash(),
      deviceName: deviceName || app.getName(),
      clientVersion: app.getVersion(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Enrollment failed (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { deviceToken?: string; deviceId?: string };
  if (!data.deviceToken) throw new Error('Enrollment response missing deviceToken.');

  const s = load();
  s.deviceToken = data.deviceToken;
  s.deviceId = data.deviceId;
  save(s);
  logger.info('[enrollment] device enrolled');

  // Pull the key right away.
  await refreshClientConfig();
}

/** Fetch this device's LiteLLM key + optional config/routing using the stored token. */
export async function refreshClientConfig(): Promise<void> {
  const s = load();
  if (!isEnrollmentConfigured() || !s.deviceToken) return;

  const res = await fetch(`${ENROLL_BASE_URL}/client-config`, {
    headers: {
      authorization: `Bearer ${s.deviceToken}`,
      'x-machine-hash': getMachineHash(),
      'x-client-version': app.getVersion(),
    },
  });

  if (res.status === 401) {
    logger.warn('[enrollment] device unauthorized (revoked/binding mismatch); clearing local credentials.');
    clearSecureBlob();
    throw new Error('Device unauthorized — re-enrollment required.');
  }
  if (!res.ok) {
    throw new Error(`client-config failed (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as {
    litellm?: { apiKey?: string; baseUrl?: string };
    ttlSeconds?: number;
  };
  s.litellmKey = data.litellm?.apiKey ?? s.litellmKey;
  s.litellmBaseUrl = data.litellm?.baseUrl ?? s.litellmBaseUrl;
  s.ttlSeconds = data.ttlSeconds;
  s.configFetchedAt = Date.now();
  save(s);
  logger.info('[enrollment] client config refreshed');
}

/** The LiteLLM key to inject into the gateway env (null if not enrolled/fetched). */
export function getLiteLLMKey(): string | null {
  return load().litellmKey ?? null;
}

/** Optional server-provided LiteLLM base URL override (null if none). */
export function getLiteLLMBaseUrlOverride(): string | null {
  return load().litellmBaseUrl ?? null;
}

/** Forget all enrollment state (e.g. on 401 or user "unbind"). */
export function resetEnrollment(): void {
  clearSecureBlob();
  logger.info('[enrollment] local enrollment reset');
}
