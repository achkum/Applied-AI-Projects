import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { catalogs } from '@subtrack/i18n';
import { IdentifierEntry } from '../components/onboarding/identifier-entry';
import { normalizeIdentifier } from '../lib/onboarding-identifier';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('normalizeIdentifier', () => {
  it.each([
    ['email trims while preserving local-part case and lowering domain', 'email', '  User.Name@EXAMPLE.TEST  ', { valid: true, channel: 'email', identifier: 'User.Name@example.test' }],
    ['Swedish national phone', 'phone', '070-123 45 67', { valid: true, channel: 'phone', identifier: '+46701234567' }],
    ['international access prefix', 'phone', '0046 (70) 123-45-67', { valid: true, channel: 'phone', identifier: '+46701234567' }],
    ['valid E.164 shape', 'phone', '+1 202 555 0147', { valid: true, channel: 'phone', identifier: '+12025550147' }],
    ['empty value', 'email', '   ', { valid: false, code: 'required' }],
    ['email containing internal whitespace', 'email', 'a b@example.test', { valid: false, code: 'email_format' }],
    ['email rejects NUL control', 'email', 'a\u0000@example.test', { valid: false, code: 'email_format' }],
    ['email rejects ESC control', 'email', 'a@example\u001b.test', { valid: false, code: 'email_format' }],
    ['email rejects zero-width format character', 'email', 'a\u200b@example.test', { valid: false, code: 'email_format' }],
    ['email with multiple at signs', 'email', 'a@@example.test', { valid: false, code: 'email_format' }],
    ['email missing dotted domain', 'email', 'a@example', { valid: false, code: 'email_format' }],
    ['email domain begins with dot', 'email', 'a@.example.test', { valid: false, code: 'email_format' }],
    ['email domain has consecutive dots', 'email', 'a@example..test', { valid: false, code: 'email_format' }],
    ['email domain label begins with hyphen', 'email', 'a@-example.test', { valid: false, code: 'email_format' }],
    ['email domain label ends with hyphen', 'email', 'a@example-.test', { valid: false, code: 'email_format' }],
    ['email domain permits hyphenated labels', 'email', 'a@My-Example.test', { valid: true, channel: 'email', identifier: 'a@my-example.test' }],
    ['phone letters/extensions', 'phone', '0701234567 ext 2', { valid: false, code: 'phone_format' }],
    ['phone rejects embedded tab', 'phone', '070\t1234567', { valid: false, code: 'phone_format' }],
    ['phone rejects leading tab', 'phone', '\t0701234567', { valid: false, code: 'phone_format' }],
    ['phone rejects embedded newline', 'phone', '070\n1234567', { valid: false, code: 'phone_format' }],
    ['phone accepts nonbreaking space separator', 'phone', '070\u00a0123 45 67', { valid: true, channel: 'phone', identifier: '+46701234567' }],
    ['phone with internal plus', 'phone', '070+1234567', { valid: false, code: 'phone_format' }],
    ['phone with repeated plus', 'phone', '++46701234567', { valid: false, code: 'phone_format' }],
    ['phone rejects unsupported double zero country prefix', 'phone', '0012025550147', { valid: false, code: 'phone_format' }],
    ['phone rejects trunk zero after +46', 'phone', '+460701234567', { valid: false, code: 'phone_format' }],
    ['phone rejects trunk zero after 0046', 'phone', '00460701234567', { valid: false, code: 'phone_format' }],
    ['phone rejects unmatched parenthesis', 'phone', '070 (123 45 67', { valid: false, code: 'phone_format' }],
    ['phone rejects misplaced plus', 'phone', '070 123+4567', { valid: false, code: 'phone_format' }],
    ['phone with short shape', 'phone', '0701', { valid: false, code: 'phone_length' }],
    ['phone with too many digits', 'phone', '+1234567890123456', { valid: false, code: 'phone_length' }],
  ] as const)('%s', (_caseName, channel, input, expected) => {
    expect(normalizeIdentifier(channel, input)).toEqual(expected);
  });
});

describe('IdentifierEntry', () => {
  it('clears the previous channel value and error, then submits one normalized callback', () => {
    const onContinue = vi.fn();
    render(<IdentifierEntry locale="en" onContinue={onContinue} />);
    const email = screen.getByLabelText(catalogs.en.onboarding.identifier.emailLabel);
    fireEvent.change(email, { target: { value: 'bad address' } });
    fireEvent.blur(email);
    expect(email.getAttribute('aria-invalid')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: catalogs.en.onboarding.identifier.phoneChannel }));
    const phone = screen.getByLabelText(catalogs.en.onboarding.identifier.phoneLabel);
    expect(phone.getAttribute('value') ?? (phone as HTMLInputElement).value).toBe('');
    expect(phone.getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(phone, { target: { value: '070 123 45 67' } });
    fireEvent.submit(phone.closest('form') as HTMLFormElement);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith({ channel: 'phone', identifier: '+46701234567' });
  });

  it('does not call onContinue for an invalid submitted value and describes the inline error', () => {
    const onContinue = vi.fn();
    render(<IdentifierEntry locale="sv" onContinue={onContinue} />);
    const input = screen.getByLabelText(catalogs.sv.onboarding.identifier.emailLabel);
    fireEvent.change(input, { target: { value: 'invalid' } });
    const submit = screen.getByRole('button', { name: catalogs.sv.onboarding.identifier.continueLabel });
    expect(submit.getAttribute('type')).toBe('submit');
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onContinue).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(catalogs.sv.onboarding.identifier.errors.email_format)).toBeTruthy();
    fireEvent.change(input, { target: { value: 'a@example.test' } });
    expect(submit.hasAttribute('disabled')).toBe(false);
  });

  it.each([
    ['sv', 'light'], ['sv', 'dark'], ['en', 'light'], ['en', 'dark'],
  ] as const)('has no accessibility violations in %s %s', async (locale, theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = render(<IdentifierEntry locale={locale} onContinue={() => undefined} />);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
