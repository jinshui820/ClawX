# 定制规格:打包 / 开发工具链

> 状态:已实现(custom 分支)。最后更新:2026-06-03。

## 目标

在本机(Windows、国内网络、装有腾讯电脑管家)上稳定地**开发运行**和**打包** ClawX,
并让重复操作不必每次重新下载。规避已踩过的坑(详见记忆 `clawx-packaging-tfsflt-block`)。

## 方案 / 涉及文件

全部是**新增脚本**(零上游冲突),外加对**下载脚本的幂等化**(改动上游文件,但仅加守卫)。

**新增脚本(`scripts/`):**
- `dev.ps1` —— 清 `ELECTRON_RUN_AS_NODE`;默认以**隔离 profile** 启动(`.profiles/dev`,端口 18790/13211);`-Shared` 退回共用真实数据。
- `clawx-profile.ps1` —— 共享助手:设 `CLAWX_USER_DATA_DIR` + `OPENCLAW_HOME` + 端口(见 [openclaw-isolation.md](openclaw-isolation.md))。
- `package-win.ps1` —— 一键完整打包:Git bash 优先(避开坏 WSL bash)、清 `ELECTRON_RUN_AS_NODE`、清死代理,再 `pnpm package:win`。
- `sync-upstream.ps1` —— fetch upstream → main 快进 → custom rebase → force-with-lease push;只看已跟踪改动判定干净。
- `fetch-win-binaries.ps1` —— 镜像兜底:node 走 npmmirror、agent-browser 走 GitHub→gh-proxy,均带重试。

**改动的上游文件(仅加幂等守卫,冲突极小):**
- `scripts/download-bundled-{uv,node,agent-browser}.mjs` —— 目标二进制已存在则跳过(`--force` 强制)。
- `scripts/bundle-preinstalled-skills.mjs` —— 与清单一致则跳过 GitHub 拉取(`--force` / `FORCE_PREINSTALLED_SKILLS=1`)。

## 关键环境坑（一次性,已解决/记录）

- `pnpm package:win` 报 `rename electron.exe -> ClawX.exe` ENOENT:多为 **app-builder 的 Electron 缓存损坏**(`%LOCALAPPDATA%\electron\Cache` 里 zip 0 条目),删缓存重下即可;**不是杀软**。
- 死代理 `HTTP(S)_PROXY` 会让 app-builder 下载失败(proxyconnect);清掉直连 npmmirror。
- 预装技能用了坏的 WSL bash → `ERROR_PATH_NOT_FOUND`;把 Git bash 放 PATH 最前。
- 腾讯电脑管家的 `TFsFlt` 内核驱动会隔离 electron.exe(首次下载时),需卸载/停服务 + 重启。

## 验证

- `pnpm run prep:win-binaries` 二次运行应全部「Already present, skipping」。
- `pnpm exec zx scripts/bundle-preinstalled-skills.mjs` 二次运行应「already cached, skipping」。
- `pwsh ./scripts/package-win.ps1` 产出 `release\ClawX-<ver>-win-x64.exe`(有效 NSIS 安装包)。

## 与上游合并注意

- 新增脚本零冲突。
- 下载脚本的幂等守卫是**局部插入**(在 `setupTarget` 开头几行),上游若重构这些脚本需重新套用守卫。
