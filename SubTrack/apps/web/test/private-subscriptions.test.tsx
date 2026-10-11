import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { PrivateSubscriptions } from '../components/onboarding/private-subscriptions';

const id = '123e4567-e89b-42d3-a456-426614174000';
const owner = { visibility: 'owner' as const, id, customName: 'Synthetic', merchantId: null, merchantName: null,
  categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY' as const, status: 'ACTIVE' as const,
  expectedAmountMinor: '9007199254740993', currency: 'SEK', nextChargeDate: null, alwaysPrivate: true };
function props(locale: 'en' | 'sv') {
  return { locale, items: [owner], nextCursor: 'cursor', selected: null, busy: false, confirmed: false,
    onMore: vi.fn(), onSelect: vi.fn(), onBack: vi.fn(), onTransition: vi.fn() };
}
describe('private owner subscriptions', () => {
  it.each(['en', 'sv'] as const)('shows an accessible persisted row and continuation in %s', async (locale) => {
    const callbacks = props(locale);
    const { container } = render(<PrivateSubscriptions {...callbacks} />);
    const row = screen.getByRole('button', { name: /Synthetic/ });
    row.focus(); fireEvent.keyDown(row, { key: 'Enter' }); fireEvent.click(row);
    expect(callbacks.onSelect).toHaveBeenCalledWith(id);
    fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Load more subscriptions' : 'Visa fler prenumerationer' }));
    expect(callbacks.onMore).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(locale === 'en' ? 'Video streaming' : 'Videoströmning');
    expect(container.textContent).not.toContain('9007199254740993');
    expect((await axe(container)).violations).toEqual([]);
  });
  it('shows only legal status actions and disables them during a request', async () => {
    const callbacks = { ...props('en'), selected: owner, busy: true };
    const { container, rerender } = render(<PrivateSubscriptions {...callbacks} />);
    expect(screen.getByRole('button', { name: 'Pause' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();
    rerender(<PrivateSubscriptions {...callbacks} selected={{ ...owner, status: 'ARCHIVED' }} busy={false} />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect((await axe(container)).violations).toEqual([]);
  });
});
