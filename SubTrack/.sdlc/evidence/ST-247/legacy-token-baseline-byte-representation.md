# ST247 legacy token baseline representation repair

The two existing generated-token evidence maps retain the same two path keys and the same SHA-256 digests, now encoded as 32 JSON byte integers instead of a continuous hexadecimal string. The focused consumer validates byte-array shape and compares the exact canonical LF text digest. On a CRLF checkout it also compares the exact original checkout-byte digest against the separate checkout evidence map. This preserves the intentional distinction between canonical Git LF and local checkout bytes without making a Linux LF checkout depend on Windows line endings.

No generated token, scanner rule, path allowlist, or acceptance threshold changed. Focused token test and scoped lint passed after adding the explicit Node Buffer import. The evidence maps contain public generated-file fingerprints, not credentials. Independent privacy/source review and the root-owned historical-fingerprint handling remain separate.
