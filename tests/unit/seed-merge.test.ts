import { describe, expect, it } from 'vitest';
import { mergeUnder } from '../../electron/gateway/seed-merge';

describe('mergeUnder (default-config seeding)', () => {
  it('fills in keys missing from override (template defaults)', () => {
    const base = { models: { providers: { vllm: { baseUrl: 'x' } } } };
    const override = {};
    expect(mergeUnder(base, override)).toEqual(base);
  });

  it('lets existing (override) values win on conflict', () => {
    const base = { a: 1, b: 2 };
    const override = { b: 99 };
    expect(mergeUnder(base, override)).toEqual({ a: 1, b: 99 });
  });

  it('deep-merges nested objects, existing wins per-leaf', () => {
    const base = { agents: { defaults: { model: { primary: 'vllm/claw-main', fallbacks: ['x'] } } } };
    const override = { agents: { defaults: { model: { primary: 'custom/foo' } } } };
    expect(mergeUnder(base, override)).toEqual({
      agents: { defaults: { model: { primary: 'custom/foo', fallbacks: ['x'] } } },
    });
  });

  it('replaces arrays wholesale (does not element-merge)', () => {
    const base = { list: [1, 2, 3] };
    const override = { list: [9] };
    expect(mergeUnder(base, override)).toEqual({ list: [9] });
  });

  it('keeps base when override is undefined for a key', () => {
    const base = { a: { keep: true } };
    const override = { a: undefined };
    expect(mergeUnder(base, override)).toEqual({ a: { keep: true } });
  });

  it('override primitive replaces base object (and vice versa)', () => {
    expect(mergeUnder({ a: { x: 1 } }, { a: 'str' })).toEqual({ a: 'str' });
    expect(mergeUnder({ a: 'str' }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
  });

  it('adds template providers the user lacks, but never clobbers a user-edited provider', () => {
    const template = {
      models: { providers: { vllm: { baseUrl: 'https://vip/v1', apiKey: '${LITELLM_API_KEY}' } } },
    };
    const userExisting = {
      models: { providers: { vllm: { baseUrl: 'https://my-override/v1' }, custom: { baseUrl: 'y' } } },
    };
    expect(mergeUnder(template, userExisting)).toEqual({
      models: {
        providers: {
          // user's baseUrl wins; template's apiKey fills in; user's extra provider preserved
          vllm: { baseUrl: 'https://my-override/v1', apiKey: '${LITELLM_API_KEY}' },
          custom: { baseUrl: 'y' },
        },
      },
    });
  });

  it('does not mutate its inputs', () => {
    const base = { a: { b: 1 } };
    const override = { a: { c: 2 } };
    const baseCopy = structuredClone(base);
    mergeUnder(base, override);
    expect(base).toEqual(baseCopy);
  });
});
