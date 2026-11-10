---
purpose: "Desktop dev actual run — 2026-11-09"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# Desktop dev actual run — 2026-11-09

## Latest verified state — 2026-11-09 17:14:25 +08:00

**The actual Desktop startup-path failure is fixed and verified through its real Stop → Start buttons.** Reviewed private `start-desktop.ps1` was executed after Root normally closed the old GUI and cleared the queued task with user approval. New native Electron PID **28668**, HWND **594198**, live dev session **8295** preserve the same isolated login/userData/source. Electron automatically spawned daemon **40672** with genuine `launched_by=desktop`; Root then used the actual Desktop Stop button and Start button, producing current daemon **30736**. Health is **running**, profile `desktop-localhost-8080`, agents `[dsh]`, managed by Desktop, active/running/wait counts **0**. Root's final UI showed “1台在线 / DeepSeek Harness在线 / 由桌面端管理 / 全部空闲”. A post-button 45.96-second/33-sample observation completed at 17:14:25 with no task/stdio or model-list request observed. This is not a paid inference/task test or future no-execution guarantee. No manual CLI start or forged launched_by marker was used in this verification. Keep GUI28668/daemon30736/session8295 running; no extra restart is needed. Next startup uses `E:\CodexData\morchat-r1-local\run\multica-local-demo\start-desktop.ps1`, SHA256 `DB38F3AD2D77B9B0EBDAC32067C0E92A2E2F31C9FCEB20BE00E4CD77E922A0AD`.
## Initial checkpoint (historical)

- Reviewed source: committed `51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271`, exported by Root to `E:\CodexData\morchat-r1-local\run\multica-local-demo\source-51e23d9` (no new repo/worktree). Original source/WIP and its partial node_modules were not changed.
- **Desktop started and remains running.** Main Electron PID `28988`; launcher Node PID `23100`; electron-vite Node PID `49064`; live execution session `12770`; native window handle `2885428`, title initially `Multica`, later `任务`.
- Renderer: `http://localhost:5178/`; API: `http://localhost:8080`; WS: `ws://localhost:8080/ws`; app/share URL: `http://localhost:3000`.
- The first UI observation showed the native password-login screen. No credentials were entered/read by this agent. A later read-only observation showed signed-in workspace `titan-868o` with TITA-1/2/3. Native logs show `/auth/supabase` 200 and subsequent task APIs 200. This establishes app login, **not daemon registration**.
- **Bundled Windows CLI built successfully** using the repository's existing `bundle-cli.mjs`. `multica --version`: `multica dev (commit: unknown)`, Go `go1.27.3`, windows/amd64. The export has no `.git`, so the existing script legitimately uses `dev/unknown`; no metadata was forged.
- **Daemon is not running/registered successfully.** Native login sync selected profile `desktop-localhost-8080` and minted its PAT (not read). Automatic native daemon startup/recovery failed: `no agent CLI found ... dsh ... ensure it is on PATH` in this run's daemon.err.log. The explicitly sanitized PATH intentionally contains only pinned Node/Go, Git, and Windows system paths. The user-specified DSH executable directory must be supplied explicitly rather than scanning real home directories or inheriting the full user environment.
- **No AI/DSH task was executed.** No model budget was used by this agent. No task-dispatch test, synthetic token, new harness, or credential reuse was attempted.

## Tool/dependency commands actually used

Pinned Node: `E:\CodexData\morchat-r1-local\tools\node22\node-v22.23.4-win-x64\node.exe` (`v22.23.4`). Pinned Go: `E:\CodexData\morchat-r1-local\tools\go127\go\bin\go.exe` (`go1.27.3`). No Windows PATH fallback pnpm was used.

With cwd guarded to the exported source, isolated HOME/USERPROFILE/AppData, empty npm userconfig, and explicit official registry:

```text
node <pinned-node-dir>\node_modules\npm\bin\npm-cli.js install --prefix E:\CodexData\morchat-r1-local\run\multica-local-demo\desktop-bootstrap pnpm@10.28.2 --ignore-scripts --package-lock=false --registry=https://registry.npmjs.org
node <private-root>\desktop-bootstrap\node_modules\pnpm\bin\pnpm.cjs --version
node <private-root>\desktop-bootstrap\node_modules\pnpm\bin\pnpm.cjs --filter @multica/desktop... install --frozen-lockfile --registry=https://registry.npmjs.org
node apps/desktop/scripts/bundle-cli.mjs
```

