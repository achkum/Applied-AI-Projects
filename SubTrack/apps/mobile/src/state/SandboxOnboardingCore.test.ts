import {SandboxOnboardingCore} from './SandboxOnboardingCore';
const identifier={valid:true as const,channel:'email' as const,identifier:'synthetic@example.test'};
it('creates the isolated sandbox session directly without retaining contact or simulating verification',async()=>{
 const changed=jest.fn(),core=new SandboxOnboardingCore(changed),establish=jest.fn().mockResolvedValue(undefined);
 await core.register(identifier,establish);expect(establish).toHaveBeenCalledTimes(1);
 expect(changed.mock.calls.map(([flow])=>flow.phase)).toEqual(['starting','identifier']);
 expect(JSON.stringify(changed.mock.calls)).not.toContain(identifier.identifier);
 await expect(core.register({...identifier,identifier:'invalid'},establish)).rejects.toThrow();expect(establish).toHaveBeenCalledTimes(1);
});
it('fences reset and delayed login, rejects double entry and allows retry after failure',async()=>{
 const changed=jest.fn(),core=new SandboxOnboardingCore(changed);let finish!:()=>void;
 const pending=core.login(()=>new Promise<void>(resolve=>{finish=resolve;}));await expect(core.login(jest.fn())).rejects.toThrow();
 core.reset();finish();await expect(pending).rejects.toThrow();expect(changed).toHaveBeenLastCalledWith({phase:'identifier'});
 await expect(core.login(async()=>{throw Error('private');})).rejects.toThrow('Sandbox session unavailable');expect(changed).toHaveBeenLastCalledWith({phase:'identifier',error:'restart'});
 await expect(core.login(async()=>undefined)).resolves.toBe('sandbox-session-ready');
});
