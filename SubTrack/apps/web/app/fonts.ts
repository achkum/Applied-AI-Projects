import { Fraunces, Manrope, JetBrains_Mono } from 'next/font/google';

// Variable font — optical size (opsz), softness (SOFT), wackiness (WONK) axes
// per DESIGN_DIRECTION.md §3. Hero numerals use large opsz with tabular-lining figures.
export const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT', 'WONK'],
  display: 'swap',
});

// Variable font for all UI text.
export const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

// Variable font for identifiers, codes, and monospaced contexts.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
