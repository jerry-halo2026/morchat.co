---
purpose: "CLIENT-GITHUB-INTEGRATION-UI-r1"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# CLIENT-GITHUB-INTEGRATION-UI-r1

## Authority and owners

- Task-ID: CLIENT-GITHUB-INTEGRATION-UI-r1; exact Root-approved source/test window, 2026-11-10.
- Sole source writer/test operator: /root/brand_morechat_r1; consumer: /root; independent reviewer: /root/icons_avatar_study_r1 (actual model gpt-6.1-sol per parent). Reviewer independently accepted the bounded source/raw evidence; owner did not self-approve.
- Model: gpt-6.1-sol per parent task declaration; no independent model introspection evidence available to this agent.
- Source: E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co; branch codex/round1-continuous, HEAD96085ec414511f7537aabe6b73d22a7aac641a7c, protected pre-existing WIP retained.
- Allowed writes: packages/views/settings/components/{code-tab.tsx,repositories-section.tsx,code-tab.test.tsx,repositories-section.test.tsx} plus this new report only. Reviewed Help six-source window unchanged.

## Product scope and minimum implementation

Remove GitHub installation/connect/import entry points, the integration card, and GitHub PR/sidebar/auto-link/co-author configuration display. No backend/source identity/license/NOTICE/producer-attribution changes. Brand name/logo remains HOLD awaiting waiver facts. Other GitHub surfaces are OUT OF SCOPE.

- CodeTab no longer loads or renders GitHub installation data or exposes installation/pause/disconnect/settings mutation handlers. It retains the original manager/member read-only notice, VCSConnectionRows deployment gate, RepositoriesSection and PRMergeStatusRow.
- PRMergeStatusRow remains because its existing source/test contract explicitly serves self-hosted Git merge behavior too. No backend setting is silently rewritten.
- RepositoriesSection retains original stored repository rows, descriptions, URL identity/deduplication, explicit generic add/edit/delete confirmation, failure handling and member write restrictions. Existing github.com URLs remain byte-for-byte user data, not removed by hostname. Generic FolderGit2 represents all rows.
- Removed GitHub-specific installation/browse queries, import picker and its mutation/connect callbacks. A legacy callback only drops its one-shot URL parameters; it never opens a picker or calls connect/disconnect/delete/update. Generic repository mutation remains only behind explicit existing user actions.
- Manual SSH host URL and local path tests show unchanged input/persistence behavior, not proof of actual local clone/import execution.

## Test-first execution and retained failures

1. Verified no WIP in the four permitted paths; original source pins matched the prior inventory.
2. Migrated 9 GitHub-specific CodeTab cases and 4 repository integration cases into seeded negative requirements. Kept original generic Git merge/VCS, repository CRUD/failure/member/identity cases; added two manual non-GitHub/local-path input cases. Total 26 tests; no test skipped/deleted to obtain GREEN.
3. Initial actual old-source RED: 26 run, 15 pass, 11 fail, 0 pending, exit1, stderr0. Source remained unchanged. Reading the assertions exposed an asynchronous menu Portal timing gap: two negative cases queried before the menu appeared; one failed on missing generic menu rather than the product requirement.
4. Strengthened only those tests to await the real generic menu item before checking absent GitHub items. Preserved first raw. Actual RED-r2 on unchanged source: 26 run, 13 pass, 13 fail, 0 pending, exit1, stderr0. Failures: GitHub card/config9, visible GitHub menu3, legacy callback auto-picker1. No environment/setup failure.
5. Rechecked original two source pins, then made the minimum UI deletion inside those two files. No backend mutation/data deletion performed by this work.
6. Same final tests plus existing generic Git/merge and reviewed Help regression: 9 files, 83 run, 83 pass, 0 fail, 0 pending, exit0, stderr0. Exact contributions: CodeTab11, Repositories15, code-vcs4, pr-merge-status-row4, Help49. This is selected regression only, not all frontend tests.
7. Whole mirrored views typecheck with installed Node22.23.4 and TypeScript6.0.3: exit0/stdout0/stderr0. No package install, lock, package.json or test-config changes.
8. Independent review/build/real UI click/deployment: NOT RUN/PENDING. No source51e overlay, process/window operation, DB, model, browser, commit/merge/push.

## Reproduction

Use the existing new private mirror E:/CodexData/morchat-r1-local/run/multica-local-demo/client-help-r1, which already has tracked current views files and the explicit new Help test. Root/views node_modules junctions read the existing source-51e23d9 dependencies; only four allowed candidate files were synchronized for this slice. Evidence is under evidence/github-ui, separate from prior Help runs.

From mirror packages/views, run installed Node22 against node_modules/vitest/vitest.mjs:

    run settings/components/code-tab.test.tsx settings/components/repositories-section.test.tsx

