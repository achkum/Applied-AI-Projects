import assert from 'node:assert/strict';
import {test} from 'node:test';
import {customCategoryLabel,createCustomCategory} from '../subscription-category.ts';
import {parsePrivateManualCreate,parsePrivateOwnerView} from '../private-onboarding.ts';
test('custom category roundtrips through existing strict manual and owner readback contracts',()=>{
 const categoryCode=createCustomCategory('  Craft supplies  ');assert.equal(categoryCode,'CUSTOM:Craft supplies');
 const fields={customName:'Example',categoryCode,cadence:'MONTHLY',expectedAmountMinor:'12990',nextChargeDate:'2026-10-17'};
 assert.equal(parsePrivateManualCreate(fields).categoryCode,categoryCode);
 const row={...fields,visibility:'owner',id:'123e4567-e89b-42d3-a456-426614174000',merchantId:null,merchantName:null,status:'ACTIVE',currency:'SEK',alwaysPrivate:true,source:'MANUAL',revision:'1'};
 assert.equal(customCategoryLabel(parsePrivateOwnerView(row).categoryCode),'Craft supplies');
});
test('unknown provider codes, noncanonical or overlength labels remain rejected',()=>{
 for(const value of [null,1,'UNKNOWN','CUSTOM:','CUSTOM: bad','CUSTOM:bad ','CUSTOM:e\u0301','CUSTOM:bad\u0000','CUSTOM:bad\u200d','CUSTOM:'+'x'.repeat(41),'CUSTOM:\ud800'])assert.equal(customCategoryLabel(value),null);
 assert.equal(createCustomCategory('e\u0301'),'CUSTOM:é');assert.throws(()=>createCustomCategory(' '));
});
