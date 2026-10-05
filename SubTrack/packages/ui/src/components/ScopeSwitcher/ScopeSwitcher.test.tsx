import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
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

  it.each([
    ['Me', 0, 'var(--aurora-violet)'],
    ['Household', 1, 'var(--aurora-green)'],
    ['Alex', 2, 'var(--member-accent-02)'],
  ] as const)('shows the selected token identity and checkmark for %s', (name, index, accent) => {
    render(<ScopeSwitcher options={options} selectedIndex={index} onSelect={vi.fn()} />);

    const group = screen.getByRole('group', { name: 'Scope' });
    const selected = screen.getByRole('radio', { name });
    const indicator = selected.querySelector('svg');
    expect(group).toHaveStyle({ '--scope-accent': accent });
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(indicator).toHaveAttribute('aria-hidden', 'true');
    expect(indicator?.querySelector('path')).toHaveAttribute(
      'stroke-width',
      'var(--scope-switcher-selected-indicator-stroke-width)',
    );
    expect(screen.getAllByRole('radio').filter((radio) => radio !== selected)
      .every((radio) => radio.querySelector('svg') === null)).toBe(true);
  });

  it.each(['light', 'dark'] as const)(
    'keeps the member token mapping theme-independent in %s theme',
    (theme) => {
      render(
        <div data-theme={theme}>
          <ScopeSwitcher options={options} selectedIndex={2} onSelect={vi.fn()} />
        </div>,
      );

      const member = screen.getByRole('radio', { name: 'Alex' });
      const avatar = screen.getByText('A');
      expect(screen.getByRole('group', { name: 'Scope' })).toHaveStyle({
        '--scope-accent': 'var(--member-accent-02)',
      });
      expect(member).toHaveAttribute('aria-checked', 'true');
      expect(avatar).toHaveStyle({ '--member-accent': 'var(--member-accent-02)' });
    },
  );

  it('uses the violet identity fallback when the selected index is invalid', () => {
    render(<ScopeSwitcher options={options} selectedIndex={-1} onSelect={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Scope' })).toHaveStyle({
      '--scope-accent': 'var(--aurora-violet)',
    });
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
      expect(radio.querySelector('svg')).toBeNull();
    }
  });

  it('calls onSelect with the pressed index', () => {
    const onSelect = vi.fn();
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Household' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('scrolls a focused later option into view without changing selection', () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const calls: Array<{ element: HTMLElement; options?: ScrollIntoViewOptions }> = [];
    const scrollIntoView = vi.fn(function (this: HTMLElement, options?: ScrollIntoViewOptions) {
      calls.push({ element: this, options });
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    try {
      const onSelect = vi.fn();
      render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
      const laterOption = screen.getByRole('radio', { name: 'Alex' });

      laterOption.focus();

      expect(calls).toEqual([{
        element: laterOption,
        options: { block: 'nearest', inline: 'nearest', behavior: 'instant' },
      }]);
      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Me' })).toHaveAttribute('aria-checked', 'true');
      expect(laterOption).toHaveAttribute('aria-checked', 'false');
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          writable: true,
          value: originalScrollIntoView,
        });
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    }
  });

  it('does not call onSelect when already-selected segment is clicked', () => {
    const onSelect = vi.fn();
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Me' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('announces a new scope in a live region and removes it after announcement', async () => {
    vi.useFakeTimers();
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });

    try {
      const onSelect = vi.fn();
      render(
        <ScopeSwitcher
          options={options}
          selectedIndex={0}
          onSelect={onSelect}
          selectedAnnouncementLabel={(name) => `Switched to ${name}`}
        />,
      );

      fireEvent.click(screen.getByRole('radio', { name: 'Household' }));
      expect(onSelect).toHaveBeenCalledWith(1);
      const liveRegion = document.body.querySelector('[aria-live="polite"]');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
      expect(liveRegion).toHaveTextContent('');
      expect(animationFrames).toHaveLength(1);

      const animationFrame = animationFrames[0];
      if (animationFrame === undefined) {
        throw new Error('The scope-change announcement animation frame was not captured.');
      }
      act(() => animationFrame(0));
      expect(liveRegion).toHaveTextContent('Switched to Household');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(liveRegion?.isConnected).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
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
