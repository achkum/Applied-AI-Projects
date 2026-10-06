export type IdentifierChannel = 'email' | 'phone';
export type IdentifierValidationCode = 'required' | 'email_format' | 'phone_format' | 'phone_length';
export type IdentifierResult =
  | { valid: true; channel: IdentifierChannel; identifier: string }
  | { valid: false; code: IdentifierValidationCode };

const invalid = (code: IdentifierValidationCode): IdentifierResult => ({ valid: false, code });

export function normalizeIdentifier(channel: IdentifierChannel, input: string): IdentifierResult {
  if (/[\p{Cc}\p{Cf}]/u.test(input)) return invalid(channel === 'email' ? 'email_format' : 'phone_format');
  const value = input.trim();
  if (!value) return invalid('required');

  if (channel === 'email') {
    if (/\s/.test(value)) return invalid('email_format');
    const parts = value.split('@');
    if (parts.length !== 2) return invalid('email_format');
    const [local, domain] = parts;
    if (!local || !domain || !/^[^@]+$/.test(local) || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(domain) || domain.split('.').some((label) => !label || label.startsWith('-') || label.endsWith('-'))) return invalid('email_format');
    return { valid: true, channel, identifier: `${local}@${domain.toLowerCase()}` };
  }

  if (!/^[+0-9 \u00a0\u202f()-]+$/.test(value)) return invalid('phone_format');
  const opens = (value.match(/\(/g) ?? []).length;
  const closes = (value.match(/\)/g) ?? []).length;
  if (opens !== closes || opens > 1 || (opens === 1 && value.indexOf('(') > value.indexOf(')'))) return invalid('phone_format');
  const compact = value.replace(/[ \u00a0\u202f()-]/g, '');
  if (compact.slice(1).includes('+')) return invalid('phone_format');

  let normalized: string;
  if (compact.startsWith('0046')) {
    if (compact[4] === '0') return invalid('phone_format');
    normalized = `+46${compact.slice(4)}`;
  } else if (compact.startsWith('00')) return invalid('phone_format');
  else if (compact.startsWith('0')) normalized = `+46${compact.slice(1)}`;
  else if (compact.startsWith('+')) normalized = compact;
  else return invalid('phone_format');
  if ((compact.startsWith('+46') && compact[3] === '0')) return invalid('phone_format');
  if (!/^\+[1-9]\d*$/.test(normalized)) return invalid('phone_format');
  const digits = normalized.slice(1);
  if (digits.length < 8 || digits.length > 15) return invalid('phone_length');
  return { valid: true, channel, identifier: normalized };
}
