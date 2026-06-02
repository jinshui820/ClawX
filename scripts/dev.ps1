<#
.SYNOPSIS
    本地开发启动脚本(默认数据隔离)。

.DESCRIPTION
    - 清除 ELECTRON_RUN_AS_NODE(否则 Electron 退化为 node,报 getVersion 崩溃)。
    - 默认以**隔离 profile** 启动:dev 用独立的 ~/.openclaw、~/.clawx、userData 和端口,
      与你安装的正式版 / 独立 OpenClaw 互不干扰,可同时运行。
      隔离数据放在 <repo>\.profiles\<ProfileName>\ 下。
    - 传 -Shared 则退回共用真实的 ~/.openclaw 与默认端口(旧行为)。

.PARAMETER ProfileName
    隔离 profile 名(默认 dev)。不同名字 = 不同独立实例。

.PARAMETER GatewayPort
    OpenClaw 网关端口(dev 默认 18790;正式版构建默认 18792;独立 OpenClaw 常用 18789)。

.PARAMETER HostApiPort
    主进程 Host API 端口(dev 默认 13211;正式版构建默认 13212)。

.PARAMETER Shared
    不隔离,使用真实 ~/.openclaw 与默认端口。

.EXAMPLE
    pwsh ./scripts/dev.ps1               # 隔离 dev,网关 18790
    pwsh ./scripts/dev.ps1 -Shared       # 共用正式版数据(旧行为)
    pwsh ./scripts/dev.ps1 -ProfileName dev2 -GatewayPort 18793 -HostApiPort 13213
#>

param(
    [string]$ProfileName = 'dev',
    [int]$GatewayPort = 18790,
    [int]$HostApiPort = 13211,
    [switch]$Shared
)

$ErrorActionPreference = 'Stop'

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if ($repoRoot) { Set-Location $repoRoot }

if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "已清除 ELECTRON_RUN_AS_NODE" -ForegroundColor Yellow
    $env:ELECTRON_RUN_AS_NODE = $null
}

if (-not $Shared) {
    . "$PSScriptRoot/clawx-profile.ps1"
    $base = Join-Path $repoRoot ".profiles/$ProfileName"
    Set-ClawXProfileEnv `
        -HomeDir (Join-Path $base 'home') `
        -UserDataDir (Join-Path $base 'userdata') `
        -GatewayPort $GatewayPort `
        -HostApiPort $HostApiPort
} else {
    Write-Host "共享模式:使用真实 ~/.openclaw 与默认端口" -ForegroundColor Yellow
}

pnpm dev
