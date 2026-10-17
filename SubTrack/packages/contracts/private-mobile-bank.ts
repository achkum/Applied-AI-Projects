/** Development-only owner Synthetic banking. Never accepts an owner or fixture selector. */
export const PRIVATE_MOBILE_BANK_PATHS = Object.freeze({
 read: '/v2/private/mobile/banks/synthetic/read',
 connect: '/v2/private/mobile/banks/synthetic/connect',
 sync: '/v2/private/mobile/banks/synthetic/sync',
 disconnect: '/v2/private/mobile/banks/synthetic/disconnect',
});
export type PrivateMobileBankOperation = 'read' | 'connect' | 'sync' | 'disconnect';
export type PrivateMobileBankSummary = Readonly<{
 connectionId: string; provider: 'SYNTHETIC'; institutionId: 'synthetic-demo-v1';
 status: 'ACTIVE' | 'REVOKED'; disposition: 'retained' | 'purged';
 accountCount: number; transactionCount: number; lastSyncAt: string | null;
}>;
export type PrivateMobileBankReadResult = Readonly<{connections: readonly PrivateMobileBankSummary[]}>;
export type PrivateMobileBankMutationResult = Readonly<{
 operation: Exclude<PrivateMobileBankOperation, 'read'>; connection: PrivateMobileBankSummary;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('bank-shape');
 const names = Reflect.ownKeys(value);
 const descriptors = Object.getOwnPropertyDescriptors(value);
 if (keys.some(key => !Object.prototype.hasOwnProperty.call(value, key)) || names.some(key => typeof key !== 'string' || !keys.includes(key) || !('value' in descriptors[key]!))) throw new Error('bank-shape');
 return value as Record<string, unknown>;
}
function connectionId(value: unknown): string {
 if (typeof value !== 'string' || !UUID.test(value)) throw new Error('bank-connection');
 return value;
}
function count(value: unknown): number {
 if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000 || Object.is(value, -0)) throw new Error('bank-count');
 return value;
}
function timestamp(value: unknown): string | null {
 if (value === null) return null;
 if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value) || value.startsWith('0000') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('bank-time');
 return value;
}
export function parsePrivateMobileBankRead(value: unknown): Readonly<Record<string, never>> {
 object(value, []); return {};
}
export function parsePrivateMobileBankConnect(value: unknown): Readonly<{institutionId: 'synthetic-demo-v1'}> {
 const v = object(value, ['institutionId']);
 if (v.institutionId !== 'synthetic-demo-v1') throw new Error('bank-institution');
 return {institutionId: 'synthetic-demo-v1'};
}
export function parsePrivateMobileBankSync(value: unknown): Readonly<{connectionId: string}> {
 const v = object(value, ['connectionId']); return {connectionId: connectionId(v.connectionId)};
}
export function parsePrivateMobileBankDisconnect(value: unknown): Readonly<{connectionId: string; purge: boolean}> {
 const v = object(value, ['connectionId', 'purge']);
 if (typeof v.purge !== 'boolean') throw new Error('bank-purge');
 return {connectionId: connectionId(v.connectionId), purge: v.purge};
}
/** HTTP adapter handles raw duplicate-header rejection before calling this value parser. */
export function parsePrivateMobileBankRequestKey(operation: PrivateMobileBankOperation, value: unknown): string | null {
 if (operation === 'read') {
  if (value !== undefined) throw new Error('bank-key-forbidden');
  return null;
 }
 if (!['connect', 'sync', 'disconnect'].includes(operation) || typeof value !== 'string' || !REQUEST_KEY.test(value)) throw new Error('bank-key-required');
 return value;
}
export function parsePrivateMobileBankSummary(value: unknown): PrivateMobileBankSummary {
 const v = object(value, ['connectionId', 'provider', 'institutionId', 'status', 'disposition', 'accountCount', 'transactionCount', 'lastSyncAt']);
 if (v.provider !== 'SYNTHETIC' || v.institutionId !== 'synthetic-demo-v1' || !['ACTIVE', 'REVOKED'].includes(v.status as string) || !['retained', 'purged'].includes(v.disposition as string)) throw new Error('bank-summary');
 const accountCount = count(v.accountCount); const transactionCount = count(v.transactionCount);
 if (v.disposition === 'purged' && (v.status !== 'REVOKED' || accountCount !== 0 || transactionCount !== 0)) throw new Error('bank-disposition');
 return {connectionId: connectionId(v.connectionId), provider: 'SYNTHETIC', institutionId: 'synthetic-demo-v1', status: v.status as 'ACTIVE' | 'REVOKED', disposition: v.disposition as 'retained' | 'purged', accountCount, transactionCount, lastSyncAt: timestamp(v.lastSyncAt)};
}
export function parsePrivateMobileBankReadResult(value: unknown): PrivateMobileBankReadResult {
 const v = object(value, ['connections']);
 if (!Array.isArray(v.connections) || v.connections.length > 50) throw new Error('bank-list');
 const list = v.connections;
 const descriptors = Object.getOwnPropertyDescriptors(list);
 if (Object.getPrototypeOf(list) !== Array.prototype || Reflect.ownKeys(list).length !== list.length + 1 || Array.from({length: list.length}, (_, index) => descriptors[String(index)]).some(descriptor => !descriptor || !('value' in descriptor))) throw new Error('bank-list-shape');
 const connections = list.map(parsePrivateMobileBankSummary);
 if (connections.some(connection => connection.disposition === 'purged') || new Set(connections.map(connection => connection.connectionId)).size !== connections.length || connections.filter(connection => connection.status === 'ACTIVE').length > 1) throw new Error('bank-list-state');
 return {connections};
}
export function parsePrivateMobileBankMutationResult(value: unknown): PrivateMobileBankMutationResult {
 const v = object(value, ['operation', 'connection']);
 if (!['connect', 'sync', 'disconnect'].includes(v.operation as string)) throw new Error('bank-operation');
 const connection = parsePrivateMobileBankSummary(v.connection);
 if (v.operation === 'disconnect' ? connection.status !== 'REVOKED' : connection.status !== 'ACTIVE') throw new Error('bank-operation-state');
 return {operation: v.operation as PrivateMobileBankMutationResult['operation'], connection};
}
