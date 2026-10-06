/** Internal transport classification only; this does not authenticate credentials. */
export type V2CredentialOperation =
  | 'listV2Sessions'
  | 'revokeV2Session'
  | 'startV2DeleteOtpReauth'
  | 'verifyV2DeleteOtpReauth'
  | 'deleteV2Me'
  | 'refreshV2Session';

export type V2CredentialTransport =
  | 'web-cookie'
  | 'mobile-access-bearer'
  | 'mobile-refresh';

/** Lossless adapter observation: every occurrence of each recognized credential. */
export interface V2CredentialObservations {
  readonly accessCookies: readonly string[];
  readonly refreshCookies: readonly string[];
  readonly authorizationHeaders: readonly string[];
}

const unavailable = (): Error => new Error('V2 credential selection unavailable');
const fields = ['accessCookies', 'refreshCookies', 'authorizationHeaders'] as const;
const protectedOperations: readonly V2CredentialOperation[] = [
  'listV2Sessions',
  'revokeV2Session',
  'startV2DeleteOtpReauth',
  'verifyV2DeleteOtpReauth',
  'deleteV2Me',
];

function credentialValue(value: string): boolean {
  // Nonempty printable ASCII, excluding separators and quoting/escaping characters.
  return /^[\x21-\x7e]+$/.test(value) && !/[;,"'\\]/.test(value);
}

function snapshot(input: unknown): V2CredentialObservations {
  try {
    if (input === null || typeof input !== 'object') throw unavailable();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw unavailable();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || fields.some((field) => !keys.includes(field))) {
      throw unavailable();
    }

    const copy = {} as Record<(typeof fields)[number], string[]>;
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !('value' in descriptor) || !Array.isArray(descriptor.value)) {
        throw unavailable();
      }
      const occurrences = descriptor.value as unknown[];
      const lengthDescriptor = Object.getOwnPropertyDescriptor(occurrences, 'length');
      if (!lengthDescriptor || !('value' in lengthDescriptor) ||
        (lengthDescriptor.value !== 0 && lengthDescriptor.value !== 1)) throw unavailable();
      const values: string[] = [];
      // Read indexed data properties; custom iterators/accessors cannot hide occurrences.
      for (let index = 0; index < lengthDescriptor.value; index++) {
        const occurrence = Object.getOwnPropertyDescriptor(occurrences, String(index));
        if (!occurrence || !('value' in occurrence)) throw unavailable();
        const item: unknown = occurrence.value;
        if (typeof item !== 'string' || (field === 'authorizationHeaders' ? authorizationScheme(item) === null : !credentialValue(item))) throw unavailable();
        values.push(item);
      }
      copy[field] = values;
    }
    return copy;
  } catch {
    // Normalize malformed objects, getters, proxies, and credential values alike.
    throw unavailable();
  }
}

function authorizationScheme(value: string): 'Bearer' | 'Refresh' | null {
  const match = /^(Bearer|Refresh) ([^ ]+)$/.exec(value);
  if (!match || typeof match[2] !== 'string' || !credentialValue(match[2])) return null;
  return match[1] as 'Bearer' | 'Refresh';
}

/** Selects the exclusive v2 transport branch without returning credential material. */
export function selectV2CredentialTransport(
  operation: V2CredentialOperation,
  observations: V2CredentialObservations,
): V2CredentialTransport {
  try {
    if (operation !== 'refreshV2Session' && !protectedOperations.includes(operation)) {
      throw unavailable();
    }
    const observed = snapshot(observations);
    const { accessCookies, refreshCookies, authorizationHeaders } = observed;
    const schemes = authorizationHeaders.map(authorizationScheme);
    if (schemes.some((scheme) => scheme === null)) throw unavailable();

    if (operation === 'refreshV2Session') {
      if (authorizationHeaders.length === 1 && schemes[0] === 'Refresh'
        && accessCookies.length === 0 && refreshCookies.length === 0) {
        return 'mobile-refresh';
      }
      if (authorizationHeaders.length === 0 && refreshCookies.length === 1
        && accessCookies.length <= 1) {
        return 'web-cookie';
      }
      throw unavailable();
    }

    if (authorizationHeaders.length === 1 && schemes[0] === 'Bearer'
      && accessCookies.length === 0 && refreshCookies.length === 0) {
      return 'mobile-access-bearer';
    }
    if (authorizationHeaders.length === 0 && accessCookies.length === 1
      && refreshCookies.length === 0) {
      return 'web-cookie';
    }
    throw unavailable();
  } catch {
    throw unavailable();
  }
}
