# 千川全量回填脚本 — PowerShell 原生，路径稳定
Set-Location "D:\dev\morchat.co\packages\qianchuan-sync"

Write-Host "=== 刷新 token ===" -ForegroundColor Cyan
node scripts/token-refresh.mjs

Write-Host "`n=== 全量回填（180 天窗口）===" -ForegroundColor Cyan
node run.mjs --all --backfill

Write-Host "`n=== 完成 ===" -ForegroundColor Green
Write-Host "按任意键退出…"
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
