import { catalogs, type Locale } from '@subtrack/i18n';
import { WelcomeScreen } from './welcome-screen';

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'sv' && locale !== 'en') {
    return null;
  }

  return <WelcomeScreen locale={locale as Locale} tagline={catalogs[locale].onboarding.welcome.tagline} />;
}
