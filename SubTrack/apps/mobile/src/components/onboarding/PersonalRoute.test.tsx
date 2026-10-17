import {observeStartupStage} from '@/utils/privateRuntimeEnrollmentDiagnostic';
jest.mock('@/utils/privateRuntimeEnrollmentDiagnostic',()=>({observeStartupStage:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
import React from 'react';
import {act,render} from '@testing-library/react-native';
import PersonalRoute from '../../../app/personal';
import WelcomeRoute from '../../../app/welcome';
import IndexRoute from '../../../app/index';
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false)}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
jest.mock('./WelcomeActions',()=>({WelcomeActions:(props:Record<string,unknown>)=>{mockWelcomeProps=props;return null;}}));
let mockWelcomeProps:Record<string,unknown>;
const mockWelcomeLogin=jest.fn();
let mockFocused=true,mockPhase='active';
let mockSandbox=false,mockSetup:undefined|string;const mockReplace=jest.fn();let mockProps:Record<string,unknown>;
jest.mock('expo-router',()=>({useFocusEffect:(effect:()=>void)=>jest.requireActual<typeof import('react')>('react').useEffect(()=>{if(mockFocused)return effect();},[effect,mockFocused]),useRouter:()=>({replace:mockReplace,push:jest.fn()}),useLocalSearchParams:()=>({setup:mockSetup}),Redirect:(props:unknown)=>{mockProps=props as Record<string,unknown>;return null;}}));
jest.mock('@/state/SandboxSession',()=>({sandboxBuildSelected:()=>mockSandbox,useSandboxSession:()=>({phase:'active'})}));
jest.mock('@/state/OnboardingAdapter',()=>({useOnboarding:()=>({sessionPhase:mockPhase,provider:mockSandbox?'sandbox':'production',reset:jest.fn(),login:mockWelcomeLogin})}));
jest.mock('@/api/sandboxMobileApi',()=>({sandboxMobileApi:{sandbox:true}}));
jest.mock('./NativePersonalScreen',()=>({NativePersonalScreen:(props:Record<string,unknown>)=>{mockProps=props;return null;}}));
beforeEach(()=>{jest.clearAllMocks();mockSetup=undefined;mockFocused=true;mockPhase='active';});
it.each([false,true])('same setup route gates handoff on authoritative screen callback sandbox=%s',sandbox=>{
 mockSandbox=sandbox;const view=render(<PersonalRoute/>);expect(mockReplace).not.toHaveBeenCalled();const complete=mockProps.onSetupComplete as (reason:'load'|'mutation')=>void;complete('load');expect(mockReplace).not.toHaveBeenCalled();complete('mutation');expect(mockReplace).toHaveBeenCalledWith('/personal-billing-month');mockReplace.mockClear();mockSetup='1';view.rerender(<PersonalRoute/>);(mockProps.onSetupComplete as typeof complete)('load');expect(mockReplace).toHaveBeenCalledWith('/personal-billing-month');
});
it('completed installation starts through authoritative setup readback, never blind home',()=>{render(<IndexRoute/>);expect(mockProps.href).toEqual({pathname:'/personal',params:{setup:'1'}});});

it('resumed sessions arriving after initial redirect still require authoritative setup before home',()=>{render(<WelcomeRoute/>);expect(mockReplace).toHaveBeenCalledWith({pathname:'/personal',params:{setup:'1'}});});

it.each([false,true])('native welcome keeps the same supported actions and omits deferred web demo sandbox=%s',sandbox=>{mockSandbox=sandbox;render(<WelcomeRoute/>);expect(mockWelcomeProps.environment).toBe(sandbox?'sandbox':'production');expect(mockWelcomeProps.onCreateAccount).toEqual(expect.any(Function));expect(mockWelcomeProps.onLogIn).toEqual(expect.any(Function));expect(Object.prototype.hasOwnProperty.call(mockWelcomeProps,'onExploreDemo')).toBe(false);});

it('Welcome emits only its fixed commit milestone without changing entry callbacks',()=>{render(<WelcomeRoute/>);expect(observeStartupStage).toHaveBeenCalledWith('welcome-committed');expect(mockWelcomeProps.onCreateAccount).toEqual(expect.any(Function));expect(mockWelcomeProps.onLogIn).toEqual(expect.any(Function));});

it.each([false,true])('background Welcome cannot replace a freshly verified Manage route sandbox=%s',sandbox=>{
 mockSandbox=sandbox;mockFocused=false;mockPhase='verification-required';const view=render(<WelcomeRoute/>);
 mockPhase='active';view.rerender(<WelcomeRoute/>);expect(mockReplace).not.toHaveBeenCalled();
 mockFocused=true;view.rerender(<WelcomeRoute/>);expect(mockReplace).toHaveBeenCalledWith({pathname:'/personal',params:{setup:'1'}});
});
it.each(['busy','verification-required','storage-error'])('focused Welcome does not redirect without active authority phase=%s',phase=>{mockPhase=phase;render(<WelcomeRoute/>);expect(mockReplace).not.toHaveBeenCalled();});

it('Welcome sandbox Login resumes once without another login page',async()=>{
 mockSandbox=true;mockPhase='verification-required';let resolve:()=>void=()=>undefined;
 mockWelcomeLogin.mockImplementation(()=>new Promise<void>(done=>{resolve=done;}));render(<WelcomeRoute/>);
 await act(async()=>{(mockWelcomeProps.onLogIn as ()=>void)();(mockWelcomeProps.onLogIn as ()=>void)();});
 expect(mockWelcomeLogin).toHaveBeenCalledTimes(1);expect(mockReplace).not.toHaveBeenCalled();
 await act(async()=>resolve());expect(mockReplace).toHaveBeenCalledWith({pathname:'/personal',params:{setup:'1'}});
});
