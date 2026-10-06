import styles from './welcome-screen.module.css';

export function WelcomeScreen({
  locale,
  tagline,
}: {
  locale: 'sv' | 'en';
  tagline: string;
}) {
  return (
    <main className={styles.frame} lang={locale}>
      <section aria-labelledby="welcome-wordmark" className={styles.hero}>
        <h1 className={styles.wordmark} id="welcome-wordmark">
          SubTrack
        </h1>
        <p className={styles.tagline}>{tagline}</p>
      </section>
    </main>
  );
}
