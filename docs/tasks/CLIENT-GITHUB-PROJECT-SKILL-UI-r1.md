---
purpose: "CLIENT-GITHUB-PROJECT-SKILL-UI-r1"
owner: task-owners
status: current
updated: 2026-11-10
related: []
---
# CLIENT-GITHUB-PROJECT-SKILL-UI-r1

## Scope and authority

- Task-ID: CLIENT-GITHUB-PROJECT-SKILL-UI-r1; Root-approved exact slice, 2026-11-10.
- Sole source writer/test operator: /root/brand_morechat_r1; consumer: /root; independent reviewer: /root/icons_avatar_study_r1 (actual model gpt-6.1-sol per parent; independent review ACCEPT).
- Model: gpt-6.1-sol per parent declaration; no independent runtime-model introspection evidence.
- Source: E:/CodexData/worktrees/r1-02b-claim-pin/morchat.co; branch codex/round1-continuous; HEAD96085ec414511f7537aabe6b73d22a7aac641a7c plus protected existing WIP.
- Source write set: packages/views/modals/create-project.tsx and packages/views/skills/components/create-skill-dialog.tsx only.
- Locale write set: packages/views/locales/{en,es,fr,ja,ko,zh-Hans,zh-Hant}/{modals.json,projects.json}; exactly create_project.{repos_heading,repos_url_placeholder,source_tab_repos} and resources.{popover_title,url_placeholder}. No other JSON value or formatting changed.
- Existing test writes only: modals/create-project.test.tsx, modals/create-project-local-mode.test.tsx, projects/components/project-resources-github-ref.test.tsx, skills/components/create-skill-dialog.test.tsx (all within packages/views).
- This is the only new task card. No ACTIVE/results/checkpoint writes.

## Product change and invariants

- Replaced the create-project inline GitHub Octocat at its three uses with the already imported generic GitBranch icon. Kept all selection, custom URL, checkout ref, browse-URL normalization, keyboard invalid-ref guard and local-source mode logic unchanged.
- Changed five approved localized copy keys from GitHub-specific to generic Git guidance. Example hosts now use git.example.com while retaining each locale's existing connector/placeholder formatting. This changes examples, not user URLs.
- Removed only the GitHub recommendation/browse card from the skill URL form and its GitHub-specific loading caption. ClawHub and Skills.sh cards remain; the two-card layout uses two columns. Existing URL API call, trimming, seeding, callback, error and loading logic remain. An explicitly entered GitHub URL is still passed unchanged to the existing import API; it is not blocked.
- Project resource source already uses generic FolderGit, so project-resources-section.tsx was intentionally not modified. Internal github_repo/resource_ref fields and backend APIs remain unchanged. Existing URLs and source provenance/user data are not erased or relabeled.
- Producer attribution, LICENSE/NOTICE, product name/logo, source/footer links, ActorAvatar and all backend/schema/auth are untouched. Waiver-path confirmation/branding remains a separate hold. No all-site marketing expansion.

## Actual test-first sequence

1. Read source and consumers before proposing the exact write set. Root explicitly approved the two source paths, 14 files/five locale keys and four existing tests. Recorded old source/locale/test pins before production writes.
2. Added seven-language no-GitHub/generic-example checks, a create-project icon check retaining its repository tooltip, a desktop generic-Git/local choice check, a generic resource prompt check retaining the stored URL, and skill no-card plus explicit GitHub-URL import/loading tests. Existing URL/ref/tree/path/permission and local/failure tests retained; existing label/placeholder selectors migrated to generic user text without changing their payload assertions.
3. Initial old-source RED: 58 tests, 38 pass, 20 fail, 0 pending, exit1/stderr0. One new skill selector incorrectly requested URL instead of the existing Skill URL label; retained the raw and corrected only that selector before implementation.
4. Corrected-test old-source RED-r2: 58 tests, 38 pass, 20 fail, 0 pending, exit1/stderr0. The skill URL request now actually reached the mock existing API with the same GitHub URL, then failed on the old provider-specific loading caption. Other failures were the old GitHub copy/icon/card, not setup failures.
5. Rechecked all old source/locale/test pins, then changed only the released source2/locale14 scope. First selected GREEN: six files, 377/377, 0 fail/pending, exit0/stderr0 (four UI test files58 + unchanged local-resource2 + locale parity317).
6. Whole views typecheck initially FAILED exit2: seven errors in the new cross-locale test because the registered RESOURCES map exposes unknown/optional namespace entries. Preserved typecheck.*. Corrected only the new test's static narrowing to the already imported canonical enModals/enProjects JSON shapes; no assertion or product change.
7. Final same-six-file regression after type-only correction: 377/377, 0 fail/pending, exit0/stderr0. Whole views typecheck-r2: exit0/stdout0/stderr0, existing Node22.23.4/TypeScript6.0.3. No installation/config/lock change.
8. Scope audit: all 14 locale files byte-for-byte equal to HEAD after substituting only the approved five keys; protected project resource source/local test unchanged. Prior reviewed settings GitHub2source/2test pins unchanged. All 16 source51e pre-overlay source/locale hashes match the RED old pins.

