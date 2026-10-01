import React from 'react';
import styles from './Orbit.module.css';
import { computeOrbitLayout } from './orbitMath';
import type { OrbitSubscription } from './types';

/** CSS custom-property names per category. The host app owns colour values. */
const CATEGORY_COLOR_VAR: Record<string, string> = {
  streaming:     '--color-cat-streaming',
  fitness:       '--color-cat-fitness',
  productivity:  '--color-cat-productivity',
  gaming:        '--color-cat-gaming',
  music:         '--color-cat-music',
  cloud:         '--color-cat-cloud',
  news:          '--color-cat-news',
  other:         '--color-cat-other',
};

function categoryColorVar(category: string): string {
  return CATEGORY_COLOR_VAR[category.toLowerCase()] ?? CATEGORY_COLOR_VAR['other'] ?? '--color-cat-other';
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
      role="img"
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
        aria-hidden="true"
        focusable="false"
      >
        {/* Static ring tracks */}
        {usedRings.map((ring) => {
          const r = ringRadii[Math.min(ring, ringRadii.length - 1)] ?? ringRadii[ringRadii.length - 1];
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
            const colorVar = `var(${categoryColorVar(body.subscription.category)}, #666)`;
            return (
              <g key={body.id}>
                <circle
                  className={styles.subscriptionBody}
                  cx={body.cx}
                  cy={body.cy}
                  r={body.r}
                  style={{ '--body-color': colorVar } as React.CSSProperties}
                  strokeWidth={isActive ? 2 : 0}
                  stroke={isActive ? 'var(--color-orbit-active-ring, #fff)' : undefined}
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
