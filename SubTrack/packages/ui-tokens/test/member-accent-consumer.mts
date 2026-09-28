import {
  memberAccentForId,
  type MemberAccentToken,
} from '@subtrack/ui-tokens/member-accent';

const accent: MemberAccentToken = memberAccentForId('opaque-member-id-1');
void accent;

// @ts-expect-error A member accent cannot be confused with a category hue token.
const categoryAccent: MemberAccentToken = 'category.streaming';
void categoryAccent;

// @ts-expect-error Member IDs are opaque strings, not numeric array indexes.
memberAccentForId(1);
