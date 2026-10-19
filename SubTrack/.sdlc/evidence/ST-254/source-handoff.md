# SDK54 static bundle guard repair

Actual installed-native CI passed version/preconditions, fixture construction and HTTPS startup, then failed before Expo launch because static bundle policy accepted only obsolete RN0.74.5/Babel11.0.15. Resolved installed packages are RN0.81.5/Babel54.0.12, matching existing accepted package/lockfile.

The two-path correction changes only the exact allowlist and test vector. Static Expo export arguments and platform/output/privacy gates stay unchanged. Tests resolve the real installed packages and verify both-platform acceptance, rejecting stale/foreign/mismatched pins and invalid platform/output inputs. Existing dependencies are unchanged.

Seven policy tests pass with 100% line/branch/function coverage. Both syntax checks and scoped ESLint pass. Source hashes: policy0437e4ee8e61b1c78135255698960aa15e06de7e7a1c1a25af0b1b2a4e3b2e10; test6bb16060821f05cac0f773ea275c18900a5a8afd2c12cbafeb561a03d89dcf28. No remote operations, app launch or installed acceptance claimed. Independent delta review and new-head applicable CI remain required.

Separately, the ST253 actual-source precondition test now explicitly imports Node URL rather than relying on a global absent in the existing ESLint configuration. Scoped lint and all three source-block tests pass; no driver/authority guard change.

Independent delta review: SOURCE GO for explicit Node URL import and the two SDK54 static-policy paths. Reviewer matched all three frozen hashes and confirmed that only accepted exact dependency versions changed; static export arguments and privacy/authority guards remain unchanged. No tests or remote actions repeated. Actual installed-native CI still required.
