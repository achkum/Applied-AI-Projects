/**
 * ST-021: Self-hosted font declarations for the SubTrack web app.
 *
 * next/font/google downloads and serves font files from the Next.js app server
 * at build time. No requests reach Google Fonts (or any CDN) at runtime —
 * the built app is self-sufficient.
 *
 * Three typefaces:
 *   fraunces  — variable display/numeral font (→ --font-display token)
 *   manrope   — variable sans-serif UI font  (→ --font-ui token)
 *   jetbrainsMono — monospaced code font     (→ --font-mono token)
 *
 * CSS variable names (.variable) are applied to <html> in the root layout
 * so every component can consume them via var(--font-display) etc.
 */

import { Fraunces, Manrope, JetBrains_Mono } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'WONK'],
  variable: '--font-display',
  display: 'swap',
  preload: true,
});

export const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
  preload: true,
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
});

/** All three font CSS-variable classnames joined — apply to <html>. */
export const fontClassNames =
  `${fraunces.variable} ${manrope.variable} ${jetbrainsMono.variable}`;