Frozen install succeeded (pnpm 10.28.2). Locked Electron 44.9.3 binary exists. Only repository-allowed build scripts ran; ignored optional scripts were not approved. Lock SHA256 before/after: `D8CE587411C76846769EF7F3B28C6717D871FBEC31ACE56633748E062C1F43C6`.

Actual dev cwd: `<export>\apps\desktop`; command: `node scripts/dev.mjs`. Original chain executed `bundle-cli.mjs` → `brand-dev-electron.mjs` (Windows no-op) → `electron-vite dev`. Main/preload builds succeeded; renderer connected; native window opened.

## Isolation and retained handles

- HOME/USERPROFILE: `E:\CodexData\morchat-r1-local\run\multica-local-demo\desktop-profile-51e23d9`.
- Actual userData: `<isolated-home>\AppData\Roaming\Multica Canary r1-local-51e23d9`.
- Desktop-owned daemon profile: `<isolated-home>\.multica\profiles\desktop-localhost-8080`.
- `DESKTOP_APP_SUFFIX=r1-local-51e23d9`; `DESKTOP_RENDERER_PORT=5178`; explicit VITE API/WS/APP URLs as above.
- `MULTICA_WORKSPACES_ROOT=<isolated-home>\workspaces` (new empty directory; no real-directory scan).
- Personal provider/API/SSH/cloud/task environment was removed by allowlisting only basic Windows OS variables before setting the explicit paths/config above. Git global config was pointed to the private empty file; npm userconfig also private/empty. Existing private Go caches were reused at `E:\CodexData\morchat-r1-local\go-cache` and `go-mod`.
- Logs: `<private-root>\desktop-deps.log`, `desktop-cli-build.log`, `desktop-dev.log`; native failure: `<isolated-home>\.multica\profiles\desktop-localhost-8080\daemon.err.log`. Never print/copy profile config.json or credentials.
- The original execution session `12770` is intentionally retained. Do not restart merely because a tool wait yields. No Web/API/DB container was restarted/stopped by this agent.

## Remaining action / safety

A Windows security prompt asked for Node.js public-network access during the initial screenshot. It was not clicked. Loopback dev does not require a public-network grant; the user/Root retains control of that prompt. No UI input was performed by this agent.

Next: Root supplies the previously user-approved DSH absolute executable path. Inspect only that exact executable metadata and the existing native DSH probe behavior before any environment adjustment/restart. Do not claim daemon owner-binding/registration until native status actually proves it. Never dispatch an AI task without the user's model budget approval.

## Follow-up checkpoint — exact DSH path, 16:26 local

Root supplied the user-approved installed CLI `D:\software\deepseekharness\resources\runtime\cli\bin\dsh.cmd`. Its existing wrapper runs the bundled DeepSeek Harness executable as Node with `ELECTRON_RUN_AS_NODE=1`; no wrapper/source was changed.

Repository inspection established: discovery is LookPath only; native registration executes `dsh --version`; `dsh --profile multica --probe` is reached only if the isolated profile manifest actually names `@multica-ai/dsh-runtime`. Missing manifest returns before spawning the probe. `MULTICA_DSH_PROFILE_BUNDLE` is unset, so automatic profile installation is disabled. None of these discovery commands dispatches an AI task.

Without restarting/killing the existing GUI, executed the existing bundled CLI once:

```text
<export>\apps\desktop\resources\bin\multica.exe daemon start --profile desktop-localhost-8080
```

The child used the same isolated HOME/USERPROFILE/AppData/workspaces and sanitized environment as Desktop, additionally `DSH_HOME=<isolated-home>\.dsh`, `MULTICA_LAUNCHED_BY=desktop`, and only the exact DSH command directory prepended to PATH. Existing Desktop PAT was used internally by the original CLI; it was not read or printed by the agent. No token/prefs/config changes were made manually.

Actual native log evidence:

