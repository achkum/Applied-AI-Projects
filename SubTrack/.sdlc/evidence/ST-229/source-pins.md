Reuse all24 ST228 source-pins.md: each matches accepted main243a0d376a23e5fa409fda23592ed8ee402affde and working source; ADR0026 blob5ce4945a594e68b7aba47308f514d8bdfff040c7; transaction-plan blob5ca879c949cbce10eae22fe61587c2161c575bc4.
SubTrack/apps/api/src/auth/otp-v2/otp-http.ts : 0c819e6edd0dfb4981bb0b6ba095af7b0c90e795
SubTrack/apps/api/src/auth/browser-nonce/browser-nonce-http.ts : cf031402cab2c5031b4a831e3b98570d77278d6f
SubTrack/packages/contracts/tests/v2-auth.test.mjs : fe57e73ab6a8d2ea124e5d88ee153016ef11afd8
SubTrack/docs/product/API_CONTRACT.md : b4d4ffc21eb573300d078f5518d8cd13600012b0
Source constraints: nonce.ts consumeAndRotate/consumeForSession only; otp-http.ts lines79-118 rotates same purpose and provisions hash only; proof-store.ts compareAndConsume returns boolean, consumeLogin is login-only; idempotency allowlist has no new enrollment operations; WebSessionResponse strict at openapi.yaml1386, V2Problem1477 is not four-field strict.
