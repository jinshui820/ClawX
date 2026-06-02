<#
.SYNOPSIS
    共享助手:为一个隔离的 ClawX 实例(profile)配置环境变量。

.DESCRIPTION
    dot-source 本文件后调用 Set-ClawXProfileEnv,让随后启动的 ClawX 使用一套
    **独立**的数据与端口,与其它实例 / 独立官方 OpenClaw 互不干扰。

    只需设 userData + 端口:打过补丁的 ClawX 会
      - 通过 CLAWX_USER_DATA_DIR 把 Electron userData 指到隔离目录(单实例锁随之隔离);
      - 在 early-env 里把 OPENCLAW_HOME 默认成该 userData,于是自带 OpenClaw 配置落在
        <userData>\.openclaw,和官方 ~/.openclaw 彻底分开。
    不再改写 USERPROFILE/HOME,所以 dev 里的 ~/Downloads、~ 展开仍指向真实目录。

    用法:
      . "$PSScriptRoot/clawx-profile.ps1"
      Set-ClawXProfileEnv -UserDataDir D:\x\udata -GatewayPort 18790 -HostApiPort 13211
#>

function Set-ClawXProfileEnv {
    param(
        [Parameter(Mandatory)] [string]$UserDataDir,
        [Parameter(Mandatory)] [int]$GatewayPort,
        [Parameter(Mandatory)] [int]$HostApiPort
    )

    New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null

    # 数据隔离:userData(含单实例锁、electron-store、日志);OpenClaw 配置自动落 <userData>\.openclaw
    $env:CLAWX_USER_DATA_DIR = $UserDataDir
    # 显式同步 OPENCLAW_HOME = userData(与 early-env 默认一致,确保未打补丁场景也隔离)
    $env:OPENCLAW_HOME = $UserDataDir

    # 端口隔离
    $env:CLAWX_GATEWAY_PORT        = "$GatewayPort"
    $env:CLAWX_PORT_CLAWX_HOST_API = "$HostApiPort"

    # 避免 Electron 被当成 node 跑
    $env:ELECTRON_RUN_AS_NODE = $null

    Write-Host "ClawX profile:" -ForegroundColor Cyan
    Write-Host "  userData    = $UserDataDir  (-> .openclaw 落于此)" -ForegroundColor Gray
    Write-Host "  gatewayPort = $GatewayPort" -ForegroundColor Gray
    Write-Host "  hostApiPort = $HostApiPort" -ForegroundColor Gray
}
