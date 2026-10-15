import {observeStartupStage} from '@/utils/privateRuntimeEnrollmentDiagnostic';
jest.mock('@/utils/privateRuntimeEnrollmentDiagnostic',()=>({observeStartupStage:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
import React from 'react';
import {render} from '@testing-library/react-native';
import PersonalRoute from '../../../app/personal';
import WelcomeRoute from '../../../app/welcome';
import IndexRoute from '../../../app/index';
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false)}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
jest.mock('./WelcomeActions',()=>({WelcomeActions:(props:Record<string,unknown>)=>{mockWelcomeProps=props;return null;}}));
let mockWelcomeProps:Record<string,unknown>;
let mockSandbox=false,mockSetup:undefined|string;const mockReplace=jest.fn();let mockProps:Record<string,unknown>;
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace,push:jest.fn()}),useLocalSearchParams:()=>({setup:mockSetup}),Redirect:(props:unknown)=>{mockProps=props as Record<string,unknown>;return null;}}));
jest.mock('@/state/SandboxSession',()=>({sandboxBuildSelected:()=>mockSandbox,useSandboxSession:()=>({phase:'active'})}));
jest.mock('@/state/OnboardingAdapter',()=>({useOnboarding:()=>({sessionPhase:'active',provider:mockSandbox?'sandbox':'production',reset:jest.fn()})}));
jest.mock('@/api/sandboxMobileApi',()=>({sandboxMobileApi:{sandbox:true}}));
jest.mock('./NativePersonalScreen',()=>({NativePersonalScreen:(props:Record<string,unknown>)=>{mockProps=props;return null;}}));
beforeEach(()=>{jest.clearAllMocks();mockSetup=undefined;});
it.each([false,true])('same setup route gates handoff on authoritative screen callback sandbox=%s',sandbox=>{
 mockSandbox=sandbox;const view=render(<PersonalRoute/>);expect(mockReplace).not.toHaveBeenCalled();const complete=mockProps.onSetupComplete as (reason:'load'|'mutation')=>void;complete('load');expect(mockReplace).not.toHaveBeenCalled();complete('mutation');expect(mockReplace).toHaveBeenCalledWith('/personal-billing-month');mockReplace.mockClear();mockSetup='1';view.rerender(<PersonalRoute/>);(mockProps.onSetupComplete as typeof complete)('load');expect(mockReplace).toHaveBeenCalledWith('/personal-billing-month');
});
it('completed installation starts through authoritative setup readback, never blind home',()=>{render(<IndexRoute/>);expect(mockProps.href).toEqual({pathname:'/personal',params:{setup:'1'}});});

it('resumed sessions arriving after initial redirect still require authoritative setup before home',()=>{render(<WelcomeRoute/>);expect(mockReplace).toHaveBeenCalledWith({pathname:'/personal',params:{setup:'1'}});});

it.each([false,true])('native welcome keeps the same supported actions and omits deferred web demo sandbox=%s',sandbox=>{mockSandbox=sandbox;render(<WelcomeRoute/>);expect(mockWelcomeProps.environment).toBe(sandbox?'sandbox':'production');expect(mockWelcomeProps.onCreateAccount).toEqual(expect.any(Function));expect(mockWelcomeProps.onLogIn).toEqual(expect.any(Function));expect(Object.prototype.hasOwnProperty.call(mockWelcomeProps,'onExploreDemo')).toBe(false);});

it('Welcome emits only its fixed commit milestone without changing entry callbacks',()=>{render(<WelcomeRoute/>);expect(observeStartupStage).toHaveBeenCalledWith('welcome-committed');expect(mockWelcomeProps.onCreateAccount).toEqual(expect.any(Function));expect(mockWelcomeProps.onLogIn).toEqual(expect.any(Function));});
