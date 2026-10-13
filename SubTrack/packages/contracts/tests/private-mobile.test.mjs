import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const url=new URL('../private-mobile.ts',import.meta.url).href;
function run(code){const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`import assert from 'node:assert/strict';import * as p from ${JSON.stringify(url)};${code}`],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);}
test('private mobile completion excludes identifiers/person selectors and mixed transport',()=>run(`
 const body={transport:'mobile',enrollmentProof:'v2.'+'A'.repeat(43)};
 assert.deepEqual(p.parsePrivateMobileEnrollmentComplete(body),body);
 assert.equal(p.parsePrivateMobileEnrollmentComplete({...body,locale:'sv'}).locale,'sv');
 for(const patch of [{transport:'web'},{identifier:'private'},{personnummer:'private'},{identityId:'x'},{enrollmentProof:'bad'},{locale:'other'},{locale:undefined}])assert.throws(()=>p.parsePrivateMobileEnrollmentComplete({...body,...patch}));
 for(const value of [null,[],{},Object.assign(Object.create(null),body)])assert.throws(()=>p.parsePrivateMobileEnrollmentComplete(value));
`));
test('registered fixture verification/session shapes are separate from enrollment proof',()=>run(`
 assert.deepEqual(p.parsePrivateMobileLoginVerify({transport:'mobile'}),{transport:'mobile'});
 const body={transport:'mobile',loginProof:'v2.'+'A'.repeat(43)};assert.deepEqual(p.parsePrivateMobileSessionRequest(body),body);
 assert.equal(p.parsePrivateMobileLoginVerified({...body,status:'verified'}).status,'verified');
 for(const value of [{transport:'web'},{transport:'mobile',demoIdentity:'alice'},{transport:'mobile',ownerId:'x'}])assert.throws(()=>p.parsePrivateMobileLoginVerify(value));
 assert.throws(()=>p.parsePrivateMobileSessionRequest({...body,enrollmentProof:body.loginProof}));
 assert.throws(()=>p.parsePrivateMobileLoginVerified({...body,status:'pending'}));
`));
test('one native credential bundle has strict accepted mobile session fields',()=>run(`
 const body={transport:'mobile',sessionId:'123e4567-e89b-42d3-a456-426614174000',accessToken:'abc.def.ghi',refreshToken:'v2r.'+'A'.repeat(43)};
 assert.deepEqual(p.parsePrivateMobileSessionResponse(body),body);
 for(const patch of [{transport:'web'},{sessionId:'bad'},{accessToken:'bad'},{refreshToken:'bad'},{csrfToken:'bad'},{identityId:'bad'}])assert.throws(()=>p.parsePrivateMobileSessionResponse({...body,...patch}));
 assert.equal(Object.keys(p.PRIVATE_MOBILE_PATHS).length,13);
`));

test('mobile manual edit reuses exact fields and rejects authority selectors',()=>run(`
 const body={id:'123e4567-e89b-42d3-a456-426614174000',customName:' Test ',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'123',nextChargeDate:null,expectedRevision:'1'};
 assert.equal(p.parsePrivateMobileManualEdit(body).customName,'Test');
 for(const patch of [{id:'bad'},{ownerId:'private'},{status:'ARCHIVED'},{expectedRevision:'01'},{expectedRevision:'9223372036854775808'},{nextChargeDate:undefined}])assert.throws(()=>p.parsePrivateMobileManualEdit({...body,...patch}));
`));
test('mobile status is a closed resource-target envelope',()=>run(`
 const body={id:'123e4567-e89b-42d3-a456-426614174000',status:'PAUSED'};assert.deepEqual(p.parsePrivateMobileStatus(body),body);
 for(const patch of [{id:'bad'},{status:'DETECTED'},{expectedRevision:'1'},{ownerId:'private'}])assert.throws(()=>p.parsePrivateMobileStatus({...body,...patch}));
`));
