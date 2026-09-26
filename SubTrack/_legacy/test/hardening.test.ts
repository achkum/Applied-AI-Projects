import test from "node:test";
import assert from "node:assert/strict";
import { generateInsights, type InsightSubscription } from "../src/domain/insights.js";
import { canViewSubscription, deleteImportedData, exportUserData, requireOwner, revokeShare, type PrivacyState } from "../src/domain/privacy.js";
import { safeEvent } from "../src/domain/telemetry.js";

const observed = (id: string, ownerId: string, merchantName: string, category: string, amounts: number[], dates = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"]): InsightSubscription => ({ id, ownerId, merchantName, category, currency: "SEK", cadence: "monthly", activeFrom: dates[0]!, confidence: "high", observations: amounts.map((amountMinor, i) => ({ id: `${id}-${i}`, date: dates[i]!, amountMinor })) });

test("insights are evidence-based, explainable, stable, and tenant scoped", () => {
  const data = [observed("a", "alice", "Stream A", "video", [100, 100, 120, 120]), observed("b", "alice", "Stream B", "video", [80, 80, 80, 80]), observed("secret", "bob", "Private", "video", [1, 1, 2, 2])];
  const first = generateInsights(data, "alice", new Date("2026-09-01T00:00:00Z"));
  const second = generateInsights(data, "alice", new Date("2026-09-01T00:00:00Z"));
  assert.deepEqual(first, second);
  assert.ok(first.some(x => x.type === "likely_price_change"));
  assert.ok(first.some(x => x.type === "possible_duplicate_coverage"));
  assert.ok(first.every(x => x.explanation && x.evidence.eventIds.length && x.disclaimer));
  assert.ok(first.every(x => !x.evidence.subscriptionIds.includes("secret")));
});

function privacyState(): PrivacyState { return { connections: [{ id: "c-a", ownerId: "alice" }, { id: "c-b", ownerId: "bob" }], transactions: [{ id: "t-a", ownerId: "alice" }, { id: "t-b", ownerId: "bob" }], subscriptions: [{ id: "s-a", ownerId: "alice" }, { id: "s-b", ownerId: "bob" }], insights: [{ id: "i-a", ownerId: "alice", sourceIds: ["s-a"] }, { id: "i-b", ownerId: "bob", sourceIds: ["s-b"] }], shares: [{ id: "share", ownerId: "alice", subscriptionId: "s-a", audienceIds: ["cara"], active: true }], tombstones: [] }; }

test("object authorization does not disclose existence across tenants", () => {
  const state = privacyState();
  assert.throws(() => requireOwner(state.transactions.find(x => x.id === "t-a"), "bob"), /^Error: not found$/);
  assert.equal(canViewSubscription(state, "s-a", "cara"), true);
  assert.equal(canViewSubscription(state, "s-b", "cara"), false);
  assert.equal(canViewSubscription(state, "missing", "cara"), false);
});
test("share revocation immediately removes access and derived insight", () => {
  const state = privacyState(); revokeShare(state, "share", "alice");
  assert.equal(canViewSubscription(state, "s-a", "cara"), false); assert.equal(state.insights.some(x => x.id === "i-a"), false);
});
test("export is tenant-scoped and deletion cascades with payload-free tombstones", () => {
  const state = privacyState(); const exported = exportUserData(state, "alice");
  assert.deepEqual(exported.transactions.map(x => x.id), ["t-a"]);
  deleteImportedData(state, "alice", new Date("2026-09-01T00:00:00Z"));
  assert.deepEqual(state.transactions.map(x => x.id), ["t-b"]); assert.deepEqual(state.insights.map(x => x.id), ["i-b"]);
  assert.ok(state.tombstones.length >= 4); assert.ok(state.tombstones.every(x => !Object.hasOwn(x, "payload")));
});
test("telemetry pseudonymizes identifiers and drops sensitive fields", () => {
  const event = safeEvent("ingestion.completed", { actorId: "alice", householdId: "home", transactionDescription: "SECRET SHOP", accessToken: "token", count: 3 }, "test-salt");
  const encoded = JSON.stringify(event); assert.ok(!encoded.includes("alice")); assert.ok(!encoded.includes("home")); assert.ok(!encoded.includes("SECRET")); assert.ok(!encoded.includes("token")); assert.equal(event.count, 3);
});
