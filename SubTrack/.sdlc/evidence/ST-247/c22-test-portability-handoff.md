# C22 canonical OS-temp test portability repair

Root explicitly authorized narrow test-only repair after coherent head4a3d269 native38495163270 iOS115629164493 failed preflight dependency/proof-tools step. Exact safe failure: fresh-invocation fixture at source line32 expectedAVAILABLE but gotUNAVAILABLE; no actual native driver/Pods/identifier/enrollment gate reached. Source fixture used lexical OS temporary directory while production reader requires canonical nonsymlink owned paths; OS temp aliases can violate that positive fixture prerequisite.

Changed only test temporary helper: resolve OS-temp base through fs.realpathSync(tmpdir()) before creating fresh directory, then verify recursive cleanup containment against that same immutable canonical base. Production strict reader, symlink/realpath/inode/bounds guards, original invocation/output/acceptance untouched. This corrects the test setup to its intended canonical-owner precondition; it does not relax a rejected alias or adopt a different flow.

Focused helper six testsPASS, lines/branches/functions100%; changed test scoped ESLintPASS and git diff --checkPASS. Production helper SHA256 independently compared with prior handoff and is unchanged. Test hash refreshed in c22-source-hashes.json. No Git/push/rerun/cancel/heavy job. Independent platform/privacy source recheck required before root combines a future repair/head. Actual Mac preflight success remains unproven until that changed-head job executes.

Current test SHA256: 568d8c3cc94eb63c696970a1331a0aa246bd1edbc6c8d754a084714470c82e41
