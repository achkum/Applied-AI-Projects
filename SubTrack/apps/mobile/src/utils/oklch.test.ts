import { oklchToRgb } from './oklch';

describe('oklchToRgb', () => {
  it('converts an oklch() token to a well-formed rgb() string', () => {
    expect(oklchToRgb('oklch(0.58 0.14 0)')).toMatch(
      /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/,
    );
  });

  it('is deterministic for the same input', () => {
    const a = oklchToRgb('oklch(0.72 0.14 147.2727)');
    const b = oklchToRgb('oklch(0.72 0.14 147.2727)');
    expect(a).toBe(b);
  });

  it('produces visually distinct colors for distinct hues', () => {
    const hueA = oklchToRgb('oklch(0.58 0.14 0)');
    const hueB = oklchToRgb('oklch(0.58 0.14 180)');
    expect(hueA).not.toBe(hueB);
  });

  it('clamps out-of-gamut channels instead of throwing', () => {
    expect(() => oklchToRgb('oklch(0.99 0.4 300)')).not.toThrow();
  });

  it('throws a TypeError for a malformed token', () => {
    expect(() => oklchToRgb('not-a-color')).toThrow(TypeError);
  });
});
