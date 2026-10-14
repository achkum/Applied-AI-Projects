# Android signer host identity repair

Root measured the approved VPS transport identity as UID996/GID987. Host authority, custody directories, retained files, restore inputs and desktop remote checks now require that exact identity. Signing image, container user and container probes remain UID996/GID996. Identical UID permits owner access to the existing restrictive bind-mounted files.

Fresh initialization creates secret files inside the container. The source therefore verifies the two fixed freshly created p12/password paths are regular, not symlinks, UID996/GID996 and mode600, then changes only their group to987 and verifies exact host custody. This performs no key operation in this author session. Host-created identity, backup, history and signed-return files retain the measured primary group normally.

| Source | SHA256 |
| --- | --- |
| tools/sandbox/sign-android.sh | 41557d26b836ace88d9b6a21dd2aa9a8b2842bc618c33d5aa661438330393e4f |
| tools/sandbox/download-android.ps1 | b362788ea2f92b1f73a2d7c41ec5118143458f26b7ec67bea418419d4c12b1a8 |
| tools/sandbox/android-transfer-receipt.test.mjs | 94c11e43e409d8d585af980dc9f144e165663c08417ee247d7ac37b4d02fc749 |

Focused test passed: actual Bash host authority accepts996:987, rejects996:996/root/wrong groups; container guard separately accepts996:996; custody mode/group negatives and initialization normalization order are checked. Bash and PowerShell syntax passed. No keys, deployment, CI, Git or remote actions were executed. Independent review remains required.
