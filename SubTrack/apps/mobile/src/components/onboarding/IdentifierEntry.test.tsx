import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { IdentifierEntry } from './IdentifierEntry';

let mockLocale: 'en' | 'sv' = 'en';
let mockIsDark = false;

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeTheme(mockIsDark),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () => jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeI18n(mockLocale),
}));

describe('IdentifierEntry', () => {
  beforeEach(() => { mockLocale = 'en'; mockIsDark = false; });
  it('normalizes a valid email and calls the callback once when continued', () => {
    const onValidIdentifier = jest.fn();
    render(<IdentifierEntry onValidIdentifier={onValidIdentifier} />);
    fireEvent.changeText(screen.getByLabelText('Email address'), ' User@EXAMPLE.com ');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onValidIdentifier).toHaveBeenCalledTimes(1);
    expect(onValidIdentifier).toHaveBeenCalledWith({ valid: true, channel: 'email', identifier: 'User@example.com' });
  });

  it('keeps invalid continuation disabled, reports localized validation and clears it after switching modes', () => {
    const onValidIdentifier = jest.fn();
    render(<IdentifierEntry onValidIdentifier={onValidIdentifier} />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Email address'), 'bad address');
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: 'Mobile number' }));
    expect(screen.getAllByLabelText('Mobile number')[1].props.keyboardType).toBe('phone-pad');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a localized error on blur and rejects malformed keyboard submissions', () => {
    const onValidIdentifier = jest.fn();
    render(<IdentifierEntry onValidIdentifier={onValidIdentifier} />);
    const input = screen.getByLabelText('Email address');
    fireEvent.changeText(input, 'broken');
    fireEvent(input, 'blur');
    expect(screen.getByRole('alert').props.children).toBe('Enter an email address in the format name@example.test.');
    fireEvent(input, 'submitEditing');
    expect(onValidIdentifier).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState.disabled).toBe(true);
  });

  it.each([
    ['en', false, 'Email address', '#FFFFFF'],
    ['en', true, 'Email address', '#12162A'],
    ['sv', false, 'E-postadress', '#FFFFFF'],
    ['sv', true, 'E-postadress', '#12162A'],
  ] as const)('uses %s copy and %s theme tokens', (locale, isDark, fieldLabel, background) => {
    mockLocale = locale;
    mockIsDark = isDark;
    render(<IdentifierEntry onValidIdentifier={jest.fn()} />);
    const radio = screen.getByRole('radio', { name: locale === 'sv' ? 'E-post' : 'Email' });
    expect(radio.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText(fieldLabel).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: background })]));
    expect(screen.getByRole('button', { name: locale === 'sv' ? 'Fortsätt' : 'Continue' })).toBeTruthy();
  });

  it('submits a phone number through the keyboard with phone channel preserved', () => {
    const onValidIdentifier = jest.fn();
    render(<IdentifierEntry onValidIdentifier={onValidIdentifier} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Mobile number' }));
    const input = screen.getAllByLabelText('Mobile number')[1];
    fireEvent.changeText(input, '070 123 45 67');
    fireEvent(input, 'submitEditing');
    expect(onValidIdentifier).toHaveBeenCalledWith({ valid: true, channel: 'phone', identifier: '+46701234567' });
  });
});
