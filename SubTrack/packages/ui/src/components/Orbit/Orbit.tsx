import React, { useState, useSyncExternalStore } from 'react';
import { catalogs } from '@subtrack/i18n';
import type { Locale } from '@subtrack/i18n';
import styles from './Orbit.module.css';
import { computeOrbitLayout, HIT_TARGET_REFERENCE_SIZE } from './orbitMath';
import type { OrbitPresentation, OrbitSubscription } from './types';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const INVALID_PRESENTATION_ERROR =
  'Orbit requires a valid locale and nonblank presentation for every subscription when presentationById is provided.';

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionSnapshot(): boolean {
  // Default to the static list in server-rendered HTML until the client preference is known.
  return true;
}

function isNonblank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireValidPresentation(
  locale: Locale | undefined,
  subscriptions: readonly OrbitSubscription[],
  presentationById: Readonly<Record<string, OrbitPresentation>>,
): Locale {
  if (locale !== 'en' && locale !== 'sv') throw new Error(INVALID_PRESENTATION_ERROR);
  for (const subscription of subscriptions) {
    const presentation = presentationById[subscription.id];
    if (!presentation) throw new Error(INVALID_PRESENTATION_ERROR);
    if (
      !isNonblank(presentation.categoryLabel)
      || !isNonblank(presentation.amountLabel)
      || !isNonblank(presentation.cadenceLabel)
      || !isNonblank(presentation.ownerLabel)
    ) {
      throw new Error(INVALID_PRESENTATION_ERROR);
    }
  }
  return locale;
}

/** CSS custom-property names per category. The host app owns colour values. */
const CATEGORY_COLOR_VAR: Record<string, string> = {
  streaming:     '--category-video-streaming',
  fitness:       '--category-fitness-wellness',
  productivity:  '--category-software-productivity',
  gaming:        '--category-gaming',
  music:         '--category-music-audio',
  cloud:         '--category-cloud-storage',
  news:          '--category-news-magazines',
  other:         '--category-other-subscription',
};

function categoryColorVar(category: string): string {
  return CATEGORY_COLOR_VAR[category.toLowerCase()] ?? '--category-other-subscription';
}

export interface OrbitProps {
  subscriptions: OrbitSubscription[];
  /** Called when a body is selected (click or Enter/Space). */
  onBodySelect?: (id: string) => void;
  /** Active subscription id — highlighted body. */
  activeId?: string;
  /** Accessible label for the overall figure. */
  ariaLabel?: string;
  className?: string;
  /** Locale for Orbit-owned copy in enriched presentation mode. */
  locale?: Locale;
  /** Complete, localized display strings keyed by subscription ID. */
  presentationById?: Readonly<Record<string, OrbitPresentation>>;
}

