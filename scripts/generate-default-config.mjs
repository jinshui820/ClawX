#!/usr/bin/env node
/**
 * 生成「打包进客户端的默认 openclaw 配置」。
 *
 * 按 CLAWX_BUILD_ENV(默认取 config/build-config.json5 的 `default`)选择模板,
 * 用 values 替换模板里的 <占位符>(值支持 ${env:NAME} 读构建期环境变量),
 * 运行时引用如 ${LITELLM_API_KEY} 保持原样,输出:
 *   resources/config-templates/openclaw.default.json
 * 该文件经 extraResources 打进安装包,首次运行由客户端 merge 进 openclaw.json。
 *
 * 用法:  node scripts/generate-default-config.mjs [--env dev|prod]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_CONFIG = join(ROOT, 'config', 'build-config.json5');
const OUT_PATH = join(ROOT, 'resources', 'config-templates', 'openclaw.default.json');

function fail(msg) {
  console.error(`✗ [gen-config] ${msg}`);
  process.exit(1);
}

function resolveValue(raw) {
  const m = typeof raw === 'string' && raw.match(/^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (m) return (process.env[m[1]] ?? '').trim();
  return raw;
}

if (!existsSync(BUILD_CONFIG)) fail(`missing ${BUILD_CONFIG}`);
const cfg = JSON5.parse(readFileSync(BUILD_CONFIG, 'utf8'));

const argEnv = (() => {
  const i = process.argv.indexOf('--env');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const envName = (argEnv || process.env.CLAWX_BUILD_ENV || cfg.default || 'dev').trim();

const envCfg = cfg.envs?.[envName];
if (!envCfg) fail(`unknown env "${envName}" (have: ${Object.keys(cfg.envs || {}).join(', ')})`);

const templatePath = join(ROOT, envCfg.template);
if (!existsSync(templatePath)) fail(`template not found: ${envCfg.template}`);

let text = readFileSync(templatePath, 'utf8');

// 占位替换
const unresolved = [];
for (const [token, rawVal] of Object.entries(envCfg.values || {})) {
  const val = resolveValue(rawVal);
  if (!val) {
    // 未提供值:保留占位、记录告警(不阻断构建,便于先出包再补值)
    if (text.includes(token)) unresolved.push(token);
    continue;
  }
  text = text.split(token).join(val);
}

// 校验并规范化(json5 → 普通 JSON);也确保 ${LITELLM_API_KEY} 等运行时引用原样保留为字符串
let parsed;
try {
  parsed = JSON5.parse(text);
} catch (e) {
  fail(`generated config is not valid JSON5 after substitution: ${e.message}`);
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

console.log(`✓ [gen-config] env=${envName}  template=${envCfg.template}`);
console.log(`✓ [gen-config] wrote ${OUT_PATH.replace(ROOT, '.')}`);
if (unresolved.length) {
  console.warn(`⚠ [gen-config] 占位符未填值(保留原样): ${[...new Set(unresolved)].join(', ')}`);
  console.warn(`  生产构建请设置对应环境变量(见 config/build-config.json5),或在客户端设置/远程配置中覆盖。`);
}
