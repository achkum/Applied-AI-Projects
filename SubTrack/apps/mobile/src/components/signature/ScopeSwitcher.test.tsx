import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { ScopeSwitcher } from './ScopeSwitcher';
import { ScopeOption } from './types';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => require('./testUtils/contextMocks').makeTheme(),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () => require('./testUtils/contextMocks').makeI18n('en'),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const options: ScopeOption[] = [
  { kind: 'me' },
  { kind: 'household' },
  { kind: 'member', memberId: 'member-1', displayName: 'Alex' },
];

describe('ScopeSwitcher', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes each segment with accessibilityRole radio and a name', () => {
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Me' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Household' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Alex' })).toBeTruthy();
  });

  it('marks only the selected segment as accessibilityState selected', () => {
    render(<ScopeSwitcher options={options} selectedIndex={1} onSelect={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Household' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByRole('radio', { name: 'Me' }).props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('calls onSelect with the pressed segment index', () => {
    const onSelect = jest.fn();
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Household' }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('triggers a light haptic impact on scope change', () => {
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={jest.fn()} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Household' }));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('does not fire haptics or onSelect when re-pressing the already-selected segment', () => {
    const onSelect = jest.fn();
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Me' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('announces the newly selected scope for screen readers', () => {
    render(<ScopeSwitcher options={options} selectedIndex={0} onSelect={jest.fn()} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Alex' }));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Alex selected');
  });
});