## Selected verification commands

Private existing mirror: E:/CodexData/morchat-r1-local/run/multica-local-demo/client-help-r1 . Only exact candidate files synchronized; existing root/views node_modules junctions read source51e installed dependencies. No source51e write/overlay.

From mirror packages/views using Node22 and node_modules/vitest/vitest.mjs:

    run modals/create-project.test.tsx modals/create-project-local-mode.test.tsx projects/components/project-resources-github-ref.test.tsx projects/components/project-resources-local-directory.test.tsx skills/components/create-skill-dialog.test.tsx locales/parity.test.ts

Final file counts: create-project17, local-mode12, project-resources-ref16, local-directory2, create-skill13, parity317 = 377.

Typecheck: installed physical typescript@6.0.3/node_modules/typescript/bin/tsc --noEmit --incremental false . Selected unit mocks are not real Git/skill network execution or desktop acceptance.

## Final source/locale/test pins

| Path | SHA256 |
|---|---|
| packages/views/modals/create-project.tsx | 3A42840D3C1378BD55BBAE5C3948565B943B977819747CCD33CA4A9C8D795BB7 |
| packages/views/skills/components/create-skill-dialog.tsx | EBFADFAACA57CEFF1314460E44A8BEBFB358416F7FEC3F810B42FF6E6A86B640 |
| packages/views/modals/create-project.test.tsx | 6B8B6A44FB9885758FE89C753A4097062F4745DFB5EE6FF3EA494BB7715F1A8B |
| packages/views/modals/create-project-local-mode.test.tsx | 367AD0C3C31A87EBEFE1842BC16DDDD998BAA773C11460415A3C2AC12B59EFD1 |
| packages/views/projects/components/project-resources-github-ref.test.tsx | 0F1C545B3A12EF2C52257DA796B571228A5096607AACD85EFFE8664AFEE456A3 |
| packages/views/skills/components/create-skill-dialog.test.tsx | BF617C403AF87A032977C2506372699CE1AEE8B3FF929761073FC6C5634D7574 |
| packages/views/locales/en/modals.json | B3B2ACDBBE559AB0ADBD62C497CAFC73F50A1AB7AED1353D71B3EAB6959E82B0 |
| packages/views/locales/en/projects.json | CC049CB26C157E730874E4094DA8357B8715500DDBFDFAFBF3BAA460ED334955 |
| packages/views/locales/es/modals.json | 9F0F8BD4BF8FBBC2471EB636E36486ACB0F4FA86360B9DBBA2056AF60531F5B6 |
| packages/views/locales/es/projects.json | B4D744630A7527CD880C0AD896A6151B8A48747C208905DB00577D0233BFEB02 |
| packages/views/locales/fr/modals.json | 37DD0DADF93BEA9810A0DFB2024219BBC1FF703FB0A4DB40588107649173ED13 |
| packages/views/locales/fr/projects.json | D20D8DAF1D723E47D190681BA00CC782F7F31D78042FB6CE057B63FE8C7D23B7 |
| packages/views/locales/ja/modals.json | 4DBFBB9BE3C028C2FEDFD17FA30C86A6B621BA2CC99C6C5C4C3A039D206B6745 |
| packages/views/locales/ja/projects.json | EEF6893EC600C971C7D932C50F303381D7B0F8B617825C91A47E634FC9BF4A98 |
| packages/views/locales/ko/modals.json | 83A29C62B0445A957380AD3BA77E8EE7A5F0A07DC65B4C28755DDB25418FDCA3 |
| packages/views/locales/ko/projects.json | 5CF86A33BBCCDD5F7E6F45787ABA4B1EF54DB08F239D669AD22804FB671624C5 |
| packages/views/locales/zh-Hans/modals.json | 6D049ACBA5E9A995A6BFADDFAD7109A7F3B78B84B0B6AB43779E36EC4617AC5F |
| packages/views/locales/zh-Hans/projects.json | 8302F641CFA8898AC6BCD3F47D4C8A4F289A07B84DD00C7E8093E616C15654B7 |
| packages/views/locales/zh-Hant/modals.json | F2E90E8A7137BBFF4323D0D61D10E6D746EB53FD8CC7F3AB6EE79C5CFB6309FC |
| packages/views/locales/zh-Hant/projects.json | 6793C377983B1DB44B7FB2D10A6AAF8FE7F2BC1A5090D40A98CCD31D0B2C8C73 |

## Actual evidence

