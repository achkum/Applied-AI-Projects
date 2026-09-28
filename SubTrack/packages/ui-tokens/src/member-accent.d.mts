/** Stable identity accent token names, independent of theme and category hues. */
export type MemberAccentToken =
  | 'member.accent.01'
  | 'member.accent.02'
  | 'member.accent.03'
  | 'member.accent.04'
  | 'member.accent.05'
  | 'member.accent.06'
  | 'member.accent.07'
  | 'member.accent.08';

/**
 * Select a stable accent from an opaque, stable member ID.
 * Do not pass display names, email addresses, or other personal data.
 * Throws TypeError for an empty ID.
 */
export declare function memberAccentForId(
  opaqueMemberId: string,
): MemberAccentToken;
