<#
.SYNOPSIS
    本地开发启动脚本。

.DESCRIPTION
    清除 ELECTRON_RUN_AS_NODE 后再启动 pnpm dev。
    某些终端/环境会注入 ELECTRON_RUN_AS_NODE=1,导致 Electron 退化为普通 Node,
    主进程启动时报 `Cannot read properties of undefined (reading 'getVersion')` 并崩溃。
    本脚本在启动前移除该变量,避免该问题。

.EXAMPLE
    pwsh ./scripts/dev.ps1
#>

$ErrorActionPreference = 'Stop'

# 切到仓库根目录
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if ($repoRoot) { Set-Location $repoRoot }

if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "检测到 ELECTRON_RUN_AS_NODE=$($env:ELECTRON_RUN_AS_NODE),已清除以正常启动 Electron。" -ForegroundColor Yellow
    $env:ELECTRON_RUN_AS_NODE = $null
}

pnpm dev
