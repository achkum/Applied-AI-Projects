# Android signer host identity independent source review

Disposition: **SOURCE GO** for the bounded host/container group correction. Actual SHA256 matches sign script `41557d26b836ace88d9b6a21dd2aa9a8b2842bc618c33d5aa661438330393e4f`, desktop helper `b362788ea2f92b1f73a2d7c41ec5118143458f26b7ec67bea418419d4c12b1a8`, and test `94c11e43e409d8d585af980dc9f144e165663c08417ee247d7ac37b4d02fc749`.

Host execution and retained/staged custody now require the measured UID996/GID987. Image inspection, container invocation and tool probe retain UID996/GID996. Mode600/700 owner access therefore remains valid without granting group access or new capabilities.

Group normalization is confined to the two fixed secret paths created by the fresh initialize branch. Each must first be a regular nonsymlink mode600 UID996/GID996 file, then chgrp987 and pass exact final custody. The branch requires absent keydir; existing identity, key, password, backup, restore and history paths undergo validation rather than automatic rewriting. Host-created signed-return copies and metadata naturally retain the host group. Temporary container output/certificate files remain temporary and are not incorrectly treated as persistent host files.

The focused source regression exercises actual Bash authority with both group identities and rejects wrong/root cases; it also checks unchanged container identity and normalization/check ordering. No material platform/privacy defect found in this delta. Existing signer backup/restore proof, offline execution, source/image/manifest and return eligibility gates remain applicable. No tests, keys or remote/runtime actions were performed by this reviewer.
