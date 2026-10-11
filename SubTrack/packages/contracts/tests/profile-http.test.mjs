import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { zProfileReadRequest, zProfilePatch, zProfileView } from '../generated/zod.gen.ts';

const contract = readFileSync(new URL('../openapi.yaml', import.meta.url),'utf8');

test('private profile HTTP operations remain current browser authority only', () => {
  for (const path of ['/v2/me/profile/read:','/v2/me/profile:']) assert(contract.includes(`  ${path}`));
  for (const id of ['readV2BrowserProfile','patchV2BrowserProfile']) assert(contract.includes(`operationId: ${id}`));
  assert.equal((contract.match(/\$ref: '#\/components\/parameters\/SessionCsrf'/g) ?? []).length >= 2,true);
  assert(contract.includes('401 AUTHENTICATION_REQUIRED for all collapsed current-authority failures'));
  assert(contract.includes('403 PROFILE_REQUEST_REJECTED only for syntactically rejected envelope'));
  assert.equal(zProfileReadRequest.safeParse({}).success,true);
  for (const body of [[],null,{ownerId:'x'},{csrf:'x'}]) assert.equal(zProfileReadRequest.safeParse(body).success,false);
  assert.equal(zProfilePatch.safeParse({defaultCurrency:'EUR'}).success,false);
  assert.equal(zProfileView.safeParse({displayName:null,avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:false,ownerId:'x'}).success,false);
});
