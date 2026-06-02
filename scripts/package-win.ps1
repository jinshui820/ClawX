<#
.SYNOPSIS
    一键完整打包 Windows 安装包,自动规避本机已知的环境坑。

.DESCRIPTION
    在调用 `pnpm package:win` 前做三件事:
      1. 把 Git 自带 bash 放到 PATH 最前面 —— 否则 zx 会用坏掉的 WSL bash
         (system32\bash.exe),导致预装技能 git fetch 报 ERROR_PATH_NOT_FOUND。
      2. 清除 ELECTRON_RUN_AS_NODE —— 否则相关步骤可能把 Electron 当 node 跑。
      3. 清除 HTTP_PROXY/HTTPS_PROXY —— 本机这俩曾指向不可达的远程代理,
         会让 app-builder 下载 Electron 失败(proxyconnect)。直连 npmmirror 即可。

    幂等说明(无需每次重下):
      - 捆绑二进制(uv/node/agent-browser)已存在则跳过(--force 强制)。
      - 预装技能已缓存且与清单一致则跳过(FORCE_PREINSTALLED_SKILLS=1 强制重拉)。
      - Electron 运行时由 electron-builder 自带缓存;若缓存损坏报
        `rename electron.exe -> ClawX.exe` ENOENT,删除 `%LOCALAPPDATA%\electron\Cache` 重来。

.PARAMETER KeepProxy
    保留当前 HTTP_PROXY/HTTPS_PROXY(默认会清除)。

.EXAMPLE
    pwsh ./scripts/package-win.ps1
#>

param(
    [switch]$KeepProxy
)

$ErrorActionPreference = 'Stop'

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if ($repoRoot) { Set-Location $repoRoot }

# 1. Git bash 优先,避开坏掉的 WSL bash
$gitBin = 'C:\Program Files\Git\bin'
if (Test-Path $gitBin) {
    $env:PATH = "$gitBin;" + $env:PATH
    Write-Host "✓ 使用 Git bash: $gitBin\bash.exe" -ForegroundColor Green
} else {
    Write-Host "⚠ 未找到 Git bash($gitBin),zx 可能回退到 WSL bash。" -ForegroundColor Yellow
}

# 2. Electron 不能以 node 模式运行
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "✓ 已清除 ELECTRON_RUN_AS_NODE" -ForegroundColor Green
    $env:ELECTRON_RUN_AS_NODE = $null
}

# 3. 清除可能不可达的代理(让 app-builder 直连镜像下载 Electron)
if (-not $KeepProxy) {
    foreach ($v in 'HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy') {
        if (Test-Path "Env:\$v") {
            Write-Host "✓ 已清除 $v(原值: $((Get-Item Env:\$v).Value))" -ForegroundColor Green
            Remove-Item "Env:\$v" -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "==> pnpm package:win" -ForegroundColor Cyan
pnpm package:win
$code = $LASTEXITCODE

if ($code -eq 0) {
    Write-Host "`n🎉 打包完成,产物在 release\ 下:" -ForegroundColor Green
    Get-ChildItem release -Filter '*.exe' -ErrorAction SilentlyContinue |
        Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}} | Format-Table -Auto
} else {
    Write-Host "`n✗ 打包失败(exit $code)。" -ForegroundColor Red
    Write-Host "  若报 'rename electron.exe -> ClawX.exe' ENOENT,多半是 Electron 缓存损坏:" -ForegroundColor Yellow
    Write-Host "  Remove-Item -Recurse -Force \$env:LOCALAPPDATA\electron\Cache  然后重跑。" -ForegroundColor Yellow
}
exit $code
