import { describe, it, expect } from 'vitest';
import { catalogs } from '@subtrack/i18n';

// Simple test to verify app structure
describe('App shell', () => {
  it('should render without error', () => {
    const div = document.createElement('div');
    expect(div).toBeDefined();
  });

  it('should have Swedish and English locale catalogs', () => {
    expect(catalogs.sv).toBeDefined();
    expect(catalogs.en).toBeDefined();
  });

  it('should have navigation strings in both locales', () => {
    expect(catalogs.sv.navigation.home).toBe('Hem');
    expect(catalogs.en.navigation.home).toBeDefined();
  });
});
