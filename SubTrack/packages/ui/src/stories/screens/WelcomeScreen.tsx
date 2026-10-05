import type { Locale, Catalog } from '@subtrack/i18n';
import { catalogs } from '@subtrack/i18n';
import styles from './WelcomeScreen.module.css';

export type WelcomeCopyKey = 'onboarding.welcome.tagline';

const copyReaders: Record<WelcomeCopyKey, (catalog: Catalog) => string> = {
  'onboarding.welcome.tagline': (catalog) => catalog.onboarding.welcome.tagline,
};

export interface WelcomeScreenProps {
  locale: Locale;
  reducedMotion?: boolean;
}

export function t(locale: Locale, key: WelcomeCopyKey): Catalog['onboarding']['welcome']['tagline'] {
  return copyReaders[key](catalogs[locale]);
}

export function WelcomeScreen({ locale, reducedMotion = false }: WelcomeScreenProps) {
  return (
    <main className={styles.frame} data-story="screens-welcome">
      <section
        aria-labelledby="welcome-wordmark"
        className={styles.hero}
        data-reduced-motion={reducedMotion ? 'true' : undefined}
      >
        <h1 className={styles.wordmark} id="welcome-wordmark">
          SubTrack
        </h1>
        <p className={styles.tagline}>{t(locale, 'onboarding.welcome.tagline')}</p>
      </section>
    </main>
  );
}
