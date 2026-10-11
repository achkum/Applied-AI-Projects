import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const profile = new URL('../profile.ts', import.meta.url).href;
const generated = new URL('../generated/zod.gen.ts', import.meta.url).href;
const prelude = `import assert from 'node:assert/strict';\nimport { parseProfilePatch as patch, parseProfileView as view, parseJustMeChoice as choice, projectInitialProfile as initial } from ${JSON.stringify(profile)};\nimport { zProfilePatch, zProfileView, zJustMeChoice } from ${JSON.stringify(generated)};\n`;
function run(code) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', prelude + code], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('patch is nonempty, closed, and cannot assert authority or clear non-avatar fields', () => run(`
  const denied = [{}, {displayName:null}, {displayName:undefined}, {avatarEmoji:undefined}, {language:null},
    {defaultCurrency:'SEK'}, {ownerId:'x'}, {contact:'x'}, {provider:'x'}, {verifiedName:'x'},
    {sessionId:'x'}, {householdId:'x'}, {mode:'just-me'}, {displayName:'Ada', role:'owner'}];
  for (const value of denied) assert.throws(() => patch(value), undefined, JSON.stringify(value));
  assert.deepEqual(patch({avatarColourToken:null, avatarEmoji:null}), {avatarColourToken:null, avatarEmoji:null});
  assert.deepEqual(patch({displayName:'Åsa', language:'sv', theme:'dark'}), {displayName:'Åsa', language:'sv', theme:'dark'});
  assert.equal(zProfilePatch.safeParse({ownerId:'x'}).success, false);
  assert.equal(zProfilePatch.safeParse({}).success, true); // minProperties needs decoder enforcement
`));

test('display name counts Unicode scalars and rejects noncanonical or unsafe text', () => run(`
  for (const name of ['A', 'Åsa', '🙂'.repeat(80)]) assert.equal(patch({displayName:name}).displayName, name);
  for (const name of ['', '🙂'.repeat(81), ' A', 'A ', 'e\\u0301', 'a\\u0000b', 'a\\u200db', '\\ud800', '\\udc00'])
    assert.throws(() => patch({displayName:name}), undefined, JSON.stringify(name));
  assert.equal(zProfilePatch.safeParse({displayName:'🙂'.repeat(80)}).success, true); // installed Zod counts scalars
  assert.equal(zProfilePatch.safeParse({displayName:'🙂'.repeat(81)}).success, false);
  assert.equal(zProfilePatch.safeParse({displayName:'e\\u0301'}).success, true); // NFC needs decoder
`));

test('avatar, language, theme and completed-view rules match closed components', () => run(`
  const base = initial();
  assert.deepEqual(base, {displayName:null, avatarColourToken:null, avatarEmoji:null,
    language:'en', theme:'system', defaultCurrency:'SEK', profileComplete:false});
  for (let n = 1; n <= 8; n++) {
    const token = 'member.accent.' + String(n).padStart(2, '0');
    assert.equal(patch({avatarColourToken:token}).avatarColourToken, token);
  }
  for (const emoji of ['🙂','😀','😎','🌟','🌿','🐱','🦊','🦉']) assert.equal(patch({avatarEmoji:emoji}).avatarEmoji, emoji);
  for (const invalid of [{avatarColourToken:'member.accent.09'}, {avatarEmoji:'🙂️'},
    {avatarEmoji:'👩‍👩'}, {avatarEmoji:'💡'}, {language:'fr'}, {theme:'auto'}])
    assert.throws(() => patch(invalid), undefined, JSON.stringify(invalid));
  assert.deepEqual(view(base), base);
  assert.deepEqual(view({...base, displayName:'Ada'}).displayName, 'Ada');
  assert.equal(view({...base, displayName:'Ada', profileComplete:true}).profileComplete, true);
  assert.equal(view({...base, displayName:'🙂'.repeat(80), profileComplete:true}).profileComplete, true);
  for (const invalid of [{...base, profileComplete:true}, {...base, defaultCurrency:'EUR'},
    {...base, displayName:'🙂'.repeat(81)}, {...base, ownerId:'x'}, {...base, avatarEmoji:undefined}])
    assert.throws(() => view(invalid));
  assert.equal(zProfileView.safeParse({...base, profileComplete:true}).success, true); // cross-field decoder rule
`));

test('private locale fallback and explicit Just me remain data-only', () => run(`
  for (const hint of ['sv','sv-SE','SV-fi']) assert.equal(initial(undefined, hint).language, 'sv');
  for (const hint of [undefined,'en','sve','sv_Se','x-sv']) assert.equal(initial(undefined, hint).language, 'en');
  assert.equal(initial('en','sv-SE').language, 'en');
  assert.equal(initial('sv','en').language, 'sv');
  assert.equal(Object.hasOwn(initial(undefined,'sv-SE'), 'privateLocaleHint'), false);
  assert.deepEqual(choice({mode:'just-me'}), {mode:'just-me'});
  for (const invalid of [{}, {mode:'my-household'}, {mode:'just-me', householdId:'x'},
    {mode:'just-me', profileComplete:true}, {mode:undefined}]) assert.throws(() => choice(invalid));
  assert.equal(zJustMeChoice.safeParse({mode:'just-me', ownerId:'x'}).success, false);
`));
