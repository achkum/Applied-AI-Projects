import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryProofRepository, ProofStore, type ProofBinding, type StoredProof } from './proof-store';
import { InMemoryOtpChallengeRepository, OtpProofProducer, type MobileEnrollmentIssuance, type OtpChallengeRecord, type OtpChallengeRepository, type VerifiedTransportContext } from './otp-proof-producer';

const web: VerifiedTransportContext = Object.freeze({ transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' });
const mobile: VerifiedTransportContext = Object.freeze({ transport: 'mobile' });
const key = Buffer.alloc(32, 9);
function fixture(repository: OtpChallengeRepository = new InMemoryOtpChallengeRepository(), proofRepo = new InMemoryProofRepository()) {
  let now = 10_000;
  const proofStore = new ProofStore(proofRepo, () => now);
  const producer = new OtpProofProducer(key, repository, proofStore, () => now);
  return { producer, repository, proofRepo, proofStore, setNow: (value: number) => { now = value; } };
}
async function provision(f: ReturnType<typeof fixture>, purpose: 'enroll_identifier' | 'otp_step_up' = 'enroll_identifier', transportContext: VerifiedTransportContext = web) {
  return f.producer.provision({ purpose, identifierHash: 'a'.repeat(64), channel: 'sms', transportContext });
}

describe('OtpProofProducer', () => {
  it('projects mobile issuance from the inserted record and consumes its exact tuple once', async () => {
    const memory = new InMemoryOtpChallengeRepository(); const inserted: OtpChallengeRecord[] = [];
    const repo: OtpChallengeRepository = { insert: record => { inserted.push(record); memory.insert(record); },
      verifyAndConsume: input => memory.verifyAndConsume(input), verifyMobileEnrollment: input => memory.verifyMobileEnrollment(input) };
    const f = fixture(repo); const { issuance, code } = await f.producer.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'sms' });
    expect(issuance).toEqual({ challengeId: inserted[0]?.challengeId, purpose: inserted[0]?.purpose, transport: 'mobile',
      identifierHash: inserted[0]?.identifierHash, channel: inserted[0]?.channel, issuedAt: inserted[0]?.issuedAt, expiresAt: inserted[0]?.expiresAt });
    expect(Object.isFrozen(issuance)).toBe(true);
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => f.producer.verifyMobileEnrollment({ issuance, code })));
    expect(outcomes.filter(x => x.status === 'fulfilled' && x.value.kind === 'consumed')).toHaveLength(1);
    const proof = (outcomes.find(x => x.status === 'fulfilled' && x.value.kind === 'consumed') as PromiseFulfilledResult<{ kind: string; proof: string }>).value.proof;
    expect(await f.proofStore.consume(proof, { purpose: 'login', challenge: issuance.challengeId, transport: 'mobile', identifierHash: issuance.identifierHash })).toEqual({ valid: false });
    expect(await f.proofStore.consume(proof, { purpose: 'enrollment', challenge: issuance.challengeId, transport: 'mobile', identifierHash: issuance.identifierHash })).toEqual({ valid: true });
  });

  it('reports four retryable errors and a terminal fifth without another proof', async () => {
    const f = fixture(); const { issuance, code } = await f.producer.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'email' });
    const wrong = code === '000000' ? '000001' : '000000';
    for (const remainingAttempts of [4, 3, 2, 1]) expect(await f.producer.verifyMobileEnrollment({ issuance, code: wrong })).toEqual({ kind: 'incorrect', remainingAttempts });
    expect(await f.producer.verifyMobileEnrollment({ issuance, code: wrong })).toEqual({ kind: 'terminal' });
    expect(await f.producer.verifyMobileEnrollment({ issuance, code })).toEqual({ kind: 'terminal' });
  });

  it.each(['identifierHash', 'channel', 'issuedAt', 'expiresAt', 'purpose', 'transport', 'challengeId'] as const)(
    'rejects a changed consumed %s before proof issuance', async field => {
      let saved!: OtpChallengeRecord;
      const repo: OtpChallengeRepository = { insert: row => { saved = row; }, verifyAndConsume: () => null,
        verifyMobileEnrollment: () => ({ kind: 'consumed', record: { ...saved, [field === 'transport' ? 'transportContext' : field]:
          field === 'transport' ? web : field === 'identifierHash' ? 'b'.repeat(64) : field === 'channel' ? 'email' :
            field === 'purpose' ? 'otp_step_up' : field === 'challengeId' ? 'B'.repeat(43) : saved[field] + 1 } as OtpChallengeRecord }) };
      const f = fixture(repo); const { issuance, code } = await f.producer.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'sms' });
      await expect(f.producer.verifyMobileEnrollment({ issuance, code })).rejects.toThrow('Verification unavailable');
    });

  it('fails closed without specialized atomic capability, on repository faults, and across awaits', async () => {
    const f = fixture(); const { issuance, code } = await f.producer.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'sms' });
    const old = new OtpProofProducer(key, { insert: () => undefined, verifyAndConsume: () => null }, f.proofStore, () => 10_000);
    await expect(old.verifyMobileEnrollment({ issuance, code })).rejects.toThrow('Verification unavailable');
    const broken = new OtpProofProducer(key, { insert: () => undefined, verifyAndConsume: () => null,
      verifyMobileEnrollment: () => { throw new Error('secret fault'); } }, f.proofStore, () => 10_000);
    await expect(broken.verifyMobileEnrollment({ issuance, code })).rejects.toThrow('Verification unavailable');
    for (const late of [9_999, issuance.expiresAt, Number.MAX_SAFE_INTEGER]) {
      let now = 10_000;
      const repo: OtpChallengeRepository = { insert: () => { now = late; }, verifyAndConsume: () => null,
        verifyMobileEnrollment: () => { now = late; return { kind: 'terminal' }; } };
      const p = new OtpProofProducer(key, repo, f.proofStore, () => now);
      await expect(p.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'sms' })).rejects.toThrow('OTP unavailable');
      now = 10_000; await expect(p.verifyMobileEnrollment({ issuance, code })).rejects.toThrow('Verification unavailable');
    }
  });

  it('discloses no proof when time regresses or expires during proof insertion', async () => {
    for (const changedTime of [9_999, 310_000]) {
      let now = 10_000;
      const repo = new InMemoryOtpChallengeRepository();
      const proofs = new ProofStore({ insert: () => { now = changedTime; }, compareAndConsume: () => false }, () => 10_000);
      const producer = new OtpProofProducer(key, repo, proofs, () => now);
      const { issuance, code } = await producer.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'sms' });
      await expect(producer.verifyMobileEnrollment({ issuance, code })).rejects.toThrow('Verification unavailable');
      now = 10_000;
      expect(await producer.verifyMobileEnrollment({ issuance, code })).toEqual({ kind: 'terminal' });
    }
  });

  it('rejects 100 to 200 to 150 clock regression across both verification awaits', async () => {
    let now = 100;
    const memory = new InMemoryOtpChallengeRepository();
    const repo: OtpChallengeRepository = { insert: row => memory.insert(row), verifyAndConsume: () => null,
      verifyMobileEnrollment: input => { now = 200; return memory.verifyMobileEnrollment(input); } };
    const proofStore = new ProofStore({ insert: () => { now = 150; }, compareAndConsume: () => false }, () => 100);
    const producer = new OtpProofProducer(key, repo, proofStore, () => now);
    const { issuance, code } = await producer.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'sms' });
    await expect(producer.verifyMobileEnrollment({ issuance, code })).rejects.toThrow('Verification unavailable');
    expect(now).toBe(150);
    await expect(producer.verifyMobileEnrollment({ issuance, code })).rejects.toThrow('Verification unavailable');
  });

  it('uses one issuance snapshot even if its caller-owned object changes during repository await', async () => {
    const memory = new InMemoryOtpChallengeRepository();
    const holder: { mutable?: { -readonly [K in keyof MobileEnrollmentIssuance]: MobileEnrollmentIssuance[K] } } = {};
    const repo: OtpChallengeRepository = { insert: row => memory.insert(row), verifyAndConsume: () => null,
      verifyMobileEnrollment: input => { holder.mutable!.identifierHash = 'b'.repeat(64); return memory.verifyMobileEnrollment(input); } };
    const f = fixture(repo);
    const result = await f.producer.provisionMobileEnrollment({ identifierHash: 'a'.repeat(64), channel: 'sms' });
    holder.mutable = { ...result.issuance };
    expect(await f.producer.verifyMobileEnrollment({ issuance: holder.mutable, code: result.code })).toMatchObject({ kind: 'consumed' });
  });
  it('maps enrollment and step-up from stored metadata and retains transport bindings', async () => {
    for (const [purpose, expected] of [['enroll_identifier', 'enrollment'], ['otp_step_up', 'stepup']] as const) {
      const f = fixture(); const otp = await provision(f, purpose); const secret = await f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: web });
      const records: StoredProof[] = [];
      const capture = new ProofStore({ insert: (record) => { records.push(record); }, compareAndConsume: () => false }, () => 10_000);
      const other = new OtpProofProducer(key, f.repository, capture, () => 10_000);
      // The first successful verification consumed the record; this independently tests the binding shape via a fresh challenge.
      const next = await provision({ ...f, producer: other } as ReturnType<typeof fixture>, purpose);
      const proof = await other.verify({ challengeId: next.challengeId, code: next.code, transportContext: web });
      expect(proof).toMatch(/^v2\./); expect(records[0]?.purpose).toBe(expected);
      expect(records[0]?.challenge).toBe(next.challengeId); expect(records[0]?.identifierHash).toBe('a'.repeat(64));
      expect(records[0]?.exactOrigin).toBe(web.exactOrigin); expect(records[0]?.browserChainId).toBe(web.browserChainId);
      expect(await f.proofStore.consume(secret, { purpose: expected, challenge: otp.challengeId, transport: 'web', identifierHash: 'a'.repeat(64), exactOrigin: web.exactOrigin, browserChainId: web.browserChainId } as ProofBinding)).toEqual({ valid: true });
    }
  });

  it('requires a copied 32-byte HMAC key and persists no raw code or identifier', async () => {
    expect(() => new OtpProofProducer(Buffer.alloc(31), new InMemoryOtpChallengeRepository(), new ProofStore(new InMemoryProofRepository()))).toThrow('OTP unavailable');
    const rows: OtpChallengeRecord[] = [];
    const repo: OtpChallengeRepository = { insert: record => { rows.push(record); }, verifyAndConsume: () => null };
    const sourceKey = Buffer.alloc(32, 4); const f = new OtpProofProducer(sourceKey, repo, new ProofStore(new InMemoryProofRepository())); sourceKey.fill(0);
    const otp = await f.provision({ purpose: 'enroll_identifier', identifierHash: 'b'.repeat(64), channel: 'email', transportContext: mobile });
    expect(otp.code).toMatch(/^\d{6}$/); expect(JSON.stringify(rows)).not.toContain(otp.code);
    expect(JSON.stringify(rows)).not.toContain('person@example.test'); expect(rows[0]?.codeDigest).toHaveLength(32);
    expect(rows[0]?.codeDigest).toEqual(createHmac('sha256', Buffer.alloc(32, 4)).update('subtrack:restricted-otp:v2\0').update(otp.challengeId).update('\0').update(otp.code).digest());
  });

  it('does not burn a challenge on context mismatch, and issues no proof for wrong codes', async () => {
    const f = fixture(); const otp = await provision(f);
    await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: { ...web, browserChainId: 'other' } })).rejects.toThrow('Verification unavailable');
    await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code === '000000' ? '000001' : '000000', transportContext: web })).rejects.toThrow('Verification unavailable');
    await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: web })).resolves.toMatch(/^v2\./);
  });

  it('locks after five incorrect codes and rejects expiry, clock rollback, and replay generically', async () => {
    const f = fixture(); const otp = await provision(f);
    for (let i = 0; i < 5; i += 1) await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code === '000000' ? '000001' : '000000', transportContext: web })).rejects.toThrow('Verification unavailable');
    await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: web })).rejects.toThrow('Verification unavailable');
    const expiry = await provision(f); f.setNow(expiry.expiresAt);
    await expect(f.producer.verify({ challengeId: expiry.challengeId, code: expiry.code, transportContext: web })).rejects.toThrow('Verification unavailable');
    f.setNow(20_000); const rollback = await provision(f); f.setNow(19_999);
    await expect(f.producer.verify({ challengeId: rollback.challengeId, code: rollback.code, transportContext: web })).rejects.toThrow('Verification unavailable');
  });

  it('allows one concurrent winner and consumes before proof issuance failure', async () => {
    const f = fixture(); const otp = await provision(f);
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: web })));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(7);
    const broken = new OtpProofProducer(key, new InMemoryOtpChallengeRepository(), new ProofStore({ insert: () => { throw new Error('storage detail'); }, compareAndConsume: () => false }));
    const next = await broken.provision({ purpose: 'otp_step_up', identifierHash: 'c'.repeat(64), channel: 'sms', transportContext: mobile });
    await expect(broken.verify({ challengeId: next.challengeId, code: next.code, transportContext: mobile })).rejects.toThrow('Verification unavailable');
    await expect(broken.verify({ challengeId: next.challengeId, code: next.code, transportContext: mobile })).rejects.toThrow('Verification unavailable');
  });

  it('fails closed on malformed metadata and repository errors without revealing details', async () => {
    const f = fixture();
    await expect(f.producer.provision({ purpose: 'enroll_identifier', identifierHash: 'raw-email', channel: 'sms', transportContext: web })).rejects.toThrow('OTP unavailable');
    const failing: OtpChallengeRepository = { insert: () => { throw new Error('db secret'); }, verifyAndConsume: () => { throw new Error('db secret'); } };
    const producer = new OtpProofProducer(key, failing, f.proofStore);
    await expect(producer.provision({ purpose: 'otp_step_up', identifierHash: 'd'.repeat(64), channel: 'sms', transportContext: web })).rejects.toThrow('OTP unavailable');
    await expect(producer.verify({ challengeId: 'a'.repeat(40), code: '123456', transportContext: web })).rejects.toThrow('Verification unavailable');
  });

  it.each([
    { transport: 'web', exactOrigin: 'null', browserChainId: 'a' },
    { transport: 'web', exactOrigin: 'https://app.example/path', browserChainId: 'a' },
    { transport: 'web', exactOrigin: 'http://app.example', browserChainId: 'a' },
    { transport: 'web', exactOrigin: 'https://*.example', browserChainId: 'a' },
    { transport: 'web', exactOrigin: 'https://app.example', browserChainId: '' },
    { transport: 'mobile', exactOrigin: 'https://app.example' },
    { transport: 'other' },
  ])('rejects malformed provisioning context %j before insertion', async context => {
    const f = fixture();
    await expect(provision(f, 'enroll_identifier', context as VerifiedTransportContext)).rejects.toThrow('OTP unavailable');
  });

  it('allows canonical HTTPS and loopback HTTP contexts, plus mobile step-up', async () => {
    for (const context of [mobile, { transport: 'web', exactOrigin: 'http://localhost:3000', browserChainId: 'a' }, { transport: 'web', exactOrigin: 'http://127.0.0.1:3000', browserChainId: 'a' }] as VerifiedTransportContext[]) {
      const f = fixture(); const otp = await provision(f, 'otp_step_up', context);
      const secret = await f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: context });
      const binding: ProofBinding = { purpose: 'stepup', challenge: otp.challengeId, identifierHash: 'a'.repeat(64), ...context };
      expect(await f.proofStore.consume(secret, { ...binding, purpose: 'login', identityId: 'client' })).toEqual({ valid: false });
      expect(await f.proofStore.consume(secret, binding)).toEqual({ valid: true });
      expect(await f.proofStore.consume(secret, binding)).toEqual({ valid: false });
      await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: context })).rejects.toThrow('Verification unavailable');
    }
  });

  it.each([
    { challengeId: '', code: '123456', transportContext: mobile },
    { challengeId: 'x'.repeat(43), code: 'bad', transportContext: mobile },
    { challengeId: 'x'.repeat(43), code: '123456', transportContext: mobile, purpose: 'login' },
    { challengeId: 'x'.repeat(43), code: '123456', transportContext: { transport: 'web', exactOrigin: 'bad', browserChainId: 'a' } },
  ])('rejects malformed or caller-authority verification fields %j', async input => {
    await expect(fixture().producer.verify(input as Parameters<OtpProofProducer['verify']>[0])).rejects.toThrow('Verification unavailable');
  });

  it('rejects missing challenges and invalid clocks without issuing proof', async () => {
    const f = fixture();
    await expect(f.producer.verify({ challengeId: 'x'.repeat(43), code: '123456', transportContext: mobile })).rejects.toThrow('Verification unavailable');
    for (const now of [NaN, -1, Infinity, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) {
      f.setNow(now);
      await expect(provision(f)).rejects.toThrow('OTP unavailable');
      await expect(f.producer.verify({ challengeId: 'x'.repeat(43), code: '123456', transportContext: mobile })).rejects.toThrow('Verification unavailable');
    }
  });

  it('rejects transport/origin substitution without consuming the correct challenge', async () => {
    const f = fixture(); const otp = await provision(f);
    for (const context of [mobile, { ...web, exactOrigin: 'https://other.example' }]) {
      await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: context })).rejects.toThrow('Verification unavailable');
    }
    await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: web })).resolves.toMatch(/^v2\./);
  });

  it.each([
    { purpose: 'login' }, { purpose: 'account-delete' }, { identityId: 'caller' },
    { identifierHash: 'malformed' }, { channel: 'other' }, { challengeId: 'other' },
    { attempts: NaN }, { attempts: -1 }, { attempts: 5 }, { issuedAt: Infinity },
    { expiresAt: 999999 }, { transportContext: mobile },
  ])('fails closed on a malformed consumed repository record %j', async override => {
    let stored: OtpChallengeRecord;
    const repo: OtpChallengeRepository = {
      insert: record => { stored = record; },
      verifyAndConsume: () => ({ ...stored, ...override } as OtpChallengeRecord),
    };
    const f = fixture(repo); const otp = await provision(f);
    await expect(f.producer.verify({ challengeId: otp.challengeId, code: otp.code, transportContext: web })).rejects.toThrow('Verification unavailable');
  });
});
