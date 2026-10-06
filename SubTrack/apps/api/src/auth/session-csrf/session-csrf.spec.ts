import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  InMemorySessionCsrfStore,
  SessionCsrfGuard,
  type SessionCsrfStore,
  type VerifiedWebSessionAuthority,
} from './session-csrf.js';

function authority(): VerifiedWebSessionAuthority {
  return {
    identityId: `identity-${randomUUID()}`,
    sessionId: `session-${randomUUID()}`,
  } as unknown as VerifiedWebSessionAuthority;
}

function otherAuthority(source: VerifiedWebSessionAuthority): VerifiedWebSessionAuthority {
  return { identityId: source.identityId, sessionId: `session-${randomUUID()}` } as unknown as VerifiedWebSessionAuthority;
}

function genericFailure(action: () => unknown): void {
  assert.throws(action, { message: 'Session CSRF unavailable' });
}

describe('SessionCsrfGuard', () => {
  it('mints an independent token, stores only frozen digests, and verifies without consuming', () => {
    const store = new InMemorySessionCsrfStore();
    const guard = new SessionCsrfGuard(store);
    const session = authority();
    const token = guard.mint(session);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.doesNotThrow(() => guard.verify(session, token));
    assert.doesNotThrow(() => guard.verify(session, token));
    const snapshot = store.snapshot();
    assert.equal(snapshot.length, 1);
    assert(Object.isFrozen(snapshot));
    const record = snapshot[0];
    assert(record && Object.isFrozen(record));
    assert.match(record.bindingDigest, /^[0-9a-f]{64}$/);
    assert.match(record.tokenDigest, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(snapshot).includes(token), false);
    assert.equal(JSON.stringify(snapshot).includes(session.identityId), false);
    assert.equal(JSON.stringify(snapshot).includes(session.sessionId), false);
  });

  it('rotates atomically and rejects the previous token and other identity or session bindings', () => {
    const guard = new SessionCsrfGuard();
    const session = authority();
    const token = guard.mint(session);
    const replacement = guard.mint(session);
    assert.notEqual(replacement, token);
    genericFailure(() => guard.verify(session, token));
    assert.doesNotThrow(() => guard.verify(session, replacement));
    genericFailure(() => guard.verify(otherAuthority(session), replacement));
    genericFailure(() => guard.verify({ identityId: `identity-${randomUUID()}`, sessionId: session.sessionId } as unknown as VerifiedWebSessionAuthority, replacement));
  });

  it('rejects malformed authority and token shapes with one generic error', () => {
    const guard = new SessionCsrfGuard();
    const session = authority();
    const valid = guard.mint(session);
    for (const badAuthority of [null, [], {}, { identityId: ' ', sessionId: `session-${randomUUID()}` },
      { identityId: `identity-${randomUUID()}`, sessionId: 'x'.repeat(257) },
      { identityId: `identity-${randomUUID()}`, sessionId: `session-${randomUUID()}`, extra: 'value' }]) {
      genericFailure(() => guard.verify(badAuthority as VerifiedWebSessionAuthority, valid));
      genericFailure(() => guard.mint(badAuthority as VerifiedWebSessionAuthority));
    }
    for (const malformed of ['', valid.slice(1), `${valid}=`, ` ${valid}`, null, 17]) {
      genericFailure(() => guard.verify(session, malformed as string));
    }
    genericFailure(() => guard.verify(authority(), valid));
  });

  it('enforces configured capacity without losing an existing binding and permits rotation at capacity', () => {
    const store = new InMemorySessionCsrfStore();
    const guard = new SessionCsrfGuard(store, { maxRecords: 1 });
    const firstAuthority = authority();
    const firstToken = guard.mint(firstAuthority);
    const secondToken = guard.mint(firstAuthority);
    assert.notEqual(firstToken, secondToken);
    genericFailure(() => guard.mint(authority()));
    assert.doesNotThrow(() => guard.verify(firstAuthority, secondToken));
    genericFailure(() => guard.verify(firstAuthority, firstToken));
    assert.equal(store.snapshot().length, 1);
  });

  it('copies and freezes records on input, lookup, and diagnostic snapshots', () => {
    const store = new InMemorySessionCsrfStore();
    const guard = new SessionCsrfGuard(store);
    const session = authority();
    const token = guard.mint(session);
    const view = store.snapshot()[0];
    assert(view);
    assert(Object.isFrozen(view));
    assert(Object.isFrozen(store.get(view.bindingDigest)));
    assert.notEqual(view.tokenDigest, token);
    assert.equal(store.snapshot()[0]?.tokenDigest, view.tokenDigest);
    const input = { bindingDigest: view.bindingDigest, tokenDigest: view.tokenDigest };
    store.replace(input, 1);
    input.tokenDigest = 'f'.repeat(64);
    assert.equal(store.get(view.bindingDigest)?.tokenDigest, view.tokenDigest);
    assert.throws(() => Object.assign(view, { tokenDigest: 'f'.repeat(64) }), TypeError);
  });

  it('fails generically when a store operation throws or returns invalid data', () => {
    const throwingStore: SessionCsrfStore = {
      get: () => { throw new Error('internal diagnostic'); },
      replace: () => { throw new Error('internal diagnostic'); },
      delete: () => { throw new Error('internal diagnostic'); },
    };
    const guarded = new SessionCsrfGuard(throwingStore);
    const session = authority();
    genericFailure(() => guarded.mint(session));
    genericFailure(() => guarded.verify(session, 't'.repeat(43)));
    genericFailure(() => guarded.invalidate(session));

    const malformedStore: SessionCsrfStore = {
      get: () => ({ bindingDigest: 'malformed', tokenDigest: 'malformed' }),
      replace: () => undefined,
      delete: () => undefined,
    };
    const malformedGuard = new SessionCsrfGuard(malformedStore);
    genericFailure(() => malformedGuard.verify(session, malformedGuard.mint(session)));
  });

  it('invalidates only the supplied authority binding', () => {
    const guard = new SessionCsrfGuard();
    const session = authority();
    const other = authority();
    const token = guard.mint(session);
    const otherToken = guard.mint(other);
    guard.invalidate(session);
    genericFailure(() => guard.verify(session, token));
    assert.doesNotThrow(() => guard.verify(other, otherToken));
  });

  it('keeps concurrent synchronous reissues atomic so only the current token verifies afterward', async () => {
    const guard = new SessionCsrfGuard();
    const session = authority();
    const results = await Promise.all([
      Promise.resolve().then(() => guard.mint(session)),
      Promise.resolve().then(() => guard.mint(session)),
    ]);
    const current = results[1];
    assert(current);
    assert.doesNotThrow(() => guard.verify(session, current));
    genericFailure(() => guard.verify(session, results[0] ?? ''));
  });

  it('rejects invalid direct repository inputs without changing state', () => {
    const store = new InMemorySessionCsrfStore();
    const guard = new SessionCsrfGuard(store);
    const session = authority();
    const token = guard.mint(session);
    const record = store.snapshot()[0];
    assert(record);
    for (const key of ['', 'G'.repeat(64), 12]) {
      genericFailure(() => store.get(key as string));
      genericFailure(() => store.delete(key as string));
    }
    for (const bad of [null, { ...record, bindingDigest: 'bad' }, { ...record, tokenDigest: 'bad' }]) {
      genericFailure(() => store.replace(bad as typeof record, 1));
    }
    for (const capacity of [0, -1, 1.5, 10001, Number.NaN]) {
      genericFailure(() => store.replace(record, capacity));
    }
    guard.invalidate(authority());
    assert.doesNotThrow(() => guard.verify(session, token));
  });

  it('rejects invalid capacity settings', () => {
    for (const maxRecords of [0, -1, 1.5, 10_001, '2', Number.NaN]) {
      genericFailure(() => new SessionCsrfGuard(new InMemorySessionCsrfStore(), { maxRecords } as unknown as { maxRecords?: number }));
    }
  });
});
