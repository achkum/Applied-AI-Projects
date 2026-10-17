# Disabled Expo updates metadata source review

Disposition: **SOURCE GO**, superseding the sole guard-order HOLD. Final actual SHA256 matches release module `8806ca091e83e18a56d9039ba683c6b33b7196f3f701133a9cb6b345415685ab` and test `870fd6781962c3e6471844b6b74809b873f9c1c88b3ce09d9921f9cc14c9128a`.

The bounded repair rejects EXPO_UPDATE_URL/RUNTIME_VERSION before the absent ENABLED return. Added unsigned and signed absent-marker negatives cover both override names. The sole prior finding is resolved; no remaining material defect was found in this slice.

The remaining delta narrowly allows one exact false boolean tag with two attributes in either order and self-closing/empty paired form. Enabled, duplicate, resource, extra-attribute and case variants remain rejecting. Both unsigned and signed inspection use the same helper; unrelated XML, signature, actual config/Hermes/ZIP and source gates remain. [Expo SDK54 documentation](https://docs.expo.dev/versions/v54.0.0/sdk/updates/) supports embedded-update loading when updates are disabled; generated metadata presence is distinct from actual final APK eligibility.

No tests or remote/runtime actions were performed. The reported local prebuild does not establish final merged APK or signed native acceptance.
