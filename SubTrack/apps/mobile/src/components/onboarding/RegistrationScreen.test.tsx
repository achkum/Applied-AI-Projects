let mockDiagnosticChannel:ReturnType<typeof import('@/utils/privateRuntimeEnrollmentDiagnostic').createEnrollmentDiagnosticChannel>|undefined;
jest.mock('@/utils/privateRuntimeEnrollmentDiagnostic',()=>{const actual=jest.requireActual<typeof import('@/utils/privateRuntimeEnrollmentDiagnostic')>('@/utils/privateRuntimeEnrollmentDiagnostic');return {...actual,calibrateEnrollmentDiagnostic:()=>mockDiagnosticChannel?.calibrate()??(()=>{}),observeEnrollmentStage:(stage:import('@/utils/privateRuntimeEnrollmentDiagnostic').EnrollmentDiagnosticStage)=>mockDiagnosticChannel?.observe(stage),beginEnrollmentDiagnostic:()=>mockDiagnosticChannel?.begin()};});
import {beginEnrollmentDiagnostic,createEnrollmentDiagnosticChannel} from '@/utils/privateRuntimeEnrollmentDiagnostic';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { catalogs } from '@subtrack/i18n';
import WelcomeRoute from '../../../app/welcome';
import RegisterRoute from '../../../app/register';
import { RegistrationScreen } from './RegistrationScreen';
import RegisterBankIdRoute from '../../../app/register-bankid';

let mockLocale: 'en' | 'sv' = 'en';
let mockRouteParams: Record<string, string | string[] | undefined> = {};
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockStart = jest.fn();
const mockReset = jest.fn();
const mockNativeLogin = jest.fn().mockResolvedValue(undefined);
const mockNativeLogout = jest.fn().mockResolvedValue(false);
const mockNativeComplete = jest.fn().mockResolvedValue(undefined);
let mockFlow: { phase: string; error?: string; proof?: string } = { phase: 'identifier' };
const registrationCopy = {
  en: catalogs.en.onboarding.registration,
  sv: catalogs.sv.onboarding.registration,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('@/state/EnrollmentFlow', () => ({
  useEnrollment: () => ({ flow: mockFlow, start: mockStart, reset: mockReset }),
}));
jest.mock('@/state/NativeSession', () => ({ useNativeSession: () => ({ phase: 'verification-required', login: mockNativeLogin, logout: mockNativeLogout, complete: mockNativeComplete }) }));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () =>
    jest
      .requireActual<typeof import('../signature/testUtils/contextMocks')>(
        '../signature/testUtils/contextMocks',
      )
      .makeTheme(false),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () => {
    return jest
      .requireActual<typeof import('../signature/testUtils/contextMocks')>(
        '../signature/testUtils/contextMocks',
      )
      .makeI18n(mockLocale);
  },
}));

