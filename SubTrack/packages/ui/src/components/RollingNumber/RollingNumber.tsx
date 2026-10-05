import React from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion';
import { formatMoney } from '../../utils/formatMoney';
import styles from './RollingNumber.module.css';

export interface RollingNumberProps {
  amountMinor: number;
  currency: string;
  locale: 'sv-SE' | 'en-SE';
  period: 'monthly' | 'annual';
  onPeriodChange: (period: 'monthly' | 'annual') => void;
  monthlyLabel: string;
  annualLabel: string;
  periodGroupLabel?: string;
  isLoading?: boolean;
  loadingLabel?: string;
  unavailableLabel?: string;
}

export function RollingNumber({
  amountMinor,
  currency,
  locale,
  period,
  onPeriodChange,
  monthlyLabel,
  annualLabel,
  periodGroupLabel = 'Period',
  isLoading = false,
  loadingLabel = '…',
  unavailableLabel,
}: RollingNumberProps) {
  const prefersReducedMotion = useReducedMotion();
  const formatted = formatMoney(amountMinor, currency, locale);

  const spring: Transition = prefersReducedMotion
    ? { type: 'tween', duration: 0 }
    : { type: 'spring', damping: 18, stiffness: 180 };

  const displayText = isLoading
    ? loadingLabel
    : unavailableLabel != null
    ? unavailableLabel
    : formatted;

  return (
    <div className={styles.root}>
      <div
        className={styles.amount}
        aria-live="polite"
        aria-label={displayText}
        aria-busy={isLoading}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={displayText}
            initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
            transition={spring}
            className={styles.value}
          >
            {displayText}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className={styles.toggle} role="group" aria-label={periodGroupLabel}>
        <button
          type="button"
          className={[styles.toggleBtn, period === 'monthly' ? styles.active : ''].join(' ')}
          aria-pressed={period === 'monthly'}
          onClick={() => onPeriodChange('monthly')}
        >
          {monthlyLabel}
        </button>
        <button
          type="button"
          className={[styles.toggleBtn, period === 'annual' ? styles.active : ''].join(' ')}
          aria-pressed={period === 'annual'}
          onClick={() => onPeriodChange('annual')}
        >
          {annualLabel}
        </button>
      </div>
    </div>
  );
}
