import {describe,it,expect} from 'vitest';
import {PRIVATE_MANUAL_EDIT_STATEMENTS as statements} from './private-manual-edit-statements.js';
describe('private manual Edit fixed SQL',()=>{
 it('is closed, owner-parameterized, quote-free and cannot change protected fields',()=>{
  expect(Object.keys(statements)).toEqual(['manualEditModeRead','manualEditReceiptRead','manualEditTargetLock','manualEditCompareUpdate','manualEditReceiptInsert']);
  for(const sql of Object.values(statements)){expect(sql).toContain('$1::uuid');expect(sql.replaceAll("cadence IN('WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL')",'')).not.toMatch(/;|--|["'`]|\b(?:delete|commit|rollback|set_config|set_role)\b/i);}
  for(const key of ['manualEditTargetLock','manualEditCompareUpdate'] as const){expect(statements[key]).toContain('identity_id=$1::uuid AND id=$2::uuid');expect(statements[key]).toMatch(/AND source=\$\d+::public\.subscription_source AND currency=\$\d+::char\(3\)/);expect(statements[key]).toContain("cadence IN('WEEKLY','MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL')");expect(statements[key]).not.toMatch(/ANY\s*\(/);}
  expect(statements.manualEditTargetLock).toMatch(/FOR UPDATE$/);
  const writes=statements.manualEditCompareUpdate.split('WHERE')[0]!;
  expect(writes).not.toMatch(/\b(?:identity_id|source|status|currency|always_private|merchant_id|catalog_plan_id|paying_account_id|confidence|detection_reasons|revision)\s*=/);
  expect(statements.manualEditCompareUpdate).toContain('AND revision=$3::bigint');
  expect(statements.manualEditReceiptRead).toContain('identity_id=$1::uuid AND key_hash=$2::bytea');
  expect(statements.manualEditReceiptInsert).toContain('$2::bytea,$3::bytea,$4::uuid,$5::bigint');
 });
});
