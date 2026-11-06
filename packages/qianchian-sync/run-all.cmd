@echo off
REM 千川全量回填 — 直接双击或在 cmd 中运行
cd /d D:\dev\morchat.co\packages\qianchian-sync
echo === 刷新 token ===
node scripts\token-refresh.mjs
echo === 跑全部源 ===
node run.mjs --all --backfill
echo.
echo === 完成 ===
pause
