export type {
  ActiveShare,
  HouseholdMembership,
  SubscriptionVisibilityContext,
  VisibilityDecision,
} from './types.js';

export { evaluateSubscriptionVisibility } from './subscription-visibility.js';
export type { DataCategory } from './data-category.js';
export { isSharableCategory } from './data-category.js';
