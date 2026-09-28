import theme from '../generated/theme.native.json' with { type: 'json' };

/**
 * Select a stable theme-aware member accent from an opaque, stable member ID.
 * Do not pass display names, email addresses, or other personal data.
 */
export function memberAccentForId(opaqueMemberId) {
  if (typeof opaqueMemberId !== 'string' || opaqueMemberId.length === 0)
    throw new TypeError('opaqueMemberId must be a non-empty string');

  let hash = 0x811c9dc5;
  for (let index = 0; index < opaqueMemberId.length; index += 1) {
    hash ^= opaqueMemberId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const slots = Object.keys(theme.memberAccent.slots);
  return slots[(hash >>> 0) % slots.length];
}
