#!/usr/bin/env node
/**
 * 本地 mock 的「设备注册 / 发钥」服务,用于开发联调(无需真服务端)。
 *
 *   node scripts/dev-enroll-mock.mjs            # 监听 :8787
 * 然后用注册端点指向它启动 ClawX:
 *   $env:CLAWX_ENROLL_BASE_URL="http://127.0.0.1:8787"; pwsh ./scripts/dev.ps1
 * 在 ClawX 里输入注册码(默认 TEST-CODE)即可拿到一个假的 LiteLLM key。
 *
 * 实现的契约见 docs/customizations/device-enrollment.md。
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 8787);
const VALID_CODE = process.env.MOCK_CODE || 'TEST-CODE';
const MOCK_KEY = process.env.MOCK_LITELLM_KEY || 'sk-mock-device-key';
const MOCK_BASEURL = process.env.MOCK_LITELLM_BASEURL || '';

/** token -> { machineHash, revoked } */
const devices = new Map();

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/enroll') {
    const body = await readJson(req);
    if (!body) return send(res, 400, { error: 'invalid json' });
    if (body.code !== VALID_CODE) {
      console.log(`[mock] enroll rejected: code="${body.code}" (expected "${VALID_CODE}")`);
      return send(res, 400, { error: 'invalid or expired code' });
    }
    if (!body.machineHash) return send(res, 400, { error: 'missing machineHash' });
    const deviceToken = randomBytes(24).toString('hex');
    const deviceId = `dev-${randomBytes(4).toString('hex')}`;
    devices.set(deviceToken, { machineHash: body.machineHash, revoked: false });
    console.log(`[mock] enrolled device=${deviceId} machineHash=${body.machineHash.slice(0, 12)}… name=${body.deviceName}`);
    return send(res, 200, { deviceToken, deviceId, expiresAt: null });
  }

  if (req.method === 'GET' && url.pathname === '/client-config') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const machineHash = req.headers['x-machine-hash'] || '';
    const rec = devices.get(token);
    if (!rec || rec.revoked) return send(res, 401, { error: 'unauthorized' });
    if (rec.machineHash !== machineHash) {
      console.log('[mock] client-config rejected: machineHash binding mismatch');
      return send(res, 401, { error: 'binding mismatch' });
    }
    console.log('[mock] issued client-config (LiteLLM key)');
    return send(res, 200, {
      litellm: { apiKey: MOCK_KEY, ...(MOCK_BASEURL ? { baseUrl: MOCK_BASEURL } : {}) },
      ttlSeconds: 3600,
    });
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock] device-enrollment mock on http://127.0.0.1:${PORT}`);
  console.log(`[mock] valid code: "${VALID_CODE}"  → returns LiteLLM key "${MOCK_KEY}"`);
});
