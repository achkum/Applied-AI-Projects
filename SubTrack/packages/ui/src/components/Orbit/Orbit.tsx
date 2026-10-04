import React from 'react';
import styles from './Orbit.module.css';
import { computeOrbitLayout, HIT_TARGET_REFERENCE_SIZE } from './orbitMath';
import type { OrbitSubscription } from './types';

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
}

export function Orbit({
  subscriptions,
  onBodySelect,
  activeId,
  ariaLabel = 'Subscription orbit',
  className,
}: OrbitProps) {
  const { bodies, size, cx, cy } = computeOrbitLayout(subscriptions);

  // Ring track radii derived from the layout (we know rings 0–3 map to these radii)
  const ringRadii = [72, 152, 232, 312];
  const usedRings = [...new Set(bodies.map((b) => b.ring))].sort((a, z) => a - z);

  return (
    <figure
      aria-label={ariaLabel}
      className={className}
      style={{ position: 'relative' }}
    >
      {/* Accessible fallback list for screen readers */}
      <ul className={styles.a11yList}>
        {subscriptions.map((s) => (
          <li key={s.id}>
            {s.name} — {s.ownerType} — {s.billingCadence}
          </li>
        ))}
      </ul>

      <svg
        className={styles.orbit}
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
          Me
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
                  role="button"
                  tabIndex={0}
                  aria-label={body.subscription.name}
                  onClick={() => onBodySelect?.(body.id)}
                  onKeyDown={(e) => {
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
                {/* Counter-rotate label so text stays readable */}
                <text
                  className={styles.bodyLabel}
                  x={body.cx}
                  y={body.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={8}
                  fill="currentColor"
                  style={{
                    pointerEvents: 'none',
                    userSelect: 'none',
                    transformOrigin: `${body.cx}px ${body.cy}px`,
                  }}
                >
                  {body.subscription.name.slice(0, 3)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </figure>
  );
}

export default Orbit;
