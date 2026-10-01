import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Orbit } from '@subtrack/ui';
import type { OrbitSubscription } from '@subtrack/ui';

const SUBS: OrbitSubscription[] = [
  { id: 'netflix',  name: 'Netflix', category: 'streaming',    ownerType: 'ME',        monthlyCostMinor: 13900, billingCadence: 'MONTHLY' },
  { id: 'icloud',   name: 'iCloud',  category: 'cloud',        ownerType: 'HOUSEHOLD', monthlyCostMinor:  2900, billingCadence: 'MONTHLY' },
  { id: 'peloton',  name: 'Peloton', category: 'fitness',      ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor: 44900, billingCadence: 'MONTHLY' },
];

describe('Orbit integration (apps/web)', () => {
  it('renders the orbit figure with the correct aria-label', () => {
    render(<Orbit subscriptions={SUBS} ariaLabel="Test subscription orbit" />);
    expect(screen.getByRole('img', { name: 'Test subscription orbit' })).toBeDefined();
  });

  it('lists all subscription names in the accessible list', () => {
    render(<Orbit subscriptions={SUBS} />);
    expect(screen.getByText('Netflix')).toBeDefined();
    expect(screen.getByText('iCloud')).toBeDefined();
    expect(screen.getByText('Peloton')).toBeDefined();
  });

  it('renders an SVG element', () => {
    const { container } = render(<Orbit subscriptions={SUBS} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('fires onBodySelect when a body is clicked', async () => {
    const selected: string[] = [];
    render(
      <Orbit
        subscriptions={SUBS}
        onBodySelect={(id) => selected.push(id)}
      />,
    );
    const buttons = screen.getAllByRole('button');
    buttons[0]?.click();
    expect(selected).toHaveLength(1);
  });
});
