import React from 'react';
import {act,render} from '@testing-library/react-native';
import {ProductionOnboardingProvider,SandboxOnboardingProvider,useOnboarding,type OnboardingAdapter} from './OnboardingAdapter';
let mockPath='/register',mockSelected=true;const mockStart=jest.fn(),mockVerify=jest.fn(),mockResend=jest.fn(),mockReset=jest.fn(),mockComplete=jest.fn(),mockLogin=jest.fn(),mockBootstrap=jest.fn(),mockLogout=jest.fn();
let mockResumable=false,mockAvailable=true,mockFlow:Record<string,unknown>={phase:'bankid',proof:'private-test-proof'};
jest.mock('expo-router',()=>({usePathname:()=>mockPath}));
jest.mock('./SandboxSession',()=>({sandboxBuildSelected:()=>mockSelected,useSandboxSession:()=>({available:mockAvailable,phase:'verification-required',resumable:mockResumable,bootstrap:mockBootstrap,login:mockLogin,logout:mockLogout})}));
jest.mock('./NativeSession',()=>({useNativeSession:()=>({phase:'active',complete:mockComplete,login:mockLogin,logout:mockLogout})}));
jest.mock('./EnrollmentFlow',()=>({useEnrollment:()=>({flow:mockFlow,start:mockStart,verify:mockVerify,resend:mockResend,reset:mockReset})}));
let adapter:OnboardingAdapter;function Consumer(){adapter=useOnboarding();return null;}
beforeEach(()=>{jest.clearAllMocks();mockPath='/register';mockSelected=true;mockAvailable=true;mockResumable=false;mockFlow={phase:'bankid',proof:'private-test-proof'};});
it('production closes only the real proof privately and preserves native operations',async()=>{
 render(<ProductionOnboardingProvider><Consumer/></ProductionOnboardingProvider>);expect(adapter.flow).toEqual({phase:'bankid'});expect(JSON.stringify(adapter)).not.toContain('private-test-proof');await expect(adapter.complete('sv')).resolves.toBe('production-session-ready');expect(mockComplete).toHaveBeenCalledWith('private-test-proof','sv');await adapter.login('en');expect(mockLogin).toHaveBeenCalledWith();adapter.reset();expect(mockReset).toHaveBeenCalled();expect(mockBootstrap).not.toHaveBeenCalled();
});
it.each([false,true])('sandbox confirmation alone invokes existing installation establishment resumable=%s',async resumable=>{
 mockResumable=resumable;render(<SandboxOnboardingProvider><Consumer/></SandboxOnboardingProvider>);await act(async()=>{await adapter.start({valid:true,channel:'email',identifier:'synthetic@example.test'});await adapter.verify('000000');});expect(mockStart).not.toHaveBeenCalled();expect(mockVerify).not.toHaveBeenCalled();expect(mockBootstrap).not.toHaveBeenCalled();expect(mockLogin).not.toHaveBeenCalled();await act(async()=>{await expect(adapter.complete('sv')).resolves.toBe('sandbox-session-ready');});expect(resumable?mockLogin:mockBootstrap).toHaveBeenCalledTimes(1);if(!resumable)expect(mockBootstrap).toHaveBeenCalledWith('sv');expect(mockComplete).not.toHaveBeenCalled();
});
it('sandbox login and back do not establish authority, wrong markers stay closed',async()=>{
 const view=render(<SandboxOnboardingProvider><Consumer/></SandboxOnboardingProvider>);await act(async()=>{await adapter.login('en');});expect(adapter.flow.phase).toBe('bankid');expect(mockLogin).not.toHaveBeenCalled();mockPath='/register-bankid';view.rerender(<SandboxOnboardingProvider><Consumer/></SandboxOnboardingProvider>);mockPath='/register-otp';view.rerender(<SandboxOnboardingProvider><Consumer/></SandboxOnboardingProvider>);expect(adapter.flow.phase).toBe('identifier');for(const [selected,available] of [[false,true],[true,false]] as const){mockSelected=selected;mockAvailable=available;view.rerender(<SandboxOnboardingProvider><Consumer/></SandboxOnboardingProvider>);await expect(adapter.login('en')).rejects.toThrow();await expect(adapter.complete('en')).rejects.toThrow();}expect(mockBootstrap).not.toHaveBeenCalled();expect(mockComplete).not.toHaveBeenCalled();
});
it('unmount fences pending sandbox completion and does not destroy persisted installation identity',async()=>{
 let finish!:()=>void;mockBootstrap.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));const view=render(<SandboxOnboardingProvider><Consumer/></SandboxOnboardingProvider>);await act(async()=>{await adapter.login('en');});let pending!:ReturnType<OnboardingAdapter['complete']>;act(()=>{pending=adapter.complete('en');});view.unmount();finish();await expect(pending).rejects.toThrow();expect(mockLogout).not.toHaveBeenCalled();
});
