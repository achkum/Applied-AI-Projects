import styles from './welcome-screen.module.css';
import Link from 'next/link';
import { catalogs } from '@subtrack/i18n';

export function WelcomeScreen({ locale, tagline }: { locale: 'sv' | 'en'; tagline: string }) {
  return (
    <main className={styles.frame} lang={locale}>
      <section aria-labelledby="welcome-wordmark" className={styles.hero}>
        <h1 className={styles.wordmark} id="welcome-wordmark">SubTrack</h1>
        <p className={styles.tagline}>{tagline}</p>
        <Link className={styles.demoLink} href={`/${locale}/register`}>
          {catalogs[locale].onboarding.welcome.createAccount}
        </Link>
        <Link className={styles.demoLink} href={`/${locale}/demo`}>
          {catalogs[locale].onboarding.welcome.exploreDemo}
        </Link>
      </section>
    </main>
  );
}
