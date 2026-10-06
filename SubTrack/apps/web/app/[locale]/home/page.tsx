import { notFound } from 'next/navigation';
import { HomeScreen } from './home-screen';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'sv' && locale !== 'en') notFound();
  return <HomeScreen locale={locale} />;
}
