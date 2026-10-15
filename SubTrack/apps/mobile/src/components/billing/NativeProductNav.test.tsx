import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { catalogs } from '@subtrack/i18n';
import { NativeProductNav, type NativeProductDestination } from './NativeProductNav';

let mockLocale: 'en' | 'sv' = 'en';
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false) }));
jest.mock('@/context/I18nContext', () => ({ useI18n: () => jest.requireActual('../signature/testUtils/contextMocks').makeI18n(mockLocale) }));

it.each(['en', 'sv'] as const)('shows only real destinations with localized selected state in %s', language => {
  mockLocale = language;
  const onNavigate = jest.fn();
  const copy = catalogs[language].onboarding.productNav;
  render(<NativeProductNav active="month" onNavigate={onNavigate} />);
  expect(screen.getByTestId('native-product-navigation').props.accessibilityRole).toBe('tablist');
  expect(screen.getByTestId('native-product-navigation').props.accessibilityLabel).toBe(copy.label);
  expect(screen.getByRole('tab', { name: copy.month }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('tab', { name: copy.upcoming }).props.accessibilityState.selected).toBe(false);
  expect(screen.getByRole('tab', { name: copy.manage }).props.accessibilityState.selected).toBe(false);
  expect(screen.queryByText(/household|insights|subscriptions/i)).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: copy.manage }));
  expect(onNavigate).toHaveBeenCalledWith('manage' satisfies NativeProductDestination);
});
