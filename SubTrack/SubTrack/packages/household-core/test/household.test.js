import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptInvitation,
  calculateAllocations,
  completeTransfer,
  createHousehold,
  createSettlementRun,
  inviteMember,
  shareSubscription,
} from "../src/index.js";

const date = new Date("2026-09-26T00:00:00.000Z");

function householdWithMembers() {
  const household = createHousehold({ id: "home", name: "Home", ownerId: "alice", now: date });
  for (const [id, email] of [["bob", "bob@example.com"], ["cara", "cara@example.com"]]) {
    inviteMember(household, { id: `invite-${id}`, email, invitedBy: "alice", now: date });
    acceptInvitation(household, { invitationId: `invite-${id}`, userId: id, email, now: date });
  }
  return household;
}

test("invitations are explicit and email-bound", () => {
  const household = createHousehold({ name: "  Svenssons  ", ownerId: "alice", now: date });
  const invite = inviteMember(household, { id: "i1", email: "BOB@example.com", invitedBy: "alice", now: date });
  assert.equal(household.name, "Svenssons");
  assert.equal(invite.email, "bob@example.com");
  assert.throws(() => acceptInvitation(household, { invitationId: "i1", userId: "bob", email: "mallory@example.com" }), /does not match/);
  acceptInvitation(household, { invitationId: "i1", userId: "bob", email: "bob@example.com", now: date });
  assert.deepEqual(household.members.map((m) => m.userId), ["alice", "bob"]);
});

test("equal split allocates rounding deterministically by user id", () => {
  assert.deepEqual(calculateAllocations(100, ["cara", "alice", "bob"], { type: "equal" }), { alice: 34, bob: 33, cara: 33 });
});

test("percentage split uses integer basis points and largest remainder", () => {
  const result = calculateAllocations(101, ["bob", "alice"], { type: "percentage", basisPoints: { alice: 3333, bob: 6667 } });
  assert.deepEqual(result, { alice: 34, bob: 67 });
  assert.throws(() => calculateAllocations(100, ["alice", "bob"], { type: "percentage", basisPoints: { alice: 5000, bob: 4999 } }), /total/);
});

test("fixed split assigns the unallocated remainder explicitly", () => {
  assert.deepEqual(calculateAllocations(1_000, ["alice", "bob"], { type: "fixed", amountsMinor: { alice: 300, bob: 200 }, remainderUserId: "alice" }), { alice: 800, bob: 200 });
});

test("custom split must match the exact charge", () => {
  assert.deepEqual(calculateAllocations(999, ["alice", "bob"], { type: "custom", amountsMinor: { alice: 400, bob: 599 } }), { alice: 400, bob: 599 });
  assert.throws(() => calculateAllocations(1_000, ["alice", "bob"], { type: "custom", amountsMinor: { alice: 400, bob: 599 } }), /equal/);
});

test("sharing reveals only the selected subscription to selected members", () => {
  const household = householdWithMembers();
  const share = shareSubscription(household, {
    id: "share-music", subscriptionId: "music", ownerId: "alice", participantIds: ["alice", "bob"], rule: { type: "equal" }, now: date,
  });
  assert.deepEqual(share.participantIds, ["alice", "bob"]);
  assert.equal(household.shares.some((item) => item.subscriptionId === "other-private-subscription"), false);
  assert.throws(() => shareSubscription(household, { subscriptionId: "x", ownerId: "alice", participantIds: ["mallory"], rule: { type: "equal" } }), /not a household member/);
});

test("settlement is deterministic and completion is participant-only", () => {
  const household = householdWithMembers();
  shareSubscription(household, { id: "s1", subscriptionId: "stream", ownerId: "alice", participantIds: ["alice", "bob", "cara"], rule: { type: "equal" }, now: date });
  shareSubscription(household, { id: "s2", subscriptionId: "storage", ownerId: "bob", participantIds: ["alice", "bob"], rule: { type: "equal" }, now: date });
  const run = createSettlementRun(household, {
    id: "sept", currency: "SEK", now: date,
    charges: [
      { shareId: "s1", paidBy: "alice", amountMinor: 3_000, currency: "SEK" },
      { shareId: "s2", paidBy: "bob", amountMinor: 1_000, currency: "SEK" },
    ],
  });
  assert.deepEqual(run.balances, { alice: 1_500, bob: -500, cara: -1_000 });
  assert.deepEqual(run.transfers.map(({ fromUserId, toUserId, amountMinor }) => ({ fromUserId, toUserId, amountMinor })), [
    { fromUserId: "bob", toUserId: "alice", amountMinor: 500 },
    { fromUserId: "cara", toUserId: "alice", amountMinor: 1_000 },
  ]);
  assert.throws(() => completeTransfer(household, { runId: "sept", transferId: "sept:1", completedBy: "cara" }), /participant/);
  assert.equal(completeTransfer(household, { runId: "sept", transferId: "sept:1", completedBy: "bob", now: date }), false);
  assert.equal(completeTransfer(household, { runId: "sept", transferId: "sept:2", completedBy: "alice", now: date }), true);
});
