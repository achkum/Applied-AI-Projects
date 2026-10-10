# Offline catalogue extraction

Run `pnpm --filter @subtrack/catalog catalogue:extract -- <manifest.json> <new-output.json>` from the workspace. The command accepts a UTF-8 JSON manifest of at most 16 KiB and local HTML files of at most 1 MiB, each stored beside the manifest. The output must be a new file.

Manifest shape:

```json
{
  "version": 1,
  "sources": [{
    "sourceId": "storytel-se",
    "inputPath": "storytel.html",
    "provenance": "synthetic",
    "capturedAt": "2026-10-10T10:00:00Z",
    "previousMinorUnits": { "Premium": "16900" }
  }]
}
```

`sourceId` must name an entry in `sources.yaml`; provenance is `synthetic` or `manual-fixture`. Capture time is caller-supplied UTC. Baselines are canonical non-negative SEK minor-unit strings (öre); zero is retained as an invalid baseline and quarantined. Results are extraction candidates, never verified current prices. Missing baselines and changes strictly above 40% are quarantined. Registered source terms remain unresolved and live fetching is disabled.

The browser loads supplied text with scripts disabled, service workers blocked, and all requests aborted. It never navigates to the registered source URL. Synthetic test markup exercises the configured selectors and does not assert compatibility with current websites.

HTML containing a meta refresh is quarantined as a whole source, even when its prices otherwise match. An aborted refresh can destroy the extraction document; no partial candidates are accepted. Isolation tests retain hostile refresh, script, image and local-file frame/object stimuli, assert zero hits on an owned loopback server and exclude a private file sentinel from the artifact.
