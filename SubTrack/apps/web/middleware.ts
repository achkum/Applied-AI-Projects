import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['sv', 'en'],
  defaultLocale: 'sv',
  localeDetection: true,
  // The opt-in private HTTPS root has an exact auth-cookie roster; route locale remains explicit.
  ...(process.env.ST237_PRIVATE_HTTPS === '1' ? { localeCookie: false as const } : {}),
});

export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
