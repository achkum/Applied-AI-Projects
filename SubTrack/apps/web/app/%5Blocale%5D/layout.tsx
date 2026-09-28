import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return [{ locale: 'sv' }, { locale: 'en' }];
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const validLocales = ['sv', 'en'];
  if (!validLocales.includes(locale)) {
    notFound();
  }

  await getMessages({ locale });

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
