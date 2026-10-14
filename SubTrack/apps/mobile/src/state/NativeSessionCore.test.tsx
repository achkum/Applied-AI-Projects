import { NativeSessionCore, NativeSessionError } from './NativeSessionCore';
import { NativeStorageError, type NativeBundleStore } from '@/utils/secureSessionBundle';
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
const session = { transport: 'mobile' as const, sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: 'v2r.' + 'a'.repeat(43) };
function fixture() {
  const store: jest.Mocked<NativeBundleStore> = { read: jest.fn().mockResolvedValue(session), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  const changed = jest.fn(); return { store, changed, core: new NativeSessionCore(store, changed) };
}
it('never authenticates automatically from an old bundle, including after a failed offline logout delete', async () => {
  const { store, changed, core } = fixture(); await core.establish(async () => session);
  store.clear.mockRejectedValueOnce(new NativeStorageError());
  const logout = core.logout(); expect(changed).toHaveBeenLastCalledWith('verification-required');
  await expect(logout).rejects.toBeInstanceOf(NativeStorageError);
  const restarted = new NativeSessionCore(store, changed); await restarted.initialize();
  expect(changed).toHaveBeenLastCalledWith('verification-required');
  await expect(restarted.run(async () => 'private')).rejects.toBeInstanceOf(NativeSessionError);
});
it('ignores a delayed verifier response after logout without writing or exposing its credentials', async () => {
  const { core, store, changed } = fixture(); let resolve: (value: typeof session) => void = () => undefined;
  const login = core.establish(() => new Promise(done => { resolve = done; }));
  await Promise.resolve(); await Promise.resolve();
  const logout = core.logout(); resolve(session); await login; await logout;
  expect(store.write).not.toHaveBeenCalled(); expect(changed).toHaveBeenLastCalledWith('verification-required');
});
it('rotates the pair once and never retries a refresh after an unknown result', async () => {
  const { core, store } = fixture(); await core.establish(async () => session);
  const refresh = jest.fn().mockRejectedValue(new Error('lost response'));
  await expect(core.rotate(refresh)).rejects.toBeInstanceOf(NativeSessionError);
  await expect(core.rotate(refresh)).rejects.toBeInstanceOf(NativeSessionError);
  expect(refresh).toHaveBeenCalledTimes(1); expect(store.clear).toHaveBeenCalledTimes(2);
});
it('does not publish a rotated pair until the atomic secure write succeeds', async () => {
  const { core, store, changed } = fixture(); await core.establish(async () => session);
  store.write.mockRejectedValueOnce(new NativeStorageError());
  await expect(core.rotate(async () => ({ ...session, accessToken: 'new.payload.signature', refreshToken: 'v2r.' + 'b'.repeat(43) }))).rejects.toBeInstanceOf(NativeStorageError);
  expect(changed).toHaveBeenLastCalledWith('storage-error');
  await expect(core.run(async () => true)).rejects.toBeInstanceOf(NativeSessionError);
});

it('serializes successful refreshes using each newly stored pair rather than a consumed secret',async()=>{
  const {core,store}=fixture();await core.establish(async()=>session);
  const second={...session,accessToken:'second.payload.signature',refreshToken:'v2r.'+'b'.repeat(43)};
  const third={...session,accessToken:'third.payload.signature',refreshToken:'v2r.'+'c'.repeat(43)};
  const refresh=jest.fn().mockResolvedValueOnce(second).mockResolvedValueOnce(third);
  await Promise.all([core.rotate(refresh),core.rotate(refresh)]);
  expect(refresh.mock.calls.map(([credentials])=>credentials.refreshToken)).toEqual([session.refreshToken,second.refreshToken]);
  expect(store.write).toHaveBeenLastCalledWith(third);expect(await core.run(async token=>token)).toBe(third.accessToken);
});
it('reports acknowledged server revocation only after local retirement and successful revoke',async()=>{
  const {core,store}=fixture();await core.establish(async()=>session);
  const revoke=jest.fn(async()=>{expect(store.clear).toHaveBeenCalledTimes(2);});
  expect(await core.logout(revoke)).toBe(true);expect(revoke).toHaveBeenCalledTimes(1);
  await expect(core.run(async()=>true)).rejects.toBeInstanceOf(NativeSessionError);
});
it('ignores a late protected result after logout instead of returning private data',async()=>{
  const {core}=fixture();await core.establish(async()=>session);let resolve:(value:string)=>void=()=>undefined;
  const read=core.run(()=>new Promise<string>(done=>{resolve=done;}));await Promise.resolve();
  const logout=core.logout();resolve('private current data');await expect(read).rejects.toBeInstanceOf(NativeSessionError);await logout;
});
it('masks malformed/read storage failures and best-effort retires the item without restoring authority',async()=>{
  const {core,store,changed}=fixture();store.read.mockRejectedValueOnce(new Error('private storage details'));
  await expect(core.initialize()).rejects.toEqual(new NativeStorageError());expect(store.clear).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenLastCalledWith('storage-error');await expect(core.run(async()=>true)).rejects.toBeInstanceOf(NativeSessionError);
});

it.each(['establish','rotate'] as const)('retires a late atomic write after logout during %s',async operation=>{
  const {core,store}=fixture();await core.establish(async()=>session);
  let writing:()=>void=()=>undefined,finish:()=>void=()=>undefined;
  const started=new Promise<void>(done=>{writing=done;});
  store.write.mockImplementationOnce(()=>{writing();return new Promise<void>(done=>{finish=done;});});
  const next={...session,accessToken:'next.payload.signature',refreshToken:'v2r.'+'b'.repeat(43)};
  const pending=operation==='establish'?core.establish(async()=>next):core.rotate(async()=>next);
  await started;const logout=core.logout();finish();await pending;await logout;
  await expect(core.run(async()=>true)).rejects.toBeInstanceOf(NativeSessionError);
});
it.each(['changed-session','reused-refresh','malformed'] as const)('requires verification rather than publishing %s rotation',async kind=>{
  const {core,store}=fixture();await core.establish(async()=>session);
  const next={...session,refreshToken:'v2r.'+'b'.repeat(43),...(kind==='changed-session'?{sessionId:'123e4567-e89b-42d3-a456-426614174001'}:kind==='reused-refresh'?{refreshToken:session.refreshToken}:{accessToken:'invalid'})};
  await expect(core.rotate(async()=>next)).rejects.toBeInstanceOf(kind==='malformed'?NativeStorageError:NativeSessionError);
  expect(store.write).toHaveBeenCalledTimes(1);await expect(core.run(async()=>true)).rejects.toBeInstanceOf(NativeSessionError);
});
it('never transmits an obsolete queued one-use proof when a newer verification replaces it',async()=>{
  const {core}=fixture();const old=jest.fn(async()=>session),current=jest.fn(async()=>session);
  await Promise.all([core.establish(old),core.establish(current)]);expect(old).not.toHaveBeenCalled();expect(current).toHaveBeenCalledTimes(1);
});
it('clears usable credentials and masks a protected request failure',async()=>{
  const {core,changed}=fixture();await core.establish(async()=>session);
  await expect(core.run(async()=>{throw new Error('private server detail');})).rejects.toEqual(new NativeSessionError());
  expect(changed).toHaveBeenLastCalledWith('verification-required');
});
it('does not send revocation without a usable session',async()=>{
  const {core}=fixture();const revoke=jest.fn();expect(await core.logout(revoke)).toBe(false);expect(revoke).not.toHaveBeenCalled();
});

it.each(['network','secure-write'] as const)('requires fresh verification after uncertain initial %s outcome',async failure=>{
  const {core,store,changed}=fixture();if(failure==='secure-write')store.write.mockRejectedValueOnce(new NativeStorageError());
  await expect(core.establish(async()=>{if(failure==='network')throw new Error('private response');return session;})).rejects.toBeInstanceOf(failure==='network'?NativeSessionError:NativeStorageError);
  expect(changed).toHaveBeenLastCalledWith(failure==='network'?'verification-required':'storage-error');
  await expect(core.run(async()=>true)).rejects.toBeInstanceOf(NativeSessionError);
});
it('does not transmit a verifier request after logout while retiring the old item',async()=>{
  const {core,store}=fixture();let started:()=>void=()=>undefined,finish:()=>void=()=>undefined;
  const clearing=new Promise<void>(done=>{started=done;});store.clear.mockImplementationOnce(()=>{started();return new Promise<void>(done=>{finish=done;});});
  const verify=jest.fn(async()=>session);const login=core.establish(verify);await clearing;const logout=core.logout();finish();await login;await logout;expect(verify).not.toHaveBeenCalled();
});
it('ignores a stale initialization failure after logout and does not replace the signed-out state',async()=>{
  const {core,store,changed}=fixture();let started:()=>void=()=>undefined,reject:(error:Error)=>void=()=>undefined;
  const reading=new Promise<void>(done=>{started=done;});store.read.mockImplementationOnce(()=>{started();return new Promise((_,fail)=>{reject=fail;});});
  const initialize=core.initialize();await reading;const logout=core.logout();reject(new Error('old read failed'));await initialize;await logout;
  expect(changed).toHaveBeenLastCalledWith('verification-required');
});
it('ignores a stale initialization result after logout without adopting the old pair',async()=>{
  const {core,store}=fixture();let started:()=>void=()=>undefined,finish:(value:typeof session)=>void=()=>undefined;
  const reading=new Promise<void>(done=>{started=done;});store.read.mockImplementationOnce(()=>{started();return new Promise(done=>{finish=done;});});
  const initialize=core.initialize();await reading;const logout=core.logout();finish(session);await initialize;await logout;
  await expect(core.run(async()=>true)).rejects.toBeInstanceOf(NativeSessionError);
});
it('does not publish a canceled verifier failure and dispose invalidates queued private operations',async()=>{
  const {core}=fixture();let started:()=>void=()=>undefined,reject:(error:Error)=>void=()=>undefined;
  const verifying=new Promise<void>(done=>{started=done;});const login=core.establish(()=>{started();return new Promise((_,fail)=>{reject=fail;});});
  await verifying;core.dispose();reject(new Error('old response failed'));await login;
  await expect(core.run(async()=>true)).rejects.toBeInstanceOf(NativeSessionError);
});
it('never sends a queued refresh or read from a previous login generation',async()=>{
  const {core}=fixture();await core.establish(async()=>session);const refresh=jest.fn(async()=>session),read=jest.fn(async()=>true);
  const rotating=core.rotate(refresh),reading=core.run(read);const login=core.establish(async()=>session);
  await expect(rotating).rejects.toBeInstanceOf(NativeSessionError);await expect(reading).rejects.toBeInstanceOf(NativeSessionError);await login;
  expect(refresh).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
});
it('keeps storage failure closed even if retiring a malformed item also fails',async()=>{
  const {core,store,changed}=fixture();store.read.mockRejectedValueOnce(new NativeStorageError());store.clear.mockRejectedValueOnce(new NativeStorageError());
  await expect(core.initialize()).rejects.toBeInstanceOf(NativeStorageError);expect(changed).toHaveBeenLastCalledWith('storage-error');
});

it.each(['resolved','rejected'] as const)('ignores a %s refresh response after logout before any secure write',async outcome=>{
  const {core,store}=fixture();await core.establish(async()=>session);let started:()=>void=()=>undefined,resolve:(value:typeof session)=>void=()=>undefined,reject:(error:Error)=>void=()=>undefined;
  const refreshing=new Promise<void>(done=>{started=done;});const rotating=core.rotate(()=>{started();return new Promise((done,fail)=>{resolve=done;reject=fail;});});
  await refreshing;const logout=core.logout();if(outcome==='resolved')resolve({...session,refreshToken:'v2r.'+'b'.repeat(43)});else reject(new Error('old refresh failed'));
  await rotating;await logout;expect(store.write).toHaveBeenCalledTimes(1);
});
it('retires only local state when server logout acknowledgement is lost',async()=>{
  const {core}=fixture();await core.establish(async()=>session);const revoke=jest.fn().mockRejectedValue(new Error('lost acknowledgement'));
  expect(await core.logout(revoke)).toBe(false);expect(revoke).toHaveBeenCalledTimes(1);
});
it('does not read an obsolete startup bundle after logout replaced its queued initialization',async()=>{
  const {core,store}=fixture();const initializing=core.initialize(),logout=core.logout();await initializing;await logout;expect(store.read).not.toHaveBeenCalled();
});

describe('generation ownership across asynchronous credential cleanup', () => {
  const cases = (['initialize', 'establish', 'rotate', 'run', 'logout'] as const).flatMap(origin =>
    (['resolved', 'rejected'] as const).flatMap(outcome =>
      (['logout', 'verify', 'dispose'] as const).map(replacement => ({ origin, outcome, replacement }))));
  it.each(cases)('$origin cleanup $outcome cannot publish over $replacement', async ({ origin, outcome, replacement }) => {
    const { core, store, changed } = fixture();
    if (origin === 'rotate' || origin === 'run' || origin === 'logout') await core.establish(async () => session);
    if (origin === 'establish') store.clear.mockResolvedValueOnce(undefined);
    let started: () => void = () => undefined;
    let finish: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const clearing = new Promise<void>(done => { started = done; });
    store.clear.mockImplementationOnce(() => {
      started(); return new Promise<void>((done, reject) => { finish = done; fail = reject; });
    });
    const error = async () => { throw new Error('old operation failure'); };
    const old = origin === 'initialize' ? core.initialize() : origin === 'establish' ? core.establish(error)
      : origin === 'rotate' ? core.rotate(error) : origin === 'run' ? core.run(error) : core.logout();
    const oldSettled = old.catch(() => undefined);
    await clearing;
    let next: Promise<unknown> = Promise.resolve();
    if (replacement === 'logout') next = core.logout();
    else if (replacement === 'verify') next = core.establish(async () => session);
    else core.dispose();
    const afterReplacement = changed.mock.calls.length;
    if (outcome === 'resolved') finish(); else fail(new NativeStorageError());
    await oldSettled; await next;
    const later = changed.mock.calls.slice(afterReplacement).map(([phase]) => phase);
    expect(later).not.toContain('storage-error');
    if (replacement === 'verify') {
      expect(later).toEqual(['active']);
      expect(await core.run(async token => token)).toBe(session.accessToken);
    } else {
      expect(later).toEqual(replacement === 'logout' ? ['verification-required'] : []);
      await expect(core.run(async () => true)).rejects.toBeInstanceOf(NativeSessionError);
    }
  });
  it('does not reject obsolete malformed startup cleanup after a newer verification starts', async () => {
    const { core, store, changed } = fixture(); store.read.mockRejectedValueOnce(new NativeStorageError());
    let started: () => void = () => undefined, fail: (error: Error) => void = () => undefined;
    const clearing = new Promise<void>(done => { started = done; });
    store.clear.mockImplementationOnce(() => { started(); return new Promise<void>((_, reject) => { fail = reject; }); });
    const old = core.initialize(); await clearing;
    const current = core.establish(async () => session); const afterReplacement = changed.mock.calls.length;
    fail(new NativeStorageError()); await expect(old).resolves.toBeUndefined(); await current;
    expect(changed.mock.calls.slice(afterReplacement)).toEqual([['active']]);
  });
});
