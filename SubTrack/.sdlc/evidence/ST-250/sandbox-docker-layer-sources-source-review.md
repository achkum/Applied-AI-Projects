# Docker LayerSources compatibility source review

Disposition: **SOURCE GO** for the bounded helper/test repair. Actual SHA256 matches: `image-import-binding.cjs` — `0e5f635e8169fb854a5a88985b9da96f66694ea8d27ed10e0dd7acdd0aa64463`; `activation-contract.test.cjs` — `097918d69bcf34548e72de14c626157a149bcf84ba2e3ebc259d121693418ff9`.

The manifest remains closed to the original three fields plus optional own data `LayerSources`; Parent, unknown fields, hidden fields, accessors and unexpected prototypes fail. The optional map has exactly the raw config DiffID keys. Each descriptor is closed to mediaType/size/digest, requires raw OCI tar media type, its key digest, positive safe size bounded to 2 GiB, and matches the actual streamed layer digest and byte count in original config order. Duplicate DiffIDs remain represented once in the map and checked for every ordered occurrence. The legacy three-field form retains its original config/layer binding.

The archive integration measures layers before checking descriptors and then retains full config, identity, platform and ordered layer checks. Existing streaming, private-path inspection, scratch cleanup, provenance, per-service probe and retained receipt gates remain in place. The new regression covers actual/legacy shapes, foreign and missing keys, digest/size/media drift, extra descriptor fields, accessors, changed measured bytes and swapped order.

No independent tests or runtime actions were performed. Author-reported focused tests do not establish VPS import, activation or resource acceptance. This review supplements the prior consolidated five-path source review; it does not waive any runtime gate.
