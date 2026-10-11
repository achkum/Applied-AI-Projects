import { describe, expect, it } from 'vitest';
import { PRIVATE_PROFILE_STATEMENTS } from './private-profile-statements.js';

describe('private profile statement registry', () => {
  it('installs exactly the two owner-scoped, quote-free fixed statements', () => {
    expect(Object.keys(PRIVATE_PROFILE_STATEMENTS)).toEqual(['profileRead', 'profilePatch']);
    for (const sql of Object.values(PRIVATE_PROFILE_STATEMENTS)) {
      expect(sql).toContain('public.identity_profile');
      expect(sql).toContain('$1::uuid');
      expect(sql).not.toMatch(/["'`;]|default_currency\s*=/i);
    }
    expect(PRIVATE_PROFILE_STATEMENTS.profilePatch).toContain('$11::varchar(16)');
    expect(PRIVATE_PROFILE_STATEMENTS.profileRead).not.toMatch(/\bUPDATE\b/i);
  });
});
