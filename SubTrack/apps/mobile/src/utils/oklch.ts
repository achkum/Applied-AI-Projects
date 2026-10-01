/**
 * Converts a generated `oklch(L C H)` token string to an `rgb()` string that
 * React Native's style engine can render.
 *
 * `packages/ui-tokens` only emits category-hue tokens as `oklch()` strings
 * for both web and native (see `packages/ui-tokens/generated/theme.native.json`).
 * React Native 0.74's style engine does not parse `oklch()`, so native
 * consumers must convert the exact declared token value themselves. This
 * performs the standard OKLCH -> OKLab -> linear sRGB -> sRGB conversion;
 * it never invents or substitutes a color, only re-encodes the token's own
 * declared value.
 */
export function oklchToRgb(oklch: string): string {
  const match = oklch
    .trim()
    .match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (!match) {
    throw new TypeError(`Not a valid oklch() string: ${oklch}`);
  }
  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hueDegrees = Number(match[3]);

  const hueRadians = (hueDegrees * Math.PI) / 180;
  const labA = chroma * Math.cos(hueRadians);
  const labB = chroma * Math.sin(hueRadians);

  const l = lightness + 0.3963377774 * labA + 0.2158037573 * labB;
  const m = lightness - 0.1055613458 * labA - 0.0638541728 * labB;
  const s = lightness - 0.0894841775 * labA - 1.291485548 * labB;

  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;

  const linearR = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const linearG = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const linearB = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return `rgb(${toSrgbByte(linearR)}, ${toSrgbByte(linearG)}, ${toSrgbByte(linearB)})`;
}

function toSrgbByte(linear: number): number {
  const clampedLinear = Math.min(1, Math.max(0, linear));
  const encoded =
    clampedLinear <= 0.0031308
      ? clampedLinear * 12.92
      : 1.055 * Math.pow(clampedLinear, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}
