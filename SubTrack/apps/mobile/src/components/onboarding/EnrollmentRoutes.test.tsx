jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { I18n } from 'i18n-js';
import { catalogs } from '@subtrack/i18n';
import OtpRoute from '../../../app/register-otp';
import BankIdRoute from '../../../app/register-bankid';

let mockProvider:'production'|'sandbox'='production';
let mockLocale: 'en' | 'sv' = 'en';
let mockIsDark = false;
let mockFlow: Record<string, unknown> = { phase: 'identifier' };
const mockReplace = jest.fn();
const mockVerify = jest.fn();
const mockResend = jest.fn();
const mockReset = jest.fn();
const mockComplete = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
jest.mock('@/state/OnboardingAdapter',()=>({SANDBOX_TEST_CODE:'000000',useOnboarding:()=>({provider:mockProvider,flow:mockFlow,sessionPhase:'verification-required',verify:mockVerify,resend:mockResend,reset:mockReset,complete:mockComplete,login:mockLogin,logout:mockLogout})}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace})}));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    ...jest.requireActual<typeof import('../signature/testUtils/contextMocks')>(
      '../signature/testUtils/contextMocks',
    ).makeTheme(mockIsDark),
    theme: jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json'),
  }),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () =>
    jest
      .requireActual<typeof import('../signature/testUtils/contextMocks')>(
        '../signature/testUtils/contextMocks',
      )
      .makeI18n(mockLocale),
}));

const challengeId = 'a'.repeat(43);
const otp = () => ({
  phase: 'otp',
  identifier: {
    valid: true,
    channel: 'email',
    identifier: 'person@example.test',
  },
  challengeId,
  cooldownUntil: 0,
  pending: false,
});

function expectPrimaryAction(button: ReturnType<typeof screen.getByRole>, dark: boolean) {
  const tokens = jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json') as {
    color: { light: Record<string, string>; dark: Record<string, string> };
  };
  const palette = dark ? tokens.color.dark : tokens.color.light;
  const style = StyleSheet.flatten(button.props.style);
  expect(style.minHeight).toBe(48);
  expect(style.backgroundColor).toBe(palette['action.accent']);
  expect(StyleSheet.flatten(button.findByType(Text).props.style).color).toBe(palette['ink.on-accent']);
}

