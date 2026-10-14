# Android tools legacy config and shape diagnostic source review

Disposition: **SOURCE GO** for this bounded diagnostic delta. Actual SHA256 matches module `383000596302697b798a589a0458ff4a7ac8dc021612902df93df6ba74ed181f` and test `779e350062ee58892af0c8df25ff5aa51ab9802294fdb72413fb38f809152254`.

The legacy config classifier requires the closed unknown OS/architecture, layers rootfs and bounded digest-list/null shape, with only an optional empty config. It does not admit unproved created/history fields. BOUND additionally requires actual hash/size-bound config and in-toto descriptors, a target-bound attestation manifest, known subject digests and exact ordered rootfs DiffIDs matching the statement bytes. Null DiffIDs or a missing/foreign graph remain UNBOUND. The earlier predicate-shape accuracy repair remains intact.

Canonical JSON collection retains the UTF8 roundtrip, exact compact serialization, content-addressed name and 1 MiB guards. Scalar roots are handled safely. Unknown JSON emits only a finite union of fixed root/field-kind and known structural flags; no arbitrary names, values, counts, digests, parser errors or body data enter the output. The inspected fixtures cover bound/unbound legacy configs, malformed shapes, scalar roots and privacy canaries. Every extra still unconditionally rejects and produces no receipt or archive-upload eligibility.

No material defect found. No independent tests or external/runtime actions were performed. Author-reported focused tests and source approval do not prove the actual failed archive's classification or build/import success.
