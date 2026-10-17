# Android tools legacy V1 chain diagnostic source review

Disposition: **SOURCE GO**, superseding the prior bounded serializer accuracy HOLD. Final actual SHA256 matches module `70b8b1f02982acbcb7b2e6724beacadd63e55c15d71374e5746310c5fb031f88` and test `37431a744f45059a6940970b4aa9ffddc097c2bb3e1506364d57adc642056213`.

The repair conservatively leaves integer-like Labels/Volumes/ExposedPorts map keys unsupported and UNBOUND rather than serializing them through JavaScript's numeric property enumeration. Numeric map fixtures now assert no CHAIN_BOUND and an incomplete chain. This closes the prior ordering finding.

Supported config fields now require string, boolean, string-slice, typed map or safe integer-pointer shapes before conversion. StopTimeout zero is retained rather than omitted. Nonnull Healthcheck stays unsupported instead of approximating another codec. Wrong-type StopSignal/WorkingDir/timeouts/health/Cmd/escape/volume fixtures remain UNBOUND, while the realistic independently written transcript retains COMPLETE. V1 top-level type guards are present. This closes the prior type finding; no archive predicate waiver is introduced.

The ordered ChainID/parent linkage, epoch intermediate metadata, final verified-image comparison and canonical hash-bound small JSON collection otherwise preserve the intended proof. Fixed class output does not expose IDs or contents, and every extra still rejects without receipt or upload eligibility. No tests or runtime actions were performed.

Primary comparison: [Moby CreateID](https://raw.githubusercontent.com/moby/moby/v28.0.0/image/v1/imagev1.go) marshals the typed V1 image before the sorted raw-message map; [container.Config](https://raw.githubusercontent.com/moby/moby/v28.0.0/api/types/container/config.go) defines field types and omission tags; [save writer](https://raw.githubusercontent.com/moby/moby/v28.0.0/image/tarexport/save.go) supplies the legacy metadata sequence. These references establish the intended writer model, not actual archive acceptance.
