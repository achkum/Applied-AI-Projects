import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RequestContext } from '../database/request-transaction';
import { SubscriptionReadRepository, type ReadFilters, type SubscriptionReadRow } from './subscription-read.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const STATUS = new Set(['DETECTED', 'TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED', 'REJECTED']);
const CATEGORY = new Set(['VIDEO_STREAMING', 'MUSIC_AUDIO', 'AUDIOBOOKS_EBOOKS', 'NEWS_MAGAZINES', 'GAMING', 'SOFTWARE_PRODUCTIVITY', 'CLOUD_STORAGE', 'AI_TOOLS', 'MOBILE_PLAN', 'BROADBAND_TV', 'FITNESS_WELLNESS', 'FOOD_MEALKITS', 'TRANSPORT_MOBILITY', 'HOME_SECURITY', 'EDUCATION_KIDS', 'PETS', 'SHOPPING_MEMBERSHIPS', 'VPN_SECURITY', 'DONATIONS', 'DATING_SOCIAL', 'APP_STORE_BILLING', 'OTHER_SUBSCRIPTION']);
const REASONS = new Set(['MERCHANT_RESOLVED', 'CADENCE_MATCHED', 'MIN_OCCURRENCES_MET', 'DATE_PATTERN_STABLE', 'AMOUNT_WITHIN_BAND', 'SUBSCRIPTION_CATEGORY_PRIOR']);
const MIN_BIGINT = -(1n << 63n);
const MAX_BIGINT = (1n << 63n) - 1n;

function invalid(): never { throw new BadRequestException('INVALID_SUBSCRIPTION_QUERY'); }
function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
}
function encode(value: object): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function cursor(raw: unknown, endpoint: 'subscriptions' | 'review-inbox', scope: string, status: string | null, category: string | null): ReadFilters['after'] {
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) invalid();
  const decoded = Buffer.from(raw, 'base64url');
  if (decoded.length > 384 || decoded.toString('base64url') !== raw) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(decoded.toString('utf8')); } catch { invalid(); }
  if (!plain(parsed) || Object.keys(parsed).sort().join(',') !== 'category,createdAt,endpoint,id,scope,status,v' ||
      parsed.v !== 1 || parsed.endpoint !== endpoint || parsed.scope !== scope || parsed.status !== status || parsed.category !== category ||
      !timestamp(parsed.createdAt) || typeof parsed.id !== 'string' || !UUID.test(parsed.id)) invalid();
  return { createdAt: parsed.createdAt, id: parsed.id };
}
function options(raw: unknown, inbox: boolean): ReadFilters {
  if (!plain(raw)) invalid();
  const allowed = inbox ? new Set(['cursor', 'limit']) : new Set(['scope', 'status', 'category', 'cursor', 'limit']);
  if (Object.keys(raw).some(key => !allowed.has(key))) invalid();
  const scope = inbox ? 'me' : raw.scope === undefined ? 'me' : raw.scope;
  const status = inbox ? null : raw.status === undefined ? null : raw.status;
  const category = inbox ? null : raw.category === undefined ? null : raw.category;
  if (scope !== 'me' && scope !== 'household') invalid();
  if (status !== null && (typeof status !== 'string' || !STATUS.has(status))) invalid();
  if (category !== null && (typeof category !== 'string' || !CATEGORY.has(category))) invalid();
  const limit = raw.limit === undefined ? 20 : typeof raw.limit === 'string' && /^(?:[1-9]|[1-4][0-9]|50)$/.test(raw.limit) ? Number(raw.limit) : invalid();
  return { scope, status, category, limit, after: cursor(raw.cursor, inbox ? 'review-inbox' : 'subscriptions', scope, status, category) };
}
function amount(value: bigint): string {
  if (typeof value !== 'bigint' || value < MIN_BIGINT || value > MAX_BIGINT) throw new Error('Invalid stored amount');
  return value.toString();
}
function common(row: SubscriptionReadRow) {
  if (!UUID.test(row.id) || !STATUS.has(row.status) || !/^[A-Z]{3}$/.test(row.currency) || !CATEGORY.has(row.categoryCode)) throw new Error('Invalid stored subscription');
  return { id: row.id, categoryCode: row.categoryCode, cadence: row.cadence, status: row.status,
    expectedAmountMinor: amount(row.expectedAmountMinor), currency: row.currency.trim() };
}
function owner(row: SubscriptionReadRow) {
  return { visibility: 'owner' as const, ...common(row), customName: row.customName, merchantId: row.merchantId,
    merchantName: row.merchantName, nextChargeDate: row.nextChargeDate?.toISOString().slice(0, 10) ?? null,
    alwaysPrivate: row.alwaysPrivate };
}
function visible(row: SubscriptionReadRow, userId: string) {
  if (row.identityId === userId) return owner(row);
  if (row.status === 'DETECTED') throw new Error('Peer detection leaked from query');
  return { visibility: 'household' as const, ...common(row) };
}
function reasonCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.flatMap(item => plain(item) && typeof item.code === 'string' && REASONS.has(item.code) ? [item.code] : []))];
}
function review(row: SubscriptionReadRow, userId: string) {
  if (row.identityId !== userId || row.status !== 'DETECTED') throw new Error('Inbox query violated owner scope');
  const { visibility: _visibility, nextChargeDate: _nextChargeDate, alwaysPrivate: _alwaysPrivate, ...fields } = owner(row);
  void _visibility; void _nextChargeDate; void _alwaysPrivate;
  const confidence = row.confidence === null ? null : Number(row.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error('Invalid stored confidence');
  return { ...fields, confidence, reasonCodes: reasonCodes(row.detectionReasons), catalogPlanId: row.catalogPlanId };
}

export class SubscriptionReadService {
  constructor(private readonly repository: SubscriptionReadRepository) {}

  async list(context: Readonly<RequestContext>, raw: unknown, inbox = false) {
    const filters = options(raw, inbox);
    const rows = await this.repository.list(context, filters, inbox);
    const hasMore = rows.length > filters.limit;
    const page = rows.slice(0, filters.limit);
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encode({ v: 1, endpoint: inbox ? 'review-inbox' : 'subscriptions',
      scope: filters.scope, status: filters.status, category: filters.category, createdAt: last.createdAt, id: last.id }) : null;
    return { items: page.map(row => inbox ? review(row, context.userId) : visible(row, context.userId)), nextCursor };
  }

  async detail(context: Readonly<RequestContext>, id: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) invalid();
    const row = await this.repository.detail(context, id);
    if (!row) throw new NotFoundException('SUBSCRIPTION_NOT_FOUND');
    return visible(row, context.userId);
  }
}
