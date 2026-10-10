import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { catalogs } from '@subtrack/i18n';
import OtpRoute from '../../../app/register-otp';
import BankIdRoute from '../../../app/register-bankid';

let mockLocale: 'en' | 'sv' = 'en';
let mockIsDark = false;
let mockFlow: Record<string, unknown> = { phase: 'identifier' };
const mockReplace = jest.fn();
const mockVerify = jest.fn();
const mockResend = jest.fn();
const mockReset = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@/state/EnrollmentFlow', () => ({
  useEnrollment: () => ({
    flow: mockFlow,
    verify: mockVerify,
    resend: mockResend,
    reset: mockReset,
  }),
}));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () =>
    jest
      .requireActual<typeof import('../signature/testUtils/contextMocks')>(
        '../signature/testUtils/contextMocks',
      )
      .makeTheme(mockIsDark),
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

describe('enrollment route rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      const input = screen.getByLabelText(copy.otpLabel);
      expect(input.props.keyboardType).toBe('number-pad');
      const verifyButton = screen.getByRole('button', {
        name: copy.verifyLabel,
      });
      expect(verifyButton.props.accessibilityState.disabled).toBe(true);
      fireEvent.changeText(input, '1a234567');
      expect(input.props.value).toBe('123456');
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
    'gates %s verified proof at unavailable BankID continuation',
    (locale) => {
      mockLocale = locale;
      mockFlow = { phase: 'bankid', proof: `v2.${'b'.repeat(43)}` };
      render(<BankIdRoute />);
      const copy = catalogs[locale].onboarding.registration;
      expect(
        screen.getByRole('header', { name: copy.bankIdRequired }),
      ).toBeTruthy();
      expect(screen.getByRole('alert').props.children).toBe(
        copy.bankIdUnavailable,
      );
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.queryByText(String(mockFlow.proof))).toBeNull();
    },
  );
});
