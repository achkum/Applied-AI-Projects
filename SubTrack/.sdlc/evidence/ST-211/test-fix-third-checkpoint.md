# ST-211 third timeout diagnosis checkpoint
- CI run 38068326931 at `b82f5a8`: first EnrollmentFlow test exceeded 5 s; 128 other tests passed. Concurrent RegistrationScreen and EnrollmentFlow suites each took about 36 s.
- Focused local baseline: first flow test 1,058 ms; next six 6–46 ms. This isolates first-use test renderer work to the first test.
- Moved one renderer mount/cleanup into `beforeAll` so shared React Native rendering setup occurs outside per-test timers; assertions and production behavior are unchanged.
- Focused rerun: seven tests passed; first test 12 ms, others 3–8 ms.
- This is a supported cause locally, not proof of the precise CI scheduling delay. Exact-head CI remains required. No full suite or commit was run here.
