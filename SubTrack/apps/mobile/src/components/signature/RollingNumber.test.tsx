import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RollingNumber } from './RollingNumber';

const mockUseReducedMotion = jest.fn(() => false);

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () =>
    jest
      .requireActual<typeof import('./testUtils/contextMocks')>('./testUtils/contextMocks')
      .makeTheme(),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () =>
    jest
      .requireActual<typeof import('./testUtils/contextMocks')>('./testUtils/contextMocks')
      .makeI18n('en'),
}));
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

describe('RollingNumber', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('renders the locale-formatted amount for the selected period', () => {
    render(
      <RollingNumber
        amountMinorUnits={139000}
        currencyCode="SEK"
        period="monthly"
        onPeriodChange={jest.fn()}
      />,
    );
    expect(screen.getByText('SEK 1,390')).toBeTruthy();
  });

  it('shows a loading state when the amount is null', () => {
    render(
      <RollingNumber
        amountMinorUnits={null}
        currencyCode="SEK"
        period="monthly"
        onPeriodChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Loading total')).toBeTruthy();
  });

  it('shows an unavailable state distinct from loading', () => {
    render(
      <RollingNumber
        amountMinorUnits={null}
        currencyCode="SEK"
        period="monthly"
        onPeriodChange={jest.fn()}
        isUnavailable
      />,
    );
    expect(screen.getByText('Total unavailable')).toBeTruthy();
  });

  it('calls onPeriodChange when the annual toggle is pressed', () => {
    const onPeriodChange = jest.fn();
    render(
      <RollingNumber
        amountMinorUnits={139000}
        currencyCode="SEK"
        period="monthly"
        onPeriodChange={onPeriodChange}
      />,
    );
    fireEvent.press(screen.getByLabelText('Annual'));
    expect(onPeriodChange).toHaveBeenCalledWith('annual');
  });

  it('exposes accessibilityState selected on the active period toggle', () => {
    render(
      <RollingNumber
        amountMinorUnits={139000}
        currencyCode="SEK"
        period="annual"
        onPeriodChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Annual').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByLabelText('Monthly').props.accessibilityState).toEqual({
      selected: false,
    });
  });
});
