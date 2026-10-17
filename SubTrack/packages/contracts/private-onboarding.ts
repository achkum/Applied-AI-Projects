import type { ModeView, PrivateOwnerPage, PrivateOwnerSubscriptionView } from './generated/types.gen.ts';
import {customCategoryLabel} from '@subtrack/contracts/subscription-category';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MINOR = /^(?:0|-?[1-9]\d*)$/;
const STATUS = new Set(['DETECTED', 'TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED']);
const CADENCE = new Set(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM']);
const CATEGORY = new Set(['VIDEO_STREAMING', 'MUSIC_AUDIO', 'AUDIOBOOKS_EBOOKS', 'NEWS_MAGAZINES', 'GAMING', 'SOFTWARE_PRODUCTIVITY', 'CLOUD_STORAGE', 'AI_TOOLS', 'MOBILE_PLAN', 'BROADBAND_TV', 'FITNESS_WELLNESS', 'FOOD_MEALKITS', 'TRANSPORT_MOBILITY', 'HOME_SECURITY', 'EDUCATION_KIDS', 'PETS', 'SHOPPING_MEMBERSHIPS', 'VPN_SECURITY', 'DONATIONS', 'DATING_SOCIAL', 'APP_STORE_BILLING', 'OTHER_SUBSCRIPTION']);
const FIELDS = ['visibility', 'id', 'customName', 'merchantId', 'merchantName', 'categoryCode', 'cadence', 'status', 'expectedAmountMinor', 'currency', 'nextChargeDate', 'alwaysPrivate', 'source', 'revision'];
const MIN = -(1n << 63n);
const MAX = (1n << 63n) - 1n;

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('closed-object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key) ||
      !('value' in descriptors[key]!)) || required.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error('closed-object');
  return value as Record<string, unknown>;
}
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function revision(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= MAX;
}
function date(value: unknown): boolean {
  return typeof value === 'string' && DATE.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}
export function parseModeView(value: unknown): ModeView {
  const v = record(value, ['mode']);
  if (v.mode !== null && v.mode !== 'just-me') throw new Error('mode');
  return { mode: v.mode } as ModeView;
}
export function parsePrivateOwnerPageRequest(value: unknown): Readonly<{ cursor?: string }> {
  const v = record(value, [], ['cursor']);
  if (v.cursor !== undefined && (typeof v.cursor !== 'string' || v.cursor.length < 1 || v.cursor.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(v.cursor))) throw new Error('cursor');
  return v.cursor === undefined ? {} : { cursor: v.cursor as string };
}
export function parsePrivateOwnerView(value: unknown): PrivateOwnerSubscriptionView {
  const v = record(value, FIELDS);
  if (v.visibility !== 'owner' || !uuid(v.id) ||
      !(v.customName === null || typeof v.customName === 'string' && v.customName.length <= 120) ||
      !(v.merchantId === null || uuid(v.merchantId)) ||
      !(v.merchantName === null || typeof v.merchantName === 'string' && v.merchantName.length <= 120) ||
      ( !CATEGORY.has(v.categoryCode as string) && customCategoryLabel(v.categoryCode) === null ) || !CADENCE.has(v.cadence as string) || !STATUS.has(v.status as string) ||
      typeof v.expectedAmountMinor !== 'string' || !MINOR.test(v.expectedAmountMinor) ||
      BigInt(v.expectedAmountMinor) < MIN || BigInt(v.expectedAmountMinor) > MAX ||
      typeof v.currency !== 'string' || !/^[A-Z]{3}$/.test(v.currency) ||
      !(v.nextChargeDate === null || date(v.nextChargeDate)) || typeof v.alwaysPrivate !== 'boolean' || !['MANUAL', 'DETECTED'].includes(v.source as string) || !revision(v.revision))
    throw new Error('owner-view');
  return v as PrivateOwnerSubscriptionView;
}
export function parsePrivateOwnerPage(value: unknown): PrivateOwnerPage {
  const v = record(value, ['items', 'nextCursor']);
  if (!Array.isArray(v.items) || v.items.length > 50 ||
      !(v.nextCursor === null || typeof v.nextCursor === 'string' && v.nextCursor.length >= 1 &&
        v.nextCursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(v.nextCursor))) throw new Error('owner-page');
  const items = v.items.map(parsePrivateOwnerView);
  if (new Set(items.map(item => item.id)).size !== items.length ||
      v.nextCursor !== null && items.length !== 50) throw new Error('owner-page');
  return { items, nextCursor: v.nextCursor as string | null };
}
export function parsePrivateLifecycleResult(value: unknown): Readonly<{ id: string; status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'ARCHIVED' }> {
  const v = record(value, ['id', 'status']);
  if (!uuid(v.id) || !['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED'].includes(v.status as string)) throw new Error('lifecycle-result');
  return { id: v.id, status: v.status as 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'ARCHIVED' };
}

export function parsePrivateManualCreate(value: unknown): Readonly<{customName:string; categoryCode: string; cadence: 'WEEKLY'|'MONTHLY'|'QUARTERLY'|'SEMIANNUAL'|'ANNUAL'; expectedAmountMinor:string; nextChargeDate:string|null}> {
  const v = record(value, ['customName', 'categoryCode', 'cadence', 'expectedAmountMinor'], ['nextChargeDate']);
  if (typeof v.customName !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(v.customName)) throw new Error('manual-create');
  const customName = v.customName.trim();
  if (customName.length < 1 || customName.length > 120 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(customName) ||
      ( !CATEGORY.has(v.categoryCode as string) && customCategoryLabel(v.categoryCode) === null ) || !['WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL'].includes(v.cadence as string) ||
      typeof v.expectedAmountMinor !== 'string' || !/^[1-9][0-9]{0,18}$/.test(v.expectedAmountMinor) || BigInt(v.expectedAmountMinor) > MAX ||
      !(v.nextChargeDate === undefined || v.nextChargeDate === null || date(v.nextChargeDate) && !(v.nextChargeDate as string).startsWith('0000')))
    throw new Error('manual-create');
  return { customName, categoryCode: v.categoryCode as string, cadence: v.cadence as 'WEEKLY'|'MONTHLY'|'QUARTERLY'|'SEMIANNUAL'|'ANNUAL', expectedAmountMinor: v.expectedAmountMinor, nextChargeDate: v.nextChargeDate as string|null ?? null };
}
export function parsePrivateManualCreated(value: unknown): Readonly<{id:string}> {
  const v = record(value, ['id']); if (!uuid(v.id)) throw new Error('manual-created'); return { id: v.id };
}
export function parsePrivateManualEdit(value: unknown): ReturnType<typeof parsePrivateManualCreate> & Readonly<{expectedRevision:string}> {
  const v = record(value, ['customName', 'categoryCode', 'cadence', 'expectedAmountMinor', 'nextChargeDate', 'expectedRevision']);
  if (!revision(v.expectedRevision) || v.nextChargeDate === undefined) throw new Error('manual-edit');
  const fields = parsePrivateManualCreate({customName:v.customName,categoryCode:v.categoryCode,cadence:v.cadence,
    expectedAmountMinor:v.expectedAmountMinor,nextChargeDate:v.nextChargeDate});
  return {...fields,expectedRevision:v.expectedRevision};
}
export function parsePrivateManualEdited(value: unknown): Readonly<{id:string;revision:string}> {
  const v = record(value, ['id', 'revision']);
  if (!uuid(v.id) || !revision(v.revision)) throw new Error('manual-edited');
  return {id:v.id,revision:v.revision};
}
