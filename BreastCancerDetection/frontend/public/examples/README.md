# Preset demo slides

Drop the 4 demo slides exported by the notebook (`results/deploy/examples/`) here, alongside the
`labels.json` manifest that maps each filename to its ground-truth class, e.g.:

```json
{
  "SOB_B_A-14-22549AB-400-001.png": "benign",
  "SOB_M_DC-14-2523-400-001.png": "malignant"
}
```

`UploadSlide` fetches `labels.json` at runtime and renders whatever is listed. While this file is
empty (`{}`), the upload form simply shows no presets.

These are the only slide images committed to the repo — BreaKHis is licensed; no training data lives here.
