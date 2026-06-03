# 定制规格:自动更新源(预留 + 默认关闭)

> 状态:已实现(custom 分支)。最后更新:2026-06-03。

## 目标

防止定制版客户端**自动更新到官方版本而覆盖定制**;同时为将来**自建更新源**预留好接入位,
且在源尚未就绪/不可达时**客户端零报错、零网络请求**。

## 方案

更新源地址改为「**默认空 = 整体关闭**」+ 可预留覆盖:

- `electron/main/updater.ts`:
  - `OSS_BASE_URL = (process.env.CLAWX_UPDATE_FEED_URL || DEFAULT_UPDATE_FEED_URL).trim()`,
    `DEFAULT_UPDATE_FEED_URL = ''`(默认空)。
  - `UPDATES_ENABLED = OSS_BASE_URL.length > 0`。
  - 为空时:构造函数**不调用 setFeedURL**、不设渠道;`checkForUpdates()` 直接返回
    `not-available`(不发起任何网络请求)。→ 客户端绝不联网、绝不报更新错误。
- `electron-builder.yml`:`publish` 去掉官方 OSS + ValueCell GitHub,改为占位
  `https://updates.example.invalid/latest`(`.invalid` 永不解析,不会误连)。该块仅用于
  生成 `app-update.yml` 和作为 `--publish` 上传目标;运行时实际以 updater.ts 为准。

原有保护(本就存在,继续生效):`autoDownload=false`、`autoInstallOnAppQuit=false`、
构造函数默认 `error` 监听(更新失败不终止主进程)、所有 `checkForUpdates` 调用点 try/catch。

## 启用自建源(将来发布时)

1. 站好自建源(内网 nginx / MinIO,或国内 OSS),按渠道分目录:`<base>/latest/`、`<base>/alpha/`。
2. 设 `DEFAULT_UPDATE_FEED_URL`(updater.ts)+ `publish.url`(electron-builder.yml)为你的地址;
   或打包时设环境变量 `CLAWX_UPDATE_FEED_URL`。
3. `electron-builder ... --publish always` 自动上传 `exe + *.yml + blockmap`,或手动上传那三类文件。
4. 给真实用户发"稳定版"时,版本号去掉 `-alpha`/`-beta`(→ `latest` 渠道)。

## 涉及文件

- `electron/main/updater.ts` —— 源地址解析 + 未配置时短路(上游文件,改动局部)。
- `electron-builder.yml` —— publish 占位(上游文件)。

## 验证

- `pnpm typecheck` 通过。
- 未配置源(默认)时:启动日志出现 `update feed not configured — auto-update disabled`;
  UI 点"检查更新"返回"无可用更新",无错误、无网络请求。
- 配置源后:`[Updater] ... feedUrl: <你的源>/<channel>`,正常检查/下载。

## 与上游合并注意

- 上游若改 `updater.ts` 的 feedUrl 逻辑,保留我们的「`UPDATES_ENABLED` 守卫 + 默认空」。
- 切勿让 `OSS_BASE_URL` 回退到官方 `oss.intelli-spectrum.com`,否则定制会被官方更新覆盖。
