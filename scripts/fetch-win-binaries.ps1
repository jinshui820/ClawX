<#
.SYNOPSIS
    在国内网络环境下,稳健地获取 Windows 打包所需的捆绑二进制
    (agent-browser.exe + node.exe),绕开脚本里脆弱的 Node fetch。

.DESCRIPTION
    - node:        从 npmmirror 镜像下载(国内快),解压出 node.exe
    - agent-browser: 从 GitHub 下载,curl 带重试;失败则回退 gh-proxy 镜像
    放置到 electron-builder 期望的路径:
      resources/bin/win32-x64/{node.exe,agent-browser.exe}
      resources/bin/win32-arm64/{node.exe,agent-browser.exe}
    uv.exe 已存在则跳过。

.NOTES
    版本号需与 scripts/download-bundled-node.mjs / download-bundled-agent-browser.mjs 保持一致。
#>

$ErrorActionPreference = 'Stop'
$NODE_VERSION = '22.16.0'
$AB_VERSION   = 'v0.27.0'

$repoRoot = (git rev-parse --show-toplevel)
Set-Location $repoRoot
$bin = Join-Path $repoRoot 'resources/bin'

function Get-File($url, $out) {
    Write-Host "⬇️  $url" -ForegroundColor Cyan
    curl.exe -L --fail --retry 6 --retry-all-errors --retry-delay 3 `
        --connect-timeout 30 --max-time 600 -o $out $url
    if ($LASTEXITCODE -ne 0) { throw "下载失败 ($LASTEXITCODE): $url" }
    if (-not (Test-Path $out) -or (Get-Item $out).Length -eq 0) { throw "文件为空: $out" }
}

# ---------- node.exe (x64 + arm64) ----------
$nodeArchs = @{
    'win32-x64'   = "node-v$NODE_VERSION-win-x64"
    'win32-arm64' = "node-v$NODE_VERSION-win-arm64"
}
foreach ($id in $nodeArchs.Keys) {
    $dir = Join-Path $bin $id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $dest = Join-Path $dir 'node.exe'
    if (Test-Path $dest) { Write-Host "✅ 已存在: $dest" -ForegroundColor Green; continue }

    $name = $nodeArchs[$id]
    $zip  = Join-Path $env:TEMP "$name.zip"
    $url  = "https://registry.npmmirror.com/-/binary/node/v$NODE_VERSION/$name.zip"
    Get-File $url $zip

    $tmp = Join-Path $env:TEMP "node_extract_$id"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    Copy-Item (Join-Path $tmp "$name/node.exe") $dest -Force
    Remove-Item -Recurse -Force $tmp
    Remove-Item -Force $zip
    Write-Host "✅ node.exe -> $dest" -ForegroundColor Green
}

# ---------- agent-browser.exe (x64;arm64 复用 x64) ----------
$abX64Dir = Join-Path $bin 'win32-x64'
$abArmDir = Join-Path $bin 'win32-arm64'
New-Item -ItemType Directory -Force -Path $abX64Dir, $abArmDir | Out-Null
$abX64 = Join-Path $abX64Dir 'agent-browser.exe'

if (-not (Test-Path $abX64)) {
    $asset = 'agent-browser-win32-x64.exe'
    $direct = "https://github.com/vercel-labs/agent-browser/releases/download/$AB_VERSION/$asset"
    $proxy  = "https://gh-proxy.com/$direct"
    try {
        Get-File $direct $abX64
    } catch {
        Write-Host "⚠️ 直连 GitHub 失败,改用 gh-proxy 镜像..." -ForegroundColor Yellow
        Get-File $proxy $abX64
    }
    Write-Host "✅ agent-browser.exe -> $abX64" -ForegroundColor Green
} else {
    Write-Host "✅ 已存在: $abX64" -ForegroundColor Green
}
# arm64 复用同一个 x64 二进制
Copy-Item $abX64 (Join-Path $abArmDir 'agent-browser.exe') -Force
Write-Host "✅ agent-browser.exe (arm64 复用) 就绪" -ForegroundColor Green

Write-Host "`n🎉 Windows 二进制全部就绪" -ForegroundColor Green
Get-ChildItem -Recurse $bin | Where-Object { -not $_.PSIsContainer } |
    ForEach-Object { "{0,-45} {1,10:N0} bytes" -f $_.FullName.Replace($repoRoot,'.'), $_.Length }
