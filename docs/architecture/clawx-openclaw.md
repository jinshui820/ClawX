# 架构:ClawX 与 OpenClaw 的关系（开发 Agent 功能前必读）

> 目的:固化两者关系与集成接缝,**开发 Agent 相关功能时优先复用 OpenClaw,不要在 ClawX 里重造**。
> 最后更新:2026-06-04。

## 一句话

- **OpenClaw** = AI Agent **运行时/引擎**(npm 包 `openclaw`,日历版本如 `2026.5.x`):Agent 编排、工具调用、渠道、技能、模型 Provider、记忆/定时任务,核心都在它里面。
- **ClawX** = **Electron 桌面壳 + 集成层**(本仓库,`0.4.x`):把 OpenClaw 捆绑进来,用 GUI 包住它(设置向导、聊天、渠道/技能/模型管理界面、托盘、更新)。
- 关系:**ClawX 派生并托管一个 OpenClaw「网关进程」,通过 RPC 调它、通过配置文件喂它**。模型这层由 OpenClaw 经 OpenAI 兼容 `base_url` 对接(私有化时即 LiteLLM)。

## 运行时拓扑

```
ClawX (Electron)
  ├─ 主进程 electron/main ──spawn/管理──> OpenClaw 网关进程
  │     │                                  node openclaw.mjs gateway --port <网关端口>
  │     ├─ 网关 RPC: electron/gateway/protocol.ts        ← 调 Agent 能力(对话/运行/状态…)
  │     ├─ 配置同步: electron/gateway/config-sync.ts      ← UI 设置 → openclaw.json → 网关
  │     └─ Host API (electron/api): 给渲染进程的本地 HTTP/IPC
  └─ 渲染进程 src (React UI) ──Host API──> 主进程
配置目录: <userData>/.openclaw  （本 fork 已隔离为 ClawX 私有,见 docs/customizations/openclaw-isolation.md）
```

端口/目录隔离详见 [../customizations/openclaw-isolation.md](../customizations/openclaw-isolation.md)。

## 三条集成接缝(扩展功能就从这里下手)

1. **网关 RPC** — [electron/gateway/protocol.ts](../../electron/gateway/protocol.ts)、[electron/api/routes/gateway.ts](../../electron/api/routes/gateway.ts)、渲染侧 [src/lib/api-client.ts](../../src/lib/api-client.ts)。
   想用 OpenClaw 的某个运行时能力(发起对话、跑 agent、查状态),走这里调,**别在 ClawX 里另起炉灶**。
2. **配置同步** — [electron/gateway/config-sync.ts](../../electron/gateway/config-sync.ts)。
   ClawX 把界面设置写成 `openclaw.json` 再同步给网关。新增"可配置项"通常是:加 UI → 落 openclaw.json 字段 → 由 config-sync 下发。
3. **ClawX 扩展系统** — [electron/extensions/](../../electron/extensions/)（`registry.ts`/`loader.ts`/`builtin/`）。
   这是 **ClawX 壳自己的**扩展点(如 clawhub-marketplace、diagnostics),用于把主进程能力暴露给 UI;与 OpenClaw 的插件**不是一回事**。

## 能力归属对照（UI 页面 ↔ OpenClaw 能力)

| ClawX 页面 (src/pages) | 背后的 OpenClaw 能力 | 新功能复用点 |
|---|---|---|
| Chat | Agent 运行时(对话/工具调用) | 网关 RPC |
| Agents | 多 Agent、`agentId` 上下文 | openclaw.json + 网关 |
| Channels | **OpenClaw 插件**(`@openclaw/discord`、`@tencent-weixin/openclaw-weixin`…) | 装进 `.openclaw/extensions` |
| Skills | OpenClaw 技能(pdf/xlsx/tavily…) | 预装技能 + 技能目录 |
| Models | OpenClaw Provider / `base_url` | provider 配置 → openclaw.json |
| Cron | OpenClaw 定时任务 | 网关 RPC / 配置 |
| Dreams | OpenClaw 记忆/梦境 | 网关 RPC |
| ImageGeneration | OpenAI 兼容生图端点 | provider 配置 |
| Setup/Settings | 写 openclaw.json | config-sync |

## 开发新 Agent 功能的决策顺序(复用优先)

1. **先问:OpenClaw 是否已有这能力?**(Agent 编排、工具、渠道、技能、记忆、定时、模型路由——多半已有。)
2. **有 → ClawX 只做两件事:**(a) 通过网关 RPC / `openclaw.json` 把它接上;(b) 加 UI 页面/设置项暴露给用户。**不要在 ClawX 重写引擎逻辑。**
3. **没有,但属于 Agent 运行时范畴 → 优先考虑做成 OpenClaw 插件/技能**(可跟随 OpenClaw 生态、跨 CLI/ClawX 复用),而不是塞进 ClawX 主进程。
4. **只有"纯 GUI/桌面集成"的能力**(托盘、窗口、系统通知、本地文件对话框、安装器)才在 ClawX 侧实现。
5. 模型一律走 OpenClaw 的 `base_url`(私有化 = 指向 LiteLLM,见 [../deployment/](../deployment/));ClawX 不直接调模型。

## 版本与升级

- `openclaw`(引擎)和 ClawX(壳)是**两条独立发布线**;ClawX 捆绑某个 openclaw 版本,随上游更新一起前进。
- 我们是**跟踪上游的定制 fork**;改动尽量走"新文件 + 接缝处小改",详见 [../customizations/](../customizations/)。
