---
purpose: "CLIENT-HELP-FEISHU-r1 — bounded client help destination"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# CLIENT-HELP-FEISHU-r1 — bounded client help destination

## Authority and ownership

- Task-ID: CLIENT-HELP-FEISHU-r1; revision TEST-FROZEN-r1, Root-approved Help-only window.
- Owner/source writer/test operator: /root/brand_morechat_r1; consumer: /root. Root subsequently delegated actual isolated TDD execution to the owner to avoid blocking its independent model work.
- Model: gpt-6.1-sol as declared in the parent task; this agent has no independent runtime-model introspection evidence.
- Independent reviewer: PENDING binding; owner does not self-approve.
- Source tree: E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co; branch codex/round1-continuous; HEAD 96085ec414511f7537aabe6b73d22a7aac641a7c with protected existing WIP.

## Scope

The exact requested destination is https://wcnb2ddshm1z.feishu.cn/wiki/PlGcw8kUyidnOakv9e7ccvDanfc?from=from_copylink . Return this byte-for-byte for every locale: no appended locale, path, fragment or query. Changing a link does not establish access to or review of the Feishu document.

Production window only:
- packages/views/layout/{help-links.ts,help-launcher.tsx,account-menu.tsx,feature-intro.tsx}
- packages/views/runtimes/components/runtime-docs.ts
- apps/desktop/src/renderer/src/components/daemon-settings-tab.tsx (guide URL literal only)

Test window only:
- packages/views/layout/{help-launcher.test.tsx,feature-intro.test.tsx,help-links.test.ts (NEW)}
- packages/views/runtimes/components/{runtime-docs.test.ts,runtime-profiles-dialog.test.tsx}; Root approved the last two for URL expectations/test descriptions only.

Do not change product name/logo/attribution/LICENSE/NOTICE, internal identifiers/protocols/Profile, auth/server/core types, dependencies or lockfiles. No main/commit/merge/push. Do not edit running source51e export. Brand waiver remains unconfirmed and branding is HOLD. Other help sites/templates and GitHub UI changes are outside this slice.

## Test-first sequence and actual status

1. Rebound worktree/HEAD and verified no pre-existing tracked WIP in the client paths.
2. Wrote only the five test files above before touching production. Existing runtime flow assertions preserved; only their guide URL expectations/descriptions changed. New tests cover seven supported locales and undefined fallback, all seven feature slugs, both runtime links with no fragment, and unchanged download/changelog destinations. Existing menu/download/version/carousel behavior assertions remain.
3. Actual RED on unchanged six production pins: 49 tests, 15 pass, 34 fail, 0 pending; exit 1, stderr 0 bytes. All five files collected and failed specifically on old guide destinations, not setup errors.
4. Verified every original production SHA256 before writing. Changed the one shared DOCS_URL, removed locale suffixing from both menus, kept feature/runtime helper signatures while returning the exact guide, and changed only the desktop guide literal. No menu or runtime action was changed.
5. Same five selectors on the synchronized mirror: GREEN 49 tests, 49 pass, 0 fail, 0 pending; exit 0, stderr 0 bytes. Test file hashes unchanged between RED/GREEN.
6. Whole mirrored views typecheck with existing TypeScript 6.0.3 and Node 22.23.4: exit 0, stdout/stderr 0 bytes. First wrong local tsc path produced MODULE_NOT_FOUND; preserved, then resolved the existing physical .pnpm compiler entry, no install or configuration change.
7. Build/real account-menu and desktop click acceptance: NOT RUN. Independent review: PENDING. Current running app unchanged; no UI acceptance claim.

Selectors from packages/views:

    vitest run layout/help-launcher.test.tsx layout/feature-intro.test.tsx layout/help-links.test.ts runtimes/components/runtime-docs.test.ts runtimes/components/runtime-profiles-dialog.test.tsx

## Test SHA256 before RED

| File | SHA256 |
|---|---|
| layout/help-launcher.test.tsx | 8EC13E67DCFAA5E38E431793BA03DB32F5FB508CB26C8C04BA59ACFF0E7985D2 |
| layout/feature-intro.test.tsx | C9364C5C6F3878859AA6FE8050539000A86EC72CACCC88955996B980256C74C8 |
| layout/help-links.test.ts | E05F8835DB97DF9567189B8539B5FFE705B62A748EC01624B715160D447603EC |
| runtimes/components/runtime-docs.test.ts | 87943509FF2BB9011690FDB91E6AC5ECB82E7E49E381F436C2F4910C1DE6C8FD |
| runtimes/components/runtime-profiles-dialog.test.tsx | 25D62590FC32F55110B902401949B44E8BE28A94DF427A113AD38B9F01EB3FA9 |

## Production SHA256 before implementation

