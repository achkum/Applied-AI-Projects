# SubTrack — core individual experience

A dependency-free, mobile-first implementation of the SubTrack MVP's individual journey. It uses a deterministic sandbox provider and sample Swedish transactions; no real financial data or credentials are used.

## Run

```bash
npm start
```

Open `http://localhost:3000`, connect the sandbox bank, review detected recurring payments, and inspect subscription details.

## Verify

```bash
npm test
```

The domain tests cover normalization, merchant mapping, recurring detection, confidence, and totals. The `MockBankProvider` boundary in `src/core.mjs` is ready to be replaced by a Tink Sandbox adapter once credentials and the backend foundation are available.

## Privacy and scope

- Source descriptions are normalized locally and remain unchanged.
- Detection and arithmetic are deterministic.
- Corrections stay in browser memory in this standalone slice.
- Production auth, persistence, and Tink token exchange belong in the engineering-foundation/backend scope; no secrets should be added to this client.
