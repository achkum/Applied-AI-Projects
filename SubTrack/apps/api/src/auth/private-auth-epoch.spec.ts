import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPrivateAuthEpoch, provisionPrivateAuthEpoch } from './private-auth-epoch.js';

let dir: string;
const prior = process.env.NODE_ENV;
beforeEach(() => { process.env.NODE_ENV = 'development'; dir = mkdtempSync(path.join(tmpdir(), 'st237-epoch-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior; });
describe('private auth epoch custody', () => {
  it('provisions once and independently reproduces the same manifest across reloads', () => {
    const file = path.join(dir, 'private.json');
    const first = provisionPrivateAuthEpoch(file);
    const restarted = loadPrivateAuthEpoch(file);
    expect(first.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(restarted.manifestHash).toBe(first.manifestHash);
    expect(() => provisionPrivateAuthEpoch(file)).toThrow('Private authentication unavailable');
    expect(loadPrivateAuthEpoch(file).origin).toBe('https://localhost:3443');
  });
  it('rejects key, digest, duplicate-key, pair and tuple mutation without fallback', () => {
    const file = path.join(dir, 'private.json');
    provisionPrivateAuthEpoch(file);
    const pristine = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const testMutation = (mutate: (copy: Record<string, unknown>) => void) => {
      const copy = structuredClone(pristine); mutate(copy);
      writeFileSync(file, JSON.stringify(copy), 'utf8');
      expect(() => loadPrivateAuthEpoch(file)).toThrow('Private authentication unavailable');
    };
    testMutation(copy => { copy.manifestHash = 'b'.repeat(64); });
    testMutation(copy => { (copy.keys as Record<string,string>)['enrollment.otp'] = 'A'.repeat(43); });
    testMutation(copy => { const keys = copy.keys as Record<string,string>; keys['enrollment.otp'] = keys['enrollment.nonce']!; });
    testMutation(copy => { copy.accessPublicSpkiDer = 'A'.repeat(64); });
    testMutation(copy => { copy.origin = 'https://st233a.invalid'; });
    writeFileSync(file, JSON.stringify(pristine), 'utf8');
    expect(loadPrivateAuthEpoch(file).manifestHash).toBe(pristine.manifestHash);
  });
});
