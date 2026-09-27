export function validateContrast(tokens) {
  const failures = [];
  for (const [theme, colors] of Object.entries(tokens.color))
    for (const pair of tokens.contrastPairs) {
      const fg = colors[pair.foreground],
        bg = colors[pair.background];
      if (!fg || !bg)
        throw new Error(
          `Unknown contrast token pair: ${pair.foreground} on ${pair.background} (${theme})`,
        );
      const ratio = contrast(fg, bg);
      if (ratio < 4.5)
        failures.push(
          `${theme}: ${pair.foreground} on ${pair.background} = ${ratio.toFixed(2)}:1 (requires 4.5:1)`,
        );
    }
  for (const [name, values] of Object.entries(tokens.memberAccent.slots)) {
    for (const theme of Object.keys(tokens.color)) {
      const accent = values[theme];
      const surface = tokens.color[theme]['bg.raised'];
      const ratio = contrast(accent, surface);
      if (ratio < 3)
        failures.push(
          `${theme}: ${name} on bg.raised = ${ratio.toFixed(2)}:1 (requires 3:1 for non-text identity accent)`,
        );
    }
  }
  return failures;
}
function contrast(fg, bg) {
  const a = luminance(parse(fg)),
    b = luminance(parse(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function parse(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color))
    throw new Error(
      `Contrast pair color must be opaque #RRGGBB; received ${color}`,
    );
  return [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}
function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
