'use strict';

function parseOpaqueRgb(color) {
  if (typeof color !== 'string') throw new TypeError('color must be a string');
  let m = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (m) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  m = color
    .trim()
    .match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (!m) throw new TypeError(`unsupported or translucent color: ${color}`);
  const rgb = m.slice(1).map(Number);
  if (rgb.some((v) => v > 255))
    throw new RangeError(`RGB channel out of range: ${color}`);
  return rgb;
}

function relativeLuminance(color) {
  const linear = parseOpaqueRgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a, b) {
  const x = relativeLuminance(a),
    y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Collapse layout whitespace while retaining NBSP used between currency and amount.
function normalizeVisibleText(text) {
  return String(text)
    .replace(/[\t\n\r\f ]+/g, ' ')
    .replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
}

module.exports = {
  parseOpaqueRgb,
  relativeLuminance,
  contrastRatio,
  normalizeVisibleText,
};
