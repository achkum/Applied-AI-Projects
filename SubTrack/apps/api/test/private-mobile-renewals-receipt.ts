import {createHash} from 'node:crypto';
export type PrivateMobileRenewalsReceipt=Readonly<{version:1;markerHash:string;subscriptionCount:1;subscriptionIdentityHash:string;subscriptionDigest:string;activeSavedDateReadback:boolean;archivedEmptyReadback:boolean}>;
const hash=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
/** Fixture-only projection: saved-date match is not a claim about the device clock/window. */
export function privateMobileRenewalsReceipt(marker:string,rows:readonly Record<string,unknown>[],candidate:string):PrivateMobileRenewalsReceipt{
 if(typeof marker!=='string'||marker.length!==32||!/^[a-f0-9]{32}$/.test(marker)||!Array.isArray(rows)||rows.length!==1||typeof candidate!=='string'||candidate.length!==10||!/^\d{4}-\d{2}-\d{2}$/.test(candidate)||candidate.startsWith('0000'))throw new Error('Fixture renewal readback rejected');
 const date=new Date(candidate+'T00:00:00.000Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==candidate)throw new Error('Fixture renewal readback rejected');
 const row=rows[0]!;if(typeof row.id!=='string'||row.id.length!==36||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id))throw new Error('Fixture renewal readback rejected');
 const projection={id:row.id,customName:row.custom_name,categoryCode:row.category_code,cadence:row.cadence,expectedAmountMinor:row.expected_amount_minor,currency:row.currency,status:row.status,source:row.source,nextChargeDate:row.next_charge_date,alwaysPrivate:row.always_private,revision:row.revision};
 const common=row.source==='MANUAL'&&row.currency==='SEK'&&row.category_code==='VIDEO_STREAMING'&&row.cadence==='MONTHLY'&&row.expected_amount_minor==='12990'&&row.always_private===true;
 return Object.freeze({version:1,markerHash:hash(marker),subscriptionCount:1,subscriptionIdentityHash:hash(row.id),subscriptionDigest:hash(JSON.stringify(projection)),
  activeSavedDateReadback:common&&row.custom_name==='Native restart proof'&&row.status==='ACTIVE'&&row.revision==='1'&&row.next_charge_date===candidate,
  archivedEmptyReadback:common&&row.custom_name==='Native edited restart proof'&&row.status==='ARCHIVED'&&row.revision==='6'&&row.next_charge_date===null});
}
