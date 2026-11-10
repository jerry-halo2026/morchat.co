---
purpose: "Windows DSH direct-process tests — source-only plan"
owner: docs-maintainers
status: current
updated: 2026-11-10
related: []
---
# Windows DSH direct-process tests — source-only plan

Read tracked TF and immutable windows-dsh-next-r1 implementer task brief. Root hands over only2 NEW test paths; everythingelse and actualruntime remain CLOSED.

1. Verify actualbranch/HEAD, all28 declaredbeforepins, bothpathsABSENT and all signedinputs. Write actualowner/modelscopeACK before source.
2. Implement standard-library synthetic JSONL PE fixture and exactly2 Windows tests; no init/global sideeffects, no Skip/Parallel/newprod APIs. Test actualMessagesfence/sentinel, full3second grace no-premature-result and actualdirectchildexit ordering. Do not claim descendent/daemon/UI/modelproof.
3. Pin gofmt42f and format only2paths; no Go build/test/vet, fixtureexecution or DSHexec. Preserve source hashes/diffs/staticcounterexamples and protectedoldsource. STOP independent source review.
4. Only after explicit separatecompile/profile/Jobrestrictedidentity/ACL/nonetwork/wholeTestMaininit and clearenv audit may anyPErun occur. Known sharedproc P0 cannot be silently ignored; realDSH installation/models/cloudusage/archives/physicaldualdevice remain later gates. No modelcostpermission is inferred.
