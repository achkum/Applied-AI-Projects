# Android single-line password source repair

Actual restore failed in SDK signer loading (fixed KEY_ERROR/JAVA_ERROR predicates); private equality comparison confirmed DPAPI key/password match retained files. No key or ciphertext replacement is needed.

Remove only the explicit `--key-pass file:/key/password`: initialization uses the same password for PKCS12 store and private key. Android PasswordRetriever caches file streams and consumes one line per password request; the second request on the same one-line file reaches EOF. SignerParams without explicit key password first uses the already supplied keystore password. Actual qualified build-tools36/JDK17 synthetic fixture reproduced explicit same-file EOF and default successful key/certificate loading. Source-derived regression reads exact candidate signer arguments and verifies shared-password initialization; synthetic fixtures never use retained keys or produce an eligible APK.

Official source checked2026-10-15:
- https://android.googlesource.com/platform/tools/apksig/+/refs/heads/main/src/apksigner/java/com/android/apksigner/PasswordRetriever.java
- https://android.googlesource.com/platform/tools/apksig/+/refs/heads/main/src/apksigner/java/com/android/apksigner/SignerParams.java

Signer SHA9d4c09b1651f240b77a00edbb2ccc7e5ff4c9d1fc059c5112b0ad36dc561b191; Bash syntax passes. All alias, PKCS12, signer cert, readonly key mounts, source/import/SDK/archive/resource, alignment, signatures, backup restore/acceptance and cleanup gates retained. Metadata-only adoption must retain old sign/import records, prove unchanged import-validator Git bytes, validate old/new records against actual image/custody and change only reviewed tooling authority. No APK/tools rebuild/relabel, image reload, key/cipher/identity reset or backend mutation.