- `starting daemon ... agents=[dsh] ... profile=desktop-localhost-8080`
- `authenticated`; workspace sync fetched 1 workspace.
- DSH exact path adopted; version `0.2.2-rc.1` detected.
- `skip registering runtime: DSH Multica runtime profile is not installed`.
- `no agent runtimes could be registered`; startup exited 1.
- Correct profile health port is `19544` (base+1+byte-sum **mod 1000**); it briefly listened on `127.0.0.1:19544` and then closed. No daemon remains live. The original Desktop PID `28988` / execution session `12770` were not restarted or killed.

`--probe` was not invoked (isolated multica manifest absent). No `plugin add`, model call, stdio task, directory scan, synthetic profile, runtime bridge, or second daemon was created. Start output is `<private-root>\desktop-daemon-start.log`.

**Current blocker:** a genuine, reviewed `@multica-ai/dsh-runtime` bundle is needed to install the Multica profile into the isolated DSH home through DSH's existing `plugin --profile multica add <actual-bundle>` flow. This committed export contains no such package; the original code says it is not yet published to npm. Do not fabricate a manifest or copy the user's real DSH home/API keys. Root must supply an existing reviewed bundle/spec or authorize that separate installation source before proceeding.

## Official bundle prepared for independent review — 16:34 local

The prior missing-input conclusion is superseded: Root found the genuine official repository linked by committed `agent_ready.go`: `https://github.com/multica-ai/dsh-multica-runtime`. Prepared only its fixed commit `571d7c036d15f58ee88c89fd80afb0a6c7f0023c` in the expressly authorized private dependency directory:

`E:\CodexData\morchat-r1-local\run\multica-local-demo\dsh-runtime-571d7c0`

Archive: `https://codeload.github.com/multica-ai/dsh-multica-runtime/tar.gz/571d7c036d15f58ee88c89fd80afb0a6c7f0023c`; SHA256 `0332BE16D439D812DCDC86A004E0CD27064D9F8C1D384AB6F106035BA49F842F`.

Original official package is `@multica-ai/dsh-runtime@0.2.0-private.1`, main `dist/index.js`, bundle patch `cordis.patch.yml`; no official source, manifest, engine or patch was edited. Using pinned Node 22.23.4 / pnpm 10.28.2 and a separately isolated `.local/build-home` (no provider keys or real user config), ran:

```text
pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
pnpm check
```

Both exited 0. Official check executed typecheck, all **3 test files / 22 tests**, then TypeScript build. Tests use fake agents/contexts, deterministic protocol data and synthetic credential strings; they do not call providers or start DSH. Install scripts were disabled. Logs are `<bundle>\.local\install.log` and `check.log`; built entry exists at `<bundle>\dist\index.js`.

SHA256 evidence (before/after official tracked files match):

- package.json: `B40E9F30E418DBDCBBB5155BD7B1F95C5F5DCC5D55C27AB14BEC5E7A2CE64EAA`
- pnpm-lock.yaml: `AD04B7137CA98B6B556A9A88B0007003010042DC9EE1EA39CE5C07C4B9733DD8`
- cordis.patch.yml: `0F45A49E81ABC42CF77770F9FC9709EF9E150E894118D09DFB95C1C6F9EE0561`
- built dist/index.js: `D505B90CA72B53D6EEF7A66093B2DF235F7F558BDEA1F296DB84FB6025EA998E`

### Compatibility / probe review facts

Official engine declares Node `^22.19.0 || >=24.0.0` and DSH `>=0.2.1-rc.2 <0.3.0`. Static inspection of the actually installed DSH ASAR (SHA256 `5FA8A6B21BCEB8F3E99E30EFA2270EFD0CC773A11E42AA0488F804A64B34E637`) found `/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js:1094-1102`: its engine check uses `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`. An own `engines.dsh` decides compatibility, rather than peer ranges (documented/implemented from line 1119). Thus DSH **0.2.2-rc.1 is accepted by the original engine rule**; no engine override/exemption is needed. This is declared compatibility, not a claim that live loading already passed. The build/test dependency family is officially locked at DSH 0.2.1-rc.2 / Cordis 4.0.5; the installed DSH tree uses 0.2.2-rc.1 / Cordis 4.1.0, so actual integration still requires the authorized native probe.

