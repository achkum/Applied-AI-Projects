import { describe, expect, it } from 'vitest';
import { extractV2BrowserEvidence } from './v2-browser-context';
import type { IncomingMessage } from 'node:http';

function rawRequest(headers: readonly string[], encrypted: boolean, remoteAddress: string): IncomingMessage {
  return {
    rawHeaders: [...headers],
    socket: { encrypted, remoteAddress },
  } as unknown as IncomingMessage;
}

const config = { allowedOrigins: ['http://127.0.0.1'], bindingCookieName: 'st_v2_browser', allowLoopbackHttpDevelopment: true } as const;

describe('v2 raw browser evidence', () => {
  it('keeps cookie absence distinct from a supplied binding secret', () => {
    const absent = extractV2BrowserEvidence(rawRequest(['Origin', 'http://127.0.0.1'], false, '127.0.0.1'), config);
    expect(absent.bindingCookie).toBeNull();
    const present = extractV2BrowserEvidence(rawRequest(['Origin', 'http://127.0.0.1', 'Cookie', 'st_v2_browser=opaque'], false, '127.0.0.1'), config);
    expect(present.bindingCookie).toBe('opaque');
  });

  it('accepts equals signs in a binding cookie value', () => {
    const evidence = extractV2BrowserEvidence(rawRequest(['Origin', 'http://127.0.0.1', 'Cookie', 'st_v2_browser=opaque=='], false, '127.0.0.1'), config);
    expect(evidence.bindingCookie).toBe('opaque==');
  });

  it('rejects a non-web origin protocol even if a caller misconfigures an allowlist', () => {
    const permissive = { ...config, allowedOrigins: ['ftp://127.0.0.1'] };
    expect(() => extractV2BrowserEvidence(rawRequest(['Origin', 'ftp://127.0.0.1'], false, '127.0.0.1'), permissive)).toThrow('Browser request unavailable');
  });

  it('retains duplicate raw Origin evidence for rejection', () => {
    expect(() => extractV2BrowserEvidence(rawRequest(['Origin', 'http://127.0.0.1', 'origin', 'http://127.0.0.1'], false, '127.0.0.1'), config)).toThrow('Browser request unavailable');
  });
});
