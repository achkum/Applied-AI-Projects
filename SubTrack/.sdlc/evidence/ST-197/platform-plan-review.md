Classification: Type 2a (architecture). Approved with conditions for the development-only unified DELETE controller and accepted-service composition described in the proposal.

The change is a reversible, opt-in runtime composition of an existing v2 route. One controller avoids registering the competing ST-194 and ST-196 controllers, while delegation keeps the established web CSRF/origin/binding checks and mobile TLS/JWT checks authoritative. The credential selector supports a mutually exclusive revoke branch and returns no credential material. The proposal also preserves the accepted v1/default wiring and makes no production-readiness claim, so this does not change the security model or create a Type 1 decision.

Conditions before implementation:

- Clear the hard dependency gate: ST-196 must be accepted on main with its CI/source evidence recorded. ST-170c currently says ST-196 is approved/in progress, which does not satisfy that gate.
- The adapter must construct selector observations from raw headers without truncating duplicates or decoding away malformed/quoted cookie evidence. Revoke must reject any Authorization header on web, any Cookie header on mobile (including unrelated cookies), refresh cookies on web, duplicate recognized credentials, ambiguous/unknown schemes, and empty or mixed branches before delegation or mutation. The selector alone cannot observe unrelated cookies, so the controller/adapter must enforce this.
- Delegate once to exactly the selected accepted service, preserve its request/response and security behavior, and never retry or fall back after errors. Do not import/register either accepted route module/controller.
- Keep the explicit development-only opt-in and strict configuration validation; no default-module, provider, database, client, dependency, or production changes.

This is plan approval only. Implementation and tests have not been reviewed; the proposed actual-HTTPS, shared-core branch and no-mutation coverage remains required by the task before merge.
