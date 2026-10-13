import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import type {V2AccessToken} from '../sessions-v2/v2-access-token.js';
import {DurablePrivateMobileAuthority} from './durable-mobile-authority.js';
import {DurablePrivateMobileSessions} from './durable-mobile-sessions.js';
import type {PrivateMobileSubjectVerifier} from './verified-subject-binding.js';
import type {PrivateMobileEnrollmentAdmission} from './enrollment-admission.js';
const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',FAMILY='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN=`v2r.${'a'.repeat(43)}`,KEY='private-refresh-key-0001';
function fixture(options:{duplicate?:boolean;reused?:boolean;expiredAfter?:boolean;finalMismatch?:boolean;ownerDeleted?:boolean;commitUnknown?:boolean;missingSession?:boolean;faultStage?:string;fullStage?:string}={}){
 vi.stubEnv('NODE_ENV','development');let now=1000;const queries:string[]=[];const release=vi.fn();
 const query=vi.fn(async(sql:string,values?:unknown[])=>{
  queries.push(sql);const result=(command:string,rows:Record<string,unknown>[]=[] ,rowCount=rows.length)=>({command,rows,rowCount});
  if(sql.startsWith('SELECT session_user'))return result('SELECT',[{login:'subtrack_dev_auth_login',role:'subtrack_dev_auth_login',db:'st237_private_https_profile',one:'',two:''}]);
  if(sql.includes('pg_catalog.pg_roles'))return result('SELECT',[{n:'4'}]);
  if(sql.startsWith('BEGIN'))return result('BEGIN');if(sql.startsWith('SET'))return result('SET');
  if(sql==='COMMIT'){if(options.commitUnknown)throw new Error('uncertain');return result('COMMIT');}if(sql==='ROLLBACK')return result('ROLLBACK');
  if(sql.startsWith('UPDATE st244_mobile.epoch'))return result('UPDATE',[{now:'1000'}]);
  if(sql.startsWith('DELETE'))return result('DELETE');
  if(sql.includes('pg_advisory'))return result('SELECT',[{}]);
  if(sql.startsWith('SELECT count'))return result('SELECT',[{n:options.fullStage&&sql.includes(options.fullStage)?'10000':'0'}]);
  if(sql.startsWith('SELECT session_id'))return result('SELECT',options.reused?[{id:SID}]:[]);
  if(sql.includes('FROM public.identity'))return result('SELECT',options.ownerDeleted?[]:[{id:ID}]);
  if(sql.startsWith('SELECT id::text AS id,identity_id'))return result('SELECT',options.missingSession?[]:[{id:SID,identity_id:ID,family_id:FAMILY,generation:'2',expires_ms:'5000'}]);
  if(sql.startsWith('SELECT id::text AS id FROM st244_mobile.session')){if(options.expiredAfter)now=5000;return result('SELECT',options.finalMismatch?[]:[{id:SID}]);}
  if(sql.startsWith('INSERT INTO st244_mobile.reservation'))return result('INSERT',[],options.faultStage==='reservation'?2:options.duplicate?0:1);
  if(sql.startsWith('INSERT'))return result('INSERT',[],options.faultStage==='consumed'?0:1);
  if(sql.startsWith('UPDATE st244_mobile.session'))return result('UPDATE',[],options.faultStage==='rotation'?0:1);
  if(sql.includes('set_config'))return result('SELECT',[{}]);throw new Error(`Unexpected SQL ${sql} ${values?.length}`);
 });
 const client={query,release} as unknown as PoolClient;const pool={connect:async()=>client} as unknown as Pick<Pool,'connect'>;
 const tokens={verify:vi.fn(),issue:vi.fn(()=> 'fresh-access-token')} as unknown as V2AccessToken;
 const authority=new DurablePrivateMobileAuthority(pool,tokens,()=>now,'a'.repeat(64),{},true);
 const subjects={keyDigest:()=> 'b'.repeat(64)} as unknown as PrivateMobileSubjectVerifier;
 const sessions=new DurablePrivateMobileSessions(authority,subjects,{} as PrivateMobileEnrollmentAdmission,tokens);
 return {sessions,queries,query,release};
}
afterEach(()=>vi.unstubAllEnvs());
describe('durable private mobile refresh',()=>{
 it('commits rotation with stable session ID and final active owner/family/hash/generation check',async()=>{
  const f=fixture();const value=await f.sessions.refresh(TOKEN,KEY);expect(value.sessionId).toBe(SID);expect(value.refreshToken).not.toBe(TOKEN);
  const final=f.queries.findIndex(q=>q.includes('family_id=$3::uuid'));expect(final).toBeGreaterThan(f.queries.findIndex(q=>q.startsWith('UPDATE st244_mobile.session SET refresh_h')));
  expect(f.queries.slice(final+1)).toContain('COMMIT');expect(f.release).toHaveBeenCalledWith();
 });
 it('known duplicate reservation is generic restart409 and does not rotate or mint credentials',async()=>{
  const f=fixture({duplicate:true});await expect(f.sessions.refresh(TOKEN,KEY)).rejects.toThrow('AUTH_RESTART_REQUIRED');expect(f.queries).toContain('COMMIT');expect(f.queries.some(q=>q.startsWith('UPDATE st244_mobile.session SET refresh_h'))).toBe(false);
 });
 it('consumed refresh reuse revokes the family and discloses nothing after known commit',async()=>{
  const f=fixture({reused:true});await expect(f.sessions.refresh(TOKEN,KEY)).rejects.toThrow('AUTH_RESTART_REQUIRED');expect(f.queries.some(q=>q.includes('SET revoked_ms'))).toBe(true);expect(f.queries).toContain('COMMIT');
 });
 for(const [label,options] of [['expiry after await',{expiredAfter:true}],['family/current-hash mismatch',{finalMismatch:true}],['deleted owner',{ownerDeleted:true}]] as const){
  it(`rejects ${label} and rolls back before credential disclosure`,async()=>{const f=fixture(options);await expect(f.sessions.refresh(TOKEN,KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.queries).toContain('ROLLBACK');expect(f.queries).not.toContain('COMMIT');});
 }
 it('missing current secret is known generic restart after commit',async()=>{const f=fixture({missingSession:true});await expect(f.sessions.refresh(TOKEN,KEY)).rejects.toThrow('AUTH_RESTART_REQUIRED');expect(f.queries).toContain('COMMIT');});
 for(const options of [{faultStage:'reservation'},{faultStage:'consumed'},{faultStage:'rotation'},{fullStage:'reservation'},{fullStage:'consumed_refresh'}])it(`refresh mutation/capacity denial ${JSON.stringify(options)} rolls back`,async()=>{const f=fixture(options);await expect(f.sessions.refresh(TOKEN,KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.queries).toContain('ROLLBACK');});
 it('unknown COMMIT outcome discards connection and does not attempt compensation',async()=>{const f=fixture({commitUnknown:true});await expect(f.sessions.refresh(TOKEN,KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.queries).not.toContain('ROLLBACK');expect(f.release).toHaveBeenCalledWith(expect.any(Error));});
 it.each(['','v2r.short','v2.not-refresh'])('rejects malformed refresh %s before PG',async token=>{const f=fixture();await expect(f.sessions.refresh(token,KEY)).rejects.toThrow('AUTH_RESTART_REQUIRED');expect(f.query).not.toHaveBeenCalled();});
});

function bootstrapFixture(options:{existing?:boolean;duplicate?:boolean;missingProof?:boolean;consumeLost?:boolean;insertFault?:string;capacity?:string;capacityStage?:string;multipleOwners?:boolean;missingNames?:boolean;subjectMismatch?:boolean;badReservation?:boolean;trackProof?:boolean;badRead?:boolean;badConsume?:boolean;foreignConsume?:boolean;admissionUnknown?:boolean;mutationUnknown?:boolean;commitUnknown?:boolean}={}){
 vi.stubEnv('NODE_ENV','development');const queries:{sql:string;values:unknown[]|undefined}[]=[];let committed=0,proofPresent=true,pendingProofDelete=false;const release=vi.fn();
 const binding={kind:'verified-mobile-subject' as const,subjectHmac:'a'.repeat(64),authorityDigest:'b'.repeat(64),verifiedAt:1000,verifiedAtIso:'1970-01-01T00:00:01.000Z',givenName:options.missingNames?null:'Alice',surname:'Andersson',expiresAt:301000,epoch:'st244-mobile-private-v1' as const,manifestHash:'c'.repeat(64)};
 const query=vi.fn(async(sql:string,values?:unknown[])=>{
  queries.push({sql,values});const q=(command:string,rows:Record<string,unknown>[]=[],rowCount=rows.length)=>({command,rows,rowCount});
  if(sql.startsWith('SELECT session_user'))return q('SELECT',[{login:'subtrack_dev_auth_login',role:'subtrack_dev_auth_login',db:'st237_private_https_profile',one:'',two:''}]);if(sql.includes('pg_catalog.pg_roles'))return q('SELECT',[{n:'4'}]);
  if(sql==='COMMIT'){committed++;if(pendingProofDelete){proofPresent=false;pendingProofDelete=false;}if((options.commitUnknown&&committed===2)||(options.admissionUnknown&&committed===3)||(options.mutationUnknown&&committed===4))throw new Error('unknown');return q('COMMIT');}if(sql==='ROLLBACK'){pendingProofDelete=false;return q('ROLLBACK');}if(sql.startsWith('BEGIN'))return q('BEGIN');if(sql.startsWith('SET'))return q('SET');if(sql.startsWith('UPDATE st244_mobile.epoch'))return q('UPDATE',[{now:'1000'}]);
  if(sql.includes('pg_advisory')||sql.includes('set_config'))return q('SELECT',[{}]);
  if(sql.startsWith('SELECT count'))return q('SELECT',[{n:options.capacityStage&&sql.includes(options.capacityStage)?'10000':options.capacity??'0'}]);
  if(sql.startsWith('SELECT identity_id::text')&&options.badRead)return q('SELECT',[],2);
  if(sql.startsWith('SELECT identity_id::text'))return q('SELECT',options.missingProof||(options.trackProof&&!proofPresent)?[]:[{identity_id:ID,subject_h:binding.subjectHmac,authority_h:binding.authorityDigest,epoch:binding.epoch,manifest_h:binding.manifestHash,verified_ms:'1000',expires_ms:'301000'}]);
  if(sql.includes('FROM public.identity')&&sql.includes('deleted_at'))return q('SELECT',[{id:(values?.[0] as string)}]);
  if(sql.includes('FROM public.identity')&&sql.includes('WHERE id='))return q('SELECT',options.subjectMismatch?[]:[{id:ID}]);
  if(sql.includes('FROM public.identity'))return q('SELECT',options.multipleOwners?[{id:ID},{id:SID}]:options.existing?[{id:ID}]:[]);
  if(sql.startsWith('DELETE FROM st244_mobile.login_proof')&&sql.includes('RETURNING')){if(options.badConsume)return q('DELETE',[],2);if(options.foreignConsume)return q('DELETE',[{identity_id:SID}]);if(options.consumeLost||(options.trackProof&&!proofPresent))return q('DELETE',[]);pendingProofDelete=true;return q('DELETE',[{identity_id:ID}]);}
  if(sql.startsWith('DELETE'))return q('DELETE');
  if(sql.startsWith('INSERT'))return q('INSERT',[],options.insertFault&&sql.includes(options.insertFault)?0:sql.includes('reservation')&&options.badReservation?2:sql.includes('reservation')&&options.duplicate?0:1);
  throw new Error(`Unexpected ${sql}`);
 });
 const client={query,release} as unknown as PoolClient;const tokens={verify:vi.fn(),issue:vi.fn(()=>{if(committed<1)throw new Error('reserve was not committed');return 'fresh-access';})} as unknown as V2AccessToken;
 const authority=new DurablePrivateMobileAuthority({connect:async()=>client} as unknown as Pick<Pool,'connect'>,tokens,()=>1000,binding.manifestHash,{},true);
 const subjects={verify:vi.fn(async()=>binding),validate:vi.fn(),fromStoredProof:vi.fn(()=>binding),keyDigest:vi.fn(()=> 'd'.repeat(64)),reserveInput:vi.fn(()=>({keyDigest:'d'.repeat(64),requestDigest:'e'.repeat(64),binding}))} as unknown as PrivateMobileSubjectVerifier;
 const admission={consume:vi.fn(async()=>({identifierHash:'f'.repeat(64),channel:'sms'}))} as unknown as PrivateMobileEnrollmentAdmission;
 return {sessions:new DurablePrivateMobileSessions(authority,subjects,admission,tokens),restart:()=>new DurablePrivateMobileSessions(authority,subjects,admission,tokens),queries,query,release,subjects,admission,tokens};
}
describe('durable verified account/session bootstrap and login',()=>{
 it('consumes real admission before fresh verifier and atomic account/profile/contact/session creation with trusted identity fields',async()=>{
  const f=bootstrapFixture();const result=await f.sessions.complete(`v2.${'a'.repeat(43)}`,'en',KEY);expect('accessToken'in result).toBe(true);
  expect(vi.mocked(f.admission.consume).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.subjects.verify).mock.invocationCallOrder[0]!);
  const birth=f.queries.find(q=>q.sql.startsWith('INSERT INTO public.identity'));expect(birth?.values?.slice(1)).toEqual(['a'.repeat(64),'1970-01-01T00:00:01.000Z','Alice','Andersson']);
  expect(f.queries.some(q=>q.sql.startsWith('INSERT INTO public.identity_profile'))).toBe(true);const contactIndex=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO st244_mobile.verified_contact'));expect(contactIndex).toBeGreaterThan(0);const priorRoles=f.queries.slice(0,contactIndex).filter(q=>q.sql.startsWith('SET LOCAL ROLE'));expect(priorRoles.at(-1)?.sql).toBe('SET LOCAL ROLE subtrack_runtime');const maintenanceIndex=f.queries.findIndex(q=>q.sql.startsWith('DELETE FROM st244_mobile.session'));expect(maintenanceIndex).toBeGreaterThan(contactIndex);expect(f.queries.slice(contactIndex,maintenanceIndex).filter(q=>q.sql.startsWith('SET LOCAL ROLE')).at(-1)?.sql).toBe('SET LOCAL ROLE subtrack_auth_producer');const sessionIndex=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO st244_mobile.session'));expect(f.queries.slice(maintenanceIndex,sessionIndex).filter(q=>q.sql.startsWith('SET LOCAL ROLE')).at(-1)?.sql).toBe('SET LOCAL ROLE subtrack_runtime');expect(f.queries.filter(q=>q.sql==='COMMIT')).toHaveLength(2);
 });
 it('existing active subject requires fresh login without birth/contact relink/new session',async()=>{const f=bootstrapFixture({existing:true});expect(await f.sessions.complete(`v2.${'a'.repeat(43)}`,'en',KEY)).toEqual({loginRequired:true});expect(f.queries.some(q=>q.sql.startsWith('INSERT INTO public.identity')||q.sql.startsWith('INSERT INTO st244_mobile.verified_contact')||q.sql.startsWith('INSERT INTO st244_mobile.session'))).toBe(false);});
 it('duplicate verified-subject reservation is409 after known commit before account work',async()=>{const f=bootstrapFixture({duplicate:true});await expect(f.sessions.complete(`v2.${'a'.repeat(43)}`,'en',KEY)).rejects.toThrow('AUTH_RESTART_REQUIRED');expect(f.queries.filter(q=>q.sql==='COMMIT')).toHaveLength(1);expect(f.queries.some(q=>q.sql.includes('FROM public.identity'))).toBe(false);});
 it('fresh login persists certified proof before disclosure and uses same canonical owner',async()=>{const f=bootstrapFixture({existing:true});const proof=await f.sessions.verifyLogin('alice',KEY);expect(proof.loginProof).toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);const saved=f.queries.find(q=>q.sql.startsWith('INSERT INTO st244_mobile.login_proof'));expect(saved?.values?.[1]).toBe(ID);expect(saved?.values).not.toContain(proof.loginProof);expect(f.queries.filter(q=>q.sql==='COMMIT')).toHaveLength(2);});
 it('durable certified proof is consumed in known admission before separate session creation',async()=>{const f=bootstrapFixture({existing:true});const value=await f.sessions.session(`v2.${'a'.repeat(43)}`,KEY);expect(value.transport).toBe('mobile');const consume=f.queries.findIndex(q=>q.sql.includes('login_proof')&&q.sql.includes('RETURNING'));const mint=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO st244_mobile.session'));expect(consume).toBeLessThan(mint);expect(f.queries.slice(consume+1,mint).some(q=>q.sql==='COMMIT')).toBe(true);expect(f.queries.filter(q=>q.sql==='COMMIT')).toHaveLength(4);expect(f.subjects.fromStoredProof).toHaveBeenCalled();});
 for(const options of [{missingProof:true},{consumeLost:true}])it(`denies absent/consumed durable login proof ${JSON.stringify(options)}`,async()=>{const f=bootstrapFixture(options);await expect(f.sessions.session(`v2.${'a'.repeat(43)}`,KEY)).rejects.toThrow('AUTH_RESTART_REQUIRED');expect(f.queries.some(q=>q.sql.startsWith('INSERT INTO st244_mobile.session'))).toBe(false);});
 for(const insertFault of ['public.identity(','identity_profile','verified_contact','st244_mobile.session'])it(`rolls back ${insertFault} mutation failure without credentials`,async()=>{const f=bootstrapFixture({insertFault});await expect(f.sessions.complete(`v2.${'a'.repeat(43)}`,'en',KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.queries.filter(q=>q.sql==='COMMIT')).toHaveLength(1);expect(f.queries.some(q=>q.sql==='ROLLBACK')).toBe(true);});
 it('unknown bootstrap COMMIT discloses nothing and performs no destructive compensation',async()=>{const f=bootstrapFixture({commitUnknown:true});await expect(f.sessions.complete(`v2.${'a'.repeat(43)}`,'en',KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.queries.some(q=>q.sql==='ROLLBACK'||q.sql.startsWith('DELETE FROM public.identity'))).toBe(false);expect(f.release).toHaveBeenCalledWith(expect.any(Error));});
 it.each(['10000','bad'])('bounded reservation capacity %s denies before account work',async capacity=>{const f=bootstrapFixture({capacity});await expect(f.sessions.complete(`v2.${'a'.repeat(43)}`,'en',KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.queries.some(q=>q.sql.includes('FROM public.identity'))).toBe(false);});
 it('malformed login proof cannot touch storage',async()=>{const f=bootstrapFixture();await expect(f.sessions.session('bad',KEY)).rejects.toThrow('AUTH_RESTART_REQUIRED');expect(f.query).not.toHaveBeenCalled();});
});

describe('bootstrap capacity/provenance recovery boundaries',()=>{
 it('invalid token issuer cannot create an engine',()=>{const f=bootstrapFixture();expect(()=>new DurablePrivateMobileSessions({} as DurablePrivateMobileAuthority,f.subjects,f.admission,{} as V2AccessToken)).toThrow();});
 for(const options of [{multipleOwners:true},{missingNames:true},{badReservation:true},{capacityStage:'session'}])it(`completion rejects corrupt authority/storage ${JSON.stringify(options)}`,async()=>{const f=bootstrapFixture(options);await expect(f.sessions.complete(`v2.${'a'.repeat(43)}`,'en',KEY)).rejects.toThrow('Mobile authority unavailable');});
 for(const options of [{existing:false},{existing:true,capacityStage:'login_proof'},{existing:true,insertFault:'st244_mobile.login_proof'}])it(`fresh login rejects absent owner/capacity/save ${JSON.stringify(options)}`,async()=>{const f=bootstrapFixture(options);await expect(f.sessions.verifyLogin('alice',KEY)).rejects.toThrow('Mobile authority unavailable');});
 it('session proof subject mismatch cannot mint credentials',async()=>{const f=bootstrapFixture({subjectMismatch:true});await expect(f.sessions.session(`v2.${'a'.repeat(43)}`,KEY)).rejects.toThrow('Mobile authority unavailable');});
});

describe('irreversible durable login proof admission before uncertain session mutation',()=>{
 for(const options of [{insertFault:'st244_mobile.session'},{mutationUnknown:true}])it(`old proof/new key fails immediately and after graph restart following ${JSON.stringify(options)}`,async()=>{
  const f=bootstrapFixture({existing:true,trackProof:true,...options}),proof=`v2.${'a'.repeat(43)}`;
  await expect(f.sessions.session(proof,KEY)).rejects.toThrow('Mobile authority unavailable');
  const attempts=f.queries.filter(q=>q.sql.startsWith('INSERT INTO st244_mobile.session')).length;
  await expect(f.sessions.session(proof,'private-new-key-0002')).rejects.toThrow('AUTH_RESTART_REQUIRED');
  await expect(f.restart().session(proof,'private-new-key-0003')).rejects.toThrow('AUTH_RESTART_REQUIRED');
  expect(f.queries.filter(q=>q.sql.startsWith('INSERT INTO st244_mobile.session'))).toHaveLength(attempts);
  const consumed=f.queries.findIndex(q=>q.sql.startsWith('DELETE FROM st244_mobile.login_proof')&&q.sql.includes('RETURNING'));
  const mutation=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO st244_mobile.session'));expect(f.queries.slice(consumed+1,mutation).some(q=>q.sql==='COMMIT')).toBe(true);
 });
 it('uncertain proof admission discloses no credentials and never reaches session mint',async()=>{const f=bootstrapFixture({existing:true,trackProof:true,admissionUnknown:true});await expect(f.sessions.session(`v2.${'a'.repeat(43)}`,KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.tokens.issue).not.toHaveBeenCalled();expect(f.queries.some(q=>q.sql.startsWith('INSERT INTO st244_mobile.session'))).toBe(false);await expect(f.restart().session(`v2.${'a'.repeat(43)}`,'private-new-key-0004')).rejects.toThrow('AUTH_RESTART_REQUIRED');});
});

describe('certified proof admission result integrity',()=>{
 for(const options of [{badRead:true},{badConsume:true},{foreignConsume:true}])it(`masks corrupt PG admission result ${JSON.stringify(options)} before mint`,async()=>{const f=bootstrapFixture({existing:true,...options});await expect(f.sessions.session(`v2.${'a'.repeat(43)}`,KEY)).rejects.toThrow('Mobile authority unavailable');expect(f.tokens.issue).not.toHaveBeenCalled();});
 it('matches exact certified subject/authority/epoch/manifest and both time boundaries at admission',async()=>{const f=bootstrapFixture({existing:true});await f.sessions.session(`v2.${'a'.repeat(43)}`,KEY);const admitted=f.queries.find(q=>q.sql.startsWith('DELETE FROM st244_mobile.login_proof')&&q.sql.includes('RETURNING'));expect(admitted?.values?.slice(1)).toEqual([ID,'b'.repeat(64),1000,'a'.repeat(64),'st244-mobile-private-v1','c'.repeat(64),1000,301000]);});
});
