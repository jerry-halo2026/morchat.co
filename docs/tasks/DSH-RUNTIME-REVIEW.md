---
purpose: "DSH runtime dependency review — 2026-11-09"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# DSH runtime dependency review — 2026-11-09

## Verdict

**APPROVE isolated native installation + `--probe` ONLY, subject to the controls below.** This is not approval for `--list-models`, `--stdio`, daemon registration/start, model tasks, credential reuse, or source/engine overrides. It is a static review, not evidence of successful installation/probing or observed zero network traffic.

## Reviewed evidence

- Product: `E:\CodexData\worktrees\r1-02b-claim-pin\morchat.co`, supplied HEAD `51e23d9e7a8d6d3b3cdf46db7df68ad1b0938271`; read `docs/tasks/DESKTOP-DEV-RUN.md`. Its checkpoint records isolated home `E:\CodexData\morchat-r1-local\run\multica-local-demo\desktop-profile-51e23d9`, DSH_HOME beneath it, Desktop PID 28988/session 12770, and failed registration because the Multica bundle is absent. No secret-bearing profile file was read.
- **B** = `E:\CodexData\morchat-r1-local\run\multica-local-demo\dsh-runtime-571d7c0`. Root identifies the official acquisition as `https://github.com/multica-ai/dsh-multica-runtime`, commit `571d7c036d15f58ee88c89fd80afb0a6c7f0023c`; this review did not refetch upstream. Its package repository metadata still names `dsh-external/dsh-multica-runtime`: metadata alone is not provenance proof.
- **A** = `D:\software\deepseekharness\resources\app.asar/dsh/node_modules/@deepseek-ai/`. ASAR entries below were decoded as data, not executed. Wrapper `D:\software\deepseekharness\resources\runtime\cli\bin\dsh.cmd:1–6` selects the installed executable in Node mode and `dsh-desktop-host/lib/cli.js`. Installed CLI version `0.2.2-rc.1` comes from the recorded native run.
- Read existing `B/.local/check.log`: typecheck, 22 tests (8 lifecycle, 8 protocol, 6 environment), build. These are the worker's results, **not reviewer reruns** and not end-to-end probe tests.

## Findings

1. **Compatibility admitted, not runtime-proven.** `B/package.json` declares bridge `0.2.0-private.1`, engines `>=0.2.1-rc.2 <0.3.0`, and development peers pinned `0.2.1-rc.2`. `A/dsh-app-boot/lib/index.js:1089–1122` reads its runtime version, calls `semver.satisfies(..., {includePrerelease:true})`, and lets an own `engines.dsh` decide instead of peers. Thus `0.2.2-rc.1` is accepted. No forced engines, exemption, manifest edit, or downgrade is needed; successful probe remains the integration check.

2. **Native install is profile-scoped, not intrinsically sterile.** `A/dsh/lib/bin.js:234–236` dispatches plugin management without profile boot; `dsh/lib/plugin-DscIHF4k.js:64–99` resolves the named profile and delegates to pnpm. `dsh-app-boot/lib/index.js:1364–1401` derives profiles under DSH_HOME and initializes an empty override plus `autoInstallPeers:false`. `dsh-plugin-manager/lib/index.js:625–639,669–720` writes profile-local logs, inherits the CLI process environment, performs compatibility preflight, and runs pnpm in that profile. Package-manager network/cache effects are possible; plugin add is not an offline guarantee. No lifecycle-script blocking is automatically inserted at this call site.

3. **Patch is narrow and applied before activation.** `B/cordis.patch.yml:5–11` disables HMR and session telemetry; remaining rows choose the isolated session path, persona, and bridge `headless-runner`. `A/dsh/lib/profile-boot-e2mS45fC.js:273–313` composes patches before boot. `dsh-app-boot/lib/index.js:1886–1891` also honors nonempty `DSH_TELEMETRY_DISABLED`. Default base has no HTTP listener/MCP client row and `agent-loop` has `agents:[]` (`A/dsh-base/cordis.patch.yml:515–520`). The transport-independent remote-access service is not itself a listener.

