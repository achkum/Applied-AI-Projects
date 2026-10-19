# Volume initializer permission order source review

Disposition: **SOURCE GO** for the minimal deployment/test repair. Actual SHA256 matches deploy `27aa547fe8d6ffe92fe48f4fe4a29d64b44cd4e2b786efa518ecb4c8bc0348d9` and test `8738589ff1e08fef4510bb95c681508145d4f6efe81fcc92040dc45f4e2df2e1`.

The embedded fresh-volume initializer now chmods the root-owned directory to 0700 before transferring UID/GID to 999 or 1000. This avoids needing CAP_FOWNER after ownership transfer while retaining CHOWN/DAC_OVERRIDE only. Accepted IDs, canonical directory and empty-content guards, exact final owner/group/mode checks, bounded invocation and ownership-controlled cleanup are unchanged. No retained-volume reset or privilege expansion is introduced.

The added test extracts the actual embedded program, models chmod denial after ownership transfer, covers both intended owners, proves the original order fails, and retains nonempty/invalid-owner rejection. The existing capability fixture remains exact. No material defect found in this delta. Authenticated tooling custody and the immutable import binding must still match the upgraded executable before invocation; this approval does not authorize relabeling or overwriting a prior binding.

No tests or external/runtime actions were performed in this review. Source approval does not establish actual initialization or activation success.