Official `src/index.ts:run` waits for loader, then the `--probe` branch only writes `{v:1,type:"probe",runtime:"dsh",plugin_version:"0.2.0-private.1",protocol_version:1}` and requests app exit. Model enumeration is in the separate `--list-models` branch; execution is only in `--stdio` upon an execute command. No such mode was run during this preparation. The bundle patch disables HMR and session telemetry, redirects session persistence to the supplied/DSH session root, changes system prompt persona and inserts the official headless runner. It does not itself add an HTTP listener or provider key.

**Review handoff:** bundle is built and ready. Per Root's explicit boundary, this phase did **not** run `plugin add`, load a profile, run `--probe`, start/restart daemon, or execute any model/task. No real DSH home, user API keys or isolated Multica PAT contents were read. Original Desktop PID 28988 / session 12770 remain untouched (latest title observed: Create Agent, user-controlled). Await Root's brief independent source/manifest/patch review before installing the official bundle into the isolated DSH home.

## Approved native install + protocol probe — 2026-11-09, 16:42 local

Executed only after Root approved `DSH-RUNTIME-REVIEW.md` SHA256 `916FFDB57CC7E175A013BE1D6D7D8045D87210D6644D7B5885D50C2EF2B2F047`. No daemon startup/model-list/stdio/task was authorized or run in this phase.

### Isolation / retained failure facts

- New invoking cwd: `<private-root>\dsh-invoke-571d7c0` (empty before each invocation; not a product checkout).
- HOME/USERPROFILE: `<private-root>\desktop-profile-51e23d9`; APPDATA/LOCALAPPDATA/TEMP/TMP explicitly inside that home.
- `DSH_HOME=<isolated-home>\.dsh`; `DSH_AGENTS_HOME=<isolated-home>\.dsh-agents`; `DSH_TELEMETRY_DISABLED=1`.
- Private npm configuration/cache/store/state only: `<private-root>\dsh-package-data-571d7c0`. Empty explicit user/global npm configs; explicit official registry; scripts ignored. Environment built from limited Windows OS allowlist; no ambient provider/PAT/task/cloud/SSH/proxy/Node-injection settings or full personal PATH.
- An initial preflight mistakenly assigned PowerShell's read-only `$HOME`; PowerShell rejected it and subsequent existence/link-metadata checks used the built-in real home. **No file contents or credentials were read and DSH was not executed in that attempt.** Root was informed. Corrected to `$isolatedHome`, enabled fail-fast, asserted all resolved paths under the private run root, and rechecked only private paths.
- Corrected preflight proved no pre-existing `.dsh`, shared-agent data, `.env`, `.credentials.yaml`, or unexpected private-root reparse points.

### Native installation, first FAIL then approved correction

Used the exact installed `D:\software\deepseekharness\resources\runtime\cli\bin\dsh.cmd` wrapper and exact fixed official built bundle, without source/engine modifications:

```text
dsh.cmd plugin --profile multica add E:\CodexData\morchat-r1-local\run\multica-local-demo\dsh-runtime-571d7c0 --ignore-scripts --store-dir=<private-package-data>\store --cache-dir=<private-package-data>\cache --registry=https://registry.npmjs.org
```

First command exited 0 but **did not install into the profile**: `PNPM_CONFIG_DIR=<private-package-data>\config` was interpreted by bundled pnpm as a `dir` override. The link/manifest landed in that private config directory; profile manifest stayed base-only. Post-install checks stopped before any probe. Output retained at `<bundle>\.local\plugin-add.log`; no out-of-private writes, compatibility override, lifecycle scripts or model calls were attempted. Root explicitly authorized removing only `PNPM_CONFIG_DIR` and rerunning the same native command with XDG/private npm config isolation retained. The mistaken private config package/link was retained as evidence, not manually removed.

Corrected native add exited 0, log `<bundle>\.local\plugin-add-corrected.log`. Exact installed DSH wrapper uses its own installation-owned pnpm **11.28.5**; it was neither upgraded nor replaced. Its local-link peer-resolution warning was retained; no switch to `file:`, peer patch, engine exemption or approval of scripts was made.

Generated **public** profile metadata checks passed:

