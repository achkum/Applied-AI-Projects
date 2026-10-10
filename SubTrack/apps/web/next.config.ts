import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl({
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
});
