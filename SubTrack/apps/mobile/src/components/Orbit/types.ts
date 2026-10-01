export type BillingCadence = 'MONTHLY' | 'ANNUAL';
export type OwnerType = 'ME' | 'HOUSEHOLD' | 'MEMBER';

export interface OrbitSubscription {
  id: string;
  name: string;
  category: string;
  ownerType: OwnerType;
  memberId?: string;
  /** Cost in minor currency units (e.g. öre/cents). */
  monthlyCostMinor: number;
  billingCadence: BillingCadence;
}

export interface BodyLayout {
  id: string;
  /** x offset from container centre. */
  dx: number;
  /** y offset from container centre. */
  dy: number;
  /** Circle radius in logical px. */
  r: number;
  ring: number;
  angle: number;
  subscription: OrbitSubscription;
}

export interface OrbitLayoutResult {
  bodies: BodyLayout[];
  /** Container width = height in logical px. */
  size: number;
  /** Centre coordinate (size / 2). */
  centre: number;
}
