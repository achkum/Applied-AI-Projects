import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ScopeSwitcher, ScopeOption } from './ScopeSwitcher';

const options: ScopeOption[] = [
  { kind: 'me', label: 'Me' },
  { kind: 'household', label: 'Household' },
  { kind: 'member', memberId: 'member-1', displayName: 'Alex' },
];

describe('ScopeSwitcher', () => {
  it('renders all scope segments', () => {
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Me' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Household' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Alex' })).toBeTruthy();
  });

  it('marks selected segment with aria-checked', () => {
    render(<ScopeSwitcher options={options} selectedIndex={1} onSelect={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Household' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Me' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onSelect with the pressed index', () => {
    const onSelect = vi.fn();
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Household' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('does not call onSelect when already-selected segment is clicked', () => {
    const onSelect = vi.fn();
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Me' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders member avatar initial', () => {
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(
      <ScopeSwitcher options={options} selectedIndex={0} onSelect={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
