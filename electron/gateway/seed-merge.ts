/**
 * Pure deep-merge helper for default-config seeding (no electron/node deps, so
 * it's unit-testable in isolation). See seed-default-config.ts.
 */
export type Json = Record<string, unknown>;

export function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge where `override` wins; `base` supplies defaults for missing keys.
 * Arrays and non-objects from `override` replace `base` wholesale. A `base`
 * key absent from `override` is preserved.
 */
export function mergeUnder(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out: Json = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = key in base ? mergeUnder(base[key], override[key]) : override[key];
  }
  return out;
}