describe('RegistrationScreen', () => {
  beforeEach(() => {
    mockLocale = 'en';
    mockRouteParams = {};
    mockFlow = { phase: 'identifier' };
    jest.clearAllMocks();
  });

  it.each(['en', 'sv'] as const)(
    'shows localized identifier registration in %s',
    (locale) => {
      mockLocale = locale;
      render(<RegistrationScreen />);
      expect(
        screen.getByRole('header', { name: registrationCopy[locale].title }),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', {
          name: catalogs[locale].onboarding.identifier.continueLabel,
        }),
      ).toBeTruthy();
    },
  );

  it('starts the OTP request only after valid input without displaying the identifier', () => {
    render(<RegistrationScreen />);
    const input = screen.getByLabelText(
      catalogs.en.onboarding.identifier.emailLabel,
    );
    fireEvent.changeText(input, 'person@example.com');
    fireEvent.press(
      screen.getByRole('button', {
        name: catalogs.en.onboarding.identifier.continueLabel,
      }),
    );
    expect(mockStart).toHaveBeenCalledWith({
      valid: true,
      channel: 'email',
      identifier: 'person@example.com',
    });
    expect(screen.queryByText('person@example.com')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes OTP and BankID phases without rendering credentials', () => {
    mockFlow = { phase: 'otp' };
    const view = render(<RegistrationScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/register-otp');
    mockFlow = { phase: 'bankid' };
    view.rerender(<RegistrationScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/register-bankid');
    expect(
      screen.queryByLabelText(catalogs.en.onboarding.identifier.emailLabel),
    ).toBeNull();
  });

  it.each(['en', 'sv'] as const)(
    'labels development verification in %s and provides back navigation',
    (locale) => {
      mockLocale = locale;
      render(<RegistrationScreen mode="login" />);
      expect(
        screen.getByText(catalogs[locale].onboarding.nativePersonal.demo),
      ).toBeTruthy();
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(
        screen.queryByLabelText(
          catalogs[locale].onboarding.identifier.emailLabel,
        ),
      ).toBeNull();
      fireEvent.press(
        screen.getByRole('button', {
          name: registrationCopy[locale].backLabel,
        }),
      );
      expect(mockBack).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['en', 'sv'] as const)(
    'routes only the explicit login enum in %s and ignores sensitive query values',
    (locale) => {
      mockLocale = locale;
      mockRouteParams = {
        mode: 'login',
        identifier: 'person@example.com',
        code: '123456',
        proof: 'opaque-proof',
        token: 'opaque-token',
      };
      render(<RegisterRoute />);
      expect(
        screen.getByText(catalogs[locale].onboarding.nativePersonal.demo),
      ).toBeTruthy();
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(
        screen.queryByLabelText(
          catalogs[locale].onboarding.identifier.emailLabel,
        ),
      ).toBeNull();
      for (const sensitive of [
        'person@example.com',
        '123456',
        'opaque-proof',
        'opaque-token',
      ]) {
        expect(screen.queryByText(sensitive)).toBeNull();
      }
      expect(mockPush).not.toHaveBeenCalled();
    },
  );

  it.each<{ mode: string | string[] | undefined }>([
    { mode: 'unknown' },
    { mode: ['login', 'register'] },
    { mode: undefined },
  ])('keeps unsupported route mode $mode on registration', ({ mode }) => {
    mockRouteParams = { mode };
    render(<RegisterRoute />);
    expect(
      screen.getByRole('header', { name: registrationCopy.en.title }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: catalogs.en.onboarding.identifier.continueLabel,
      }),
    ).toBeTruthy();
  });

  it.each(['en', 'sv'] as const)(
    'composes welcome actions into approved %s routes',
    (locale) => {
      mockLocale = locale;
      render(<WelcomeRoute />);
      fireEvent.press(
        screen.getByRole('button', {
          name: catalogs[locale].onboarding.welcome.createAccount,
        }),
      );
      fireEvent.press(
        screen.getByRole('button', {
          name: catalogs[locale].onboarding.welcome.logIn,
        }),
      );
      expect(mockPush).toHaveBeenNthCalledWith(1, '/register');
      expect(mockPush).toHaveBeenNthCalledWith(2, {
        pathname: '/register',
        params: { mode: 'login' },
      });
      fireEvent.press(
        screen.getByRole('button', {
          name: catalogs[locale].onboarding.welcome.exploreDemo,
        }),
      );
      expect(mockPush).toHaveBeenNthCalledWith(3, `/${locale}/demo`);
    },
  );
});

describe('mandatory private native completion',()=>{
  beforeEach(()=>{jest.clearAllMocks();mockLocale='en';mockFlow={phase:'bankid',proof:'v2.'+'b'.repeat(43)};mockNativeComplete.mockResolvedValue(undefined);});
  it('labels fresh development verification and submits only the producer proof and locale through the session coordinator',async()=>{
    render(<RegisterBankIdRoute />);
    expect(screen.getByText(catalogs.en.onboarding.nativePersonal.demo)).toBeTruthy();
    fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.nativePersonal.verify}));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(mockNativeComplete).toHaveBeenCalledWith(mockFlow.proof,'en');expect(mockReplace).toHaveBeenCalledWith('/personal');
  });
  it('ignores a completion response after unmount and locally invalidates its pending session',async()=>{
    let resolve:()=>void=()=>undefined;mockNativeComplete.mockImplementationOnce(()=>new Promise<void>(done=>{resolve=done;}));
    const {unmount}=render(<RegisterBankIdRoute />);fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.nativePersonal.verify}));
    unmount();resolve();await new Promise(done=>setTimeout(done,0));expect(mockNativeLogout).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalledWith('/personal');
  });
  it('retires an uncertain enrollment proof and uses fresh verification rather than replaying it',async()=>{
    mockNativeComplete.mockRejectedValueOnce(new Error('unknown completion'));const {rerender}=render(<RegisterBankIdRoute />);
    fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.nativePersonal.verify}));
    await screen.findByText(catalogs.en.onboarding.nativePersonal.unavailable);expect(mockReset).toHaveBeenCalledTimes(1);
    mockFlow={phase:'identifier'};rerender(<RegisterBankIdRoute />);
    fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.nativePersonal.verify}));
    await waitFor(()=>expect(mockNativeLogin).toHaveBeenCalledTimes(1));
    expect(mockNativeComplete).toHaveBeenCalledTimes(1);
  });

});


test('owned mounted register calibration is fixed and survives starting, retires on unmount; login never calibrates',()=>{
 const log=jest.spyOn(console,'info').mockImplementation(()=>{});mockDiagnosticChannel=createEnrollmentDiagnosticChannel(()=>({development:true,platform:'ios',proof:'true',enabled:'true',url:'https://localhost:3443'}),fixed=>console.info(fixed));
 try{mockFlow={phase:'identifier'};const view=render(<RegistrationScreen/>);expect(log.mock.calls.map(([line])=>line)).toEqual(['ST244_ENROLLMENT calibration=mounted']);const observer=beginEnrollmentDiagnostic();mockFlow={phase:'starting'};view.rerender(<RegistrationScreen/>);observer?.stage('fetch-entered');expect(log).toHaveBeenLastCalledWith('ST244_ENROLLMENT stage=fetch-entered');view.unmount();observer?.stage('flow-committed');expect(log).toHaveBeenCalledTimes(2);render(<RegistrationScreen mode="login"/>);expect(log).toHaveBeenCalledTimes(2);}
 finally{mockDiagnosticChannel=undefined;log.mockRestore();}
});
