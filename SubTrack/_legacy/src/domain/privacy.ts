export interface OwnedRecord { id: string; ownerId: string }
export interface PrivacyState {
  connections: OwnedRecord[]; transactions: OwnedRecord[]; subscriptions: OwnedRecord[]; insights: (OwnedRecord & { sourceIds: string[] })[];
  shares: (OwnedRecord & { subscriptionId: string; audienceIds: string[]; active: boolean })[]; tombstones: { recordType: string; recordId: string; deletedAt: string }[];
}

export function requireOwner<T extends OwnedRecord>(record: T | undefined, actorId: string): T {
  if (!record || record.ownerId !== actorId) throw new Error("not found");
  return record;
}
export function canViewSubscription(state: PrivacyState, subscriptionId: string, actorId: string): boolean {
  const subscription = state.subscriptions.find(item => item.id === subscriptionId);
  return Boolean(subscription && (subscription.ownerId === actorId || state.shares.some(share => share.active && share.subscriptionId === subscriptionId && share.audienceIds.includes(actorId))));
}
export function revokeShare(state: PrivacyState, shareId: string, actorId: string): void {
  const share = requireOwner(state.shares.find(item => item.id === shareId), actorId);
  share.active = false;
  state.insights = state.insights.filter(insight => !insight.sourceIds.includes(share.subscriptionId));
}
export function deleteImportedData(state: PrivacyState, actorId: string, now = new Date()): void {
  const ownedSources = new Set([...state.transactions, ...state.subscriptions].filter(item => item.ownerId === actorId).map(item => item.id));
  for (const [recordType, records] of [["connection", state.connections], ["transaction", state.transactions], ["subscription", state.subscriptions]] as const)
    for (const record of records.filter(item => item.ownerId === actorId)) state.tombstones.push({ recordType, recordId: record.id, deletedAt: now.toISOString() });
  for (const record of state.insights.filter(item => item.ownerId === actorId || item.sourceIds.some(id => ownedSources.has(id))))
    state.tombstones.push({ recordType: "insight", recordId: record.id, deletedAt: now.toISOString() });
  state.connections = state.connections.filter(item => item.ownerId !== actorId);
  state.transactions = state.transactions.filter(item => item.ownerId !== actorId);
  state.subscriptions = state.subscriptions.filter(item => item.ownerId !== actorId);
  state.insights = state.insights.filter(item => item.ownerId !== actorId && !item.sourceIds.some(id => ownedSources.has(id)));
  state.shares = state.shares.filter(item => item.ownerId !== actorId && !ownedSources.has(item.subscriptionId));
}
export function exportUserData(state: PrivacyState, actorId: string) {
  return { schemaVersion: 1, exportedFor: actorId, connections: state.connections.filter(x => x.ownerId === actorId), transactions: state.transactions.filter(x => x.ownerId === actorId), subscriptions: state.subscriptions.filter(x => x.ownerId === actorId), insights: state.insights.filter(x => x.ownerId === actorId), shares: state.shares.filter(x => x.ownerId === actorId) };
}
