export type BillingCadence = 'MONTHLY' | 'ANNUAL';
export type OwnerType = 'ME' | 'HOUSEHOLD' | 'MEMBER';

/** Localized display copy prepared by the host; Orbit never formats money or enums. */
export interface OrbitPresentation {
  categoryLabel: string;
  amountLabel: string;
  cadenceLabel: string;
  ownerLabel: string;
}

export interface OrbitSubscription {
  id: string;
  name: string;
  category: string;
  ownerType: OwnerType;
  /** Required when ownerType === 'MEMBER'; used for ring ordering. */
  memberId?: string;
  /** Cost in minor currency units (e.g. öre/cents). Used to size the body. */
  monthlyCostMinor: number;
  billingCadence: BillingCadence;
}

export interface BodyLayout {
  id: string;
  /** SVG x centre coordinate. */
  cx: number;
  /** SVG y centre coordinate. */
  cy: number;
  /** Circle radius in SVG units. */
  r: number;
  /** Ring index (0 = Me, 1 = Household, 2+ = member rings). */
  ring: number;
  /** Angle in radians, clockwise from top. */
  angle: number;
  subscription: OrbitSubscription;
}

export interface OrbitLayoutResult {
  bodies: BodyLayout[];
  /** SVG viewBox width = height. */
  size: number;
  /** Centre coordinate (size / 2). */
  cx: number;
  cy: number;
}