- `<DSH_HOME>\profiles\multica\package.json` contains exactly base + `@multica-ai/dsh-runtime` bundles and one dependency, linking the reviewed bundle.
- Link target is exactly `E:\CodexData\morchat-r1-local\run\multica-local-demo\dsh-runtime-571d7c0`.
- `pnpm-workspace.yaml`: hoisted linker, `autoInstallPeers:false`; generated `cordis.patch.yml` contains comments plus only `[]`.
- No invoking/home/profile `.env`, DSH `.credentials.yaml`, unexpected override files, or shared-agent contents were present. No secret file contents were read.

### Actual finite native probe — PASS

Ran once from the empty isolated cwd, with the same clean environment and no `PNPM_CONFIG_DIR`:

```text
D:\software\deepseekharness\resources\runtime\cli\bin\dsh.cmd --profile multica --probe
```

Used a hidden helper process with a 45-second bound. Probe PID `2124` completed normally in approximately 2.1 seconds, **exit 0**, stderr empty, and exactly one stdout frame:

```json
{"v":1,"type":"probe","runtime":"dsh","plugin_version":"0.2.0-private.1","protocol_version":1}
```

Retained stdout/stderr: `<bundle>\.local\probe.stdout.log` and `probe.stderr.log`. This proves the genuine installed DSH loaded the reviewed bridge and answered protocol 1 despite the recorded link warning. It does **not** prove daemon registration, task execution, model availability, or observed zero network traffic. No model enumeration, stdio execution, provider credentials, model budget, task dispatch or daemon start was used in this phase. Root separately confirmed daemon start can immediately claim work/model-list actions; therefore this worker stopped after probe and did not register/start it.

Original Desktop PID `28988` / execution session `12770` were not restarted or killed. Root retains the next connection/registration decision.


## Approved native registration and quiet observation — 16:47–16:49 local

Root separately approved native start after the independent follow-up review (`DSH-RUNTIME-REVIEW.md` SHA256 `733AF53A164921F1DC6DC0E850899773EBFA57C57589DCA2EAEC8BC604345632`) and reported the UI had left Create Agent for the ordinary task list, the user was told not to create Bots/dispatch during the window, and all-state agent/runtime/queue/automatic-enqueue snapshots were empty. Those were Root's checks, not this worker's database claims.

From the same sterile invoking cwd, exact private Desktop-owned profile, explicit isolated DSH/agents home, telemetry disabled and clean environment, ran the existing built CLI:

```text
<export>\apps\desktop\resources\bin\multica.exe daemon start --profile desktop-localhost-8080 --no-auto-update
```

Also set `MULTICA_DAEMON_AUTO_UPDATE=false`, `MULTICA_DSH_PATH=D:\software\deepseekharness\resources\runtime\cli\bin\dsh.cmd`, and the same private workspaces root. Native CLI used the existing isolated profile PAT internally; its contents were neither read nor printed. `MULTICA_LAUNCHED_BY` was intentionally **not** spoofed: this is an actual manual native CLI launch, so health omits `launched_by`.

Actual start exited 0: PID `29040` (parent `55256`), executable `<export>\apps\desktop\resources\bin\multica.exe`. Logs at 16:47:45 authenticated; at 16:47:47.969 registered DSH runtime `31c27f22-5bd7-4fba-ac55-552c79228782`; at 16:47:47.979 task-wakeup websocket connected. Native daemon config confirms `auto_update=false`, profile port `19544`; there was no health listener before this one start. No second daemon was started. Start output retained in `<bundle>\.local\daemon-approved-start.log`.

Safe health fields actually read: status `running`, PID `29040`, OS `windows`, profile `desktop-localhost-8080`, daemon ID `01a1bf66-9dca-7af0-a8f5-503a18799274`, server `http://localhost:8080`, CLI version `dev`/commit `unknown`, agents `[dsh]`, one registered runtime/workspace above, active/running/resource-wait counts all `0`. This retains the export's honest version metadata; no capability/version claim was fabricated.

Observation: **16:48:51.3701805–16:49:52.1934052 +08:00**, 44 samples, execution session `67067` exited 0. Checked local health, current-start native log, and DSH process-argument snapshots. No `task-received`, model-list/discovery request, `--list-models`, `--stdio`, or nonzero task-count stop condition was observed; daemon remained running. No model/task was deliberately triggered. Saved result: `<bundle>\.local\daemon-quiet-window.json`. This is a finite observation, not a network trace or a promise that a live unpaused daemon can never claim future work. No permanent capability/permission suppression or fake registration adapter was introduced.

