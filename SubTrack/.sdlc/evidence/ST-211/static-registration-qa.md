ST-211 static route QA: PASS; 2026-10-10.
Built with Expo SDK 51: `corepack pnpm --dir apps/mobile exec expo export --platform web --output-dir ../../.sdlc/evidence/ST-211/web-static`.
Actual `/register` route, viewport 375×812: EN/SV × light/dark, each visible form, zero page errors, zero `/api/` or mobile-enrollment requests; four screenshots accompany this receipt.
Playwright capture: `node .sdlc/evidence/ST-211/static-registration-qa.cjs`; result details in `static-registration-qa.json`.
CRLF-to-LF UTF-8 source SHA-256: register.tsx `04f641cfe86a73fbf97fcf175e495cadd48fd8a47b657bdc2e2ef0f0ca09d4f6`; RegistrationScreen.tsx `3b2865ec80365f214fc2ac77f492f6df98954a4a89d41f61a73f406569f9867f`; IdentifierEntry.tsx `12d76b646959d22229e098c5c5c065e3b7614456c7dc249e2fabda55843edc41`. Raw Windows-byte SHA-256: register.tsx `1487cb8ad0986915a44d0bc5cc5adf7f014b7b1288f99f1b0fc4da0b97f5f60b`; IdentifierEntry.tsx `dfd1d93dc271643dbfc0c4c75524f59e645ee5d355a093a5e1bce8a936197846`.
Static bundle SHA-256: `2d34688cb9ccba6f1b5656f2c9bf2984312d64fa9e0f49bb8456f04c4062a4bc`; generated export remains local via `.git/info/exclude`.
Limit: registration only; OTP/BankID rely on prior test fixtures. No native, TLS/device-trust, delivery, provider or account-authority claim.
