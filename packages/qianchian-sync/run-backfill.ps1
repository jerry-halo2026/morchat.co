# 千川全量回填脚本 — PowerShell 原生，路径随脚本走
# 修复：原 Set-Location 指向 packages\qianchuan-sync（少一个 i 的旧目录），换到 qianchian-sync 后必失败
Set-Location $PSScriptRoot

Write-Host "=== 刷新 token ===" -ForegroundColor Cyan
node scripts/token-refresh.mjs

Write-Host "`n=== 全量回填（180 天窗口）===" -ForegroundColor Cyan
node run.mjs --backfill

Write-Host "`n=== 完成 ===" -ForegroundColor Green
Write-Host "按任意键退出…"
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
