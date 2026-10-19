import {syntheticComparisonCatalogue} from './syntheticComparisonCatalogue';
import {projectNativeAnalytics} from './nativeAnalyticsProjection';
import sample from '../../../../packages/synthetic/src/sweden-subscriptions.json';

it('shares exact dated Swedish sample names, categories, cadences and minor units with the bank fixture',()=>{
 expect(syntheticComparisonCatalogue).toHaveLength(sample.plans.length);expect(sample.plans).toHaveLength(16);
 expect(new Set(syntheticComparisonCatalogue.map(row=>row.id)).size).toBe(sample.plans.length);
 for(const [index,plan] of sample.plans.entries())expect(syntheticComparisonCatalogue[index]).toEqual({id:`fixture:${sample.version}-${plan.key}`,name:plan.name,categoryCode:plan.category,cadence:plan.cadence,amountMinor:plan.amountMinor,currency:'SEK',source:'synthetic-persona-fixture'});
 expect(syntheticComparisonCatalogue.find(row=>row.name==='Spotify Premium Family')).toMatchObject({amountMinor:'21900',cadence:'MONTHLY'});
 expect(syntheticComparisonCatalogue.find(row=>row.name==='Microsoft 365 Family')).toMatchObject({amountMinor:'155900',cadence:'ANNUAL'});
 expect(sample.snapshotDate).toBe('2026-10-18');expect(sample.synthetic).toBe(true);expect(sample.notice).toMatch(/simulated/);
 expect(Object.isFrozen(syntheticComparisonCatalogue)).toBe(true);expect(syntheticComparisonCatalogue.every(Object.isFrozen)).toBe(true);
 expect(syntheticComparisonCatalogue.some(row=>'verifiedAt'in row)).toBe(false);
});
it('admits every sample through the actual projection identifier contract without creating owner records or totals',()=>{
 const projection=projectNativeAnalytics([],null,new Date(2026,9,18),syntheticComparisonCatalogue);
 expect(projection.plans).toEqual(syntheticComparisonCatalogue);expect(projection.active).toEqual([]);expect(projection.totals).toEqual([]);expect(projection.historyAvailable).toBe(false);
});
