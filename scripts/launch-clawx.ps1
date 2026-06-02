<#
.SYNOPSIS
    以隔离 profile 启动**已安装的正式版 ClawX**。

.DESCRIPTION
    给安装好的 ClawX.exe 套上独立的数据与端口,使它与独立 OpenClaw / dev / 另一个
    ClawX profile 互不干扰、可同时运行。隔离数据默认放在:
        %LOCALAPPDATA%\ClawX-Profiles\<Profile>\
    需要打过本仓库 custom 分支补丁的正式版(端口/userData 可配)才能完整生效。

.PARAMETER Profile
    profile 名(默认 main)。不同名字 = 不同独立实例,各自一套数据。

.PARAMETER GatewayPort
    OpenClaw 网关端口(默认 18789)。与独立 OpenClaw 同时跑时改成别的(如 18800)。

.PARAMETER HostApiPort
    主进程 Host API 端口(默认 13210)。

.PARAMETER ExePath
    ClawX.exe 路径。默认自动探测常见安装位置。

.PARAMETER DataRoot
    隔离数据根目录(默认 %LOCALAPPDATA%\ClawX-Profiles)。

.EXAMPLE
    pwsh ./scripts/launch-clawx.ps1                                  # main,网关 18789
    pwsh ./scripts/launch-clawx.ps1 -Profile work -GatewayPort 18800 -HostApiPort 13220
#>

param(
    [string]$Profile = 'main',
    [int]$GatewayPort = 18789,
    [int]$HostApiPort = 13210,
    [string]$ExePath,
    [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'ClawX-Profiles')
)

$ErrorActionPreference = 'Stop'

# 探测已安装的 ClawX.exe
if (-not $ExePath) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\ClawX\ClawX.exe'),
        'C:\Program Files\ClawX\ClawX.exe',
        (Join-Path $env:LOCALAPPDATA 'Programs\clawx\ClawX.exe')
    )
    $ExePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ExePath -or -not (Test-Path $ExePath)) {
    Write-Host "✗ 找不到 ClawX.exe。请用 -ExePath 指定,例如:" -ForegroundColor Red
    Write-Host "  pwsh ./scripts/launch-clawx.ps1 -ExePath 'C:\path\to\ClawX.exe'" -ForegroundColor Yellow
    exit 1
}

# 加载共享 profile 助手并设置环境
. "$PSScriptRoot/clawx-profile.ps1"
$base = Join-Path $DataRoot $Profile
Set-ClawXProfileEnv `
    -HomeDir (Join-Path $base 'home') `
    -UserDataDir (Join-Path $base 'userdata') `
    -GatewayPort $GatewayPort `
    -HostApiPort $HostApiPort

Write-Host "==> 启动 $ExePath  (profile=$Profile)" -ForegroundColor Cyan
# 用 Start-Process 让 ClawX 独立于本终端运行
Start-Process -FilePath $ExePath
Write-Host "✓ 已启动。该实例使用独立数据($base)与端口($GatewayPort/$HostApiPort)。" -ForegroundColor Green