## Corrected next Desktop launch (historical example; executable entry tested below)

The current GUI's original environment lacks DSH PATH. This session therefore verified a manual native daemon start, **not a full Desktop quit/reopen automatic restore**. Do not restart the current GUI just to run this example. After an intentional normal quit and a newly coordinated quiet window, run the original native dev launcher from a fresh PowerShell with the same isolated profile:

```powershell
$ErrorActionPreference = 'Stop'
$run = 'E:\CodexData\morchat-r1-local\run\multica-local-demo'
$isolatedHome = Join-Path $run 'desktop-profile-51e23d9'
$packageData = Join-Path $run 'dsh-package-data-571d7c0'
$appDir = Join-Path $run 'source-51e23d9\apps\desktop'
$nodeDir = 'E:\CodexData\morchat-r1-local\tools\node22\node-v22.23.4-win-x64'
$goBin = 'E:\CodexData\morchat-r1-local\tools\go127\go\bin'
foreach ($p in @($isolatedHome, $packageData, $appDir)) {
  if (-not ([IO.Path]::GetFullPath($p)).StartsWith($run + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'private path guard' }
}
Get-ChildItem Env: | Where-Object {
  $_.Name -notmatch '^(SystemRoot|WINDIR|COMSPEC|PATHEXT|OS|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|SystemDrive|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|PUBLIC)$'
} | ForEach-Object { Remove-Item -LiteralPath ('Env:\' + $_.Name) }
$env:PATH = "D:\software\deepseekharness\resources\runtime\cli\bin;$nodeDir;$goBin;C:\Program Files\Git\cmd;$env:SystemRoot\System32;$env:SystemRoot"
$env:HOME = $isolatedHome
$env:USERPROFILE = $isolatedHome
$env:APPDATA = Join-Path $isolatedHome 'AppData\Roaming'
$env:LOCALAPPDATA = Join-Path $isolatedHome 'AppData\Local'
$env:TEMP = Join-Path $isolatedHome 'tmp'
$env:TMP = $env:TEMP
$env:DSH_HOME = Join-Path $isolatedHome '.dsh'
$env:DSH_AGENTS_HOME = Join-Path $isolatedHome '.dsh-agents'
$env:DSH_TELEMETRY_DISABLED = '1'
$env:MULTICA_DSH_PATH = 'D:\software\deepseekharness\resources\runtime\cli\bin\dsh.cmd'
$env:MULTICA_DAEMON_AUTO_UPDATE = 'false'
$env:MULTICA_WORKSPACES_ROOT = Join-Path $isolatedHome 'workspaces'
$env:NPM_CONFIG_USERCONFIG = Join-Path $packageData 'user.npmrc'
$env:NPM_CONFIG_GLOBALCONFIG = Join-Path $packageData 'global.npmrc'
$env:NPM_CONFIG_CACHE = Join-Path $packageData 'cache'
$env:NPM_CONFIG_STORE_DIR = Join-Path $packageData 'store'
$env:NPM_CONFIG_IGNORE_SCRIPTS = 'true'
$env:NPM_CONFIG_REGISTRY = 'https://registry.npmjs.org'
$env:PNPM_HOME = Join-Path $packageData 'pnpm-home'
$env:XDG_CONFIG_HOME = Join-Path $packageData 'config'
$env:XDG_CACHE_HOME = Join-Path $packageData 'cache'
$env:XDG_DATA_HOME = Join-Path $packageData 'data'
$env:XDG_STATE_HOME = Join-Path $packageData 'state'
# Do NOT set PNPM_CONFIG_DIR: bundled pnpm interprets it as a cwd override.
$env:GIT_CONFIG_NOSYSTEM = '1'
$env:GIT_CONFIG_GLOBAL = $env:NPM_CONFIG_USERCONFIG
$env:GOCACHE = 'E:\CodexData\morchat-r1-local\go-cache'
$env:GOMODCACHE = 'E:\CodexData\morchat-r1-local\go-mod'
$env:GOTOOLCHAIN = 'local'
$env:DESKTOP_APP_SUFFIX = 'r1-local-51e23d9'
$env:DESKTOP_RENDERER_PORT = '5178'
$env:VITE_API_URL = 'http://localhost:8080'
$env:VITE_WS_URL = 'ws://localhost:8080/ws'
$env:VITE_APP_URL = 'http://localhost:3000'
Set-Location -LiteralPath $appDir
if ((Get-Location).Path -ne $appDir) { throw 'cwd guard' }
& (Join-Path $nodeDir 'node.exe') scripts/dev.mjs
```