| File | SHA256 |
|---|---|
| packages/views/layout/help-links.ts | 1760AC389C5E035D89CAE4578B8B0121877B90C4EE795ED66E914D856D58EAEE |
| packages/views/layout/help-launcher.tsx | 4B1FC45371B76A39385EE6E92CFDA6CBD7A99B25E8A62E0D4D312430C0981317 |
| packages/views/layout/account-menu.tsx | 7764218BD674C649DAFC0B276055AEBFD122614F6C7CC390EE459B7CF250F7AB |
| packages/views/layout/feature-intro.tsx | 173B04B26BAE444026AB283FC625B08669B8DD747B440ADEA04552451890A262 |
| packages/views/runtimes/components/runtime-docs.ts | 990826C5499175CA88ABAA5F46E780114819F75E1601F1C5F59977A66D913484 |
| apps/desktop/src/renderer/src/components/daemon-settings-tab.tsx | 1192C9551C5ADBDB6840171A019F6D18C508E941A1DFBB8BE50F2A47D90C6FA3 |

## Retained failures / limitations

- First attempted test-writing command used the WindowsApps Python shim, which silently performed no writes. Verified unchanged files and missing new file, then used installed Node to perform exact-match edits. No claim that the first command succeeded.
- Scoped git diff --check returned exit 0. An accidental all-tree read-only diff check reported a pre-existing EOF blank line in docs/tasks/R1-02-execution.md; that unrelated WIP was not repaired.
- Account-menu and desktop guide lack new direct render/click coverage in this initial limited test release; existing source call sites require independent review and subsequent consumer verification. Do not describe helper-only assertions as desktop UI acceptance.

## Final source SHA256

| File | SHA256 |
|---|---|
| packages/views/layout/help-links.ts | 4670DEF40EE93D2E594D1E45FA42BDFF8AAF6C8E3C9A92E3FADDBC624BA5545A |
| packages/views/layout/help-launcher.tsx | DE92A425E53625C2D3C6F2712CF2FE4FA05977C8D836159ADC60CF8C58B07AAB |
| packages/views/layout/account-menu.tsx | AC30DFD5A0030F1F300EF51EE7F85AE178275A77C9D234124AFB0B13E7B91065 |
| packages/views/layout/feature-intro.tsx | 9354C6951780700BE5AEA860C7618BF8FCB8C6B42D4B6F44E6099C7FDDF72D1D |
| packages/views/runtimes/components/runtime-docs.ts | 2E7CA367D685F16478000E30F794EDBC2EA46EBD85612EF1BA2EA92A6943303E |
| apps/desktop/src/renderer/src/components/daemon-settings-tab.tsx | 0B9E36289234AE346EE3283DDEB0CAEAABFF2BE3585040F6D988C69D2D724847 |

## Actual execution artifacts

Private mirror/evidence root: E:/CodexData/morchat-r1-local/run/multica-local-demo/client-help-r1/evidence . Created new for this task; 1631 tracked current views files plus the explicitly new test, with root/views node_modules junctions to existing source-51e23d9 dependencies. No app/package/lock/test configuration changes. Desktop guide source was copied only into the private mirror for final source pinning; desktop is not built here.

| Artifact | Bytes | SHA256 |
|---|---:|---|
| green.exit.txt | 3 | 13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354 |
| green.report.json | 15104 | 659894D3FA18E9E415FD6A406F6CF29DC65F9A438B7561F0ED4588618AE3C69A |
| green.source-pins.json | 711 | D6C438CDDB60F9F0F813F9623684E8E4C42E34422B6632A9780E3CDFA0E30110 |
| green.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| green.stdout.txt | 118 | ABF0285A02CFA0BB1D47B726F6E2EE38F8961B8ED6A6523393E68F8F71FA2F8D |
| manifest.json | 341 | 4ADEF85070165CC7EA52380EB40B4853705002EA58046C91C1A5AE34A6193B6B |
| red.exit.txt | 3 | F1B2F662800122BED0FF255693DF89C4487FBDCF453D3524A42D4EC20C3D9C04 |
| red.report.json | 73764 | 927B282A37D14B66D70E23F40492085E5AB8964218E6B8B6ABDA683C14D45D7E |
| red.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| red.stdout.txt | 116 | 34F2C7DF33422E9886EAE5C60E622D00C7C85ACE011CD68759D79423B648D489 |
| typecheck-r2.exit.txt | 3 | 13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354 |
| typecheck-r2.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| typecheck-r2.stdout.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| typecheck.exit.txt | 3 | F1B2F662800122BED0FF255693DF89C4487FBDCF453D3524A42D4EC20C3D9C04 |
| typecheck.stderr.txt | 770 | 118B5BF3E5755EB68D550AA1F08C6E3474DACA316E0C0B0F5923B27AEB3DCF6F |
| typecheck.stdout.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |

## Residual boundaries

This is a 49-test selected help regression and whole views typecheck only, not all frontend tests, build, deployed UI, model or enterprise acceptance. Existing runtime-docs 7 cases and runtime-profiles-dialog 8 cases actually ran with their non-URL behavior assertions intact. Other hardcoded integration/onboarding/marketing help links remain outside this released slice and must not be described as globally fixed. Brand name/logo and GitHub UI removal remain separate HOLD windows. No commit/merge/push performed.

## Independent review closeout
/root/icons_avatar_study_r1 independently ACCEPTED the six-source Help slice after matching current source/test and RED/GREEN evidence. This is selected49/49 and views typecheck only; native click and all-site Help links remain NOT RUN. Root later controlled-overlayed only six production files with old-blob guards/backups. No brand/logo or backend claim.
