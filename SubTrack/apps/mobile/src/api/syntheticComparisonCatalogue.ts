import sample from '../../../../packages/synthetic/src/sweden-subscriptions.json';
import type {ComparisonPlan} from './nativeAnalyticsProjection';

/** Dated Swedish sample anchors, not live offers or equivalent eligibility/features.
 * The shared fixture also labels every historical charge and price change as simulated.
 */
export const syntheticComparisonCatalogue:readonly ComparisonPlan[]=Object.freeze(sample.plans.map(row=>{
 const id=`fixture:${sample.version}-${row.key}`;
 if(!/^fixture:[a-z0-9-]+$/.test(id)||!row.name||row.currency!=='SEK'||!/^[1-9]\d*$/.test(row.amountMinor)||(row.cadence!=='MONTHLY'&&row.cadence!=='ANNUAL'))throw new Error('Sample catalogue unavailable');
 return Object.freeze({id,name:row.name,categoryCode:row.category,cadence:row.cadence,amountMinor:BigInt(row.amountMinor).toString(),currency:row.currency,source:'synthetic-persona-fixture' as const});
}));