4. **Probe skips tasks, not loader initialization.** `B/src/index.ts:545–574` awaits the loader, emits protocol 1, and calls appExit. It bypasses model listing (92–136), stdio/task-token forwarding (445–446), selection/execution (375–400), and task MCP mounting (338–346); `B/src/protocol.ts:3` fixes version 1. However, boot reads cwd/.env and DSH_HOME/.env (`A/dsh/lib/bin.js:216`; `dsh-app-boot/lib/index.js:4452–4484`). Credentials initialization attempts DSH_HOME/.credentials.yaml (`dsh-credentials-local/lib/index.js:56–60,444–451,641–655`). Therefore “probe exits before all credential reads” is false. With fresh empty isolated roots, these are absent private paths, not personal credentials. Account initialization returns when no record exists (`dsh-deepseek-account-platform/lib/index.js:606–613`). Model-list cache construction does not fetch (`dsh-llm-deepseek/lib/index.js:2530–2532,2675–2691`); discovery is a separate path. No model/MCP request was found in the reviewed probe path.

## Mandatory execution controls / stop conditions

- Keep the running Desktop untouched. Use the exact installed wrapper and exact built local B path, not a Git/registry substitute.
- Create a new empty invoking directory under this private run, not the product checkout. Bind DSH_HOME explicitly beneath `desktop-profile-51e23d9`; keep HOME, USERPROFILE, APPDATA, LOCALAPPDATA, TEMP/TMP, DSH_AGENTS_HOME and package-manager cache/store/config locations private. DSH_AGENTS_HOME is independently resolved (`A/dsh-home-paths/lib/index.js:109–125`). Do not copy personal files. Confirm absence of .env, .credentials.yaml, home/profile overlays and unexpected links without reading secret contents. Record actual resolved paths in the worker log.
- Start from the existing limited environment allowlist; no ambient provider/PAT/task/cloud/SSH credentials, proxy, Node injection, user pnpm/npm config, or full PATH. Set `DSH_TELEMETRY_DISABLED=1`. Use private empty npm config and `--ignore-scripts` on native `plugin --profile multica add <B>`; explicitly constrain registry/cache/store if resolution needs them. Do not approve builds or relax engines after failure.
- Inspect generated public profile metadata for base + reviewed bridge, no extra bundles/overlays, before `--profile multica --probe`. Require finite completion, exit 0, and one protocol-1 probe frame; retain sanitized stdout/stderr. Stop on unexpected prompts, scripts, destinations, network/provider activity, engine errors, or protocol mismatch. Do not continue to model enumeration or daemon startup on this review alone.

Reviewed SHA256: package.json `B40E9F30E418DBDCBBB5155BD7B1F95C5F5DCC5D55C27AB14BEC5E7A2CE64EAA`; cordis.patch.yml `0F45A49E81ABC42CF77770F9FC9709EF9E150E894118D09DFB95C1C6F9EE0561`; src/index.ts `00E6AEB8E74AABE4D504062B4A22F8A74B437BC1C0045292D1D1C81845A78FE8`.
## Follow-up: native daemon start — HOLD pending quiet-window checks

Let **S** = `E:\CodexData\morchat-r1-local\run\multica-local-demo\source-51e23d9` (reviewed export; no execution).

Registration probes DSH version/profile (`S/server/internal/daemon/daemon.go:2637–2669`) then registers runtimes (2867–2869,2928–2967); it does not itself enumerate models. But successful startup immediately launches heartbeat/wakeup loops and polling (2168–2190). First polling claims without an initial interval delay (5376–5420), then automatically calls handleTask (5434–5471). Task execution launches `--stdio` and sends execute (`S/server/pkg/agent/dsh.go:119–120,225–268`). No supported registration-only/pause option was found. Internal pauseClaims is a maintenance barrier, not a user mode. `--max-concurrent-tasks=0` is ignored; environment zero creates zero slots but still permits heartbeat actions and is not a complete safety control.

Pending heartbeat model requests automatically call ListModels (daemon.go:4551–4553,4715), launching `--list-models` (dsh.go:436–448). Critically, the visible model component requests discovery when its runtime becomes online, without opening its dropdown (`S/packages/views/agents/components/model-dropdown.tsx:59–61`; `packages/core/runtimes/models.ts:68–76`). Server `runtime_models.go:381–387` queues and wakes it.