Exact root: E:/CodexData/morchat-r1-local/run/multica-local-demo/client-help-r1/evidence/project-skill-ui

| File | Bytes | SHA256 |
|---|---:|---|
| final-regression.exit.txt | 3 | 13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354 |
| final-regression.report.json | 99509 | D56826518B036698118960F96579EA8C0B76847563AF316C6E0ACBB7C5E77278 |
| final-regression.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| final-regression.stdout.txt | 146 | 48F2EFAFB0BF7581F7E1D80425019F394B1608F9E434E132151E41769CD099EA |
| final.source-test-pins.json | 2364 | FB88A3A6DF7F14566F76D6AB4320402031B2123B0FD257DDEE6C04A7CA4C9CD3 |
| green-regression.exit.txt | 3 | 13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354 |
| green-regression.report.json | 99501 | EFF6949E79F1DEC22AD69863169FCC5EDBC56F3065116193004FA621775D64C8 |
| green-regression.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| green-regression.stdout.txt | 146 | 1B8DACB1FC9D47FD18056A7A4785D06D500C78208434466CBFB7E3F767ABFF36 |
| green.source-test-pins.json | 2364 | 9BE2EB5609CF6425966A42AB5792C7EC34D1D1A97A37B8D4BBCC4DB8655106F8 |
| red-r2.exit.txt | 3 | F1B2F662800122BED0FF255693DF89C4487FBDCF453D3524A42D4EC20C3D9C04 |
| red-r2.report.json | 177895 | 52966F9E9067798E142A991CA184D3FC91BF8269D42ACAD49DAC60D46ACC57B1 |
| red-r2.source-test-pins.json | 2364 | 6973EE0BB50D2ABCAA0282EC5C18B6F6DAA5CD23A4EA4E704D73412D7A7E5D35 |
| red-r2.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| red-r2.stdout.txt | 136 | 90A140D393A8CC59DEDB7C13F19982BF5A3691CD3A6E39A768363EB59F086DC5 |
| red.exit.txt | 3 | F1B2F662800122BED0FF255693DF89C4487FBDCF453D3524A42D4EC20C3D9C04 |
| red.report.json | 168558 | 33DA560B10E0D0B5AE301C87EA9501DC66AB4A315D8B3CC6E97523E36AD6CAE4 |
| red.source-test-pins.json | 2364 | 537DA0DC5CFFDBE96F251CDFD448A4184D199C98BC141EEB286C59DCD7C96348 |
| red.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| red.stdout.txt | 133 | FF9C1815E7774C790695984CBD555A58A95004F99AF5BF0DE932EAC0DFEA1D6D |
| scope-check.json | 3083 | F459AEA8056D6BA5E83884FAE6C426BEB0DCB9F6908D16F9425120FC33DEB996 |
| source51e.pre-overlay-pins.json | 1834 | CF6EA1C4561930F0C1352D44B2F171D4A231C17FB1CEFDFFC8E9A098A1D8B640 |
| typecheck-r2.exit.txt | 3 | 13BF7B3039C63BF5A50491FA3CFD8EB4E699D1BA1436315AEF9CBE5711530354 |
| typecheck-r2.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| typecheck-r2.stdout.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| typecheck.exit.txt | 3 | DF4E26A04A444901B95AFEF44E4A96CFAE34690FFF2AD2C66389C70079CDFF2B |
| typecheck.stderr.txt | 0 | E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 |
| typecheck.stdout.txt | 630 | 31CD930D2EE1E1BA369C5ECF05FA30AA6EBF9BD16E5ADB7F3CB75AC3A02EC085 |

## Residual / delivery gate

Independent review ACCEPT from /root/icons_avatar_study_r1; no owner self-approval. Build, runtime-export overlay, real UI click and whole frontend suite NOT RUN. No DB/model/browser/process/window operation or commit/merge/push. Existing failed runs retained. This slice removes only project/skill GitHub-specific guidance; it does not disable GitHub backend APIs, remove all GitHub references, or change existing resource data. Root alone decides the next controlled consumer/build action after independent review.

## Independent review evidence ACK

/root/icons_avatar_study_r1 reported final ACCEPT, no P1/P2, after independently checking pre-ACK card A72320B253CD5120E15FFE85134A850EF73AF28D65D1DD4DABD738A936545F90 and 28 artifact hashes. Reviewer confirmed 20 final pins equal current source/candidate, 16 source51e old blobs equal HEAD/RED, 14 locale files change only 35 approved leaf values with all remaining bytes equal HEAD, protected resource source/local test unchanged, and final377/typecheck-r2 results with original failures preserved. Reviewer sent Root only a controlled 16-source/locale overlay ACK. This owner metadata update does not claim build, UI, DB, all-app GitHub removal, branding or avatar acceptance; no ACTIVE change.
