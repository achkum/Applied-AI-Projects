import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SubTrackBrand } from './SubTrackBrand';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeTheme(false),
}));

describe('SubTrackBrand', () => {
  it('exposes one product heading while keeping the glyph decorative', () => {
    render(<SubTrackBrand />);
    expect(screen.getAllByRole('header', { name: 'SubTrack' })).toHaveLength(1);
  });
  it('can render a decorative compact glyph without an extra heading', () => {
    render(<SubTrackBrand size={32} wordmark={false} />);
    expect(screen.queryByRole('header')).toBeNull();
  });
});
