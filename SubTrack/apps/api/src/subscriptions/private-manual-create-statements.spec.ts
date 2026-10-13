import {describe,it,expect} from 'vitest';
import {PRIVATE_MANUAL_CREATE_STATEMENTS as statements} from './private-manual-create-statements.js';
describe('manual fixed SQL',()=>{it('keeps four owner-bound immutable parameterized statements',()=>{
 expect(Object.keys(statements)).toEqual(['manualModeRead','manualReceiptRead','manualSubscriptionInsert','manualReceiptInsert']);
 for(const sql of Object.values(statements)){expect(sql).toContain('$1::uuid');expect(sql).not.toMatch(/;|--|["'`]|\b(?:update|delete|commit|rollback|set_config)\b/i);}
 expect(statements.manualReceiptRead).toContain('identity_id=$1::uuid AND key_hash=$2::bytea');
 expect(statements.manualSubscriptionInsert).not.toMatch(/merchant_id|catalog_plan_id|paying_account_id|confidence|detection_reasons/);
 expect(statements.manualReceiptInsert).toContain('$2::bytea,$3::bytea');
});});
