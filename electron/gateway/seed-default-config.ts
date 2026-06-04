/**
 * First-run seeding of the bundled default openclaw config.
 *
 * Merges resources/config-templates/openclaw.default.json (built per
 * CLAWX_BUILD_ENV, see docs/customizations/default-config.md) into
 * <OPENCLAW_HOME>/.openclaw/openclaw.json exactly once. Existing user values
 * always win — the template only fills in what's missing. A marker file prevents
 * re-seeding (so user deletions aren't undone on later launches).
 *
 * Runs before gateway launch so the bundled OpenClaw reads the seeded config.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getOpenClawConfigDir, getResourcesDir } from '../utils/paths';
import { logger } from '../utils/logger';

const SEED_MARKER = '.clawx-default-config-seeded';

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge where `override` wins; `base` supplies defaults for missing keys. */
function mergeUnder(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out: Json = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = key in base ? mergeUnder(base[key], override[key]) : override[key];
  }
  return out;
}

function readJsonSafe(path: string): Json {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function seedDefaultOpenClawConfig(): void {
  try {
    const templatePath = join(getResourcesDir(), 'config-templates', 'openclaw.default.json');
    if (!existsSync(templatePath)) return; // no bundled default for this build

    const dir = getOpenClawConfigDir();
    const markerPath = join(dir, SEED_MARKER);
    if (existsSync(markerPath)) return; // already seeded once

    const template = readJsonSafe(templatePath);
    if (Object.keys(template).length === 0) return;

    const configPath = join(dir, 'openclaw.json');
    const existing = existsSync(configPath) ? readJsonSafe(configPath) : {};

    // template = defaults, existing user config wins on conflicts
    const merged = mergeUnder(template, existing) as Json;

    mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    writeFileSync(markerPath, `${new Date().toISOString()}\n`, 'utf8');
    logger.info('[seed] merged bundled default openclaw config into openclaw.json (first run)');
  } catch (err) {
    logger.warn('[seed] failed to seed default openclaw config:', err);
  }
}
