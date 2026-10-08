import { describe, expect, it } from 'vitest';
import {
  InMemoryProofRepository,
  ProofStore,
  type ProofBinding,
} from './proof-store';
import {
  DevelopmentDeletionOtpProofProducer,
  type DeletionOtpProofProducerConfig,
  type TrustedDeletionOtpAuthority,
} from './deletion-otp-proof-producer';

const identityId = '123e4567-e89b-42d3-a456-426614174000';
const otherIdentityId = '123e4567-e89b-42d3-a456-426614174001';
const sessionId = '223e4567-e89b-42d3-a456-426614174000';
const otherSessionId = '223e4567-e89b-42d3-a456-426614174001';
const identifierHash = 'a'.repeat(64);
const mobile = Object.freeze({ transport: 'mobile' as const });
const web = Object.freeze({
  transport: 'web' as const,
  exactOrigin: 'https://app.example',
  browserChainId: 'chain-a',
});
const key = new Uint8Array(32).fill(7);

// This fixture asserts the separately reviewed trusted-adapter boundary; it does not authenticate.
function authority(
  overrides: Record<string, unknown> = {},
): TrustedDeletionOtpAuthority {
  return Object.freeze({
    identityId,
    sessionId,
    identifierHash,
    channel: 'sms',
    transportContext: mobile,
    ...overrides,
  }) as TrustedDeletionOtpAuthority;
}

function setup(
  options: {
    now?: number;
    maxChallenges?: number;
    maxRateBuckets?: number;
    proofRepository?: InMemoryProofRepository;
    issue?: (binding: ProofBinding) => Promise<string>;
  } = {},
) {
  let now = options.now ?? 10_000;
  let clockCalls = 0;
  const repository = options.proofRepository ?? new InMemoryProofRepository();
  const actualProofStore = new ProofStore(repository, () => now);
  const proofStore = options.issue
    ? { issue: options.issue }
    : actualProofStore;
  const config: DeletionOtpProofProducerConfig = {
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    key,
    proofStore,
    clock: () => {
      clockCalls += 1;
      return now;
    },
    ...(options.maxChallenges === undefined
      ? {}
      : { maxChallenges: options.maxChallenges }),
    ...(options.maxRateBuckets === undefined
      ? {}
      : { maxRateBuckets: options.maxRateBuckets }),
  };
  return {
    producer: new DevelopmentDeletionOtpProofProducer(config),
    repository,
    proofStore,
    actualProofStore,
    setNow(value: number) {
      now = value;
    },
    clockCount() {
      return clockCalls;
    },
  };
}

const generic = 'Deletion verification unavailable';
const validFakeProof = 'v2.' + Buffer.alloc(32, 1).toString('base64url');

