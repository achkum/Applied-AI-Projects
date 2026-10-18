import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NativeProductBadge, NativeProductButton, NativeProductCard, NativeProductHeading, NativeProductLabel } from './NativeProductUI';

jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')}) }));

it('shows a distinct selected quiet segment while preserving its native selected state',()=>{
  const onPress=jest.fn();render(<><NativeProductButton label="Monthly" variant="quiet" selected onPress={onPress}/><NativeProductButton label="Yearly" variant="quiet" selected={false} onPress={onPress}/></>);
  const selected=screen.getByRole('button',{name:'Monthly'}),other=screen.getByRole('button',{name:'Yearly'});
  expect(selected.props.accessibilityState.selected).toBe(true);expect(other.props.accessibilityState.selected).toBe(false);
  const flatten=jest.requireActual('react-native').StyleSheet.flatten;
  expect(flatten(selected.props.style).backgroundColor).not.toBe(flatten(other.props.style).backgroundColor);
  fireEvent.press(other);expect(onPress).toHaveBeenCalledTimes(1);
});

it('provides a branded hierarchy and an accessible primary action', () => {
  const onPress = jest.fn();
  render(<>
    <NativeProductBadge label="Sandbox · simulated verification" />
    <NativeProductHeading eyebrow="PRIVATE SPACE" title="Your subscriptions" description="Saved dates and amounts." />
    <NativeProductCard><NativeProductLabel>Profile</NativeProductLabel></NativeProductCard>
    <NativeProductButton label="Continue" variant="primary" onPress={onPress} />
  </>);
  expect(screen.getByLabelText('Sandbox · simulated verification')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Your subscriptions' })).toBeTruthy();
  expect(screen.getByText('Profile')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('exposes disabled and selected state without dispatching', () => {
  const onPress = jest.fn();
  render(<NativeProductButton label="Month" onPress={onPress} disabled selected />);
  const button = screen.getByRole('button', { name: 'Month' });
  expect(button.props.accessibilityState).toEqual({ disabled: true, selected: true });
  fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});
