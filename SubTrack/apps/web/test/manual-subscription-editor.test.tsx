import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { catalogs } from '@subtrack/i18n';
import { ManualSubscriptionEditor } from '../components/onboarding/manual-subscription-editor';

describe('manual editor', () => {
  it.each(['sv', 'en'] as const)('validates and focuses fields, then emits exact expected values in %s', async locale => {
    const copy = catalogs[locale].onboarding.manualSubscription;
    const onSave = vi.fn();
    const { container } = render(<ManualSubscriptionEditor locale={locale} state="draft" onSave={onSave}
      onCancel={vi.fn()} onCheck={vi.fn()} onRead={vi.fn()} onReconcile={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: copy.title }));
    fireEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(document.activeElement).toBe(screen.getByLabelText(copy.name));
    fireEvent.change(screen.getByLabelText(copy.name), { target: { value: ' Synthetic ' } });
    fireEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(document.activeElement).toBe(screen.getByLabelText(copy.category));
    fireEvent.change(screen.getByLabelText(copy.category), { target: { value: 'VIDEO_STREAMING' } });
    fireEvent.change(screen.getByLabelText(copy.amount), { target: { value: locale === 'sv' ? '0,01' : '0.01' } });
    fireEvent.change(screen.getByLabelText(copy.date), { target: { value: '0000-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(document.activeElement).toBe(screen.getByLabelText(copy.date));
    fireEvent.change(screen.getByLabelText(copy.date), { target: { value: '2026-02-28' } });
    fireEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(onSave).toHaveBeenCalledWith({ customName: 'Synthetic', categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', expectedAmountMinor: '1', nextChargeDate: '2026-02-28' });
    expect((await axe(container)).violations).toEqual([]);
  });
  it('locks pending and uncertain drafts and offers explicit recovery actions', () => {
    const props = { locale: 'en' as const, onSave: vi.fn(), onCancel: vi.fn(), onCheck: vi.fn(), onRead: vi.fn(), onReconcile: vi.fn() };
    const copy = catalogs.en.onboarding.manualSubscription;
    const { rerender } = render(<ManualSubscriptionEditor {...props} state="saving" />);
    expect(screen.getByLabelText(copy.name).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: copy.save })).toBeNull();
    rerender(<ManualSubscriptionEditor {...props} state="uncertain" />);
    expect(screen.queryByRole('button', { name: copy.cancel })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: copy.check })); expect(props.onCheck).toHaveBeenCalledOnce();
    rerender(<ManualSubscriptionEditor {...props} state="read-error" />);
    fireEvent.click(screen.getByRole('button', { name: copy.retryRead })); expect(props.onRead).toHaveBeenCalledOnce();
    rerender(<ManualSubscriptionEditor {...props} state="receipt-conflict" />);
    fireEvent.click(screen.getByRole('button', { name: copy.reconcile })); expect(props.onReconcile).toHaveBeenCalledOnce();
  });
});


describe('manual Edit exact authoritative initialization', () => {
  const row = { revision: '1', source: 'MANUAL' as const, visibility: 'owner' as const,
    id: '123e4567-e89b-42d3-a456-426614174000', customName: 'Exact', merchantId: null, merchantName: null,
    categoryCode: 'VIDEO_STREAMING', cadence: 'ANNUAL' as const, status: 'PAUSED' as const,
    expectedAmountMinor: '9007199254740993', currency: 'SEK', nextChargeDate: '2026-11-15', alwaysPrivate: true };
  const props = { state: 'draft' as const, onSave: vi.fn(), onCancel: vi.fn(), onCheck: vi.fn(), onRead: vi.fn(), onReconcile: vi.fn() };
  it.each(['sv','en'] as const)('uses exact ungrouped Money input and preserved fields in %s', locale => {
    const copy = catalogs[locale].onboarding.manualSubscription;
    render(<ManualSubscriptionEditor {...props} locale={locale} initial={row} />);
    expect((screen.getByLabelText(copy.amount) as HTMLInputElement).value).toBe(locale === 'sv' ? '90071992547409,93' : '90071992547409.93');
    expect((screen.getByLabelText(copy.cadence) as HTMLSelectElement).value).toBe('ANNUAL');
    expect((screen.getByLabelText(copy.date) as HTMLInputElement).value).toBe('2026-11-15');
  });
  it.each(['0','-1'])('keeps legacy nonpositive %s blank-invalid with explicit replacement guidance', minor => {
    const copy = catalogs.en.onboarding.manualSubscription;
    const onSave = vi.fn();
    render(<ManualSubscriptionEditor {...props} onSave={onSave} locale="en" initial={{...row,expectedAmountMinor:minor}} />);
    expect((screen.getByLabelText(copy.amount) as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText(copy.amount).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(catalogs.en.onboarding.manualEdit.positiveRequired)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:catalogs.en.onboarding.manualEdit.save}));
    expect(onSave).not.toHaveBeenCalled(); expect(document.activeElement).toBe(screen.getByLabelText(copy.amount));
  });
});
