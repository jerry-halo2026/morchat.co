# 清理残留的 run.mjs 进程与僵尸锁文件
# 触发场景：Ctrl+C 中断跑批后 sync.lock 未被释放，下一轮直接报「已有进程在跑」
# 用法：powershell -File scripts/kill-stale-sync.ps1
$pkgRoot = Split-Path -Parent $PSScriptRoot

$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*run.mjs*' }
if ($procs) {
  foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force; Write-Output ("killed PID " + $p.ProcessId) }
} else { Write-Output "no run.mjs process alive" }

# 顺带清掉可能残留的锁文件
$lock = Join-Path $pkgRoot 'data\sync.lock'
if (Test-Path $lock) {
  $pid2 = (Get-Content $lock -Raw).Trim()
  $alive = Get-Process -Id ($pid2 -as [int]) -ErrorAction SilentlyContinue
  if (-not $alive) { Remove-Item $lock -Force; Write-Output "removed stale lock (pid $pid2)" }
  else { Write-Output "lock held by live pid $pid2" }
} else { Write-Output "no lock file" }
