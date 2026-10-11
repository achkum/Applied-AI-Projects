# ST-226 independent Prisma QA receipt
Frozen Git-normalized composition/spec hashes match 7249a9b3705e04893ac9ad6502f17f9d9a05c42c and db71b707c9fac3e0ac3e0028f13d8b7880a45082.
Private c5 full-suite receipt SHA-256 matches 8b8641119af3f099256f15a3de9467ca3a310c9b167e45a4033deb45a07a6057; its aggregate reports 76 files, 1,668 passed, zero skipped (receipt hash-validated, not rerun).
Independently ran only the three named composition regressions: 3 passed; 44 unrelated cases were excluded by the title filter.
Real Prisma proxy test proves callable proxy methods despite noncallable own descriptor values, one intercepted request reaches masked storage preflight denial, and connect/disconnect/Nest remain untouched.
Noncallable Prisma methods reject before preflight/Nest; authority accessors remain uninvoked and storage untouched.
Local narrow regressions PASS; no full-suite rerun or actual PostgreSQL proof claimed.
Actual Linux PG16 compiled-launcher CI run 38096675090 remains FAIL (child_startup_exit/child_exit); new exact-head CI is still required.