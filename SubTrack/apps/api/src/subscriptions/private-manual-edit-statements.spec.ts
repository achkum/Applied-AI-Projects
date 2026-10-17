import {describe,it,expect} from 'vitest';
import {PRIVATE_MANUAL_EDIT_STATEMENTS as statements} from './private-manual-edit-statements.js';
describe('private manual Edit fixed SQL',()=>{
 it('is closed, owner-parameterized, quote-free and cannot change protected fields',()=>{
  expect(Object.keys(statements)).toEqual(['manualEditModeRead','manualEditReceiptRead','manualEditTargetLock','manualEditCompareUpdate','manualEditReceiptInsert']);
  for(const sql of Object.values(statements)){expect(sql).toContain('$1::uuid');expect(sql).not.toMatch(/;|--|["'`]|\b(?:delete|commit|rollback|set_config|set_role)\b/i);}
  expect(statements.manualEditTargetLock).toContain('cadence IN($5::public.subscription_cadence,$6::public.subscription_cadence,$7::public.subscription_cadence,$8::public.subscription_cadence,$9::public.subscription_cadence)');expect(statements.manualEditCompareUpdate).toContain('cadence IN($11::public.subscription_cadence,$12::public.subscription_cadence,$13::public.subscription_cadence,$14::public.subscription_cadence,$15::public.subscription_cadence)');
  expect(statements.manualEditTargetLock).toMatch(/FOR UPDATE$/);
  const writes=statements.manualEditCompareUpdate.split('WHERE')[0]!;
  expect(writes).not.toMatch(/\b(?:identity_id|source|status|currency|always_private|merchant_id|catalog_plan_id|paying_account_id|confidence|detection_reasons|revision)\s*=/);
  expect(statements.manualEditCompareUpdate).toContain('AND revision=$3::bigint');
  expect(statements.manualEditReceiptRead).toContain('identity_id=$1::uuid AND key_hash=$2::bytea');
  expect(statements.manualEditReceiptInsert).toContain('$2::bytea,$3::bytea,$4::uuid,$5::bigint');
 });
});
