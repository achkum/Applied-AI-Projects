import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.config.ts');

export default withNextIntl({
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
});
