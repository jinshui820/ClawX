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

const REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Stored key is considered stale once 80% of its TTL has elapsed (or no TTL/never fetched). */
function isKeyStale(s: EnrollmentState): boolean {
  if (!s.litellmKey) return true;
  if (!s.ttlSeconds || !s.configFetchedAt) return true;
  return Date.now() - s.configFetchedAt > s.ttlSeconds * 1000 * 0.8;
}

/** Exchange a one-time enrollment code for a device token bound to this machine. */
export async function enroll(code: string, deviceName?: string): Promise<void> {
  if (!isEnrollmentConfigured()) {
    throw new Error('Enrollment endpoint not configured (CLAWX_ENROLL_BASE_URL unset).');
  }
  const trimmed = code.trim();
  if (!trimmed) throw new Error('Enrollment code is empty.');

  const res = await fetchWithTimeout(`${ENROLL_BASE_URL}/enroll`, {
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

  const res = await fetchWithTimeout(`${ENROLL_BASE_URL}/client-config`, {
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

/**
 * Best-effort: ensure a fresh LiteLLM key before a gateway launch.
 * If enrolled and the stored key is missing/stale, refresh it. Network/server
 * failures are swallowed so a down enrollment server never blocks gateway start
 * (the gateway falls back to the last stored key, if any).
 */
export async function ensureFreshKeyForLaunch(): Promise<void> {
  if (!isEnrollmentConfigured()) return;
  const s = load();
  if (!s.deviceToken || !isKeyStale(s)) return;
  try {
    await refreshClientConfig();
  } catch (err) {
    logger.warn('[enrollment] pre-launch key refresh failed; using last stored key:', err);
  }
}

let backgroundRefreshTimer: NodeJS.Timeout | null = null;

/**
 * Start a periodic background refresh of the device key so the stored key stays
 * fresh for the next gateway (re)launch. Best-effort; safe to call once at startup.
 */
export function startEnrollmentBackgroundRefresh(): void {
  if (backgroundRefreshTimer || !isEnrollmentConfigured()) return;
  const INTERVAL_MS = 15 * 60 * 1000; // 15 min
  backgroundRefreshTimer = setInterval(() => {
    const s = load();
    if (!s.deviceToken || !isKeyStale(s)) return;
    void refreshClientConfig().catch((err) => {
      logger.warn('[enrollment] background key refresh failed:', err);
    });
  }, INTERVAL_MS);
  if (backgroundRefreshTimer.unref) backgroundRefreshTimer.unref();
}
