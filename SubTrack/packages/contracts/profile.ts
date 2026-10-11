import * as z from 'zod';
import { zJustMeChoice, zProfilePatch, zProfileView } from './generated/zod.gen.ts';
import type { JustMeChoice, ProfilePatch, ProfileView } from './generated/types.gen.ts';

export function isCanonicalDisplayName(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim() || value !== value.normalize('NFC') || /[\p{Cc}\p{Cf}]/u.test(value)) return false;
  let scalars = 0;
  for (const scalar of value) {
    const code = scalar.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) return false;
    if (++scalars > 80) return false;
  }
  return scalars > 0;
}

const canonicalName = z.string().refine(isCanonicalDisplayName, 'Expected 1-80 canonical Unicode scalar values');
// Replace the generated name field to enforce NFC, trim stability and scalar safety.
const patch = zProfilePatch.omit({ displayName: true }).extend({ displayName: canonicalName.optional() })
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required');
const view = zProfileView.omit({ displayName: true }).extend({ displayName: canonicalName.nullable() })
  .refine((value) => !value.profileComplete || value.displayName !== null, 'A complete profile requires a display name');

// Copy own data properties only, so accessors and inherited fields are never read.
function dataObject(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input) ||
      (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new z.ZodError([{ code: 'custom', path: [], message: 'Expected a plain data object' }]);
  }
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || descriptor.value === undefined) {
      throw new z.ZodError([{ code: 'custom', path: [], message: 'Expected JSON data properties' }]);
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

export function parseProfilePatch(input: unknown): ProfilePatch { return patch.parse(dataObject(input)); }
export function parseProfileView(input: unknown): ProfileView { return view.parse(dataObject(input)); }
export function parseJustMeChoice(input: unknown): JustMeChoice { return zJustMeChoice.parse(dataObject(input)); }

export function projectInitialProfile(explicitLanguage?: 'sv' | 'en', privateLocaleHint?: string): ProfileView {
  const language = explicitLanguage === undefined
    ? (typeof privateLocaleHint === 'string' && /^sv(?:-|$)/i.test(privateLocaleHint) ? 'sv' : 'en')
    : z.enum(['sv', 'en']).parse(explicitLanguage);
  return { displayName: null, avatarColourToken: null, avatarEmoji: null,
    language, theme: 'system', defaultCurrency: 'SEK', profileComplete: false };
}
