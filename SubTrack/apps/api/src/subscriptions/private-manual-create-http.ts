import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { CurrentWebAuthorityError, type DurableCurrentWebAuthority } from '../auth/sessions-v2/durable-current-web-authority.js';
import { canonicalPrivateSecret, privateBody, privateCookies, privateJson, privateWire, rawHeader } from '../auth/enrollment-v2/private-enrollment-http.js';

const { parsePrivateManualCreate, parsePrivateManualCreated } = createRequire(__filename)('@subtrack/contracts/private-onboarding') as Readonly<{
  parsePrivateManualCreate(value: unknown): Readonly<{ customName: string; categoryCode: string; cadence: string; expectedAmountMinor: string; nextChargeDate: string | null }>;
  parsePrivateManualCreated(value: unknown): Readonly<{ id: string }>;
}>;
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();
function problem(response: ServerResponse, status: number, code?: string): void {
  const titles: Record<number,string> = {400:'Bad Request',401:'Unauthorized',403:'Forbidden',409:'Conflict',500:'Internal Server Error'};
  const codes: Record<number,string> = {400:'INVALID_MANUAL_REQUEST',401:'AUTHENTICATION_REQUIRED',403:'MANUAL_REQUEST_REJECTED',500:'INTERNAL_ERROR'};
  privateJson(response,status,{type:'about:blank',title:titles[status]!,status,code:code ?? codes[status]!},true);
}
type ModeRow = { profile_complete: unknown; onboarding_mode: unknown };
type ReceiptRow = { request_hash: unknown; subscription_id: unknown };
type CreatedRow = { id: unknown };
type Result = { state:'ok'; id:string } | {state:'mode-conflict'} | {state:'key-conflict'};
export function createPrivateManualCreateHttp(authority: DurableCurrentWebAuthority):
  Readonly<{handle(request:IncomingMessage,response:ServerResponse):Promise<void>}> {
  return Object.freeze({ async handle(request:IncomingMessage,response:ServerResponse):Promise<void> {
    let entered = false;
    try {
      privateWire(request);
      if (request.method !== 'POST' || request.url !== '/v2/subscriptions/owner/manual') throw new Error('wire');
      const key = rawHeader(request,'idempotency-key');
      if (!key || !KEY.test(key)) throw new Error('wire');
      let body: ReturnType<typeof parsePrivateManualCreate>;
      try { body = parsePrivateManualCreate(await privateBody(request)); } catch { throw new Error('wire'); }
      const origin = rawHeader(request,'origin'); const csrf = rawHeader(request,'x-session-csrf');
      const cookies = privateCookies(request);
      if (origin !== 'https://localhost:3443' || !csrf || !canonicalPrivateSecret(csrf) ||
          Object.keys(cookies).length !== 3 || !Object.hasOwn(cookies,'st_v2_access') ||
          !canonicalPrivateSecret(cookies.st_v2_binding ?? '') || !canonicalPrivateSecret(cookies.st_v2_chain ?? '')) {
        problem(response,403); return;
      }
      if (!cookies.st_v2_access || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cookies.st_v2_access)) {
        problem(response,401); return;
      }
      const keyHash = digest(key);
      const requestHash = digest(JSON.stringify({v:'manual-create-v1',customName:body.customName,
        categoryCode:body.categoryCode,cadence:body.cadence,expectedAmountMinor:body.expectedAmountMinor,nextChargeDate:body.nextChargeDate}));
      entered = true;
      const result: Result = await authority.withCurrentWebAuthority({accessToken:cookies.st_v2_access,
        exactOrigin:origin,bindingCookie:cookies.st_v2_binding!,browserChainId:cookies.st_v2_chain!,csrfToken:csrf},
      async (tx,owner):Promise<Result> => {
        const mode = await tx.execute<ModeRow>('manualModeRead',[owner.identityId]);
        if (mode.command !== 'SELECT' || mode.rowCount !== mode.rows.length || mode.rows.length > 1) throw new Error('mode-query');
        const m = mode.rows[0];
        if (m && (typeof m.profile_complete !== 'boolean' || !(m.onboarding_mode === null || m.onboarding_mode === 'just-me'))) throw new Error('mode-row');
        if (!m || m.profile_complete !== true || m.onboarding_mode !== 'just-me') return {state:'mode-conflict'};
        const receipt = await tx.execute<ReceiptRow>('manualReceiptRead',[owner.identityId,keyHash]);
        if (receipt.command !== 'SELECT' || receipt.rowCount !== receipt.rows.length || receipt.rows.length > 1) throw new Error('receipt-query');
        const prior = receipt.rows[0];
        if (prior) {
          if (!Buffer.isBuffer(prior.request_hash) || prior.request_hash.length !== 32 || typeof prior.subscription_id !== 'string' || !UUID.test(prior.subscription_id)) throw new Error('receipt-row');
          return timingSafeEqual(prior.request_hash,requestHash) ? {state:'ok',id:prior.subscription_id} : {state:'key-conflict'};
        }
        const minted = await tx.execute<CreatedRow>('manualIdMint',[]);
        if (minted.command !== 'SELECT' || minted.rowCount !== 1 || minted.rows.length !== 1) throw new Error('mint-query');
        const {id} = parsePrivateManualCreated(minted.rows[0]);
        const created = await tx.execute('manualSubscriptionInsert',[id,owner.identityId,body.customName,body.categoryCode,
          body.cadence,body.expectedAmountMinor,body.nextChargeDate,'MANUAL','ACTIVE','SEK',true]);
        if (created.command !== 'INSERT' || created.rowCount !== 1 || created.rows.length !== 0) throw new Error('create-query');
        const saved = await tx.execute<ReceiptRow>('manualReceiptInsert',[owner.identityId,keyHash,requestHash,id]);
        if (saved.command !== 'INSERT' || saved.rowCount !== 1 || saved.rows.length !== 1 || saved.rows[0]?.subscription_id !== id) throw new Error('receipt-write');
        return {state:'ok',id};
      });
      if (result.state === 'mode-conflict') { problem(response,409,'MODE_CONFLICT'); return; }
      if (result.state === 'key-conflict') { problem(response,409,'MANUAL_IDEMPOTENCY_CONFLICT'); return; }
      privateJson(response,201,parsePrivateManualCreated({id:result.id}));
    } catch (error) {
      problem(response,!entered && error instanceof Error && error.message === 'wire' ? 400 :
        error instanceof CurrentWebAuthorityError && error.kind === 'authority-rejected' ? 401 : 500);
    }
  }});
}
