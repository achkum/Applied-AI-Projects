import {describe,it,expect} from 'vitest';
import {PRIVATE_MANUAL_CREATE_STATEMENTS as statements} from './private-manual-create-statements.js';
describe('manual fixed SQL',()=>{it('keeps five fixed immutable parameterized statements',()=>{
 expect(Object.keys(statements)).toEqual(['manualModeRead','manualReceiptRead','manualIdMint','manualSubscriptionInsert','manualReceiptInsert']);
 for(const sql of Object.values(statements)){if(sql!==statements.manualIdMint)expect(sql).toContain('$1::uuid');expect(sql).not.toMatch(/;|--|["'`]|\b(?:update|delete|commit|rollback|set_config)\b/i);}
 expect(statements.manualIdMint).toBe('SELECT pg_catalog.gen_random_uuid()::text AS id');
 expect(statements.manualSubscriptionInsert).not.toMatch(/RETURNING/);
 expect(statements.manualSubscriptionInsert).toContain('(id,identity_id,');
 expect(statements.manualReceiptRead).toContain('identity_id=$1::uuid AND key_hash=$2::bytea');
 expect(statements.manualSubscriptionInsert).not.toMatch(/merchant_id|catalog_plan_id|paying_account_id|confidence|detection_reasons/);
 expect(statements.manualReceiptInsert).toContain('$2::bytea,$3::bytea');
});});
