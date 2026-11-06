# 测试脚本：跑短源 + 验证文件
Set-Location "D:\dev\morchat.co\packages\qianchian-sync"

Write-Host "=== accounts ===" -ForegroundColor Cyan
node run.mjs --source accounts 2>&1 | Select-Object -Last 3

Write-Host "`n=== anchors ===" -ForegroundColor Cyan
node run.mjs --source anchors 2>&1 | Select-Object -Last 3

Write-Host "`n=== 文件验证 ===" -ForegroundColor Yellow
$base = "D:\dev\morchat.co\packages\qianchian-sync\data\raw"
foreach ($d in @("accounts","anchors")) {
    $p = Join-Path $base $d
    if (Test-Path $p) {
        $files = (Get-ChildItem $p -Filter "*.json" -File | Where-Object { $_.DirectoryName -notmatch "versions" }).Count
        Write-Host "$d : $files files"
    } else {
        Write-Host "$d : directory missing" -ForegroundColor Red
    }
}
$totalSize = [math]::Round((Get-ChildItem $base -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1KB, 0)
Write-Host "`nTotal: ${totalSize} KB"
