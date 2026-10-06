import { notFound } from 'next/navigation';
import { SubscriptionDetail } from './subscription-detail';

export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if ((locale !== 'sv' && locale !== 'en') || id !== 'spotify') notFound();
  return <SubscriptionDetail locale={locale} />;
}
