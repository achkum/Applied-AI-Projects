import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { DevelopmentDeletionOtpProofProducer } from './deletion-otp-proof-producer';
import { InMemoryProofRepository, ProofStore } from './proof-store';
import { DevelopmentSimulatorLoginProofProducer } from './bankid-simulator-proof-producer';
import {
  DevelopmentMobileDeletionOtpAuthorityResolver,
  type MobileDeletionOtpAuthorityConfig,
} from './mobile-deletion-otp-authority';
import { DevelopmentV2PrincipalResolver } from '../sessions-v2/v2-principal-resolver';
import {
  DevelopmentV2SessionIssuer,
  InMemoryV2SessionRepository,
} from '../sessions-v2/v2-session-issuer';
import { V2AccessToken } from '../sessions-v2/v2-access-token';

const NOW = 1_800_000_000_000;
afterEach(() => vi.restoreAllMocks());
const ID = '123e4567-e89b-42d3-a456-426614174000';
const MOBILE = Object.freeze({ transport: 'mobile' as const });

async function fixture(
  contactReader?: (
    context: Readonly<{ userId: string }>,
    observedAt: number,
  ) => Promise<Readonly<{
    identifierHash: string;
    channel: 'email' | 'sms';
  }> | null>,
) {
  let now = NOW;
  vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue({
    method: 'BANKID',
    name: 'Fixture',
    personnummerHmac: 'a'.repeat(64),
    verifiedAt: new Date(NOW).toISOString(),
  });
  const clock = () => now;
  const proofStore = new ProofStore(new InMemoryProofRepository(), clock);
  const pair = generateKeyPairSync('ed25519');
  const accessTokens = new V2AccessToken({
    environment: 'development',
    enabled: true,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    clock,
  });
  const repository = new InMemoryV2SessionRepository([ID], 100, clock);
  const issuer = new DevelopmentV2SessionIssuer({
    environment: 'development',
    enabled: true,
    proofStore,
    accessTokens,
    repository,
    clock,
  });
  const principal = new DevelopmentV2PrincipalResolver({
    environment: 'development',
    enabled: true,
    accessTokens,
    reader: repository,
    clock,
  });
  const simulatorLogin = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development',
    enabled: true,
    simulatorHmacKey: new Uint8Array(32).fill(4),
    identityResolver: { resolveRegisteredIdentityId: () => ID },
    proofStore,
    clock,
  });
  const session = await issuer.issueFromLoginProof({
    loginProof: await simulatorLogin.issue(MOBILE),
    transportContext: MOBILE,
    deviceName: 'Test phone',
  });
  let contactCalls = 0;
  const contactPort = {
    readRegisteredContact(
      context: Readonly<{ userId: string }>,
      observedAt: number,
    ) {
      contactCalls += 1;
      if (context.userId !== ID || observedAt !== now) throw new Error('scope');
      return contactReader
        ? contactReader(context, observedAt)
        : Promise.resolve(
            Object.freeze({
              identifierHash: 'a'.repeat(64),
              channel: 'sms' as const,
            }),
          );
    },
  };
  const config: MobileDeletionOtpAuthorityConfig = {
    environment: 'development',
    enabled: true,
    authDeleteOtpDevOnly: true,
    accessTokens,
    principal,
    repository,
    registeredContacts: contactPort,
    clock,
  };
  const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver(config);
  return {
    config,
    principal,
    issuer,
    simulatorLogin,
    resolver,
    accessTokens,
    proofStore,
    repository,
    session,
    token: session.accessToken,
    contactCalls: () => contactCalls,
    setNow: (value: number) => {
      now = value;
    },
    clock,
  };
}