describe('DevelopmentDeletionOtpProofProducer', () => {
  it('issues a fully bound account-delete proof that cannot be consumed as login', async () => {
    const f = setup();
    const challenge = f.producer.start(authority());
    expect(challenge.challengeId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge.code).toMatch(/^\d{6}$/);
    const secret = await f.producer.verify({
      challengeId: challenge.challengeId,
      code: challenge.code,
      authority: authority(),
    });
    expect(secret).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    const binding: ProofBinding = {
      purpose: 'account-delete',
      challenge: challenge.challengeId,
      transport: 'mobile',
      identityId,
      sessionId,
      identifierHash,
    };
    expect(
      await f.actualProofStore.consume(secret, {
        ...binding,
        purpose: 'login',
      }),
    ).toEqual({ valid: false });
    expect(await f.actualProofStore.consume(secret, binding)).toEqual({
      valid: true,
    });
    expect(await f.actualProofStore.consume(secret, binding)).toEqual({
      valid: false,
    });
  });

  it('binds web origin and server chain along with identity, session, identifier, and channel', async () => {
    const f = setup();
    const webAuthority = authority({ transportContext: web, channel: 'email' });
    const challenge = f.producer.start(webAuthority);
    const secret = await f.producer.verify({
      challengeId: challenge.challengeId,
      code: challenge.code,
      authority: webAuthority,
    });
    const webBinding: ProofBinding = {
      purpose: 'account-delete',
      challenge: challenge.challengeId,
      transport: 'web',
      identityId,
      sessionId,
      identifierHash,
      exactOrigin: web.exactOrigin,
      browserChainId: web.browserChainId,
    };
    expect(
      await f.actualProofStore.consume(secret, {
        ...webBinding,
        browserChainId: 'chain-other',
      }),
    ).toEqual({ valid: false });
    expect(await f.actualProofStore.consume(secret, webBinding)).toEqual({
      valid: true,
    });
  });

  it('does not consume or spend a code attempt for wrong authority scope', async () => {
    const f = setup();
    const challenge = f.producer.start(authority());
    const wrongScopes = [
      authority({ identityId: otherIdentityId }),
      authority({ sessionId: otherSessionId }),
      authority({ identifierHash: 'b'.repeat(64) }),
      authority({ channel: 'email' }),
      authority({ transportContext: web }),
    ];
    for (const wrong of wrongScopes) {
      await expect(
        f.producer.verify({
          challengeId: challenge.challengeId,
          code: challenge.code,
          authority: wrong,
        }),
      ).rejects.toThrow(generic);
    }
    await expect(
      f.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      }),
    ).resolves.toMatch(/^v2\./);
  });

  it('allows only one concurrent verifier to consume and issue a proof', async () => {
    let issueCount = 0;
    const f = setup({
      issue: async () => {
        issueCount += 1;
        return validFakeProof;
      },
    });
    const challenge = f.producer.start(authority());
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        f.producer.verify({
          challengeId: challenge.challengeId,
          code: challenge.code,
          authority: authority(),
        }),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === 'rejected'),
    ).toHaveLength(7);
    expect(issueCount).toBe(1);
  });

  it('locks after five wrong codes, expires at the deadline, and rejects replay', async () => {
    const f = setup();
    const attempts = f.producer.start(authority());
    const wrong = attempts.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await expect(
        f.producer.verify({
          challengeId: attempts.challengeId,
          code: wrong,
          authority: authority(),
        }),
      ).rejects.toThrow(generic);
    }
    await expect(
      f.producer.verify({
        challengeId: attempts.challengeId,
        code: attempts.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);

    const expiring = f.producer.start(authority());
    f.setNow(expiring.expiresAt);
    await expect(
      f.producer.verify({
        challengeId: expiring.challengeId,
        code: expiring.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);

    f.setNow(expiring.expiresAt + 1);
    const replay = f.producer.start(authority());
    await f.producer.verify({
      challengeId: replay.challengeId,
      code: replay.code,
      authority: authority(),
    });
    await expect(
      f.producer.verify({
        challengeId: replay.challengeId,
        code: replay.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
  });

  it('enforces rolling per-identity and global start limits', () => {
    const f = setup();
    for (let i = 0; i < 5; i += 1) f.producer.start(authority());
    expect(() => f.producer.start(authority())).toThrow(generic);
    for (let i = 0; i < 5; i += 1)
      f.producer.start(authority({ identityId: otherIdentityId }));
    expect(() =>
      f.producer.start(
        authority({ identityId: '323e4567-e89b-42d3-a456-426614174000' }),
      ),
    ).not.toThrow();
    const global = setup();
    for (let i = 0; i < 300; i += 1)
      global.producer.start(
        authority({
          identityId: `123e4567-e89b-42d3-a456-${(Math.floor(i / 5) + 100).toString(16).padStart(12, '0')}`,
        }),
      );
    expect(() => global.producer.start(authority())).toThrow(generic);
    global.setNow(70_000);
    expect(() => global.producer.start(authority())).not.toThrow();
    f.setNow(70_000);
    expect(() => f.producer.start(authority())).not.toThrow();
  });

  it('rejects configured challenge and bucket capacity before charging a start', () => {
    const challengeCap = setup({ maxChallenges: 1 });
    challengeCap.producer.start(authority());
    expect(() => challengeCap.producer.start(authority())).toThrow(generic);
    challengeCap.setNow(310_001);
    expect(() => challengeCap.producer.start(authority())).not.toThrow();

    const bucketCap = setup({ maxRateBuckets: 1 });
    bucketCap.producer.start(authority());
    expect(() =>
      bucketCap.producer.start(authority({ identityId: otherIdentityId })),
    ).toThrow(generic);
    bucketCap.setNow(70_001);
    expect(() =>
      bucketCap.producer.start(authority({ identityId: otherIdentityId })),
    ).not.toThrow();
  });

  it('copies the HMAC key and captures config and method values without invoking getters', () => {
    const source = new Uint8Array(32).fill(3);
    let issued = 0;
    const repository = new InMemoryProofRepository();
    const proofStore = new ProofStore(repository);
    const input: DeletionOtpProofProducerConfig = {
      environment: 'development',
      enabled: true,
      authDeleteOtpDevOnly: true,
      key: source,
      proofStore: {
        issue: async (binding) => {
          issued += 1;
          return proofStore.issue(binding);
        },
      },
      clock: () => 1_000,
    };
    const producer = new DevelopmentDeletionOtpProofProducer(input);
    const challenge = producer.start(authority());
    source.fill(0);
    input.proofStore.issue = async () => {
      throw new Error('late mutation');
    };
    return producer
      .verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      })
      .then(async (secret) => {
        expect(secret).toMatch(/^v2\./);
        expect(issued).toBe(1);
        await expect(
          proofStore.consume(secret, {
            purpose: 'account-delete',
            challenge: challenge.challengeId,
            transport: 'mobile',
            identityId,
            sessionId,
            identifierHash,
          }),
        ).resolves.toEqual({ valid: true });
      });
  });

  it('rejects getters and malformed fulfilled proof values without invoking caller code or leaking detail', async () => {
    let getterCalls = 0;
    const f = setup();
    const malformed = Object.defineProperty({}, 'identityId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return identityId;
      },
    });
    const before = f.clockCount();
    expect(() =>
      f.producer.start(malformed as TrustedDeletionOtpAuthority),
    ).toThrow(generic);
    expect(getterCalls).toBe(0);
    expect(f.clockCount()).toBe(before);

    const badProof = setup({ issue: async () => 'not-a-proof' });
    const challenge = badProof.producer.start(authority());
    await expect(
      badProof.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
    await expect(
      badProof.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
  });

  it('rejects configuration getters and invalid clock progression before returning a proof', async () => {
    let touched = 0;
    const config = Object.defineProperties(
      {},
      {
        environment: {
          enumerable: true,
          get() {
            touched += 1;
            return 'development';
          },
        },
      },
    );
    expect(
      () =>
        new DevelopmentDeletionOtpProofProducer(
          config as DeletionOtpProofProducerConfig,
        ),
    ).toThrow(generic);
    expect(touched).toBe(0);

    const f = setup();
    const challenge = f.producer.start(authority());
    f.setNow(9_999);
    await expect(
      f.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
  });

  it('keeps a consumed challenge terminal when proof insertion fails or time expires during the await', async () => {
    let calls = 0;
    const failed = setup({
      issue: async () => {
        calls += 1;
        throw new Error('synthetic storage failure');
      },
    });
    const challenge = failed.producer.start(authority());
    await expect(
      failed.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
    await expect(
      failed.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
    expect(calls).toBe(1);

    let late!: () => void;
    const deferred = setup({
      issue: () =>
        new Promise<string>((resolve) => {
          late = () => resolve(validFakeProof);
        }),
    });
    const next = deferred.producer.start(authority());
    const pending = deferred.producer.verify({
      challengeId: next.challengeId,
      code: next.code,
      authority: authority(),
    });
    await Promise.resolve();
    deferred.setNow(next.expiresAt);
    late();
    await expect(pending).rejects.toThrow(generic);
    await expect(
      deferred.producer.verify({
        challengeId: next.challengeId,
        code: next.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
  });

  it('rejects malformed input and malformed authority without touching proof storage', async () => {
    let issueCalls = 0;
    const f = setup({
      issue: async () => {
        issueCalls += 1;
        return validFakeProof;
      },
    });
    const challenge = f.producer.start(authority());
    const malformed = [
      {
        challengeId: 'x'.repeat(43),
        code: challenge.code,
        authority: authority(),
      },
      {
        challengeId: challenge.challengeId,
        code: 'bad',
        authority: authority(),
      },
      {
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority({ identifierHash: 'raw-contact' }),
      },
      {
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority({
          transportContext: {
            transport: 'web',
            exactOrigin: 'http://bad.example',
            browserChainId: 'chain',
          },
        }),
      },
    ];
    for (const input of malformed) {
      await expect(
        f.producer.verify(input as Parameters<typeof f.producer.verify>[0]),
      ).rejects.toThrow(generic);
    }
    expect(issueCalls).toBe(0);
    await expect(
      f.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      }),
    ).resolves.toBe(validFakeProof);
    expect(issueCalls).toBe(1);
  });

  it.each([
    { environment: 'production' },
    { enabled: false },
    { authDeleteOtpDevOnly: false },
    { key: new Uint8Array(31) },
    { maxChallenges: 0 },
    { maxChallenges: 10_001 },
    { maxRateBuckets: 0 },
    { maxRateBuckets: 10_001 },
  ])('rejects invalid development config %j', (overrides) => {
    const config = {
      environment: 'development',
      enabled: true,
      authDeleteOtpDevOnly: true,
      key,
      proofStore: new ProofStore(new InMemoryProofRepository()),
      clock: () => 10_000,
      ...overrides,
    };
    expect(
      () =>
        new DevelopmentDeletionOtpProofProducer(
          config as DeletionOtpProofProducerConfig,
        ),
    ).toThrow(generic);
  });

  it('does not invoke port or typed-key getters during configuration capture', () => {
    let touches = 0;
    const proofStore = Object.defineProperty({}, 'issue', {
      get() {
        touches++;
        throw new Error('port getter');
      },
    });
    const config = {
      environment: 'development',
      enabled: true,
      authDeleteOtpDevOnly: true,
      key,
      proofStore,
      clock: () => 10_000,
    };
    expect(
      () =>
        new DevelopmentDeletionOtpProofProducer(
          config as DeletionOtpProofProducerConfig,
        ),
    ).toThrow(generic);
    const copiedKey = new Uint8Array(32).fill(5);
    Object.defineProperty(copiedKey, 'byteLength', {
      get() {
        touches++;
        throw new Error('key getter');
      },
    });
    expect(
      () =>
        new DevelopmentDeletionOtpProofProducer({
          ...config,
          key: copiedKey,
          proofStore: new ProofStore(new InMemoryProofRepository()),
        } as DeletionOtpProofProducerConfig),
    ).not.toThrow();
    expect(touches).toBe(0);
  });

  it('uses a captured authority snapshot after caller mutation', async () => {
    const f = setup();
    const context: {
      transport: 'web';
      exactOrigin: string;
      browserChainId: string;
    } = { ...web };
    const source = {
      identityId,
      sessionId,
      identifierHash,
      channel: 'email',
      transportContext: context,
    };
    const challenge = f.producer.start(source as TrustedDeletionOtpAuthority);
    source.identityId = otherIdentityId;
    context.browserChainId = 'late-change';
    await expect(
      f.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: source as TrustedDeletionOtpAuthority,
      }),
    ).rejects.toThrow(generic);
    const original = authority({ channel: 'email', transportContext: web });
    const proof = await f.producer.verify({
      challengeId: challenge.challengeId,
      code: challenge.code,
      authority: original,
    });
    await expect(
      f.actualProofStore.consume(proof, {
        purpose: 'account-delete',
        challenge: challenge.challengeId,
        transport: 'web',
        identityId,
        sessionId,
        identifierHash,
        exactOrigin: web.exactOrigin,
        browserChainId: web.browserChainId,
      }),
    ).resolves.toEqual({ valid: true });
  });

  it('shares identity rate limits across sessions and releases only expired rolling entries', () => {
    const f = setup();
    f.producer.start(authority());
    f.setNow(10_001);
    for (let i = 0; i < 4; i++)
      f.producer.start(authority({ sessionId: otherSessionId }));
    expect(() => f.producer.start(authority())).toThrow(generic);
    f.setNow(70_000);
    f.producer.start(authority());
    expect(() => f.producer.start(authority())).toThrow(generic);
    f.setNow(70_001);
    expect(() => f.producer.start(authority())).not.toThrow();
  });

  it('does not charge rejected capacity attempts against identity start limits', async () => {
    const f = setup({ maxChallenges: 1 });
    for (let i = 0; i < 5; i++) {
      const challenge = f.producer.start(authority());
      expect(() => f.producer.start(authority())).toThrow(generic);
      await f.producer.verify({
        challengeId: challenge.challengeId,
        code: challenge.code,
        authority: authority(),
      });
    }
    expect(() => f.producer.start(authority())).toThrow(generic);
  });

  it('rejects noncanonical fulfilled secrets and hostile thenables without assimilating them', async () => {
    let touches = 0;
    const tail = validFakeProof.at(-1)!;
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const noncanonical =
      validFakeProof.slice(0, -1) + alphabet[alphabet.indexOf(tail) + 1];
    for (const result of [
      noncanonical,
      Object.defineProperty({}, 'then', {
        get() {
          touches++;
          throw new Error('hostile then');
        },
      }),
      Object.create(Promise.prototype),
    ]) {
      const f = setup({
        issue: (() =>
          typeof result === 'string' ? Promise.resolve(result) : result) as (
          binding: ProofBinding,
        ) => Promise<string>,
      });
      const c = f.producer.start(authority());
      await expect(
        f.producer.verify({
          challengeId: c.challengeId,
          code: c.code,
          authority: authority(),
        }),
      ).rejects.toThrow(generic);
      await expect(
        f.producer.verify({
          challengeId: c.challengeId,
          code: c.code,
          authority: authority(),
        }),
      ).rejects.toThrow(generic);
    }
    expect(touches).toBe(0);
  });

  it('fails terminally when the clock regresses during issue', async () => {
    let calls = 0;
    const f = setup({
      issue: async () => {
        calls++;
        f.setNow(9_999);
        return validFakeProof;
      },
    });
    const c = f.producer.start(authority());
    await expect(
      f.producer.verify({
        challengeId: c.challengeId,
        code: c.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
    f.setNow(10_000);
    await expect(
      f.producer.verify({
        challengeId: c.challengeId,
        code: c.code,
        authority: authority(),
      }),
    ).rejects.toThrow(generic);
    expect(calls).toBe(1);
  });
});
