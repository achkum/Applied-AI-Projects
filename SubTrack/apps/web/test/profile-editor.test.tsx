import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { ProfileEditor } from '../components/onboarding/profile-editor';

const view = { displayName: null, avatarColourToken: null, avatarEmoji: null,
  language: 'en', theme: 'system', defaultCurrency: 'SEK', profileComplete: false } as const;

describe('profile editor', () => {
  it('sends only changed allowed fields and keeps SEK read-only', () => {
    const onSave = vi.fn();
    render(<ProfileEditor locale="en" view={view} busy={false} saved={false} uncertain={false} onSave={onSave} />);
    expect((screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Synthetic Owner' } });
    expect((screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(onSave).toHaveBeenCalledWith({ displayName: 'Synthetic Owner' });
    expect(screen.getByText('Default currency: SEK')).toBeTruthy();
  });

  it.each(['X'.repeat(81), ' Name ', 'e\u0301', 'A\u0000B', '\uD800'])('rejects invalid name %j', (name) => {
    const onSave = vi.fn();
    render(<ProfileEditor locale="en" view={view} busy={false} saved={false} uncertain={false} onSave={onSave} />);
    const input = screen.getByLabelText('Display name');
    fireEvent.change(input, { target: { value: name } });
    expect(screen.getByRole('alert').textContent).toContain('Check your profile details');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('profile-name-validation');
    expect((screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([['en', 'Profile complete.', 'Profile incomplete.'], ['sv', 'Profilen är komplett.', 'Profilen är inte komplett.']] as const)(
    'shows only server-reread completeness in %s', (locale, complete, incomplete) => {
      const props = { locale, view, busy: false, saved: false, uncertain: false, onSave: vi.fn() };
      const { rerender } = render(<ProfileEditor {...props} />);
      expect(screen.queryByText(complete)).toBeNull();
      expect(screen.queryByText(incomplete)).toBeNull();
      rerender(<ProfileEditor {...props} view={{ ...view, profileComplete: true }} saved />);
      expect(screen.getByRole('status').textContent).toBe(complete);
      rerender(<ProfileEditor {...props} view={{ ...view, profileComplete: false }} saved />);
      expect(screen.getByRole('status').textContent).toBe(incomplete);
    },
  );

  it.each(['en', 'sv'] as const)('has accessible controls in %s', async (locale) => {
    const { container } = render(<ProfileEditor locale={locale} view={view} busy={false} saved={false} uncertain={false} onSave={() => undefined} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
