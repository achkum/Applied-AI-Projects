jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Orbit } from '../Orbit';
import { OrbitListFallback } from '../OrbitListFallback';
import type { OrbitSubscription } from '../types';

const SUBS: OrbitSubscription[] = [
  { id: 'netflix',  name: 'Netflix',  category: 'streaming', ownerType: 'ME',        monthlyCostMinor: 13900, billingCadence: 'MONTHLY' },
  { id: 'icloud',   name: 'iCloud',   category: 'cloud',     ownerType: 'HOUSEHOLD', monthlyCostMinor:  2900, billingCadence: 'MONTHLY' },
  { id: 'peloton',  name: 'Peloton',  category: 'fitness',   ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor: 44900, billingCadence: 'MONTHLY' },
];

describe('Orbit component', () => {
  it('renders without crashing', () => {
    expect(() => render(<Orbit subscriptions={SUBS} />)).not.toThrow();
  });

  it('renders orbit visual mode by default (no forceList)', () => {
    render(<Orbit subscriptions={SUBS} />);
    // In reduced-motion mock, isReducedMotion is false, so visual mode renders
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(SUBS.length);
  });

  it('renders list fallback when forceList=true', () => {
    render(<Orbit subscriptions={SUBS} forceList />);
    // List mode renders accessibilityRole="link" items
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('iCloud')).toBeTruthy();
  });

  it('fires onBodyPress when a body is pressed', () => {
    const pressed: string[] = [];
    render(<Orbit subscriptions={SUBS} onBodyPress={(id) => pressed.push(id)} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.press(buttons[0]);
    expect(pressed).toHaveLength(1);
  });

  it('handles empty subscription list without crashing', () => {
    expect(() => render(<Orbit subscriptions={[]} />)).not.toThrow();
  });
});

describe('OrbitListFallback', () => {
  it('renders all subscription names', () => {
    render(<OrbitListFallback subscriptions={SUBS} />);
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('iCloud')).toBeTruthy();
    expect(screen.getByText('Peloton')).toBeTruthy();
  });

  it('fires onItemPress when item is pressed', () => {
    const pressed: string[] = [];
    render(<OrbitListFallback subscriptions={SUBS} onItemPress={(id) => pressed.push(id)} />);
    const items = screen.getAllByRole('link');
    fireEvent.press(items[0]);
    expect(pressed).toHaveLength(1);
  });

  it('renders category badge text', () => {
    render(<OrbitListFallback subscriptions={SUBS} />);
    expect(screen.getByText('streaming')).toBeTruthy();
  });
});