describe('DevelopmentMobileDeletionOtpAuthorityResolver', () => {
  it('resolves an actual simulator-issued mobile session to a deletion-only proof authority', async () => {
    const f = await fixture();
    const authority = await f.resolver.resolve(f.token);
    expect(Object.isFrozen(authority)).toBe(true);
    expect(authority).toMatchObject({
      identityId: ID,
      sessionId: f.session.sessionId,
      identifierHash: 'a'.repeat(64),
      channel: 'sms',
      transportContext: { transport: 'mobile' },
    });
    const deletion = new DevelopmentDeletionOtpProofProducer({
      environment: 'development',
      enabled: true,
      authDeleteOtpDevOnly: true,
      key: new Uint8Array(32).fill(8),
      proofStore: f.proofStore,
      clock: f.clock,
    });
    const challenge = deletion.start(authority);
    const proof = await deletion.verify({
      challengeId: challenge.challengeId,
      code: challenge.code,
      authority,
    });
    expect(proof).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    expect(f.contactCalls()).toBe(1);
  });

  it('rejects a deleted owner and an expired token before contacting the registered-contact port', async () => {
    const deleted = await fixture();
    expect(deleted.repository.markIdentityDeleted(ID, { userId: ID })).toBe(
      true,
    );
    await expect(deleted.resolver.resolve(deleted.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    expect(deleted.contactCalls()).toBe(0);

    const expired = await fixture();
    expired.setNow(NOW + 901_000);
    await expect(expired.resolver.resolve(expired.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    expect(expired.contactCalls()).toBe(0);
  });

  it('rechecks session ownership after an already-resolved contact promise', async () => {
    const control: { deleteOwner?: () => void } = {};
    const f = await fixture(async () => {
      control.deleteOwner?.();
      return Object.freeze({
        identifierHash: 'a'.repeat(64),
        channel: 'email',
      });
    });
    control.deleteOwner = () => {
      f.repository.markIdentityDeleted(ID, { userId: ID });
    };
    await expect(f.resolver.resolve(f.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    expect(f.contactCalls()).toBe(1);
  });

  it('rejects malformed contact records and a non-monotonic clock generically', async () => {
    const malformed = await fixture(
      async () => ({ identifierHash: 'raw-contact', channel: 'sms' }) as never,
    );
    await expect(malformed.resolver.resolve(malformed.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );

    const control: { setTime?: (value: number) => void } = {};
    const regressing = await fixture(async () => {
      control.setTime?.(NOW - 1);
      return Object.freeze({
        identifierHash: 'a'.repeat(64),
        channel: 'email',
      });
    });
    control.setTime = regressing.setNow;
    await expect(regressing.resolver.resolve(regressing.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
  });

  it('rejects malformed, foreign-owner, revoked, and web credentials before contact lookup', async () => {
    const f = await fixture();
    for (const token of [
      'legacy.v1',
      'a.b.c',
      'x'.repeat(4097),
      f.accessTokens.issue(
        '123e4567-e89b-42d3-a456-426614174001',
        f.session.sessionId,
      ),
    ]) {
      await expect(f.resolver.resolve(token)).rejects.toThrow(
        'Deletion authority unavailable',
      );
    }
    const web = Object.freeze({
      transport: 'web' as const,
      exactOrigin: 'https://app.example',
      browserChainId: 'web-chain',
    });
    const webSession = await f.issuer.issueFromLoginProof({
      loginProof: await f.simulatorLogin.issue(web),
      transportContext: web,
    });
    await expect(f.resolver.resolve(webSession.accessToken)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    f.repository.revokeForCurrentSession(
      f.session.sessionId,
      f.session.sessionId,
      { userId: ID },
      NOW,
    );
    await expect(f.resolver.resolve(f.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    expect(f.contactCalls()).toBe(0);
  });

  it('rejects a principal with a different owner or extra data before contact lookup', async () => {
    const f = await fixture();
    for (const value of [
      {
        identityId: '123e4567-e89b-42d3-a456-426614174001',
        sessionId: f.session.sessionId,
      },
      { identityId: ID, sessionId: f.session.sessionId, extra: true },
    ]) {
      const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
        ...f.config,
        principal: { resolve: async () => value },
      });
      await expect(resolver.resolve(f.token)).rejects.toThrow(
        'Deletion authority unavailable',
      );
    }
    expect(f.contactCalls()).toBe(0);
  });

  it('rechecks an already-resolved principal before the continuation can access contacts', async () => {
    const f = await fixture();
    const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
      ...f.config,
      principal: {
        resolve: () => {
          const result = Promise.resolve(
            Object.freeze({ identityId: ID, sessionId: f.session.sessionId }),
          );
          f.repository.markIdentityDeleted(ID, { userId: ID });
          return result;
        },
      },
    });
    await expect(resolver.resolve(f.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    expect(f.contactCalls()).toBe(0);
  });

  it('rejects revocation while the principal promise is pending', async () => {
    const f = await fixture();
    let finish!: (
      value: Readonly<{ identityId: string; sessionId: string }>,
    ) => void;
    const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
      ...f.config,
      principal: {
        resolve: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
    });
    const pending = resolver.resolve(f.token);
    f.repository.revokeForCurrentSession(
      f.session.sessionId,
      f.session.sessionId,
      { userId: ID },
      NOW,
    );
    finish(Object.freeze({ identityId: ID, sessionId: f.session.sessionId }));
    await expect(pending).rejects.toThrow('Deletion authority unavailable');
    expect(f.contactCalls()).toBe(0);
  });

  it('rejects expiration while a contact promise is pending', async () => {
    let finish!: (
      value: Readonly<{ identifierHash: string; channel: 'sms' }>,
    ) => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const f = await fixture(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          entered();
        }),
    );
    const pending = f.resolver.resolve(f.token);
    await ready;
    expect(f.contactCalls()).toBe(1);
    f.setNow(NOW + 900_000);
    finish(Object.freeze({ identifierHash: 'a'.repeat(64), channel: 'sms' }));
    await expect(pending).rejects.toThrow('Deletion authority unavailable');
  });

  it('reads the complete current row after the contact await, including malformed state', async () => {
    const f = await fixture();
    const actual = f.repository.readSession(
      f.session.sessionId,
      { userId: ID },
      NOW,
    )!;
    for (const change of [
      { transport: 'web' },
      { identityId: '123e4567-e89b-42d3-a456-426614174001' },
      { generation: 1 },
      { refreshTokenHash: 'bad' },
      { expiresAt: NOW + 1 },
      { browserChainId: 'extra' },
      { deviceName: 'x'.repeat(101) },
      { familyId: f.session.sessionId },
    ]) {
      let reads = 0;
      const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
        ...f.config,
        repository: {
          readSession: () =>
            (++reads === 1 ? actual : { ...actual, ...change }) as never,
        },
      });
      await expect(resolver.resolve(f.token)).rejects.toThrow(
        'Deletion authority unavailable',
      );
      expect(reads).toBe(2);
    }
  });

  it('rejects malformed contacts, raw selectors, and getters without evaluating caller properties', async () => {
    let touches = 0;
    const getter = Object.defineProperty({ channel: 'sms' }, 'identifierHash', {
      enumerable: true,
      get() {
        touches++;
        throw new Error('contact getter');
      },
    });
    for (const value of [
      null,
      undefined,
      { identifierHash: 'a'.repeat(64), channel: 'push' },
      { identifierHash: 'a'.repeat(64), channel: 'sms', identityId: ID },
      getter,
    ]) {
      const f = await fixture(async () => value as never);
      await expect(f.resolver.resolve(f.token)).rejects.toThrow(
        'Deletion authority unavailable',
      );
    }
    expect(touches).toBe(0);
  });

  it('rejects hostile principal/contact thenables and async session reads without assimilation', async () => {
    let touches = 0;
    const hostile = Object.defineProperty({}, 'then', {
      get() {
        touches++;
        throw new Error('then getter');
      },
    });
    const f = await fixture();
    const principal = new DevelopmentMobileDeletionOtpAuthorityResolver({
      ...f.config,
      principal: { resolve: () => hostile as never },
    });
    await expect(principal.resolve(f.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    const contacts = new DevelopmentMobileDeletionOtpAuthorityResolver({
      ...f.config,
      registeredContacts: { readRegisteredContact: () => hostile as never },
    });
    await expect(contacts.resolve(f.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    const row = new DevelopmentMobileDeletionOtpAuthorityResolver({
      ...f.config,
      repository: { readSession: () => Promise.resolve(null) as never },
    });
    await expect(row.resolve(f.token)).rejects.toThrow(
      'Deletion authority unavailable',
    );
    expect(touches).toBe(0);
  });

  it('captures contact port receivers and immutable derived owner context', async () => {
    const f = await fixture();
    const contact = {
      expected: ID,
      readRegisteredContact(
        context: Readonly<{ userId: string }>,
        now: number,
      ) {
        expect(this.expected).toBe(context.userId);
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.keys(context)).toEqual(['userId']);
        expect(now).toBe(NOW);
        return Promise.resolve(
          Object.freeze({
            identifierHash: 'b'.repeat(64),
            channel: 'email' as const,
          }),
        );
      },
    };
    const config = { ...f.config, registeredContacts: contact };
    const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver(config);
    contact.readRegisteredContact = () => {
      throw new Error('late port change');
    };
    config.clock = () => 0;
    const authority = await resolver.resolve(f.token);
    expect(authority.identifierHash).toBe('b'.repeat(64));
    expect(authority.channel).toBe('email');
    expect(Object.isFrozen(authority.transportContext)).toBe(true);
  });

  it('rejects configuration gates and accessors before contacting registered data', async () => {
    const f = await fixture();
    let touches = 0;
    for (const change of [
      { environment: 'production' },
      { enabled: false },
      { authDeleteOtpDevOnly: false },
      { clock: undefined },
    ]) {
      expect(
        () =>
          new DevelopmentMobileDeletionOtpAuthorityResolver({
            ...f.config,
            ...change,
          } as MobileDeletionOtpAuthorityConfig),
      ).toThrow('Deletion authority unavailable');
    }
    const config = Object.defineProperty(
      { ...f.config },
      'registeredContacts',
      {
        enumerable: true,
        get() {
          touches++;
          throw new Error('config getter');
        },
      },
    );
    expect(
      () => new DevelopmentMobileDeletionOtpAuthorityResolver(config),
    ).toThrow('Deletion authority unavailable');
    const port = Object.defineProperty({}, 'readRegisteredContact', {
      get() {
        touches++;
        throw new Error('method getter');
      },
    });
    expect(
      () =>
        new DevelopmentMobileDeletionOtpAuthorityResolver({
          ...f.config,
          registeredContacts: port as never,
        }),
    ).toThrow('Deletion authority unavailable');
    expect(touches).toBe(0);
    expect(f.contactCalls()).toBe(0);
  });

  it('rejects malformed verified claims before contact lookup', async () => {
    const f = await fixture();
    const actual = f.accessTokens.verify(f.token);
    for (const change of [
      { iss: 'legacy' },
      { aud: 'wrong' },
      { ver: 1 },
      { iat: actual.iat + 1 },
      { exp: actual.exp + 1 },
      { sub: 'bad' },
      { extra: true },
    ]) {
      const resolver = new DevelopmentMobileDeletionOtpAuthorityResolver({
        ...f.config,
        accessTokens: { verify: () => ({ ...actual, ...change }) as never },
      });
      await expect(resolver.resolve(f.token)).rejects.toThrow(
        'Deletion authority unavailable',
      );
    }
    expect(f.contactCalls()).toBe(0);
  });
});