Green selected regression adds:

    settings/components/code-vcs.test.tsx settings/components/pr-merge-status-row.test.tsx layout/help-launcher.test.tsx layout/feature-intro.test.tsx layout/help-links.test.ts runtimes/components/runtime-docs.test.ts runtimes/components/runtime-profiles-dialog.test.tsx

## Final source/test SHA256

| Path | SHA256 |
|---|---|
| packages/views/settings/components/code-tab.tsx | 4C0BC5ED957D19CC267CD354523116231792BCF54A38F5113599DC3C86FCA7F1 |
| packages/views/settings/components/repositories-section.tsx | 31961E06EA79C0DB197BB00BF12BE14CDECF99F23BB32ED7DCB0CDEE145BE511 |
| packages/views/settings/components/code-tab.test.tsx | 06F46208EF9CEFF98C1774DD90027EAD46347AA3A464A0B2B6EEFAC88772D684 |
| packages/views/settings/components/repositories-section.test.tsx | C1BD2935228C431A6C9F7F7AE55D4FCE5438A6B068F07D0666A79210357F3EBB |

## Original source SHA256

- code-tab.tsx: 76F358F99D3B132DF489784495E10E3A32FDF4DDD76CCC0FE4805AC44B539B06
- repositories-section.tsx: BF8755C40D1C04B6E9B5F58435B20BB48FB808700D0D883C2A3EA11B574B1A18

## Actual raw evidence

Root: E:/CodexData/morchat-r1-local/run/multica-local-demo/client-help-r1/evidence/github-ui

| File | Bytes | SHA256 |
|---|---:|---|
| green-regression.exit.txt | 3 | 13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354 |
| green-regression.report.json | 26740 | A89D19B38F92F7E9A44D5005A5B63D3D9ED10A806F9B37F2687E295741042D5D |
| green-regression.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| green-regression.stdout.txt | 139 | F2A4C93FAFA97FF43FF14AAB2230065155AEF841E248341651241E3D2FDA1500 |
| green.source-test-pins.json | 520 | C09D7D59788305B481439E940AB173F7A86FFDA82553F844BC7E766270497053 |
| red-r2.exit.txt | 3 | F1B2F662800122BED0FF255693DF89C4487FBDCF453D3524A42D4EC20C3D9C04 |
| red-r2.report.json | 25044 | 58B4E175A12F263FE7908EB65377BC50511234B5F91A6B77C1714A6B6826F4FB |
| red-r2.source-test-pins.json | 520 | 9E74E4EF2FD6DBDAA354AC9F8277D538757BFACC0ABF906CB9ABDEFB96FFC883 |
| red-r2.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| red-r2.stdout.txt | 129 | 93D0D6912146791C5760C120D4D36D4B70142EF43270653CEDF43733ABABD5D1 |
| red.exit.txt | 3 | F1B2F662800122BED0FF255693DF89C4487FBDCF453D3524A42D4EC20C3D9C04 |
| red.report.json | 42263 | D1A1E7528C19BBCC4758B61893CC42BDD19EB22380790B3AEDC5016B88DB9686 |
| red.source-test-pins.json | 520 | 3ED30F75A783738BFB321CCD640D70E28A45794DA93810000A3D393C03600DE6 |
| red.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| red.stdout.txt | 126 | 9C5AE87511AF363903E23032A57548FDC704D5F25683C9D5645047851D58072A |
| typecheck.exit.txt | 3 | 13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354 |
| typecheck.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| typecheck.stdout.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |

## Remaining limits

The two-file UI change does not disable GitHub backend routes, erase integrations/repositories, or remove all GitHub references throughout the product. Producer attribution/footer/source copyright links are intentionally untouched. Root must bind an independent reviewer before considering a controlled frontend build. No actual runtime task/desktop acceptance is claimed. Process visibility note from previous read-only diagnosis: Root confirmed PID14436 was still live; this agent's Get-Process empty result was a permissions-view limitation, not evidence that the process exited.

## Independent review ACK

/root/icons_avatar_study_r1 independently reported ACCEPT, no P1/P2, after reading strengthened RED-r2, GREEN83, typecheck0, 18 artifact hashes and pre-ACK card SHA D369C2D15D8F52E1DCCC1A65245FA7E7BAA2D7C35D8AE452A23F9CF80769D123. Reviewer checked four current files against final candidate pins, two test pins against RED-r2, unchanged generic VCS/merge source and original tests against HEAD, and source51e target two old blobs against pre-implementation pins. Reviewer gave Root a controlled two-source overlay ACK without writing source/UI/DB. This metadata-only report update does not expand acceptance beyond the two-source configuration/import UI slice. Root build/overlay/actual UI remains a separate consumer action.
