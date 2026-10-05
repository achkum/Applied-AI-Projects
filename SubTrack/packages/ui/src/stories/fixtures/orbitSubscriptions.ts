import type { OrbitSubscription } from '../../components/Orbit/types';

export const SAMPLE_SUBS: OrbitSubscription[] = [
  { id: 'netflix',  name: 'Netflix',   category: 'streaming',    ownerType: 'ME',        monthlyCostMinor: 13900, billingCadence: 'MONTHLY' },
  { id: 'spotify',  name: 'Spotify',   category: 'music',        ownerType: 'ME',        monthlyCostMinor:  9900, billingCadence: 'MONTHLY' },
  { id: 'gh',       name: 'GitHub',    category: 'productivity', ownerType: 'ME',        monthlyCostMinor:  8800, billingCadence: 'ANNUAL'  },
  { id: 'icloud',   name: 'iCloud',    category: 'cloud',        ownerType: 'HOUSEHOLD', monthlyCostMinor:  2900, billingCadence: 'MONTHLY' },
  { id: 'hbo',      name: 'HBO Max',   category: 'streaming',    ownerType: 'HOUSEHOLD', monthlyCostMinor: 11900, billingCadence: 'MONTHLY' },
  { id: 'peloton',  name: 'Peloton',   category: 'fitness',      ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor: 44900, billingCadence: 'MONTHLY' },
  { id: 'xbox',     name: 'Xbox GP',   category: 'gaming',       ownerType: 'MEMBER', memberId: 'bob',   monthlyCostMinor:  8900, billingCadence: 'MONTHLY' },
  { id: 'nytimes',  name: 'NYTimes',   category: 'news',         ownerType: 'MEMBER', memberId: 'alice', monthlyCostMinor:  1700, billingCadence: 'ANNUAL'  },
];
