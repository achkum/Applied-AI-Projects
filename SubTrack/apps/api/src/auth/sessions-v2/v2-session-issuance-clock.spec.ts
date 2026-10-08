import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { V2AccessToken } from './v2-access-token';
import { DevelopmentV2PrincipalResolver } from './v2-principal-resolver';
import { InMemoryProofRepository, ProofStore, type ProofRepository } from '../proofs-v2/proof-store';
import { DevelopmentV2SessionIssuer, InMemoryV2SessionRepository } from './v2-session-issuer';

const START = 1_800_000_000_000;
const ID = '123e4567-e89b-42d3-a456-426614174000';
const WEB = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const);
const MOBILE = Object.freeze({ transport: 'mobile' } as const);
const FAILURE = 'Session unavailable';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('v2 login proof issuance clock', () => {
  it.each([['web', WEB], ['mobile', MOBILE]] as const)(
    'consumes but does not issue credentials when the clock regresses during %s proof redemption', async (_name, transportContext) => {
      let issuerNow = START;
      const entered = deferred(); const resume = deferred();
      const memory = new InMemoryProofRepository();
      const repository: ProofRepository = {
        insert: (record) => memory.insert(record),
        compareAndConsume: (hash, expected, now) => memory.compareAndConsume(hash, expected, now),
        compareAndConsumeLogin: async (hash, expected, now) => {
          const identityId = await memory.compareAndConsumeLogin!(hash, expected, now);
          entered.release();
          await resume.promise;
          return identityId;
        },
      };
      const proofStore = new ProofStore(repository, () => START);
      const proof = await proofStore.issue({ purpose: 'login', challenge: 'server-challenge', identityId: ID, transport: transportContext.transport,
        ...(transportContext.transport === 'web' ? { exactOrigin: transportContext.exactOrigin, browserChainId: transportContext.browserChainId } : {}) });
      let uuidCalls = 0; let bytesCalls = 0; const signer = vi.fn(() => 'access-token');
      const sessions = new InMemoryV2SessionRepository([ID], 10_000, () => START);
      const insert = vi.spyOn(sessions, 'createForActiveIdentity');
      const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, repository: sessions,
        accessTokens: { issue: signer }, clock: () => issuerNow, randomUUID: () => { uuidCalls += 1; return `123e4567-e89b-42d3-a456-42661417401${uuidCalls}`; },
        randomBytes: () => { bytesCalls += 1; return new Uint8Array(32).fill(7); } });

      const issuance = issuer.issueFromLoginProof({ loginProof: proof, transportContext });
      await entered.promise;
      issuerNow = START - 1;
      resume.release();
      await expect(issuance).rejects.toThrow(FAILURE);

      expect(uuidCalls).toBe(0); expect(bytesCalls).toBe(0); expect(insert).not.toHaveBeenCalled(); expect(signer).not.toHaveBeenCalled();
      expect(await proofStore.consumeLogin(proof, transportContext)).toEqual({ valid: false });
    },
  );

  it.each([
    ['web', WEB, 'equal', 0], ['web', WEB, 'increasing', 10], ['mobile', MOBILE, 'equal', 0], ['mobile', MOBILE, 'increasing', 10],
    ['mobile', MOBILE, 'large regression', -60_000], ['web', WEB, 'large regression', -60_000],
  ] as const)(
    'handles %s %s clock after proof redemption', async (_transport, transportContext, _name, delta) => {
      let issuerNow = START;
      const entered = deferred(); const resume = deferred();
      const memory = new InMemoryProofRepository();
      const repository: ProofRepository = {
        insert: (record) => memory.insert(record),
        compareAndConsume: (hash, expected, now) => memory.compareAndConsume(hash, expected, now),
        compareAndConsumeLogin: async (hash, expected, now) => {
          const identityId = await memory.compareAndConsumeLogin!(hash, expected, now);
          entered.release(); await resume.promise; return identityId;
        },
      };
      const proofStore = new ProofStore(repository, () => START);
      const proof = await proofStore.issue({ purpose: 'login', challenge: 'server-challenge', identityId: ID, transport: transportContext.transport,
        ...(transportContext.transport === 'web' ? { exactOrigin: transportContext.exactOrigin, browserChainId: transportContext.browserChainId } : {}) });
      const sessions = new InMemoryV2SessionRepository([ID], 10_000, () => START + Math.max(0, delta));
      const insert = vi.spyOn(sessions, 'createForActiveIdentity');
      const keys = generateKeyPairSync('ed25519');
      const accessTokens = new V2AccessToken({ environment: 'development', enabled: true, privateKey: keys.privateKey, publicKey: keys.publicKey, clock: () => issuerNow });
      const signer = vi.spyOn(accessTokens, 'issue');
      const uuid = vi.fn((() => { let n = 0; return () => `123e4567-e89b-42d3-a456-42661417401${++n}`; })());
      const bytes = vi.fn(() => new Uint8Array(32).fill(7));
      const issuer = new DevelopmentV2SessionIssuer({ environment: 'development', enabled: true, proofStore, repository: sessions,
        accessTokens, clock: () => issuerNow,
        randomUUID: uuid, randomBytes: bytes });
      const issuance = issuer.issueFromLoginProof({ loginProof: proof, transportContext });
      await entered.promise; issuerNow = START + delta; resume.release();
      if (delta < 0) {
        await expect(issuance).rejects.toThrow(FAILURE);
        expect(uuid).not.toHaveBeenCalled(); expect(bytes).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled(); expect(signer).not.toHaveBeenCalled();
        expect(await proofStore.consumeLogin(proof, transportContext)).toEqual({ valid: false });
      }
      else {
        const result = await issuance;
        const principal = new DevelopmentV2PrincipalResolver({ environment: 'development', enabled: true, accessTokens, reader: sessions, clock: () => issuerNow });
        expect(await principal.resolve(result.accessToken, transportContext)).toEqual({ identityId: ID, sessionId: result.sessionId });
        expect(sessions.readSession(result.sessionId, { userId: ID }, issuerNow)?.createdAt).toBe(issuerNow);
        expect(await proofStore.consumeLogin(proof, transportContext)).toEqual({ valid: false });
      }
    },
  );
});
