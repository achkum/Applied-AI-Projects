/**
 * ST-038 AC2 — smoke test that proves the render harness works end-to-end.
 * Renders a bare RN <Text> via @testing-library/react-native and asserts on output.
 * If detectHostComponentNames crashes (the RNTL/RN 0.74 incompatibility this task
 * fixes), this suite is the first to fail with the "Unsupported param type $ReadOnlyArray"
 * error before any component logic is exercised.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

describe('render harness smoke test', () => {
  it('renders a bare Text component and finds it by text', () => {
    render(
      <View>
        <Text>hello harness</Text>
      </View>,
    );
    expect(screen.getByText('hello harness')).toBeTruthy();
  });

  it('renders multiple elements and queries by testID', () => {
    render(
      <View testID="wrapper">
        <Text testID="label">ST-038</Text>
      </View>,
    );
    expect(screen.getByTestId('wrapper')).toBeTruthy();
    expect(screen.getByTestId('label')).toBeTruthy();
  });
});
