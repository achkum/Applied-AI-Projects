import {createHash} from 'node:crypto';
export type PrivateMobileTrackingReceipt=Readonly<{version:1;markerHash:string;subscriptionCount:1;subscriptionIdentityHash:string;subscriptionDigest:string;manualEditReadback:boolean;archivedReadback:boolean;revisionSixReadback:boolean}>;
const hash=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
/** Owned fixture projection only; no row values, identifiers or names leave this seam. */
export function privateMobileTrackingReceipt(marker:string,rows:readonly Record<string,unknown>[]):PrivateMobileTrackingReceipt {
 if(!/^[a-f0-9]{32}$/.test(marker)||!Array.isArray(rows)||rows.length!==1)throw new Error('Fixture tracking readback rejected');
 const row=rows[0]!;
 if(typeof row.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id))throw new Error('Fixture tracking readback rejected');
 const projection={id:row.id,customName:row.custom_name,categoryCode:row.category_code,cadence:row.cadence,expectedAmountMinor:row.expected_amount_minor,currency:row.currency,status:row.status,source:row.source,nextChargeDate:row.next_charge_date,alwaysPrivate:row.always_private,revision:row.revision};
 return Object.freeze({version:1,markerHash:hash(marker),subscriptionCount:1,subscriptionIdentityHash:hash(row.id),subscriptionDigest:hash(JSON.stringify(projection)),
  manualEditReadback:row.custom_name==='Native edited restart proof'&&row.source==='MANUAL'&&row.currency==='SEK'&&row.category_code==='VIDEO_STREAMING'&&row.cadence==='MONTHLY'&&row.expected_amount_minor==='12990'&&row.next_charge_date===null&&row.always_private===true,
  archivedReadback:row.status==='ARCHIVED',revisionSixReadback:row.revision==='6'});
}
