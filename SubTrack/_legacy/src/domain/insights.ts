import { createHash } from "node:crypto";

export type InsightConfidence = "low" | "medium" | "high";
export type InsightType = "likely_price_change" | "possible_duplicate_coverage" | "low_confidence_recurring" | "unexpected_renewal_pattern";
export interface InsightEvidence { subscriptionIds: string[]; eventIds: string[]; window: { from: string; to: string }; baseline: string }
export interface Insight {
  id: string; type: InsightType; version: "1"; claim: string; confidence: InsightConfidence; confidenceReason: string;
  evidence: InsightEvidence; generatedAt: string; expiresAt: string; suggestedAction: string; explanation: string;
  disclaimer: "Based on observed data, not financial advice";
}
export interface InsightSubscription {
  id: string; ownerId: string; merchantName: string; category: string; currency: string; cadence: "monthly";
  activeFrom: string; activeTo?: string; confidence: InsightConfidence; observations: { id: string; date: string; amountMinor: number }[];
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const stableId = (type: InsightType, ids: string[]) => createHash("sha256").update(`${type}:1:${[...ids].sort().join(":")}`).digest("hex").slice(0, 24);
const expiry = (now: Date) => new Date(now.getTime() + 30 * 86_400_000).toISOString();
const overlaps = (a: InsightSubscription, b: InsightSubscription) => a.activeFrom <= (b.activeTo ?? "9999") && b.activeFrom <= (a.activeTo ?? "9999");

export function generateInsights(subscriptions: readonly InsightSubscription[], viewerId: string, now = new Date()): Insight[] {
  const visible = subscriptions.filter(subscription => subscription.ownerId === viewerId);
  const result: Insight[] = [];
  for (const subscription of visible) {
    const events = [...subscription.observations].sort((a, b) => a.date.localeCompare(b.date));
    if (events.length >= 4) {
      const split = Math.floor(events.length / 2), before = events.slice(0, split), after = events.slice(split);
      const oldAmount = before[0]!.amountMinor, newAmount = after[0]!.amountMinor;
      if (before.every(e => e.amountMinor === oldAmount) && after.length >= 2 && after.every(e => e.amountMinor === newAmount) && oldAmount !== newAmount) {
        result.push(make("likely_price_change", [subscription], events, now, `${subscription.merchantName} appears to have changed price.`, "high", "At least two consistent charges were observed before and after the change.", `Review the ${subscription.merchantName} subscription.`, `Charges changed from ${oldAmount} to ${newAmount} minor ${subscription.currency} units and remained at the new amount.`));
      }
    }
    if (subscription.confidence === "low" && events.length >= 2) {
      result.push(make("low_confidence_recurring", [subscription], events, now, `Is ${subscription.merchantName} a recurring payment?`, "low", "The merchant or payment timing is ambiguous.", "Confirm or dismiss this recurring-payment candidate.", "This was flagged for confirmation because the observed pattern is not reliable enough to classify automatically."));
    }
    if (events.length >= 3) {
      const gaps = events.slice(1).map((event, index) => days(events[index]!.date, event.date));
      const unusual = gaps.findIndex(gap => gap < 25 || gap > 35);
      if (unusual >= 0) result.push(make("unexpected_renewal_pattern", [subscription], events, now, `${subscription.merchantName} renewed outside its usual monthly window.`, "medium", "One observed interval was outside the 25–35 day tolerance.", "Check whether the billing cadence changed.", `The interval between ${events[unusual]!.date} and ${events[unusual + 1]!.date} was ${gaps[unusual]} days; the stated tolerance is 25–35 days.`));
    }
  }
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i]!, b = visible[j]!;
    if (a.category === b.category && overlaps(a, b)) {
      result.push(make("possible_duplicate_coverage", [a, b], [...a.observations, ...b.observations], now, `Could ${a.merchantName} and ${b.merchantName} provide overlapping ${a.category} coverage?`, "medium", "Two active subscriptions share a category and overlap in time.", "Compare the services before making any change.", `The category “${a.category}” and the active periods of both subscriptions caused this suggestion.`));
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function make(type: InsightType, subscriptions: InsightSubscription[], events: InsightSubscription["observations"], now: Date, claim: string, confidence: InsightConfidence, confidenceReason: string, suggestedAction: string, explanation: string): Insight {
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const subscriptionIds = subscriptions.map(s => s.id).sort();
  return { id: stableId(type, subscriptionIds), type, version: "1", claim, confidence, confidenceReason, evidence: { subscriptionIds, eventIds: ordered.map(e => e.id), window: { from: ordered[0]?.date ?? subscriptions[0]!.activeFrom, to: ordered.at(-1)?.date ?? subscriptions[0]!.activeFrom }, baseline: explanation }, generatedAt: now.toISOString(), expiresAt: expiry(now), suggestedAction, explanation, disclaimer: "Based on observed data, not financial advice" };
}