Root reports actual isolated database counts: agents=0, runtimes=0, assigned-agent issues=0. Reviewer did not query that database. These are snapshots, not concurrent admission barriers.

Shortest conditional path: keep original native daemon; first have the user leave Create Agent/model/onboarding surfaces for the ordinary task list and temporarily refrain from creating Bots/dispatching. Root verifies all-state task queue counts (including deferred/dispatched), automatic enqueue sources, and absence of pending discovery before launch. Retain credential-free isolation and disable self-update. Only after this quiet window is established may Root approve normal daemon start and verify registration/health plus no task-received/model-list activity. Registration needs no model key. Never treat absent keys as preventing task claims. If quiet-window conditions cannot be established, **STOP**; request user coordination, not a fabricated registration adapter. Probe success alone is not completed Desktop integration.
## Execution evidence consumption — native connection PASS, bounded scope

Read B/.local/plugin-add-corrected.log, probe.stdout.log, empty probe.stderr.log, daemon-approved-start.log and daemon-quiet-window.json; independently checked generated base+bridge metadata and exact bundle junction. Probe frame is protocol 1. Exit codes/duration are worker-recorded in DESKTOP-DEV-RUN, not reconstructed from stdout. Native daemon.log:24 records DSH registration at 16:47:47.969 for `31c27f22-5bd7-4fba-ac55-552c79228782`; start output identifies PID 29040. Root separately reports live health/DB verification (runtime online/recent heartbeat, agent/queue/usage=0).

Quiet evidence covers only 16:48:51–16:49:52, 44 samples, zero reported task counts; the retained JSON is a summary, not all raw samples. SHA256: `D4F14456D2F30884C2E05AF72B1D15AC16C648EB902A1DD7C4BFE90127DF0302`.

**Later exception:** current native log:47 records `model list requested` at **16:50:45.556**, after that window. Therefore “never enumerated models” is not supported; request handling is observed, not proof of paid inference. Root notified. No task-received event was found in this read.

PASS means installation, protocol compatibility and native connection only. Model execution, reopen/recovery and enterprise end-to-end remain NOT VERIFIED. Reviewer ran no DSH, service or model command.
## Desktop recovery/button evidence review — PASS, local dev scope

Historical stop remains valid; this is a later authorized recovery. Independently read the executed private launcher (SHA256 `DB38F3AD2D77B9B0EBDAC32067C0E92A2E2F31C9FCEB20BE00E4CD77E922A0AD`): it sets explicit isolated DSH paths/environment and invokes only original `scripts/dev.mjs`, neither manual daemon start nor a forged MULTICA_LAUNCHED_BY. Original `S/apps/desktop/src/main/daemon-manager.ts:972–973,1037–1043,1466–1478` supplies the genuine Desktop marker and native button lifecycle.

Reviewer read live public health: PID30736, running, profile desktop-localhost-8080, launched_by desktop, agents[dsh], all task counters zero. Native log independently corroborates registration 17:11:16, orderly stop/deregister 17:12:10, and new registration 17:12:36. Root's actual GUI Stop/Start observations are recorded, not reviewer-replayed clicks. Thus evidence supports real Desktop reopen/automatic management plus button restart, not the earlier manual-CLI substitute.

Consumed hashes: DESKTOP-DEV-RUN `FD0CD3B7C743108B47B19ACF16BCED78098566E6A44C465D91190E02F143B06B`; Root checkpoint `4B678AF8F2A22136B0CE4C72C03D9041A73F2D7CA2FCA4C9A2286F68301B9F32`; worker observation `13B5E9DFD5F351076B7DA55472CA3992A26826E7187EC9999EA73A12E64559D1` (17:13:39–17:14:25, 33 samples; summary evidence).

Current scope permits keyless metadata discovery, not inference. Model execution remains NOT RUN; generic installer, reboot-wide persistence, arbitrary-machine recovery and enterprise end-to-end are NOT VERIFIED. No reviewer service/model/source/DB mutation occurred; existing live GUI28668/dev8295/daemon30736 were left untouched.