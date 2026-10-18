'use strict';
/** Runs only as a private fixture child of the existing owned disposable PG harness.
 * Same-image mode loads these real cores inside its already qualified API image.
 * No production endpoint, fixture switch, DDL or credential is added to the API.
 */
async function legacyProgram(){
 const path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
 try{
  const api=process.argv[1];assert.ok(path.isAbsolute(api));const req=createRequire(path.join(api,'package.json'));
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw Error('input');}const input=JSON.parse(raw);assert.deepEqual(Object.keys(input).sort(),['mode','purge','token']);assert.ok(['prepare','inspect'].includes(input.mode));assert.equal(typeof input.purge,'boolean');assert.equal(typeof input.token,'string');assert.ok(input.token.length<=4096);
  const {loadSandboxConfig}=req('./dist/sandbox/sandbox-config.js'),config=await loadSandboxConfig(process.env),{Pool}=req('pg'),pool=new Pool(config.database);pool.on('error',()=>{});
  try{
   const {SandboxToken}=req('./dist/sandbox/sandbox-token.js'),tokens=new SandboxToken(config.privateKey,config.publicKey,Date.now),claims=tokens.verify(input.token),owner=claims.sub,{SandboxAuthority}=req('./dist/sandbox/sandbox-authority.js'),authority=new SandboxAuthority(pool,tokens,config),{legacyProductSeedKey,productSeedKey}=req('./dist/sandbox/sandbox-product-seed.js');
   const {createPrivateMobileBusiness}=req('./dist/profile/private-mobile-business.js'),business=createPrivateMobileBusiness(authority),accept=result=>{assert.equal(result.status,200);assert.ok('value'in result);return result.value;};
   const streams=[['cedar-video','Cedar Video','VIDEO_STREAMING',14900],['birch-cinema','Birch Cinema','VIDEO_STREAMING',9900],['atlas-ai','Atlas AI','AI_TOOLS',22900],['motion-club','Motion Club','FITNESS_WELLNESS',29900],['aurora-video','Aurora Video','VIDEO_STREAMING',14900]];
   if(input.mode==='prepare'){
    // The accepted mode core is intentionally called directly for old-state setup;
    // the ordinary HTTP adapter remains the only caller that initializes the new cohort.
    accept(await business.execute(input.token,'mode',{mode:'just-me'}));
    const {createPrivateMobileBank}=req('./dist/banks/private-mobile-bank.js'),{createPrivateMobileDetection}=req('./dist/detection/private-mobile-detection.js');
    const persona={id:'legacy-qualified',displayName:'Legacy fictional proof',seed:'legacy-qualified',members:[],subscriptions:streams.map(([id,name,category,amountMinor])=>({id,merchantId:id,merchantName:name,category,amountMinor,currency:'SEK',billingCadence:'MONTHLY',ownerType:'ME',descriptorVariants:[name],groundTruth:{isRecurring:true,normalizedAmountMinor:amountMinor}}))};
    const merchants=streams.map(([key,canonicalName,category])=>({key:key==='aurora-video'?key:'product-seed-v1-'+key,canonicalName,category,aliases:[canonicalName]}));
    const transform=(items,now)=>{const account=items[0].accountId,today=new Date(now),result=[];for(const [key,name,,amount]of streams)for(let back=24;back>=0;back--){const first=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-back,1)),date=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),19));if(date.getTime()>now)continue;const id='legacy-qualified-'+key+'-'+date.toISOString().slice(0,10);result.push({id,externalId:id,accountId:account,date,description:name,amountMinor:-amount,currency:'SEK',direction:'DEBIT',pending:false});}return result;};
    const bank=createPrivateMobileBank(authority,{allowMixedRecords:true,fixtureVersion:'showcase-v2',persona,transform}),detection=createPrivateMobileDetection(authority,{fixtureVersion:'showcase-v2',merchants});
    const connection=accept(await bank.execute(input.token,'connect',{institutionId:'synthetic-demo-v1'},crypto.randomUUID())).connection;
    accept(await bank.execute(input.token,'sync',{connectionId:connection.connectionId},crypto.randomUUID()));accept(await detection.execute(input.token,'scan',{},crypto.randomUUID()));
    let rows=accept(await business.execute(input.token,'owner-read',{})).items;assert.equal(rows.length,5);
    for(const name of ['Cedar Video','Birch Cinema','Aurora Video']){const row=rows.find(row=>row.customName===name);accept(await detection.execute(input.token,'confirm',{candidateId:row.id,expectedRevision:row.revision},name==='Aurora Video'?crypto.randomUUID():legacyProductSeedKey(owner,'confirm-'+row.id)));}
    await authority.withCurrentMobileAuthority(input.token,async(tx,current)=>{assert.equal(current.identityId,owner);const r=await tx.execute('sandboxDetectionDates',[owner,new Date().toISOString().slice(0,10)]);assert.equal(r.command,'UPDATE');assert.equal(r.rowCount,5);});
    rows=accept(await business.execute(input.token,'owner-read',{})).items;const edited=rows.find(row=>row.customName==='Birch Cinema'),rejected=rows.find(row=>row.customName==='Atlas AI');
    accept(await business.execute(input.token,'manual-edit',{id:edited.id,expectedRevision:edited.revision,customName:'My retained cinema',categoryCode:edited.categoryCode,cadence:edited.cadence,expectedAmountMinor:edited.expectedAmountMinor,nextChargeDate:edited.nextChargeDate},crypto.randomUUID()));
    accept(await detection.execute(input.token,'reject',{candidateId:rejected.id,expectedRevision:rejected.revision},crypto.randomUUID()));
    accept(await bank.execute(input.token,'sync',{connectionId:connection.connectionId},legacyProductSeedKey(owner,'complete')));
    if(input.purge)accept(await bank.execute(input.token,'disconnect',{connectionId:connection.connectionId,purge:true},crypto.randomUUID()));
   }
   const c=await pool.connect();let witness;
   try{
    await c.query('BEGIN');await c.query('SET LOCAL ROLE subtrack_sandbox_runtime');await c.query("SELECT set_config('app.user_id',$1,true),set_config('app.current_user_id',$1,true)",[owner]);
    const legacy=await c.query("SELECT s.id::text,s.custom_name,s.status::text,s.revision::text,s.updated_at::text,s.next_charge_date::text,c.merchant_key FROM public.subscription s JOIN st081_detection.candidate c ON c.identity_id=s.identity_id AND c.subscription_id=s.id WHERE s.identity_id=$1::uuid AND (c.merchant_key LIKE 'product-seed-v1-%' OR c.merchant_key='aurora-video') ORDER BY s.id",[owner]);assert.equal(legacy.rowCount,5);
    const ledger=await c.query("SELECT id::text,provider_transaction_id,amount_minor::text,transaction_date::text,raw_description FROM public.raw_transaction WHERE identity_id=$1::uuid AND provider_transaction_id LIKE 'legacy-qualified-%' ORDER BY id",[owner]);
    const hash=key=>crypto.createHash('sha256').update(key).digest(),marker=await c.query('SELECT last_sync_at::text FROM st248_bank.receipt WHERE identity_id=$1::uuid AND key_h=$2::bytea',[owner,hash(productSeedKey(owner,'complete'))]),prior=await c.query('SELECT operation FROM st248_bank.receipt WHERE identity_id=$1::uuid AND key_h=$2::bytea',[owner,hash(legacyProductSeedKey(owner,'complete'))]);assert.equal(prior.rowCount,1);assert.equal(prior.rows[0].operation,'sync');
    let markerLinked=0;if(marker.rowCount){const matched=await c.query("SELECT count(*)::int AS n FROM public.subscription s JOIN st248_bank.receipt r ON r.identity_id=s.identity_id AND r.key_h=$2::bytea WHERE s.identity_id=$1::uuid AND s.status='ARCHIVED' AND s.updated_at=r.last_sync_at AND s.id=ANY($3::uuid[])",[owner,hash(productSeedKey(owner,'complete')),legacy.rows.map(row=>row.id)]);markerLinked=matched.rows[0].n;}
    witness={legacy:legacy.rows,ledgerCount:ledger.rowCount,ledgerSha256:crypto.createHash('sha256').update(JSON.stringify(ledger.rows)).digest('hex'),newMarker:marker.rowCount,oldMarker:prior.rowCount,markerLinked};await c.query('ROLLBACK');
   }finally{c.release();}
   witness.page=accept(await business.execute(input.token,'owner-read',{}));
   // Direct named detail projection uses the same strict retired-sample predicate.
   witness.hiddenDetails=[];await authority.withCurrentMobileAuthority(input.token,async(tx)=>{for(const row of witness.legacy){const detail=await tx.execute('ownerDetail',[owner,row.id,'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"']);if(detail.rowCount===0)witness.hiddenDetails.push(row.id);}});
   const output=JSON.stringify(witness);assert.ok(Buffer.byteLength(output)<=32768);process.stdout.write(output);
  }finally{await pool.end();}
 }catch{process.stderr.write('ST250_SWEDEN_FIXTURE_FAILURE\n');process.exitCode=1;}
}
function assertLegacyUpgrade(before,after,purge){
 const assert=require('node:assert/strict');assert.equal(before.newMarker,0);assert.equal(before.oldMarker,1);assert.equal(after.newMarker,1);assert.equal(after.oldMarker,1);assert.equal(before.legacy.length,5);assert.equal(after.legacy.length,5);assert.equal(after.ledgerCount,before.ledgerCount);assert.equal(after.ledgerSha256,before.ledgerSha256);
 if(purge)assert.equal(after.ledgerCount,0);else assert.ok(after.ledgerCount>=100);
 const retired=before.legacy.filter(row=>!purge&&['Cedar Video','Motion Club'].includes(row.custom_name)),ids=new Set(retired.map(row=>row.id));assert.equal(after.markerLinked,retired.length);assert.deepEqual([...after.hiddenDetails].sort(),[...ids].sort());
 for(const original of before.legacy){const row=after.legacy.find(row=>row.id===original.id);assert.ok(row);if(ids.has(original.id)){assert.equal(row.status,'ARCHIVED');assert.equal(BigInt(row.revision),BigInt(original.revision)+1n);assert.equal(row.custom_name,original.custom_name);assert.ok(!after.page.items.some(item=>item.id===row.id));}else{assert.deepEqual(row,original);assert.deepEqual(after.page.items.find(row=>row.id===original.id),before.page.items.find(row=>row.id===original.id));}}
 return before.page.items.filter(row=>!ids.has(row.id));
}
module.exports={legacyProgramSource:`(${legacyProgram.toString()})()`,assertLegacyUpgrade};
