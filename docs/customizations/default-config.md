# 定制规格:打包默认 openclaw 配置(分环境注入)

> 状态:已实现(custom 分支)。最后更新:2026-06-04。

## 目标

把「连接私有化模型栈(LiteLLM/vLLM…)」的 **openclaw 默认配置**打进客户端,
且**按环境(dev/prod)注入不同端点**,密钥不入配置(走 [device-enrollment.md](device-enrollment.md))。

## 方案

不重写用户在 `docs/deployment/configs/` 维护的模板,而是**构建期选模板 + 填占位 + 输出**:

- `config/build-config.json5` —— 环境→{模板, 占位填充值} 映射。值可写 `${env:NAME}` 取构建期环境变量。
- `scripts/generate-default-config.mjs` —— 按 `CLAWX_BUILD_ENV`(默认 dev)生成
  `resources/config-templates/openclaw.default.json`(经 extraResources 打进安装包)。
  - 替换模板里的 `<占位符>`;**保留** `${LITELLM_API_KEY}` 等运行时引用;未填占位会告警。
- 接进 `package.json`:`predev`(dev) / `package`(按 `CLAWX_BUILD_ENV`),另有 `pnpm config:gen`。

环境:
- **dev** → `openclaw.litellm.json5`(本地 127.0.0.1:4000 测试栈,开箱即跑)
- **prod** → `openclaw.sample.json5`(`<VIP>` 等占位,由构建期环境变量 `CLAWX_LITELLM_VIP` 等注入)

> json5 解析:生成脚本用传递依赖的 `json5`(随工具链存在);若将来丢失会在生成时报清晰的模块缺失错误。

## 出 prod 包

```powershell
$env:CLAWX_BUILD_ENV="prod"
$env:CLAWX_LITELLM_VIP="litellm.corp.lan"   # 按需
pwsh ./scripts/package-win.ps1
```

## 涉及文件

新增:`config/build-config.json5`、`scripts/generate-default-config.mjs`。
改上游:`package.json`(predev/package/config:gen)、`.gitignore`(忽略生成产物 + `config/*.local.json5`)。
生成产物 `resources/config-templates/openclaw.default.json` 不入库(.gitignore)。

## 待办(与 b 联动)

- 客户端首次运行把 `openclaw.default.json` **merge 进 `<userData>/.openclaw/openclaw.json`**(尚未接;
  现仅打包就绪)。合并点参考 `electron/utils/openclaw-workspace.ts` 的 ensureClawXContext 播种模式。

## 与上游合并注意

- 新增文件零冲突;`package.json` scripts 是高频文件,我们的增量是各串首部 `node scripts/generate-default-config.mjs &&`,冲突时保留即可。
