# 定制规格:自带 OpenClaw 与官方隔离

> 状态:已实现(custom 分支)。最后更新:2026-06-03。

## 目标

让 ClawX **自带的 OpenClaw**(打包进安装目录的运行时)使用一套**ClawX 私有的配置目录与端口**,
与**官方独立 OpenClaw**(用 `~/.openclaw`、网关 18789)完全隔离。三者可同机共存、互不影响:

- 官方 OpenClaw CLI：`~/.openclaw` + 18789 —— ClawX 完全不碰
- 正式版 ClawX：`<userData>/.openclaw`(= `%APPDATA%\ClawX\.openclaw`)+ 18792/13212
- dev 调试：`.profiles/dev/userdata/.openclaw` + 18790/13211

非目标：不改写整个 `USERPROFILE/HOME`(否则会带偏 `~/Downloads`、`~` 展开)。

## 方案

1. **端口烤进构建**(默认值即隔离值),正式版双击快捷方式即用,无需包装脚本:
   - 网关 `CLAWX_GATEWAY_PORT` 默认 `18792`;Host API `CLAWX_PORT_CLAWX_HOST_API` 默认 `13212`。
2. **配置目录用 `OPENCLAW_HOME` 隔离**(OpenClaw 官方变量,优先级高于 HOME/USERPROFILE）:
   - `electron/main/early-env.ts`(**第一个被 import**)先应用 `CLAWX_USER_DATA_DIR`,
     再把 `OPENCLAW_HOME` 默认成 userData —— 必须在任何模块级 `.openclaw` 常量求值前完成(时序关键)。
   - `paths.ts` 的 `getOpenClawHome()/getOpenClawConfigDir()` 认 `OPENCLAW_HOME`。
   - `process-launcher.ts` 给网关进程显式 pin `OPENCLAW_HOME`,确保 ClawX 侧与网关用**同一目录**(config-sync 不错位)。
   - 所有硬编码 `join(homedir(), '.openclaw', ...)` 改走 `getOpenClawConfigDir()`(`homedir()` 仅保留给 `~/Downloads`、`~` 展开)。
3. **卸载提示**:沿用既有「是否删除应用数据」弹窗——私有配置就在 `%APPDATA%\clawx` 内,选「是」即一并删；官方 `~/.openclaw` 永不触碰(仅更新文案)。

## 涉及文件

**新增(零冲突):**
- `electron/main/early-env.ts` —— 最早 import,设 CLAWX_USER_DATA_DIR + OPENCLAW_HOME。

**改动的上游文件(冲突候选,合并时重点看):**
- `electron/main/index.ts` —— 第一个 import 改为 `./early-env`;移除原 userData setPath 块。**高 churn,易冲突。**
- `electron/utils/paths.ts` —— 新增 `getOpenClawHome()`,`getOpenClawConfigDir()` 认 OPENCLAW_HOME。
- `electron/utils/config.ts` —— 端口默认值 18792/13212。
- `electron/gateway/process-launcher.ts` —— 网关 env 设 OPENCLAW_HOME。
- 路径改走 helper：`gateway/config-sync.ts`、`gateway/reload-policy.ts`、`api/routes/files.ts`、
  `main/ipc-handlers.ts`、`utils/channel-config.ts`、`utils/openclaw-auth.ts`、`utils/openclaw-workspace.ts`、
  `utils/plugin-install.ts`、`utils/skill-config.ts`、`utils/skill-quick-access.ts`、`utils/wechat-login.ts`、
  `utils/whatsapp-login.ts`、`utils/store.ts`(端口默认)。
- 渲染进程端口默认/fallback：`preload/index.ts`、`src/lib/host-api.ts`、`src/lib/api-client.ts`、
  `src/stores/gateway.ts`、`src/stores/settings.ts`。
- `scripts/installer.nsh` —— 卸载文案。

## 验证

1. `pnpm typecheck` 通过。
2. `pwsh ./scripts/dev.ps1`(隔离 dev)启动后：
   - 网关监听 **18790**;
   - `.profiles/dev/userdata/.openclaw/openclaw.json` 等配置生成(证明 ClawX 侧与网关用同一隔离目录）；
   - 真实 `~/.openclaw` 修改时间不变(未被触碰）。
3. 正式版（用 custom 分支打包）：双击快捷方式 → 网关 18792、配置在 `%APPDATA%\ClawX\.openclaw`。

## 与上游合并注意

- `index.ts` 是高频冲突点(上游常改启动逻辑)。我们的增量是**第一个 import `./early-env`** + 删掉原 userData setPath 块——冲突时保留这两点,同时保留上游对该文件的新增(如 remote-debugging-port 等)。
- 路径类改动是**单行替换**(`homedir(), '.openclaw'` → `getOpenClawConfigDir()`),git 多能自动合并;若上游在同一函数新增 `.openclaw` 用法,记得也改走 helper。
- `rerere` 已开,重复冲突会自动套用上次解法。
- 合并后务必重跑上方「验证」三步。
