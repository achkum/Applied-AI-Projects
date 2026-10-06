import Link from 'next/link';
import demoFixture from '@subtrack/ui/demo-fixture';
import { catalogs, type Locale } from '@subtrack/i18n';
import styles from './demo-screen.module.css';

export function DemoScreen({
  locale,
  fixture = demoFixture,
}: {
  locale: Locale;
  fixture?: typeof demoFixture;
}) {
  const copy = catalogs[locale].demo;
  return (
    <main className={styles.frame} lang={locale}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 className={styles.title}>{fixture.householdName}</h1>
        <p className={styles.disclosure}>{copy.disclosure}</p>
      </header>
      <section aria-labelledby="subscriptions-heading" className={styles.listSection}>
        <h2 className={styles.sectionTitle} id="subscriptions-heading">{copy.subscriptions}</h2>
        <ul className={styles.list}>
          {fixture.subscriptions.map((subscription) => {
            return (
              <li className={styles.row} key={subscription.id}>
                <span className={styles.merchant}>{subscription.merchantName}</span>
                <span className={styles.price}>
                  <span>{subscription.displayAmount[locale] || copy.amountUnavailable}</span>
                  <span className={styles.cadence}> · {copy.cadence[subscription.billingCadence as 'MONTHLY' | 'ANNUAL']}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <Link className={styles.returnLink} href={`/${locale}`}>
        {copy.returnToWelcome}
      </Link>
    </main>
  );
}
