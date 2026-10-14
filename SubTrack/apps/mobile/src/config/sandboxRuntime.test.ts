import { resolveSandboxPreparation, resolveSandboxRuntime } from './sandboxRuntime';

const valid = { variant: 'sandbox', apiBaseUrl: 'https://198.44.116.159', platform: 'ios', development: false };

describe('sandbox configuration preparation', () => {
  it.each(['ios', 'android'])('preserves disabled release and development preparation on %s', platform => {
    for (const development of [false, true]) {
      const input = { ...valid, platform, development };
      const prepared = resolveSandboxPreparation(input);
      expect(prepared).toEqual({ variant: 'sandbox', apiBaseUrl: valid.apiBaseUrl,
        runtimeEnabled: false, publicationEnabled: false, privateDiagnosticsEnabled: false });
      expect(Object.isFrozen(prepared)).toBe(true);
      expect(resolveSandboxRuntime(input)).toBeNull();
    }
  });
  it.each([undefined, '', 'production', 'development', 'Sandbox'])('rejects variant %s without fallback', variant => {
    expect(resolveSandboxPreparation({ ...valid, variant })).toBeNull();
    expect(resolveSandboxRuntime({ ...valid, variant })).toBeNull();
  });
  it.each(['web', 'windows', ''])('rejects platform %s', platform => {
    expect(resolveSandboxPreparation({ ...valid, platform })).toBeNull();
  });
  it.each([undefined, '', 'http://198.44.116.159', 'https://198.44.116.159/',
    'https://198.44.116.159/path', 'https://198.44.116.159?key=value', 'https://198.44.116.159#fragment',
    'https://user:password@198.44.116.159', 'https://198.44.116.159:443', 'HTTPS://198.44.116.159',
    ' https://198.44.116.159', 'https://198.44.116.159\n', 'https://localhost:3443',
    'https://api.subtrack.app', 'https://other.example'])('rejects noncanonical/unapproved origin %s', apiBaseUrl => {
    expect(resolveSandboxPreparation({ ...valid, apiBaseUrl })).toBeNull();
    expect(resolveSandboxRuntime({ ...valid, apiBaseUrl })).toBeNull();
  });
});
