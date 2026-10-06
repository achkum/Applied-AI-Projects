import { describe, expect, it } from 'vitest';
import { selectV2CredentialTransport as select } from './credential-selector';
import type { V2CredentialOperation, V2CredentialObservations } from './credential-selector';

const empty = (): V2CredentialObservations => ({
  accessCookies: [], refreshCookies: [], authorizationHeaders: [],
});
const accessCookie = (): V2CredentialObservations => ({ ...empty(), accessCookies: ['sample-access'] });
const refreshCookie = (): V2CredentialObservations => ({ ...empty(), refreshCookies: ['sample-refresh'] });
const bearer = (): V2CredentialObservations => ({ ...empty(), authorizationHeaders: ['Bearer sample-access'] });
const refreshHeader = (): V2CredentialObservations => ({ ...empty(), authorizationHeaders: ['Refresh sample-refresh'] });
const protectedOps: readonly V2CredentialOperation[] = [
  'listV2Sessions', 'revokeV2Session', 'startV2DeleteOtpReauth',
  'verifyV2DeleteOtpReauth', 'deleteV2Me',
];
const rejected = (operation: string, observation: unknown): void => {
  let caught: unknown;
  try {
    select(operation as V2CredentialOperation, observation as V2CredentialObservations);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toBe('V2 credential selection unavailable');
};

describe('selectV2CredentialTransport', () => {
  it('selects web access and mobile Bearer for every protected operation', () => {
    for (const operation of protectedOps) {
      expect(select(operation, accessCookie())).toBe('web-cookie');
      expect(select(operation, bearer())).toBe('mobile-access-bearer');
    }
  });

  it('selects web refresh with optional access cookie and mobile Refresh', () => {
    expect(select('refreshV2Session', refreshCookie())).toBe('web-cookie');
    expect(select('refreshV2Session', {
      ...refreshCookie(), accessCookies: ['sample-access'],
    })).toBe('web-cookie');
    expect(select('refreshV2Session', refreshHeader())).toBe('mobile-refresh');
  });

  it('rejects missing credentials, wrong schemes, and unsupported operations generically', () => {
    rejected('listV2Sessions', empty());
    rejected('refreshV2Session', accessCookie());
    rejected('listV2Sessions', refreshHeader());
    rejected('refreshV2Session', bearer());
    rejected('createV2BrowserNonce', empty());
  });

  it('rejects recognized-cookie and Authorization mixtures, including refresh access plus Refresh', () => {
    rejected('listV2Sessions', { ...accessCookie(), authorizationHeaders: ['Bearer sample-access'] });
    rejected('listV2Sessions', { ...accessCookie(), authorizationHeaders: ['bad header'] });
    rejected('refreshV2Session', { ...accessCookie(), authorizationHeaders: ['Refresh sample-refresh'] });
    rejected('refreshV2Session', { ...refreshCookie(), authorizationHeaders: ['Refresh sample-refresh'] });
  });

  it('rejects duplicate recognized occurrences and malformed credential values', () => {
    rejected('listV2Sessions', { ...accessCookie(), accessCookies: ['sample-access', 'sample-access'] });
    rejected('listV2Sessions', { ...bearer(), authorizationHeaders: ['Bearer sample-access', 'Bearer sample-access'] });
    for (const value of ['', 'two words', 'comma,value', 'semi;value', 'quote"value', 'slash\\value', 'control\nvalue']) {
      rejected('listV2Sessions', { ...empty(), accessCookies: [value] });
      rejected('listV2Sessions', { ...empty(), authorizationHeaders: [`Bearer ${value}`] });
    }
    rejected('refreshV2Session', { ...refreshCookie(), refreshCookies: [''] });
    rejected('listV2Sessions', { ...empty(), authorizationHeaders: ['Bearer sample extra'] });
  });

  it('rejects malformed runtime shapes and leaves the observation unchanged', () => {
    const observation = accessCookie();
    const before = structuredClone(observation);
    expect(select('listV2Sessions', observation)).toBe('web-cookie');
    expect(observation).toEqual(before);
    rejected('listV2Sessions', null);
    rejected('listV2Sessions', { ...empty(), accessCookies: [undefined] });
    rejected('listV2Sessions', { ...empty(), extra: [] });
    rejected('listV2Sessions', { ...empty(), accessCookies: new Array(1) });
  });

  it('never includes supplied values in failures', () => {
    const secret = 'sensitive-sample-value';
    let message = '';
    try {
      select('listV2Sessions', { ...empty(), authorizationHeaders: [`Bearer ${secret}`, `Bearer ${secret}`] });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('V2 credential selection unavailable');
    expect(message).not.toContain(secret);
  });
});


describe('lossless credential occurrence parsing', () => {
  it('rejects duplicates even when custom iterators hide all but the first occurrence', () => {
    const cases = [
      { operation: 'listV2Sessions', field: 'accessCookies', value: 'sample-access' },
      { operation: 'refreshV2Session', field: 'refreshCookies', value: 'sample-refresh' },
      { operation: 'listV2Sessions', field: 'authorizationHeaders', value: 'Bearer sample-access' },
    ] as const;
    for (const item of cases) {
      const occurrences = [item.value, item.value];
      Object.defineProperty(occurrences, Symbol.iterator, { value: function* () { yield item.value; } });
      rejected(item.operation, { ...empty(), [item.field]: occurrences });
    }
  });

  it('rejects accessor occurrences without executing their getters', () => {
    const occurrences: string[] = [];
    let calls = 0;
    Object.defineProperty(occurrences, '0', { get: () => { calls++; return 'sample-access'; } });
    rejected('listV2Sessions', { ...empty(), accessCookies: occurrences });
    expect(calls).toBe(0);
  });
});
