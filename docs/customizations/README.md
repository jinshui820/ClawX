# ClawX 定制规格(Customization Specs)

本目录记录本 fork 相对上游 `ValueCell-ai/ClawX` 的**定制改动**——每个定制一份
markdown,说明「要解决什么 / 怎么改的 / 改了哪些文件 / 如何验证 / 与上游合并时注意什么」。

## 为什么要写

这是一个**跟踪上游的定制 fork**(`custom` 分支,定期 rebase 到 `main`=`upstream/main`)。
当某次上游合并把改动冲乱时,这些文档让你能**照规格快速重建意图**,而不必从 diff 里反推。
它不是重型 spec 框架(无需 OpenSpec/Spec Kit),只是一份「改了什么、为什么」的轻量台账。

## 写法约定

- 一个定制 = 一份 `docs/customizations/<slug>.md`。
- 固定小节:**目标 / 方案 / 涉及文件 / 验证 / 与上游合并注意**。
- 「涉及文件」区分**新增文件**(零冲突)与**改动的上游文件**(冲突候选,需重点关注)。
- 改完代码顺手更新对应规格;规格过期就改或删。

## 现有定制

| 规格 | 摘要 |
|------|------|
| [openclaw-isolation.md](openclaw-isolation.md) | 自带 OpenClaw 配置目录 + 端口与官方隔离,可同机共存 |
| [update-feed.md](update-feed.md) | 自动更新源预留 + 默认关闭(不被官方覆盖、源缺失不报错) |
| [default-config.md](default-config.md) | 打包默认 openclaw 配置 + 按 dev/prod 构建期注入端点 |
| [device-enrollment.md](device-enrollment.md) | 设备注册码(机器码绑定)+ 远程发 LiteLLM key + safeStorage |
| [build-and-dev-tooling.md](build-and-dev-tooling.md) | 打包/开发脚本:下载幂等、镜像兜底、Git bash、隔离 profile |
