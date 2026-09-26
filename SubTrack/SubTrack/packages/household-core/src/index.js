import { randomUUID } from "node:crypto";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const unique = (values) => [...new Set(values)];
const byId = (a, b) => a.localeCompare(b);

export function createHousehold({ id = randomUUID(), name, ownerId, now = new Date() }) {
  assert(name?.trim(), "Household name is required");
  assert(ownerId, "Owner is required");
  return {
    id,
    name: name.trim(),
    ownerId,
    members: [{ userId: ownerId, role: "owner", joinedAt: now.toISOString() }],
    invitations: [],
    shares: [],
    settlementRuns: [],
  };
}

export function inviteMember(household, { id = randomUUID(), email, invitedBy, now = new Date() }) {
  requireMember(household, invitedBy);
  const normalizedEmail = email?.trim().toLowerCase();
  assert(normalizedEmail, "Invite email is required");
  assert(!household.invitations.some((i) => i.email === normalizedEmail && i.status === "pending"), "A pending invite already exists");
  const invitation = { id, email: normalizedEmail, invitedBy, status: "pending", createdAt: now.toISOString() };
  household.invitations.push(invitation);
  return invitation;
}

export function acceptInvitation(household, { invitationId, userId, email, now = new Date() }) {
  const invitation = household.invitations.find((i) => i.id === invitationId);
  assert(invitation?.status === "pending", "Invitation is not pending");
  assert(invitation.email === email?.trim().toLowerCase(), "Invitation email does not match");
  assert(!household.members.some((m) => m.userId === userId), "User is already a member");
  invitation.status = "accepted";
  invitation.acceptedAt = now.toISOString();
  invitation.acceptedBy = userId;
  household.members.push({ userId, role: "member", joinedAt: now.toISOString() });
}

export function shareSubscription(household, { id = randomUUID(), subscriptionId, ownerId, participantIds, rule, now = new Date() }) {
  requireMember(household, ownerId);
  const participants = unique(participantIds).sort(byId);
  assert(participants.length > 0, "At least one participant is required");
  participants.forEach((id) => requireMember(household, id));
  validateRule(rule, participants);
  const share = { id, subscriptionId, ownerId, participantIds: participants, rule, active: true, sharedAt: now.toISOString() };
  household.shares.push(share);
  return share;
}

export function calculateAllocations(amountMinor, participantIds, rule) {
  assert(Number.isSafeInteger(amountMinor) && amountMinor >= 0, "Amount must be a non-negative integer in minor units");
  const ids = unique(participantIds).sort(byId);
  validateRule(rule, ids);

  if (rule.type === "equal") {
    const base = Math.floor(amountMinor / ids.length);
    let remainder = amountMinor - base * ids.length;
    return Object.fromEntries(ids.map((id) => [id, base + (remainder-- > 0 ? 1 : 0)]));
  }

  if (rule.type === "percentage") {
    return largestRemainder(amountMinor, ids, (id) => rule.basisPoints[id], 10_000);
  }

  if (rule.type === "fixed") {
    const result = Object.fromEntries(ids.map((id) => [id, rule.amountsMinor[id] ?? 0]));
    const fixedTotal = Object.values(result).reduce((sum, value) => sum + value, 0);
    assert(fixedTotal <= amountMinor, "Fixed amounts exceed the charge");
    result[rule.remainderUserId] += amountMinor - fixedTotal;
    return result;
  }

  assert(Object.values(rule.amountsMinor).reduce((sum, value) => sum + value, 0) === amountMinor, "Custom amounts must equal the charge");
  return Object.fromEntries(ids.map((id) => [id, rule.amountsMinor[id]]));
}

export function createSettlementRun(household, { id = randomUUID(), charges, currency, now = new Date() }) {
  assert(currency, "Currency is required");
  const balances = Object.fromEntries(household.members.map((m) => [m.userId, 0]));

  for (const charge of charges) {
    assert(charge.currency === currency, "All charges must use the settlement currency");
    const share = household.shares.find((s) => s.id === charge.shareId && s.active);
    assert(share, `Active share ${charge.shareId} not found`);
    assert(charge.paidBy === share.ownerId, "Charge payer must own the shared subscription");
    const allocations = calculateAllocations(charge.amountMinor, share.participantIds, share.rule);
    balances[charge.paidBy] += charge.amountMinor;
    for (const [userId, amount] of Object.entries(allocations)) balances[userId] -= amount;
  }

  const transfers = settleBalances(balances).map((transfer, index) => ({
    id: `${id}:${index + 1}`,
    ...transfer,
    status: "pending",
    completedAt: null,
  }));
  const run = { id, currency, createdAt: now.toISOString(), balances, transfers };
  household.settlementRuns.push(run);
  return run;
}

