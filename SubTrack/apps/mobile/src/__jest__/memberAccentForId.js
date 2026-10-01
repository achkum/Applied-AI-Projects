// CJS shim for @subtrack/ui-tokens/member-accent used in Jest only.
// The real export (member-accent.mjs) uses `import … with { type: 'json' }`
// (JSON import attributes), which babel-preset-expo 10 does not transform.
// This shim loads the same JSON via require() and re-exports the same function.
// Wired via jest.config.js moduleNameMapper.
const theme = require('../../../../packages/ui-tokens/generated/theme.native.json');

function memberAccentForId(opaqueMemberId) {
  if (typeof opaqueMemberId !== 'string' || opaqueMemberId.length === 0)
    throw new TypeError('opaqueMemberId must be a non-empty string');
  let hash = 0x811c9dc5;
  for (let i = 0; i < opaqueMemberId.length; i += 1) {
    hash ^= opaqueMemberId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const slots = Object.keys(theme.memberAccent.slots);
  return slots[(hash >>> 0) % slots.length];
}

module.exports = { memberAccentForId };
