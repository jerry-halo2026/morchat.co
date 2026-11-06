# 从初始 commit 20d04d7 提取丢失文件
Set-Location "D:\dev\morchat.co"
$INIT = "20d04d7"

$files = @(
    "packages/qianchian-sync/data/qc-uni-config-20261104.json",
    "packages/qianchian-sync/data/qc-dashboard-config-20261104.json",
    "packages/qianchian-sync/data/qc-accounts-20261104.txt",
    "packages/qianchuan-sync/data/qc-authors-20261104.json",
    "packages/qianchian-sync/scripts/token-refresh.mjs",
    "packages/qianchian-sync/docs/SYNC-ENGINE.md",
    "packages/qianchian-sync/README.md"
)

foreach ($f in $files) {
    $target = Join-Path "D:\dev\morchat.co" ($f -replace "/", "\")
    $dir = Split-Path $target -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    # 尝试初始 commit
    $content = git show "${INIT}:$f" 2>&1
    if ($LASTEXITCODE -eq 0 -and $content) {
        # 用 cmd 的重定向避免 PowerShell 编码问题
        $cmd = "git show ${INIT}:$f > `"$target`""
        cmd /c $cmd
        $size = (Get-Item $target -ErrorAction SilentlyContinue).Length
        Write-Host "OK  $f ($size bytes)"
    } else {
        Write-Host "FAIL $f : $($content | Select-Object -First 1)"
    }
}
Write-Host "`nDone."
