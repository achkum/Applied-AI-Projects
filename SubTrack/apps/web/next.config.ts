import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl({
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  rewrites: process.env.NODE_ENV === 'development'
    ? async () => [{
        source: '/api/v2/auth/:path*',
        destination: 'http://127.0.0.1:4000/v2/auth/:path*',
      }]
    : undefined,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
});
