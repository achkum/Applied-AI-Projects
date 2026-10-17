import { SandboxSessionCore } from './SandboxSessionCore';
import { SandboxStorageError, type SandboxBundleStore } from '@/utils/secureSandboxBundle';
import type { SandboxMobileApi } from '@/api/sandboxMobileApi';
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
const session = { transport: 'sandbox-mobile' as const, sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: `s250r.${'A'.repeat(43)}`, sessionExpiresAt: 10000 };
const capability = `s250c.${'A'.repeat(43)}`;
function fixture() {
  const store: jest.Mocked<SandboxBundleStore> = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  const api = { bootstrap: jest.fn().mockResolvedValue({ ...session, installationCapability: capability }), resume: jest.fn().mockResolvedValue(session), refresh: jest.fn().mockResolvedValue({ ...session, refreshToken: `s250r.${'Q'.repeat(42)}A` }), logout: jest.fn().mockResolvedValue(undefined) };
  const changed = jest.fn(), core = new SandboxSessionCore(store, api as unknown as SandboxMobileApi, changed); return { core, store, api, changed };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
it('does not automatically create a workspace; explicit bootstrap persists before active', async () => {
  const f = fixture(); await f.core.initialize(); expect(f.api.bootstrap).not.toHaveBeenCalled(); await f.core.bootstrap('sv');
  expect(f.store.write).toHaveBeenLastCalledWith({ version: 1, installationCapability: capability, session }); expect(f.changed).toHaveBeenLastCalledWith('active', true);
  expect(await f.core.run(async () => 7)).toBe(7); await expect(f.core.bootstrap('en')).rejects.toThrow();
});
it('restart resumes durable possession once rather than reusing stored access', async () => {
  const f = fixture(); f.store.read.mockResolvedValue({ version: 1, installationCapability: capability, session }); await f.core.initialize(); expect(f.api.resume).toHaveBeenCalledWith(capability, expect.anything()); expect(f.api.bootstrap).not.toHaveBeenCalled();
});
it('unknown mutation retires session, persists capability-only and requires explicit resume', async () => {
  const f = fixture(); await f.core.bootstrap('en'); await expect(f.core.run(async () => { throw Error('uncertain'); })).rejects.toThrow();
  expect(f.store.write).toHaveBeenLastCalledWith({ version: 1, installationCapability: capability, session: null }); await expect(f.core.run(async () => 1)).rejects.toThrow();
  expect(f.api.resume).not.toHaveBeenCalled(); await f.core.resume(); expect(f.changed).toHaveBeenLastCalledWith('active', true);
});
it('refresh rotates once and uncertainty permits explicit capability resume without retry', async () => {
  const f = fixture(); await expect(f.core.refresh()).rejects.toThrow(); await f.core.bootstrap('en'); await f.core.refresh(); expect(f.api.refresh).toHaveBeenCalledTimes(1);
  f.api.refresh.mockRejectedValue(Error('unknown')); await expect(f.core.refresh()).rejects.toThrow(); expect(f.changed).toHaveBeenLastCalledWith('verification-required', true); await f.core.resume();
});
it('same refresh or changed session is rejected before storing authority', async () => {
  for (const returned of [session, { ...session, sessionId: '223e4567-e89b-42d3-a456-426614174000' }]) { const f = fixture(); await f.core.bootstrap('en'); f.api.refresh.mockResolvedValue(returned); await expect(f.core.refresh()).rejects.toThrow(); expect(f.changed).toHaveBeenLastCalledWith('verification-required', true); }
});
it('logout waits for an already-started write then clears it, preventing late capability resurrection', async () => {
  const f = fixture(), pending = deferred<void>(); f.store.write.mockImplementationOnce(() => pending.promise);
  const boot = f.core.bootstrap('en'); await Promise.resolve(); await Promise.resolve(); const logout = f.core.logout(); expect(f.changed).toHaveBeenLastCalledWith('verification-required', false);
  pending.resolve(); await boot; expect(await logout).toBe(true); expect(f.api.logout).toHaveBeenCalledTimes(1); expect(f.api.logout).toHaveBeenCalledWith(session,expect.anything()); expect(f.store.clear).toHaveBeenCalledTimes(1); expect(f.changed).not.toHaveBeenLastCalledWith('active', true); await expect(f.core.resume()).rejects.toThrow();
});
it('logout immediately aborts work and stale resolved result cannot return or persist authority', async () => {
  const f = fixture(); await f.core.bootstrap('en'); const pending = deferred<number>(); let signal: AbortSignal | undefined;
  const run = f.core.run(async (_token, input) => { signal = input; return pending.promise; }); await Promise.resolve(); const logout = f.core.logout(); expect(signal?.aborted).toBe(true); pending.resolve(3); await expect(run).rejects.toThrow(); expect(await logout).toBe(true);
});
it('failed local logout clear still revokes captured server session and remains storage-error', async () => {
  const f = fixture(); await f.core.bootstrap('en'); f.store.clear.mockRejectedValue(Error('OS')); await expect(f.core.logout()).rejects.toThrow(SandboxStorageError); expect(f.api.logout).toHaveBeenCalledTimes(1); expect(f.changed).toHaveBeenLastCalledWith('storage-error', false); await expect(f.core.bootstrap('en')).rejects.toThrow();
});
it('server logout uncertainty clears local storage without claiming acknowledgment', async () => {
  const f = fixture(); await f.core.bootstrap('en'); f.api.logout.mockRejectedValue(Error('unknown')); expect(await f.core.logout()).toBe(false); expect(f.store.clear).toHaveBeenCalled();
});
it('initial read and persistent write failures block process credentials', async () => {
  const f = fixture(); f.store.read.mockRejectedValue(Error('OS')); await expect(f.core.initialize()).rejects.toThrow(SandboxStorageError); expect(f.changed).toHaveBeenLastCalledWith('storage-error', false); await expect(f.core.run(async () => 1)).rejects.toThrow();
  const g = fixture(); g.store.write.mockRejectedValue(Error('OS')); await expect(g.core.bootstrap('en')).rejects.toThrow(SandboxStorageError); expect(g.changed.mock.calls[g.changed.mock.calls.length-1]?.[0]).toBe('storage-error');
});
it('missing resume and disposed or queued obsolete operations never disclose authority', async () => {
  const f = fixture(); await expect(f.core.resume()).rejects.toThrow(); const boot = f.core.bootstrap('en'); f.core.dispose(); await boot; expect(f.api.bootstrap).not.toHaveBeenCalled();
  const init = f.core.initialize(); f.core.dispose(); await init; expect(f.store.read).not.toHaveBeenCalled();
});
it.each(['initialize-read','initialize-resume','initialize-write','bootstrap-response','bootstrap-write','resume-response','resume-write','refresh-response','refresh-write'])('logout fences %s before authority can become active',async point=>{
 const f=fixture();let started!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve;});let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 if(point.startsWith('resume')||point.startsWith('refresh'))await f.core.bootstrap('en');
 if(point.startsWith('initialize'))f.store.read.mockResolvedValue({version:1,installationCapability:capability,session});
 if(point==='initialize-read')f.store.read.mockImplementationOnce(async()=>{started();await gate;return{version:1,installationCapability:capability,session};});
 else if(point.endsWith('-write'))f.store.write.mockImplementationOnce(async()=>{started();await gate;});
 else if(point==='bootstrap-response')f.api.bootstrap.mockImplementationOnce(async()=>{started();await gate;return{...session,installationCapability:capability};});
 else if(point==='refresh-response')f.api.refresh.mockImplementationOnce(async()=>{started();await gate;return{...session,refreshToken:`s250r.${'Q'.repeat(42)}A`};});
 else f.api.resume.mockImplementationOnce(async()=>{started();await gate;return session;});
 const pending=point.startsWith('initialize')?f.core.initialize():point.startsWith('bootstrap')?f.core.bootstrap('en'):point.startsWith('resume')?f.core.resume():f.core.refresh();
 await entered;const logout=f.core.logout();release();await pending;await logout;expect(f.changed).toHaveBeenLastCalledWith('verification-required',false);await expect(f.core.run(async()=>1)).rejects.toThrow();expect(f.store.clear).toHaveBeenCalled();
});
it.each(['initialize','bootstrap','resume','refresh'] as const)('unknown %s admission/rotation withholds process credentials',async operation=>{
 const f=fixture();if(operation==='resume'||operation==='refresh')await f.core.bootstrap('en');if(operation==='initialize')f.store.read.mockResolvedValue({version:1,installationCapability:capability,session});
 const method=operation==='initialize'?'resume':operation;f.api[method].mockRejectedValueOnce(Error('unknown'));
 await expect(operation==='initialize'?f.core.initialize():operation==='bootstrap'?f.core.bootstrap('en'):operation==='resume'?f.core.resume():f.core.refresh()).rejects.toThrow();expect(f.changed.mock.calls[f.changed.mock.calls.length-1]?.[0]).toBe('verification-required');await expect(f.core.run(async()=>1)).rejects.toThrow();
});
it.each(['resume','refresh','bootstrap'])('OS write error on %s retires credential and blocks process use',async operation=>{
 const f=fixture();if(operation!=='bootstrap')await f.core.bootstrap('en');f.store.write.mockRejectedValueOnce(Error('OS'));
 await expect(operation==='bootstrap'?f.core.bootstrap('en'):operation==='resume'?f.core.resume():f.core.refresh()).rejects.toThrow(SandboxStorageError);expect(f.changed.mock.calls[f.changed.mock.calls.length-1]?.[0]).toBe('storage-error');
});
it('logout waits for uncertainty retirement writes and silent disposed UI cannot be revived by their failure',async()=>{
 const f=fixture();await f.core.bootstrap('en');let enter!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;});let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 f.store.write.mockImplementationOnce(async()=>{enter();await gate;});const failed=f.core.run(async()=>{throw Error('unknown');});await entered;const logout=f.core.logout();release();await expect(failed).rejects.toThrow();await logout;expect(f.changed).toHaveBeenLastCalledWith('verification-required',false);
 const g=fixture();await g.core.bootstrap('en');let reject!:()=>void;const pending=new Promise<void>((_resolve,no)=>{reject=()=>no(Error('OS'));});g.store.clear.mockImplementationOnce(()=>pending);const stopped=g.core.logout();await Promise.resolve();g.core.dispose();reject();await expect(stopped).rejects.toThrow(SandboxStorageError);expect(g.changed).toHaveBeenLastCalledWith('storage-error',false);
});
it('queued resume/refresh and rejected obsolete admissions cannot bypass logout generation',async()=>{
 const f=fixture();await f.core.bootstrap('en');const resume=f.core.resume(),logout=f.core.logout();await resume;await logout;expect(f.api.resume).not.toHaveBeenCalled();
 const g=fixture();await g.core.bootstrap('en');const refresh=g.core.refresh(),out=g.core.logout();await expect(refresh).rejects.toThrow();await out;expect(g.api.refresh).not.toHaveBeenCalled();
 for(const operation of ['initialize','bootstrap','resume','refresh'] as const){const h=fixture();if(operation==='resume'||operation==='refresh')await h.core.bootstrap('en');if(operation==='initialize')h.store.read.mockResolvedValue({version:1,installationCapability:capability,session});
  let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let reject!:()=>void;const gate=new Promise<void>((_resolve,no)=>{reject=()=>no(Error('unknown'));});
  const method=operation==='initialize'?'resume':operation;h.api[method].mockImplementationOnce(async()=>{entered();await gate;return{...session,installationCapability:capability};});
  const task=operation==='initialize'?h.core.initialize():operation==='bootstrap'?h.core.bootstrap('en'):operation==='resume'?h.core.resume():h.core.refresh();await started;const quit=h.core.logout();reject();await task;await quit;expect(h.changed).toHaveBeenLastCalledWith('verification-required',false);
 }
});
it('retirement storage failure blocks resume and a stale failed retirement cannot update logout UI',async()=>{
 const f=fixture();await f.core.bootstrap('en');f.store.write.mockRejectedValueOnce(Error('OS'));await expect(f.core.run(async()=>{throw Error('unknown');})).rejects.toThrow(SandboxStorageError);await expect(f.core.resume()).rejects.toThrow();
 const g=fixture();await g.core.bootstrap('en');let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let reject!:()=>void;const gate=new Promise<void>((_resolve,no)=>{reject=()=>no(Error('OS'));});g.store.write.mockImplementationOnce(async()=>{entered();await gate;});const fail=g.core.run(async()=>{throw Error('unknown');});await started;const quit=g.core.logout();reject();await expect(fail).rejects.toThrow();await quit;expect(g.changed).toHaveBeenLastCalledWith('verification-required',false);
});
it.each(['response','write','response-clear-failure','write-clear-failure'])('busy refresh %s retains revocation-only custody until exactly one logout attempt',async point=>{
 const f=fixture();await f.core.bootstrap('en');const rotated={...session,refreshToken:`s250r.${'Q'.repeat(42)}A`};
 let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 if(point.startsWith('response'))f.api.refresh.mockImplementationOnce(async()=>{entered();await gate;return rotated;});
 else f.store.write.mockImplementationOnce(async()=>{entered();await gate;});
 const refresh=f.core.refresh();await started;if(point.endsWith('clear-failure'))f.store.clear.mockRejectedValueOnce(Error('OS'));
 const logout=f.core.logout();release();await refresh;
 if(point.endsWith('clear-failure'))await expect(logout).rejects.toThrow(SandboxStorageError);else expect(await logout).toBe(true);
 expect(f.api.logout).toHaveBeenCalledTimes(1);expect(f.api.logout).toHaveBeenCalledWith(point.startsWith('response')?session:rotated,expect.anything());
 await expect(f.core.run(async()=>1)).rejects.toThrow();await expect(f.core.resume()).rejects.toThrow();await f.core.logout();expect(f.api.logout).toHaveBeenCalledTimes(1);
});
it('retired uncertain mutation still permits best-effort revocation without restoring business authority',async()=>{
 const f=fixture();await f.core.bootstrap('en');await expect(f.core.run(async()=>{throw Error('unknown');})).rejects.toThrow();await expect(f.core.run(async()=>1)).rejects.toThrow();expect(await f.core.logout()).toBe(true);expect(f.api.logout).toHaveBeenCalledWith(session,expect.anything());expect(f.api.logout).toHaveBeenCalledTimes(1);
});
it.each(['bootstrap','resume','initialize'] as const)('failed logout clearing blocks an intervening %s intent independently of generation',async operation=>{
 const f=fixture();await f.core.bootstrap('en');let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let reject!:()=>void;
 const pending=new Promise<void>((_resolve,no)=>{reject=()=>no(Error('OS'));});f.store.clear.mockImplementationOnce(async()=>{entered();await pending;});
 const logout=f.core.logout();await started;const intent=operation==='bootstrap'?f.core.bootstrap('en'):operation==='resume'?f.core.resume():f.core.initialize();
 // Observe rejection immediately so an early missing-capability rejection is not unhandled.
 const intentResult=intent.then(()=>({ok:true as const}),()=>({ok:false as const}));reject();await expect(logout).rejects.toThrow(SandboxStorageError);expect((await intentResult).ok).toBe(false);
 expect(f.api.bootstrap).toHaveBeenCalledTimes(1);expect(f.api.resume).not.toHaveBeenCalled();expect(f.store.read).not.toHaveBeenCalled();expect(f.api.logout).toHaveBeenCalledWith(session,expect.anything());
 expect(f.changed).toHaveBeenLastCalledWith('storage-error',false);await expect(f.core.run(async()=>1)).rejects.toThrow(SandboxStorageError);
 await expect(f.core.initialize()).rejects.toThrow(SandboxStorageError);await expect(f.core.bootstrap('en')).rejects.toThrow(SandboxStorageError);await expect(f.core.resume()).rejects.toThrow(SandboxStorageError);await expect(f.core.refresh()).rejects.toThrow(SandboxStorageError);
});
it('only an acknowledged local secure deletion clears the process storage-failure latch',async()=>{
 const f=fixture();await f.core.bootstrap('en');f.store.clear.mockRejectedValueOnce(Error('OS'));await expect(f.core.logout()).rejects.toThrow(SandboxStorageError);
 f.core.dispose();await expect(f.core.initialize()).rejects.toThrow(SandboxStorageError);expect(f.store.read).not.toHaveBeenCalled();
 expect(await f.core.logout()).toBe(false);expect(f.changed).toHaveBeenLastCalledWith('verification-required',false);await f.core.bootstrap('en');expect(f.api.bootstrap).toHaveBeenCalledTimes(2);expect(f.changed).toHaveBeenLastCalledWith('active',true);
});
it('a known successful clearing permits a newer queued bootstrap without clobbering its busy state',async()=>{
 const f=fixture();await f.core.bootstrap('en');let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});f.store.clear.mockImplementationOnce(async()=>{entered();await gate;});
 const logout=f.core.logout();await started;const next=f.core.bootstrap('sv');release();expect(await logout).toBe(true);await next;expect(f.api.logout).toHaveBeenCalledTimes(1);expect(f.api.bootstrap).toHaveBeenCalledTimes(2);expect(f.changed).toHaveBeenLastCalledWith('active',true);
});