describe('enrollment route rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComplete.mockResolvedValue(undefined); mockLogin.mockResolvedValue(undefined); mockLogout.mockResolvedValue(false);
    mockProvider='production';
    mockLocale = 'en';
    mockIsDark = false;
    mockFlow = { phase: 'identifier' };
  });

  it('guards direct OTP and BankID entry without a live flow', () => {
    expect(render(<OtpRoute />).toJSON()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/register');
    expect(render(<BankIdRoute />).toJSON()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/register');
  });

  it.each([
    ['en', false],
    ['en', true],
    ['sv', false],
    ['sv', true],
  ] as const)(
    'shows the %s OTP step in dark=%s with one six-digit input',
    (locale, dark) => {
      mockLocale = locale;
      mockIsDark = dark;
      mockFlow = otp();
      render(<OtpRoute />);
      const copy = catalogs[locale].onboarding.registration;
      expect(screen.getByRole('header', { name: copy.otpTitle })).toBeTruthy();
      const input = screen.getByTestId('native-registration-otp');expect(input).toBe(screen.getByLabelText(copy.otpLabel));
      expect(input.props.keyboardType).toBe('number-pad');
      const verifyButton = screen.getByRole('button', {
        name: copy.verifyLabel,
      });
      const tokens = jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json') as { color: { light: Record<string, string>; dark: Record<string, string> } };
      const palette = dark ? tokens.color.dark : tokens.color.light;
      expect(StyleSheet.flatten(verifyButton.props.style).minHeight).toBe(48);
      expect(StyleSheet.flatten(verifyButton.props.style).backgroundColor).toBe(palette['bg.sunken']);
      expect(verifyButton.props.accessibilityState.disabled).toBe(true);
      fireEvent.changeText(input, '1a234567');
      expect(input.props.value).toBe('123456');
      expectPrimaryAction(screen.getByRole('button', { name: copy.verifyLabel }), dark);
      fireEvent.press(verifyButton);
      expect(mockVerify).toHaveBeenCalledWith('123456');
      expect(screen.queryByText('person@example.test')).toBeNull();
      expect(screen.queryByText(challengeId)).toBeNull();
    },
  );

  it('announces pending and incorrect-code states and resets on explicit Back', () => {
    mockFlow = { ...otp(), pending: true, error: 'incorrect' };
    render(<OtpRoute />);
    const copy = catalogs.en.onboarding.registration;
    expect(screen.getByRole('alert').props.children).toBe(copy.wrongCode);
    expect(screen.getByText(copy.verifyPending)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.verifyLabel }).props
        .accessibilityState.disabled,
    ).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: copy.backLabel }));
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/register');
  });

  it.each(['en', 'sv'] as const)(
    'requires explicit %s development verification before completing the restricted proof',
    async (locale) => {
      mockLocale = locale;
      mockFlow = { phase: 'bankid', proof: `v2.${'b'.repeat(43)}` };
      render(<BankIdRoute />);
      const copy = catalogs[locale].onboarding.registration;
      expect(
        screen.getByRole('header', { name: copy.bankIdRequired }),
      ).toBeTruthy();
      expectPrimaryAction(screen.getByRole('button', { name: catalogs[locale].onboarding.nativePersonal.verify }), false);
      expect(screen.getByRole('alert').props.children).toBe(
        catalogs[locale].onboarding.nativePersonal.demo,
      );
      expect(screen.getAllByRole('button')).toHaveLength(2);
      expect(mockComplete).not.toHaveBeenCalled();
      expect(mockLogin).not.toHaveBeenCalled();
      expect(screen.queryByText(String(mockFlow.proof))).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: catalogs[locale].onboarding.nativePersonal.verify }));
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/personal'));
      expect(mockComplete).toHaveBeenCalledWith(locale);
      expect(mockComplete.mock.calls[0]).toHaveLength(1);
      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalledTimes(1);
    },
  );
});

it.each(['en','sv'] as const)('interpolates OTP resend countdown with the real i18n-js engine in %s',locale=>{
 const i18n=new I18n({en:catalogs.en,sv:catalogs.sv},{defaultLocale:locale,locale,enableFallback:true});
 const value=i18n.t('onboarding.registration.resendCountdown',{seconds:30});
 expect(value).not.toContain('{seconds}');expect(value).toContain('30');
});

it('sandbox uses the same OTP and BankID routes with truthful inline simulation and no proof arguments',async()=>{
 jest.clearAllMocks();mockProvider='sandbox';mockLocale='en';mockFlow=otp();const view=render(<OtpRoute/>);expect(screen.getByText(catalogs.en.onboarding.sandbox.simulatedOtp.replace('%{code}','000000'))).toBeTruthy();view.unmount();mockFlow={phase:'bankid'};render(<BankIdRoute/>);expect(screen.getByText(catalogs.en.onboarding.sandbox.simulatedBankId)).toBeTruthy();expectPrimaryAction(screen.getByRole('button',{name:catalogs.en.onboarding.nativePersonal.verify}),false);fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.nativePersonal.verify}));await waitFor(()=>expect(mockComplete).toHaveBeenCalledWith('en'));expect(mockLogin).not.toHaveBeenCalled();expect(mockComplete.mock.calls[0]).toHaveLength(1);
});
it('back from simulated BankID retires only local flow and keeps installation custody',()=>{
 jest.clearAllMocks();mockProvider='sandbox';mockFlow={phase:'bankid'};render(<BankIdRoute/>);fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.registration.backLabel}));expect(mockReset).toHaveBeenCalledTimes(1);expect(mockLogout).not.toHaveBeenCalled();
});
