<#
.SYNOPSIS
    共享助手:为一个隔离的 ClawX 实例(profile)配置环境变量。

.DESCRIPTION
    dot-source 本文件后调用 Set-ClawXProfileEnv,即可让随后启动的 ClawX
    (dev 或正式版)使用一套**独立**的数据与端口,与其它实例 / 独立 OpenClaw 互不干扰:

      - HomeDir     -> ~/.openclaw 与 ~/.clawx 的落点
                       (ClawX 走 os.homedir()=USERPROFILE;网关是独立 openclaw 进程,
                        认 OPENCLAW_HOME / HOME)
      - UserDataDir -> Electron userData(含单实例锁、electron-store 设置、日志)
                       由打过补丁的 index.ts 通过 CLAWX_USER_DATA_DIR 生效
      - GatewayPort -> OpenClaw 网关端口(CLAWX_GATEWAY_PORT)
      - HostApiPort -> 主进程 Host API 端口(CLAWX_PORT_CLAWX_HOST_API;preload 注入给渲染进程)

    用法:
      . "$PSScriptRoot/clawx-profile.ps1"
      Set-ClawXProfileEnv -HomeDir D:\x\home -UserDataDir D:\x\udata -GatewayPort 18790 -HostApiPort 13211
#>

function Set-ClawXProfileEnv {
    param(
        [Parameter(Mandatory)] [string]$HomeDir,
        [Parameter(Mandatory)] [string]$UserDataDir,
        [Parameter(Mandatory)] [int]$GatewayPort,
        [Parameter(Mandatory)] [int]$HostApiPort
    )

    New-Item -ItemType Directory -Force -Path $HomeDir, $UserDataDir | Out-Null

    # --- 数据隔离 ---
    # os.homedir() 在 Windows 上取 USERPROFILE;openclaw 还认 OPENCLAW_HOME / HOME。
    $env:USERPROFILE   = $HomeDir
    $env:HOME          = $HomeDir
    $env:OPENCLAW_HOME = $HomeDir
    # Electron userData(打过补丁的 index.ts 会 setPath)
    $env:CLAWX_USER_DATA_DIR = $UserDataDir

    # --- 端口隔离 ---
    $env:CLAWX_GATEWAY_PORT        = "$GatewayPort"
    $env:CLAWX_PORT_CLAWX_HOST_API = "$HostApiPort"

    # 避免 Electron 被当成 node 跑
    $env:ELECTRON_RUN_AS_NODE = $null

    Write-Host "ClawX profile:" -ForegroundColor Cyan
    Write-Host "  home        = $HomeDir  (-> .openclaw / .clawx)" -ForegroundColor Gray
    Write-Host "  userData    = $UserDataDir" -ForegroundColor Gray
    Write-Host "  gatewayPort = $GatewayPort" -ForegroundColor Gray
    Write-Host "  hostApiPort = $HostApiPort" -ForegroundColor Gray
}