export function Orbit({
  subscriptions,
  onBodySelect,
  activeId,
  ariaLabel = 'Subscription orbit',
  className,
  locale,
  presentationById,
}: OrbitProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
  const [userSelectedList, setUserSelectedList] = useState(false);
  const enrichedLocale = presentationById === undefined
    ? undefined
    : requireValidPresentation(locale, subscriptions, presentationById);
  const isEnriched = enrichedLocale !== undefined;
  const isListMode = isEnriched && (reducedMotion || userSelectedList);
  const catalog = enrichedLocale ? catalogs[enrichedLocale] : undefined;
  const listHeadingId = React.useId();
  const { bodies, size, cx, cy } = computeOrbitLayout(subscriptions);

  // Ring track radii derived from the layout (we know rings 0–3 map to these radii)
  const ringRadii = [72, 152, 232, 312];
  const usedRings = [...new Set(bodies.map((b) => b.ring))].sort((a, z) => a - z);

  const enrichedClassName = isEnriched
    ? [className, styles.enriched].filter(Boolean).join(' ')
    : className;

  return (
    <figure
      aria-label={catalog?.orbit.ariaLabel ?? ariaLabel}
      className={enrichedClassName}
      style={{ position: 'relative' }}
    >
      {isEnriched && catalog && presentationById ? (
        <>
          <button
            aria-pressed={isListMode}
            className={styles.modeToggle}
            disabled={reducedMotion}
            onClick={() => setUserSelectedList((selected) => !selected)}
            type="button"
          >
            {catalog.orbit.viewAsList}
          </button>
          <section
            aria-labelledby={listHeadingId}
            className={isListMode ? styles.presentationList : styles.a11yList}
          >
            <h2 className={styles.listHeading} id={listHeadingId}>
              {catalog.orbit.listLabel}
            </h2>
            <ul>
              {subscriptions.map((subscription) => {
                const presentation = presentationById[subscription.id];
                if (!presentation) return null;
                return (
                  <li key={subscription.id}>
                    <button
                      aria-pressed={activeId === subscription.id}
                      className={styles.listItem}
                      onClick={() => onBodySelect?.(subscription.id)}
                      onFocus={() => setUserSelectedList(true)}
                      type="button"
                    >
                      <span className={styles.listName}>{subscription.name}</span>
                      <span>{presentation.categoryLabel}</span>
                      <span>{presentation.amountLabel}</span>
                      <span>{presentation.cadenceLabel}</span>
                      <span>{presentation.ownerLabel}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        /* Preserve the exact legacy list for callers without an enriched presentation map. */
        <ul className={styles.a11yList}>
          {subscriptions.map((s) => (
            <li key={s.id}>
              {s.name} — {s.ownerType} — {s.billingCadence}
            </li>
          ))}
        </ul>
      )}

      <svg
        aria-hidden={isEnriched || undefined}
        className={styles.orbit}
        data-list-mode={isListMode ? 'true' : undefined}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Static ring tracks */}
        {usedRings.map((ring) => {
          const r = ringRadii[Math.min(ring, ringRadii.length - 1)] ?? 312;
          return (
        <circle
              key={`track-${ring}`}
              className={styles.ringTrack}
              cx={cx}
              cy={cy}
              r={r}
            />
          );
        })}

        {subscriptions.length === 0 && (
          <g className={styles.emptyConstellation} aria-hidden="true">
            <path d="M196 250 246 202 292 238 346 184 402 224 456 190" />
            <path d="M220 310 270 276 324 302 376 270 430 300" />
            <circle cx="196" cy="250" r="4" />
            <circle cx="246" cy="202" r="6" />
            <circle cx="292" cy="238" r="3" />
            <circle cx="346" cy="184" r="5" />
            <circle cx="402" cy="224" r="3" />
            <circle cx="456" cy="190" r="4" />
            <circle cx="220" cy="310" r="3" />
            <circle cx="270" cy="276" r="4" />
            <circle cx="324" cy="302" r="3" />
            <circle cx="376" cy="270" r="5" />
            <circle cx="430" cy="300" r="3" />
          </g>
        )}

        {/* Centre "Me" body — does not rotate */}
        <circle className={styles.centreBody} cx={cx} cy={cy} r={20} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fill="currentColor"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {catalog?.orbit.centreMeLabel ?? 'Me'}
        </text>

        {/* Rotating group */}
        <g className={styles.rotatingGroup}>
          {bodies.map((body) => {
            const isActive = body.id === activeId;
            const colorVar = `var(${categoryColorVar(body.subscription.category)})`;
            return (
              <g key={body.id}>
                <circle
                  className={styles.bodyHitTarget}
                  cx={body.cx}
                  cy={body.cy}
                  r={body.r * (size / HIT_TARGET_REFERENCE_SIZE)}
                  data-subscription-id={isEnriched ? body.id : undefined}
                  role={isEnriched ? undefined : 'button'}
                  tabIndex={isEnriched ? undefined : 0}
                  aria-label={isEnriched ? undefined : body.subscription.name}
                  onClick={() => onBodySelect?.(body.id)}
                  onKeyDown={isEnriched ? undefined : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onBodySelect?.(body.id);
                    }
                  }}
                />
                <circle
                  className={styles.subscriptionBody}
                  cx={body.cx}
                  cy={body.cy}
                  r={body.r}
                  style={{ '--body-color': colorVar } as React.CSSProperties}
                  strokeWidth={isActive ? 2 : 0}
                  stroke={isActive ? 'var(--ink-primary)' : undefined}
                />
                {/* Counter-rotate the opaque plate with its glyph to keep the underlay aligned. */}
                <g
                  aria-hidden="true"
                  className={styles.bodyLabelGroup}
                  style={{ transformOrigin: `${body.cx}px ${body.cy}px` }}
                >
                  <rect
                    aria-hidden="true"
                    className={styles.bodyLabelPlate}
                    height={14}
                    rx={2}
                    width={32}
                    x={body.cx - 16}
                    y={body.cy - 7}
                  />
                  <text
                    className={styles.bodyLabel}
                    x={body.cx}
                    y={body.cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={8}
                    fill="currentColor"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {body.subscription.name.slice(0, 3)}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </figure>
  );
}

export default Orbit;
