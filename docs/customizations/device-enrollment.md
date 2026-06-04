# 定制规格:设备注册 + 远程发钥(客户端取 LiteLLM key)

> 状态:设计定稿,客户端实现中。最后更新:2026-06-04。
> 关联:部署方案安全 §163–172(每用户 LiteLLM 虚拟 key / OIDC-SSO / mTLS / 吊销);
> 默认配置注入见同目录 default-config.md。

## 目标

客户端**不内置任何密钥**。设备首次用一次性**注册码**换取一个**绑定到本机**的设备令牌,
日常用该令牌拉取**本设备/用户专属的 LiteLLM 虚拟 key**;key 只存 OS keychain,
启动网关时作为环境变量注入,**绝不写进 openclaw.json 明文**。授权全在服务端(LiteLLM 按 key 限模型/配额/吊销)。

## 决策(已定)

- 认证主路径:**一次性注册码**(管理员发放)。
- **机器码绑定:开启**。客户端采集 `node-machine-id` 并取其 **SHA-256** 上报(不发原始硬件 ID),服务端按此绑定。
- 密钥保管:`deviceToken` 与 `litellmKey` 存 **Electron `safeStorage`(OS 级加密:Windows DPAPI / macOS Keychain)**,文件落 `<userData>/secure/enrollment.bin`。
  注意:ClawX 现有 `secret-store.ts` 是**明文 electron-store**(所有 provider key 目前明文存),本功能不沿用,改引入 safeStorage(更适合企业安全诉求;未来可推广到 provider key)。
- 注入网关:模板用 `apiKey: "${LITELLM_API_KEY}"`;客户端启动网关时注入 `LITELLM_API_KEY`(走 `provider-runtime-sync` / `process-launcher`)。

## 流程

```
未注册:
  ① 用户在 ClawX 输入注册码
  ② 客户端: machineHash = sha256(node-machine-id)
  ③ POST /enroll { code, machineHash, deviceName, clientVersion }
  ④ 服务端: 校验码 → 签发 deviceToken(可吊销) + 绑定 machineHash
  ⑤ 客户端: deviceToken 存 keychain
日常:
  ⑥ GET /client-config  (Bearer deviceToken, X-Machine-Hash)
  ⑦ 服务端: 校验令牌+绑定+未吊销 → 返回 { litellm.apiKey(虚拟 key), [litellm.baseUrl], [routing], [config], ttlSeconds }
  ⑧ 客户端: apiKey 存 keychain;启动网关注入 env LITELLM_API_KEY
  ⑨ 401(吊销/失效) → 提示重新注册 / 重取
```

## 接口契约(供服务端实现,DGX 侧)

全部 HTTPS;建议内部 CA + 可选证书 pinning。

### POST /enroll
请求体(JSON):
```json
{ "code": "一次性注册码", "machineHash": "sha256-hex", "deviceName": "主机名/友好名", "clientVersion": "0.4.8-alpha.0" }
```
200:
```json
{ "deviceToken": "不透明可吊销令牌", "deviceId": "服务端设备记录ID", "expiresAt": "ISO8601 或 null" }
```
错误:400 码无效/过期;403 绑定冲突(码已被别的机器用);409 设备已注册(按策略)。

### GET /client-config
请求头:`Authorization: Bearer <deviceToken>`、`X-Machine-Hash: <sha256-hex>`、`X-Client-Version: <ver>`
200:
```json
{
  "litellm": { "apiKey": "本设备/用户的 LiteLLM 虚拟 key", "baseUrl": "(可选)覆盖打包默认端点" },
  "routing": { "(可选) 功能→模型 路由,Phase 3 集中下发": "..." },
  "config":  { "(可选) 要 merge 进 openclaw.json 的片段": "..." },
  "ttlSeconds": 3600
}
```
错误:401 令牌无效/吊销/绑定不符 → 客户端清本地凭证并要求重新注册。

## 安全要点

- 上报 `machineHash`(SHA-256),不发原始 `node-machine-id`。
- `deviceToken`/`litellmKey` 只存 keychain;不入 openclaw.json、不入日志。
- key 经 env 注入网关进程,磁盘配置里只有 `${LITELLM_API_KEY}` 引用。
- 服务端按 token+绑定+吊销状态授权;LiteLLM 按 key 限模型/配额/限流/审计(§168/§172)。
- 短期 key + ttl 重取;离职/丢机 → 服务端吊销即时失效。

## 客户端涉及文件(实现中)

- `electron/services/enrollment/`(新增):machineHash、enroll、refreshConfig、状态机、safeStorage 加密存储。
- `electron/gateway/process-launcher.ts`(改):从已存的 key 注入 `LITELLM_API_KEY`。
- 注册入口 URL:构建期可注入 `CLAWX_ENROLL_BASE_URL`(默认空=注册功能关闭,类似更新源预留)。
- UI:Setup 向导/设置加「设备注册」入口 + 状态。
- 联调:`scripts/dev-enroll-mock.mjs`(本地 mock /enroll /client-config)。

## 与上游合并注意

- 新增 `electron/services/enrollment/` 为新目录,零冲突;`process-launcher.ts` 的注入是接缝处小改。
