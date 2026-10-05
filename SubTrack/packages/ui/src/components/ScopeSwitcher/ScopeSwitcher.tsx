import React from 'react';
import { memberAccentForId } from '@subtrack/ui-tokens/member-accent';
import styles from './ScopeSwitcher.module.css';

export type ScopeOption =
  | { kind: 'me'; label: string }
  | { kind: 'household'; label: string }
  | { kind: 'member'; memberId: string; displayName: string };

export interface ScopeSwitcherProps {
  options: ScopeOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel?: string;
  selectedAnnouncementLabel?: (name: string) => string;
}

function optionLabel(opt: ScopeOption): string {
  return opt.kind === 'member' ? opt.displayName : opt.label;
}

function optionAccentVar(opt: ScopeOption): string {
  if (opt.kind === 'me') return 'var(--aurora-violet)';
  if (opt.kind === 'household') return 'var(--aurora-green)';
  const slot = memberAccentForId(opt.memberId).replace(/\./g, '-');
  return `var(--${slot})`;
}

export function ScopeSwitcher({
  options,
  selectedIndex,
  onSelect,
  ariaLabel = 'Scope',
  selectedAnnouncementLabel,
}: ScopeSwitcherProps) {
  const selectedOption = options[selectedIndex];
  const accent = selectedOption != null ? optionAccentVar(selectedOption) : 'var(--aurora-violet)';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={styles.root}
      style={{ '--scope-accent': accent } as React.CSSProperties}
    >
      {options.map((opt, i) => {
        const label = optionLabel(opt);
        const isSelected = i === selectedIndex;
        return (
          <button
            key={opt.kind === 'member' ? opt.memberId : opt.kind}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            className={[styles.segment, isSelected ? styles.selected : ''].join(' ')}
            onFocus={(event) => {
              event.currentTarget.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
                behavior: 'instant',
              });
            }}
            onClick={() => {
              if (isSelected) return;
              onSelect(i);
              if (selectedAnnouncementLabel) {
                const msg = selectedAnnouncementLabel(label);
                const el = document.createElement('div');
                el.setAttribute('aria-live', 'polite');
                el.setAttribute('aria-atomic', 'true');
                el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';
                document.body.appendChild(el);
                requestAnimationFrame(() => {
                  el.textContent = msg;
                  setTimeout(() => document.body.removeChild(el), 1000);
                });
              }
            }}
          >
            {opt.kind === 'member' && (
              <span
                className={styles.avatar}
                aria-hidden="true"
                style={{ '--member-accent': optionAccentVar(opt) } as React.CSSProperties}
              >
                {opt.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className={styles.label}>{label}</span>
            {isSelected && (
              <svg className={styles.selectedIndicator} viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3 8.5 6.5 12 13 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="var(--scope-switcher-selected-indicator-stroke-width)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
