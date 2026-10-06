import localFont from 'next/font/local';

export const fraunces = localFont({
  src: '../public/fonts/Fraunces-VF.ttf',
  variable: '--font-display',
  display: 'swap',
  weight: '100 900',
  preload: true,
});

export const manrope = localFont({
  src: '../public/fonts/Manrope-VF.ttf',
  variable: '--font-ui',
  display: 'swap',
  weight: '200 800',
  preload: true,
});

// JetBrains Mono is not used by Welcome and has not been supplied as a verified
// web font asset. The token's monospace stack remains the documented fallback.
export const fontClassNames = `${fraunces.variable} ${manrope.variable}`;
