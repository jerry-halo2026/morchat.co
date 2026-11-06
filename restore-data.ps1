# 从 git 对象库直接导出文件（绕过 checkout 的路径问题）
Set-Location "D:\dev\morchat.co"

$files = @(
    "packages/qianchian-sync/data/qc-uni-config-20261104.json",
    "packages/qianchuan-sync/data/qc-custom-report-catalog-20261104.json",
    "packages/qianchian-sync/data/qc-dashboard-config-20261104.json",
    "packages/qianchian-sync/data/qc-accounts-20261104.txt",
    "packages/qianchian-sync/data/qc-authors-20261104.json",
    "packages/qianchian-sync/scripts/token-refresh.mjs",
    "packages/qianchian-sync/docs/SYNC-ENGINE.md",
    "packages/qianchian-sync/README.md"
)

foreach ($f in $files) {
    $target = Join-Path "D:\dev\morchat.co" ($f -replace "/", "\")
    $dir = Split-Path $target -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    git show "HEAD:$f" | Out-File -FilePath $target -Encoding utf8
    $exists = Test-Path $target
    $size = if ($exists) { (Get-Item $target).Length } else { 0 }
    Write-Host "$f -> $exists ($size bytes)"
}

Write-Host "`n=== 目录结构 ==="
Get-ChildItem "packages\qianchuan-sync" -Recurse -Depth 1 | Select-Object -ExpandProperty FullName | ForEach-Object { $_.Replace("D:\dev\morchat.co\", "") }
