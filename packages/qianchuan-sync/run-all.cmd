@echo off
REM 千川全量回填 — 直接双击或在 cmd 中运行
REM 用 %~dp0 定位脚本所在目录，避免硬编码绝对路径（仓库换位置即失效）
cd /d "%~dp0"
echo === 刷新 token ===
node scripts\token-refresh.mjs
echo === 跑全部源 ===
node run.mjs --backfill
echo.
echo === 完成 ===
pause
