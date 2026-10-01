import React from 'react';
import styles from './WelcomeScreen.module.css';

export interface WelcomeScreenProps {
  subtitle: string;
  wordmark?: string;
  reduceMotion?: boolean;
}

export function WelcomeScreen({
  subtitle,
  wordmark = 'SubTrack',
  reduceMotion = false,
}: WelcomeScreenProps) {
  return (
    <div className={styles.root}>
      <div className={[styles.aurora, reduceMotion ? styles['aurora--reduced'] : ''].join(' ')} aria-hidden="true" />
      <h1 className={styles.wordmark}>
        <span>{wordmark}</span>
      </h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </div>
  );
}
