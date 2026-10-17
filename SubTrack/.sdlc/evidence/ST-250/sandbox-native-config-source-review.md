# ST250 independent native configuration source review

2026-10-14. **GO for the four-file preparation configuration slice only.** Independently inspected actual files and recomputed all four SHA256 values; every value exactly matches `sandbox-native-config-source-handoff.md`. No source mutation outside this review, Git, remote operation, test repetition or native build performed. Author's reported loader/Jest/type/lint results remain identified as author-run evidence, not new reviewer execution.

`app.config.ts` is self-contained apart from erased Expo types. With variant absent it returns the incoming config, preserving actual app.json fields and existing private CA plugin/default behavior. Explicit sandbox requires the exact verified candidate `https://198.44.116.159`; unknown/empty variants and noncanonical origin variants reject. Local name/slug/scheme/package/bundle identifiers are distinct, while inherited assets/fonts/default native fields remain intact. These identifiers assert build intent only, not Apple registration, signing, App Store record or endpoint availability.

Sandbox config excludes the actual `./plugins/private-runtime-ca.cjs` entry and rejects presence of the existing private proof/CA/fixture flags and public enrollment/diagnostic enabling inputs, including false/empty values. Cross-checked actual private plugin/runtime/diagnostic environment consumers. The plugin's original debug CA and private graph implementation are unchanged. No new private credential/fixture or certificate payload enters `extra`; sandbox metadata contains only variant/candidate origin and literal false runtime/publication/private-diagnostic flags.

The pure resolver admits preparation for Android/iOS equally with development true or false, without loosening the existing development enrollment resolver. It rejects web/unknown variants/noncanonical origins and always returns null from `resolveSandboxRuntime`, even for valid release preparation. It does not contact a server, initialize guest authority, alter credential custody or wire screens. The runtime-disabled marker is not represented as a usable beta.

Read the actual installed-Expo-loader helper: tests cover preserving static config/default private missing-CA failure, distinct sandbox identifiers/plugin removal/false metadata, unknown variant/origin refusal and every frozen private configuration contamination input. Resolver tests cover both platforms/release and development preparation, all unavailable inputs and immutable disabled descriptor. Author reports four helper tests and25 focused Jest tests with100% metrics plus actual mobile/app-config semantic checks and scoped lint. No reason found to repeat unchanged checks during this source review.

No actionable finding in this finite scope. Actual release bundle must separately demonstrate public-CA trust, private diagnostics/fixture exclusion, correct runtime/client wiring, configured source marker, signing and installation before acceptance. Plugin exclusion and build-time flag refusal do not prove complete tree-shaking or phone behavior. Identity implementation and publication remain separate reviewed work despite founder proposal adoption.

Reviewed SHA256 roster:
apps/mobile/app.config.ts 019157dd0b5880aafd6962bccb5d9256e7d5d161f20ccfe821935e22f6a90b73
apps/mobile/scripts/sandbox-app-config-test.mjs ea938a394ccf33df4edda2fc5c3d9dae98778fae6ca52949e9bbf998b6ce8e0a
apps/mobile/src/config/sandboxRuntime.ts 84f325c8331fce9a856b9e8962001164f8bd2b2ca765b9d7a90fec47d867cc4f
apps/mobile/src/config/sandboxRuntime.test.ts 4af99dfb354358e03292196fc90dff9b666c898a8f1464caa9b7832d401cf0f5