This changes only the newly launched process environment, not the global Windows PATH or existing account settings. It stores no key/token and preserves the original product source. The current original GUI PID `28988` / native window `2885428` / session `12770` was left running. A future reopen should be tested separately before claiming automatic recovery.


## Safety stop after user-controlled UI change — 16:51 local

Root reported UI automation was stopped when user input was detected and instructed an immediate current native-log check. This worker issued no UI input. Current-start daemon log contained:

```text
16:50:45.556 pending work hint served ... kind=model_list
16:50:45.556 heartbeat: pending actions ... model_list=true
16:50:45.556 model list requested ... provider=dsh request_id=4f018701afc0be8f32d3f75699977de1
```

At the check, health still reported PID `29040` / matching profile, active/running/resource-wait counts `0`; no live DSH `--list-models`/`--stdio` process was present in that snapshot. The logged request itself was enough to trigger the established stop condition. With a cleaned environment and the same isolated profile, executed only:

```text
<export>\apps\desktop\resources\bin\multica.exe daemon stop --profile desktop-localhost-8080
```

Native output: `Stopping daemon (pid 29040)...` then `Daemon stopped.`; exit `0`. Saved output: `<bundle>\.local\daemon-safety-stop.log`. At **16:51:27.768** the native log recorded poll-loop stopping, main-loop return `context canceled`, and deregistering the one runtime on shutdown. A subsequent read-only check confirmed original PID `29040` absent and no listener on `127.0.0.1:19544`. Desktop PID `28988` remained present (latest title: Runtimes), with original session `12770` retained. No force kill, GUI restart, key/config read or restart attempt was made.

The earlier quiet-window result remains historically valid for its stated interval only. The later automatic model-list request is retained as a real event, not silently folded into a zero-model claim. The examined log had no model-list completion/result line; request observation does not establish paid inference or completion, and no provider-network trace was performed. No task/stdio execution was observed. Root was immediately informed to retain user control and decide the next action.

## Persistent Desktop launch entry preparation (historical; executed below)

Created the expressly authorized private actual launcher, not merely instructions:

```text
E:\CodexData\morchat-r1-local\run\multica-local-demo\start-desktop.ps1
```

SHA256: `DB38F3AD2D77B9B0EBDAC32067C0E92A2E2F31C9FCEB20BE00E4CD77E922A0AD`. The path did not previously exist; no user script was overwritten. Static PowerShell parsing passed with zero errors. AST checks confirm no assignment to PNPM_CONFIG_DIR or MULTICA_LAUNCHED_BY. Required source/dev/Node/Go/Electron/DSH/private npm/profile paths were checked read-only and exist; no keys/config contents were copied.

The script keeps the same reviewed source export/profile/app suffix and original `scripts/dev.mjs` entry. It fixes the real missing-PATH cause by giving the **new Electron process** the exact installed DSH CLI directory and MULTICA_DSH_PATH, explicit DSH_HOME/DSH_AGENTS_HOME, telemetry disabled, daemon auto-update disabled, private npm/XDG/cache/store configuration and a credential-free environment allowlist. Only Electron's unmodified manager will spawn the daemon and set its genuine launched_by=desktop marker. No manual CLI daemon start is present. It refuses a duplicate same-source GUI or an already-listening profile daemon and rejects unexpected Desktop dotenv files.

**The launcher was not executed in this preparation step.** Current GUI was not stopped/restarted by this worker. Root reports the user authorized cancellation of the queued task; Root's native stop preserved chat, and Root's database recheck found cancelled=1 and queued/dispatched/running/deferred=0. Worker is waiting for Root's normal GUI exit and explicit launch release; never start a second GUI while the original is open. For the next separately authorized real Desktop spawn test, Root permits isolated keyless model-capability/metadata discovery, but no personal provider key copy, paid inference, message sending, stdio task or task claiming. These new boundaries supersede the earlier temporary model-list stop condition; they do not retroactively change historical observations.


