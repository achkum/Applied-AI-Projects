# ST249 independent privacy and Money source review

2026-10-14. SOURCE GO for the frozen pure-domain stream only. Independently inspected the actual diff, bigint tests, canonical Money constructors, package export, declaration configuration and runtime build script. No implementation edits or test reruns were performed.

Both front doors call the same recurring core. The legacy safe-number validation stays at its original point; the bigint path checks runtime type and signed-int64 bounds before pending/credit filtering. Owner/account/currency/date short-circuits and all schedule, amount-band, reason and deterministic tie-breaker logic remain shared. Money amounts never convert to number. The new runtime export is additive; the script pins the existing esbuild version, asserts canonical Money input and no external runtime imports, then checks a clean Node import with NODE_OPTIONS cleared. It creates no telemetry or private artifacts.

Author evidence reports 20 focused tests, declarations/build, clean Node import, types and scoped lint passing. New bigint guard branches are covered completely; the disclosed whole-core branch result is 82.96%, above the unchanged 80% threshold, not whole-file 100%. Tests cover five cadence parity, above-safe exactness, forged/out-of-range amounts, legacy rejection and unchanged filtering. These results were inspected rather than independently rerun.

The exact absolute value of signed-minimum debit is positive 2^63. Subsequent storage must validate every candidate amount with bigint against the positive SQL bigint maximum before the first write and rollback the complete scan on an unpersistable value. No clamp, conversion, silent omission or partial scan. This boundary is frozen in the storage proposal; it does not require changing the pure-domain exact result.

Reviewed SHA-256:

- detector.ts: d834d91405cabaa1c5c82bacb3891179209b8b249ce13d2a78e8bd533bf89c87
- types.ts: 459aa5b10a97e7bf9234bf33e7635896a895070b03077a8c681c3d2a132f6f1a
- index.ts: a1cfa815285e665ea51be26a6528b246251b9bba5988e107cfd7f4d6c26ee6e2
- build-detection-runtime.mjs: 2a7bf035100229383d1c4772480a92f9b4070eef6f7fbca6f414d1810ce0a87e
- tsconfig.detection-runtime.json: d5e7c8635bd0548c07215a10ef189081d4ee35317f68f923e9a77b1f572bff36
- package.json: a5eb286fcfadae961ac619e4e1329f1be5b21f69f5c6882c74fee802b9594c48
- detection-bigint.spec.ts: 74e8cb7dbcb96d251520a7c644b3fdc2d75549504f47480a6679c138eafcdd3e

API/storage/authority/native source and actual PostgreSQL/device acceptance remain separately gated. This review does not complete ST081 or authorize production retention, training, export or delivery.

Packaging delta SOURCE GO: the additional require export selects the same ESM bundle solely for CommonJS require.resolve followed by pathToFileURL and dynamic import. The build now separately probes this existing API-loading pattern with NODE_OPTIONS cleared, in addition to the original ESM import probe. No require execution of ESM, new dependency, external import, Money or authority change. Author reports build and script lint passing; source inspected without rerun. Superseding hashes: package.json 5cd336d5a45e1c33734cb05af152bdfb39bdf29c254253148d6cb32996ccf3ab; build-detection-runtime.mjs 756462dd23bb0c7db0c71898e54a94198ce32b9348b3eadf70f414918842eefc. Other reviewed files remain unchanged.

Matcher packaging delta SOURCE GO: detection/index.ts directly re-exports the existing matchMerchantDescriptor and its types from merchant/match.js; both clean import probes now require that function. No cloned normalizer, ambiguity-rule change or raw-descriptor display fallback. Superseding hashes: index.ts 7d9d818a338903545459e8fa66c6043b5aa4fa13f5b81530f790d2cd01389b4a; build-detection-runtime.mjs cc83b3715fd7a01aa09be16e85f1f8fb02965f0242c1925bfdb8290188a1cac6. Author reports declarations/build and lint passing; no rerun or actual storage acceptance claimed.
