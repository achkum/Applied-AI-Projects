import { notFound } from 'next/navigation';
import { RegistrationFlow } from '@/components/onboarding/registration-flow';
import { isLocale } from '../layout';

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <RegistrationFlow locale={locale} />;
}