## Actual corrected Desktop restart and real UI-button verification — 17:11–17:14 local

This supersedes the earlier waiting/static-only checkpoint. Root reviewed the exact persistent launcher hash `DB38F3AD2D77B9B0EBDAC32067C0E92A2E2F31C9FCEB20BE00E4CD77E922A0AD`, obtained the user's explicit permission to cancel the queued task, used the native cancellation control while preserving chat, and reported all-state queued/dispatched/running/deferred total `0` (cancelled `1`). Root then used the original GUI's normal Alt+F4 exit; old PID `28988` and listeners `19544/5178` were absent before releasing this worker to run the script. These coordination/database/UI checks were Root's, not invented worker reruns.

Worker executed the **exact reviewed** `E:\CodexData\morchat-r1-local\run\multica-local-demo\start-desktop.ps1` once from its guarded run root. It invoked the original `node scripts/dev.mjs` in the same committed export; Windows CLI bundle/main/preload builds succeeded and renderer opened at `http://localhost:5178/`. New live execution session: **8295**; Electron main PID **28668** (Vite Node **23268**), native HWND **594198**, title Runtimes. Same API `http://localhost:8080`, same app suffix/userData/private profile; original login/chat state remained. No key or personal config was copied and no product source/global PATH was changed.

### Genuine Desktop-owned automatic daemon spawn

Without manual `multica daemon start`, the new Electron manager automatically started native daemon **40672**. At 17:11:14.531 native config recorded exact DSH path, private profile/workspaces, `auto_update=false`, **`launched_by=desktop`**; at 17:11:16.672 it registered DSH runtime `31c27f22-5bd7-4fba-ac55-552c79228782`. Worker independently read local health: running/windows, matching profile, **launched_by desktop**, agents `[dsh]`, all task counters `0`. The launcher has no MULTICA_LAUNCHED_BY assignment; the real unmodified Electron daemon manager supplied it.

The first planned follow-up observation saw connection refused because **Root was intentionally testing the Desktop Stop button**, not because of a crash or missing-PATH regression. Native log at 17:12:10.056 showed normal cancellation/shutdown; at 17:12:10.062 it deregistered the runtime. GUI28668 and renderer5178 stayed open; no crash breadcrumb existed. Worker did not restart or interfere and did not classify this controlled stop as a crash.

### Original failing client button now passes

Root used the actual Desktop UI: Stop → offline/zero online and Start button visible → Start → online. Root's subsequent health/UI evidence reported new daemon **30736**, `launched_by=desktop`, `[dsh]`, all counters zero, and final visible **“1台在线 / DeepSeek Harness在线 / 由桌面端管理 / 全部空闲”**. Root also reported queue still cancelled/no runnable task and task usage `0`. Worker did not click UI or send any message; this is a real native button test, not a simulated IPC/manual CLI substitute.

Worker then independently observed daemon **30736** for **17:13:39.5449958–17:14:25.5055506 +08:00** (45.96 seconds, **33 samples**). Every sampled local health response remained running, profile `desktop-localhost-8080`, genuine `launched_by=desktop`, `[dsh]`, active/running/resource-wait all `0`, with the same registered runtime/workspace. Current native-start marker: **17:12:34.639**. No task-received/claim/stdio execution was observed and no task stop condition occurred. Keyless metadata/model-list discovery was permitted under this renewed authorization (unlike the earlier temporary stop boundary); **0 model-list request lines** were observed in this current-start log during the check. This was a finite health/native-log/process-snapshot observation, not a paid task, model prompt, network trace, or future guarantee.

Evidence: `<bundle>\.local\desktop-owned-button-observation.json`; observation session **73171** completed exit `0`. Current live handles remain **GUI28668 / HWND594198 / daemon30736 / dev session8295**; no additional restart/stop was performed. The previous old GUI28988/session12770 and manually started daemon29040 are historical only. The persistent launcher is now **actually executed and verified**, not merely documented; source/engine/profile/token were not patched to make the result pass.
