<#
.SYNOPSIS
    把官方 upstream/main 的更新同步到本地 main,并将定制分支 custom rebase 到最新。

.DESCRIPTION
    远程结构假设:
      upstream -> 官方仓库 (ValueCell-ai/ClawX),只读
      origin   -> 你的 fork (jinshui820/ClawX),读写
      main     -> 镜像上游,不手改
      custom   -> 你的定制分支

    流程:
      1. fetch upstream
      2. main 快进到 upstream/main 并推到 origin
      3. custom rebase 到 main
      4. custom 强制安全推送到 origin (--force-with-lease)

    遇到 rebase 冲突时脚本会停下并给出提示;
    解决冲突后运行  git rebase --continue,再重新执行本脚本即可(它会自动续上)。

.PARAMETER Custom
    定制分支名,默认 custom。

.EXAMPLE
    pwsh ./scripts/sync-upstream.ps1
#>

param(
    [string]$Custom = 'custom'
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }

# 切到仓库根目录
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { Fail "当前目录不是 git 仓库。" }
Set-Location $repoRoot

# 如果上一次 rebase 卡在冲突里还没解决,先提示
if (Test-Path (Join-Path $repoRoot '.git/rebase-merge')) {
    Fail "检测到未完成的 rebase。请先解决冲突并 ``git rebase --continue``(或 ``git rebase --abort``)后再运行。"
}

# 工作区必须干净(只看已跟踪文件;未跟踪文件不影响 rebase)
if (git status --porcelain --untracked-files=no) {
    Fail "工作区有未提交的已跟踪改动,请先提交或 stash。"
}

# 远程检查
$remotes = git remote
if ($remotes -notcontains 'upstream') { Fail "缺少 upstream 远程。" }
if ($remotes -notcontains 'origin')   { Fail "缺少 origin 远程。" }

Step "fetch upstream"
git fetch upstream --prune
Ok "已拉取上游"

# 更新 main
Step "更新 main -> upstream/main"
git checkout main
git merge --ff-only upstream/main
if ($LASTEXITCODE -ne 0) {
    Fail "main 无法快进合并 upstream/main —— 说明 main 上有本地提交。main 应保持干净,请检查。"
}
git push origin main
Ok "main 已同步并推送到 origin"

# rebase 定制分支
Step "rebase $Custom -> main"
git checkout $Custom
git rebase main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "⚠ rebase 出现冲突,流程已暂停。" -ForegroundColor Yellow
    Write-Host "  1) 编辑冲突文件,git add 解决后的文件" -ForegroundColor Yellow
    Write-Host "  2) git rebase --continue" -ForegroundColor Yellow
    Write-Host "  3) 完成后重新运行本脚本完成推送(已开启 rerere,重复冲突会自动套用上次解法)" -ForegroundColor Yellow
    Write-Host "  放弃本次同步:git rebase --abort" -ForegroundColor Yellow
    exit 1
}
Ok "$Custom 已 rebase 到最新 main"

# 推送定制分支
Step "推送 $Custom 到 origin"
git push origin $Custom --force-with-lease
Ok "$Custom 已推送"

Write-Host ""
Ok "同步完成 🎉  当前分支:$Custom"
