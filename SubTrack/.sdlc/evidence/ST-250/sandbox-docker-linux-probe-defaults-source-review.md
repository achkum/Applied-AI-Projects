# Linux Docker probe defaults source review

Disposition: **SOURCE GO** for the bounded helper/test delta. Actual SHA256 matches helper `3307702238a1ea04ae3068d84ee1fbe807c6b444e6cac316e8256fa3c0890d0c` and test `53fa621a4f497ca43308d27e07281092646b795cc5ffa4d1729fd6ea581277fc`.

The fixed never-start CLI recipe now requires stdout/stderr attachments true and stdin/Tty/open/stdin-once false before projecting only stdout/stderr to the image comparison defaults. The expected Linux probe config explicitly requires ArgsEscaped false for the overridden `/bin/true` entrypoint and empty Cmd. Archive-to-image config binding and the returned base image portfolio hash retain the original ArgsEscaped value. Probe SecurityOpt requires the exact bare literal emitted by its CLI recipe; the distinct live Compose guard remains unchanged.

Regression assertions cover each rejected attachment/input/escape drift, false/extra/colon security options, and unchanged base ArgsEscaped and portfolio hash across all three service fixtures. No material defect found in this delta. Prior import provenance, layer, config, resource, mount and cleanup gates remain applicable. No tests or external/runtime actions were performed; this is source approval, not VPS acceptance.