export function completeTransfer(household, { runId, transferId, completedBy, now = new Date() }) {
  requireMember(household, completedBy);
  const run = household.settlementRuns.find((item) => item.id === runId);
  assert(run, "Settlement run not found");
  const transfer = run.transfers.find((item) => item.id === transferId);
  assert(transfer, "Transfer not found");
  assert(transfer.fromUserId === completedBy || transfer.toUserId === completedBy, "Only a transfer participant can complete it");
  assert(transfer.status === "pending", "Transfer is already complete");
  transfer.status = "completed";
  transfer.completedAt = now.toISOString();
  transfer.completedBy = completedBy;
  return run.transfers.every((item) => item.status === "completed");
}

function validateRule(rule, ids) {
  assert(rule && ["equal", "percentage", "fixed", "custom"].includes(rule.type), "Unsupported split rule");
  if (rule.type === "percentage") {
    assert(keysMatch(rule.basisPoints, ids), "Percentage rule must cover every participant");
    assert(valuesAreMinorUnits(rule.basisPoints), "Percentages must be non-negative integer basis points");
    assert(Object.values(rule.basisPoints).reduce((sum, value) => sum + value, 0) === 10_000, "Percentages must total 10000 basis points");
  }
  if (rule.type === "fixed" || rule.type === "custom") {
    assert(keysMatch(rule.amountsMinor, ids), `${rule.type} rule must cover every participant`);
    assert(valuesAreMinorUnits(rule.amountsMinor), "Amounts must be non-negative integers in minor units");
  }
  if (rule.type === "fixed") assert(ids.includes(rule.remainderUserId), "Fixed rule requires a participant to receive the remainder");
}

function largestRemainder(total, ids, weightFor, denominator) {
  const rows = ids.map((id) => {
    const numerator = total * weightFor(id);
    return { id, value: Math.floor(numerator / denominator), remainder: numerator % denominator };
  });
  let missing = total - rows.reduce((sum, row) => sum + row.value, 0);
  const ranked = [...rows].sort((a, b) => b.remainder - a.remainder || byId(a.id, b.id));
  for (let i = 0; i < missing; i++) ranked[i].value += 1;
  return Object.fromEntries(rows.map((row) => [row.id, row.value]));
}

function settleBalances(balances) {
  const creditors = Object.entries(balances).filter(([, value]) => value > 0).sort(([a], [b]) => byId(a, b)).map(([id, value]) => ({ id, value }));
  const debtors = Object.entries(balances).filter(([, value]) => value < 0).sort(([a], [b]) => byId(a, b)).map(([id, value]) => ({ id, value: -value }));
  assert(creditors.reduce((s, x) => s + x.value, 0) === debtors.reduce((s, x) => s + x.value, 0), "Settlement balances do not net to zero");
  const transfers = [];
  let creditor = 0;
  let debtor = 0;
  while (creditor < creditors.length && debtor < debtors.length) {
    const amountMinor = Math.min(creditors[creditor].value, debtors[debtor].value);
    transfers.push({ fromUserId: debtors[debtor].id, toUserId: creditors[creditor].id, amountMinor });
    creditors[creditor].value -= amountMinor;
    debtors[debtor].value -= amountMinor;
    if (creditors[creditor].value === 0) creditor += 1;
    if (debtors[debtor].value === 0) debtor += 1;
  }
  return transfers;
}

function requireMember(household, userId) {
  assert(household.members.some((member) => member.userId === userId), "User is not a household member");
}

function keysMatch(record, ids) {
  return record && Object.keys(record).sort(byId).join("\0") === [...ids].sort(byId).join("\0");
}

function valuesAreMinorUnits(record) {
  return Object.values(record).every((value) => Number.isSafeInteger(value) && value >= 0);
}
