import { notFound } from 'next/navigation';
import { DemoScreen } from './demo-screen';

export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'sv' && locale !== 'en') notFound();
  return <DemoScreen locale={locale} />;
}
