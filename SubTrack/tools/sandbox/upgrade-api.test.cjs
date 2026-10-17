'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {plan,sourceValidator,gatewayCustody,graphIdentity,networkIdentity,offlineBinding,recoveryPolicy,limits,envArgs,secretArgs,actualManifestBinding,backupArgs,captureBackup}=require('./upgrade-api.cjs');
const digest=value=>value.repeat(64),id=value=>'sha256:'+digest(value),source=value=>value.repeat(40);
function input(){return {schema:'st253-api-upgrade-plan-v1',host:'198.44.116.159',sourceHead:source('a'),runId:'123-1',toolSha256:digest('b'),bootstrapSha256:digest('c'),transferReceiptSha256:digest('d'),migrationSha256:['1','2','3','4'].map(digest),predecessor:{sourceHead:source('e'),imageId:id('f'),sourceCustodySha256:digest('1'),imageImportBindingSha256:digest('2'),deploymentReceiptSha256:digest('3'),androidDownloadBindingSha256:digest('4'),apiId:digest('5'),databaseId:digest('6'),gatewayId:digest('7')}};}
test('exact operator-pinned successor plan rejects foreign namespaces, source/run drift and principal/container ambiguity',()=>{
 assert.deepEqual(plan(input()),input());
 for(const mutate of [p=>p.host='example.org',p=>p.runId='../123',p=>p.runId='0-1',p=>p.sourceHead=p.predecessor.sourceHead,p=>p.toolSha256='unknown',p=>p.migrationSha256.pop(),p=>p.predecessor.apiId=p.predecessor.databaseId,p=>p.predecessor.imageId='latest',p=>p.path='/arbitrary',p=>p.predecessor.ownerId='foreign']){const p=input();mutate(p);assert.throws(()=>plan(p));}
});
test('plan descriptors and dense migration arrays reject getters without invoking private values',()=>{
 let touched=false;const p=input();Object.defineProperty(p,'sourceHead',{enumerable:true,get(){touched=true;throw Error();}});assert.throws(()=>plan(p));assert.equal(touched,false);
 const a=input();Object.defineProperty(a.migrationSha256,0,{enumerable:true,get(){touched=true;throw Error();}});assert.throws(()=>plan(a));assert.equal(touched,false);
 for(const p of [null,[],Object.assign(Object.create({}),input()),{...input(),[Symbol('private')]:true}])assert.throws(()=>plan(p));
});
test('offline candidate binds all four real migrations and entrypoint while retaining the exact foundational capability manifest',()=>{
 const p=input(),old={manifest:digest('8'),migrations:p.migrationSha256.slice(0,2),entrypoint:digest('9'),bootstrap:p.bootstrapSha256},next={manifest:digest('8'),migrations:[...p.migrationSha256],entrypoint:digest('a'),bootstrap:p.bootstrapSha256},m={compiledEntrypointSha256:digest('a')};assert.deepEqual(offlineBinding(p,old,next,m),next);
 for(const changed of [{...next,manifest:digest('7')},{...next,migrations:next.migrations.slice(0,2)},{...next,migrations:[...next.migrations.slice(0,3),digest('b')]},{...next,entrypoint:digest('b')},{...next,bootstrap:digest('b')},{...next,unknown:true}])assert.throws(()=>offlineBinding(p,old,changed,m));
 assert.throws(()=>offlineBinding(p,{...old,migrations:[digest('3'),digest('4')]},next,m));
});
test('recovery never starts an old API once any forward DDL may have committed',()=>{
 assert.equal(recoveryPolicy(false,false),'leave-running');assert.equal(recoveryPolicy(true,false),'restore-old');assert.equal(recoveryPolicy(false,true),'hold-stopped');assert.equal(recoveryPolicy(true,true),'hold-stopped');assert.throws(()=>recoveryPolicy('true',false));
});
test('original frozen live/volume validators are extracted exactly; missing/duplicated marker code fails closed',()=>{
 const verify=fs.readFileSync(path.join(__dirname,'verify.sh'),'utf8');const live=sourceValidator(verify,'LIVE'),volume=sourceValidator(verify,'VOLUME');assert.equal(typeof live,'function');assert.equal(typeof volume,'function');assert.throws(()=>live({},null,'api-live','/home/openclaw/subtrack-sandbox',{},source('e'),null));
 assert.throws(()=>sourceValidator('', 'LIVE'));assert.throws(()=>sourceValidator(verify+'\n// BEGIN LIVE VALIDATOR','LIVE'));
 const generation='123e4567-e89b-42d3-a456-426614174000',head=source('e'),run='123-1',role='database-data',name='subtrack-sandbox-'+role;
 const record={Name:name,Driver:'local',Scope:'local',CreatedAt:'2026-10-17T12:00:00.000Z',Mountpoint:'/var/lib/docker/volumes/'+name+'/_data',Options:null,Labels:{'org.subtrack.sandbox.namespace':'st250-runtime-v1','com.docker.compose.project':'subtrack-sandbox','com.docker.compose.volume':role,'org.subtrack.sandbox.source':head,'org.subtrack.sandbox.run':run,'org.subtrack.sandbox.generation':generation}};
 assert.deepEqual(volume(record,record,role,head,run,generation),record);assert.throws(()=>volume({...record,Mountpoint:'/foreign'},record,role,head,run,generation));
});

test('frozen live validator accepts real host-realm JSON Android binding through same-realm deserialization and rejects tampering',()=>{
 const live=sourceValidator(fs.readFileSync(path.join(__dirname,'verify.sh'),'utf8'),'LIVE'),root='/home/openclaw/subtrack-sandbox',head=source('e'),image=id('f');
 const base={Id:image,Config:{Env:[],Entrypoint:[],Cmd:['node','dist/sandbox/main.js']}},identity={inspectedImageId:image,containerImageId:image,requestedImage:image};
 const overrides={NODE_ENV:'production',SUBTRACK_RUNTIME:'sandbox',SANDBOX_STARTUP_ENABLED:'true',SANDBOX_PUBLICATION_ENABLED:'true',SANDBOX_DATABASE_HOST:'database',SANDBOX_DATABASE_NAME:'subtrack_sandbox',SANDBOX_DATABASE_ROLE:'subtrack_sandbox_runtime',SANDBOX_POOL_MAX:'4',SANDBOX_DATABASE_CREDENTIAL_FILE:'/run/secrets/database_runtime',SANDBOX_AUTH_MATERIAL_FILE:'/run/secrets/api_auth_material',PORT:'4000'};
 const container={Image:image,State:{Running:true},Config:{Image:image,User:'1000:1000',Labels:{'org.subtrack.sandbox.namespace':'st250-runtime-v1','org.subtrack.sandbox.source':head,'com.docker.compose.service':'api-live'},Env:Object.entries(overrides).map(([k,v])=>k+'='+v),Entrypoint:[],Cmd:base.Config.Cmd},HostConfig:{CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Memory:384*1048576,PidsLimit:64,NanoCpus:0.75e9,ReadonlyRootfs:true,IpcMode:'private',LogConfig:{Type:'json-file',Config:{'max-file':'2','max-size':'5m'}},Tmpfs:{'/tmp':'size=16m,uid=1000,gid=1000'}},NetworkSettings:{Networks:{'subtrack-sandbox-database':{},'subtrack-sandbox-ingress':{}}},Mounts:[{Type:'bind',Source:root+'/secrets/database-runtime',Destination:'/run/secrets/database_runtime',RW:false},{Type:'bind',Source:root+'/secrets/api-auth-material',Destination:'/run/secrets/api_auth_material',RW:false}]};
 const android=JSON.parse(JSON.stringify({schema:'st250-android-download-binding-v1',artifactSourceHead:head,toolingSourceHead:head,apkRun:'123-1',toolsRun:'123-1',applicationId:'se.subtrack.app.sandbox',versionCode:2,signedSha256:digest('1'),bytes:123,signerCertificateSha256:digest('2'),embeddedConfigSha256:digest('3'),hermesSha256:digest('4'),signedReceiptSha256:digest('5')}));
 const records=Object.fromEntries(['database-data','certificate-data','gateway-config'].map(role=>[role,{Mountpoint:'/var/lib/docker/volumes/subtrack-sandbox-'+role+'/_data'}]));
 assert.equal(live(container,base,'api-live',root,records,head,identity,android),true);
 for(const tampered of [{...android,applicationId:'se.subtrack.production'},{...android,versionCode:0},{...android,signedSha256:'invalid'},{...android,extra:true}])assert.throws(()=>live(container,base,'api-live',root,records,head,identity,tampered));
 const timed=sourceValidator('// BEGIN LIVE VALIDATOR\nfunction validateLive(){while(true){}}\n// END LIVE VALIDATOR','LIVE');assert.throws(()=>timed(),/timed out/);
});
test('stable graph comparison excludes volatile process timing but detects replaced IDs, mounts and network attachment',()=>{
 const c={Id:digest('1'),Name:'api',Image:id('2'),Config:{Env:['NODE_ENV=production']},HostConfig:{PortBindings:{}},Mounts:[],State:{Running:true,StartedAt:'before'},NetworkSettings:{Networks:{'subtrack-sandbox-database':{NetworkID:digest('3'),Aliases:['api-live'],IPAddress:'172.18.0.4'}}}};
 assert.deepEqual(graphIdentity(c),graphIdentity({...c,State:{Running:true,StartedAt:'later'}}));assert.notDeepEqual(graphIdentity(c),graphIdentity({...c,Id:digest('4')}));assert.notDeepEqual(graphIdentity(c),graphIdentity({...c,Mounts:[{Source:'/foreign'}]}));
 const n={Id:digest('a'),Name:'subtrack-sandbox-ingress',Driver:'bridge',Internal:true,Labels:{'org.subtrack.sandbox.namespace':'st250-runtime-v1'},IPAM:{},Options:{}};assert.equal(networkIdentity(n,n.Name).Id,n.Id);assert.throws(()=>networkIdentity({...n,Internal:false},n.Name));assert.throws(()=>networkIdentity({...n,Name:'foreign'},n.Name));
});

test('gateway preflight invokes the authenticated frozen executable verifier and rejects capless binary tampering before STOP',()=>{
 const frozen=require('./image-import-binding.cjs'),profile=frozen.gatewayExecutableProfile,binding={services:{gateway:{requestedImage:profile.imageReference}}},source={schema:'st250-source-custody-v4',gatewayExecutable:{...profile}},calls=[];
 gatewayCustody({...frozen,verifyGatewayExecutable:(...args)=>calls.push(args)},source,binding);assert.deepEqual(calls,[['/home/openclaw/subtrack-sandbox',profile.imageReference]]);
 assert.throws(()=>gatewayCustody(frozen,{...source,gatewayExecutable:{...profile,binarySha256:digest('f')}},binding));
 const vm=require('node:vm'),file=path.join(__dirname,'image-import-binding.cjs'),module={exports:{}},fakeFs={...fs,lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid:996,gid:987,mode:0o100755,size:profile.binaryBytes}),realpathSync:value=>value,readFileSync:()=>Buffer.from('tampered capless executable')};let commands=0;
 const customRequire=name=>name==='node:fs'?fakeFs:name==='node:child_process'?{execFileSync:()=>{commands++;throw Error('Unexpected executable inspection');}}:require(name);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:customRequire,Buffer,process,__filename:file,__dirname},{timeout:1000});
 // Run the exact frozen byte/metadata verifier. Tampered content must fail before getcap.
 assert.throws(()=>module.exports.verifyGatewayExecutable('/home/openclaw/subtrack-sandbox',profile.imageReference));assert.equal(commands,0);
 const actual=fs.readFileSync(path.join(__dirname,'upgrade-api.cjs'),'utf8'),check=actual.indexOf('\n gatewayCustody(helpers,source,binding);');assert.ok(check>actual.indexOf('helpers.sourceBinding(source,'));assert.ok(check<actual.indexOf("state='STOP_OLD_API'"));assert.match(actual,/function unchanged\(saved,includeApi=true\)\{gatewayCustody\(saved.helpers,saved.source,saved.binding\)/);
});
test('candidate argument builders provide exact least-privilege resources and only original read-only API secrets',()=>{
 const args=limits();for(const part of ['--read-only','1000:1000','--cap-drop','ALL','no-new-privileges','384m','0.75','64','/tmp:size=16m,uid=1000,gid=1000'])assert.ok(args.includes(part));for(const forbidden of ['--privileged','--publish','--volume','--cap-add','--pid'])assert.ok(!args.includes(forbidden));
 const secrets=secretArgs().join(' ');assert.match(secrets,/database-runtime,dst=\/run\/secrets\/database_runtime,readonly/);assert.match(secrets,/api-auth-material,dst=\/run\/secrets\/api_auth_material,readonly/);assert.doesNotMatch(secrets,/docker.sock|android-signing|database-bootstrap/);assert.ok(envArgs().includes('SUBTRACK_RUNTIME=sandbox'));assert.ok(envArgs().includes('SANDBOX_DATABASE_NAME=subtrack_sandbox'));
});
test('actual source gates archive/config probes before stop and marks irreversible boundary before bootstrap; it never rewrites original custody',()=>{
 const source=fs.readFileSync(path.join(__dirname,'upgrade-api.cjs'),'utf8');assert.ok(source.indexOf('await candidate(p,stage,saved.helpers)')<source.indexOf("state='STOP_OLD_API'"));assert.ok(source.indexOf('offlineBinding(p,before,next,c.manifest)')<source.indexOf("state='STOP_OLD_API'"));assert.ok(source.indexOf('migrationStarted=true')<source.indexOf("const migration=docker(args)"));
 assert.match(source,/SUBTRACK_SANDBOX_MIGRATION=preserve-owner-v1/);assert.match(source,/qualification:'awaiting-tls-feature-readback'/);assert.match(source,/publicAndroid:'v2-unchanged'/);assert.doesNotMatch(source,/docker\(\['(?:pull|volume','rm|network','rm)'/);
 assert.match(source,/regular\(file,\{mode:0o444\}\)/);assert.match(source,/bootstrap:h\('\/opt\/subtrack\/bootstrap.cjs'\)/);
 for(const file of ['.source-custody.json','runtime/source-head','runtime/image-id','runtime/deployment-receipt.json','runtime/android-download-binding.json'])assert.ok(!source.includes("retain(ROOT+'/"+file+"'"));
});
test('bootstrap mount metadata requires immutable world-readable source before actual UID1000 offline bytes are probed',()=>{
 const vm=require('node:vm'),file=path.join(__dirname,'upgrade-api.cjs'),bytes=Buffer.from('trusted bootstrap source');let mode=0o100444,uid=996,reads=0;
 const fakeFs={lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid,gid:987,mode,size:bytes.length}),realpathSync:value=>value,readFileSync:()=>{reads++;return bytes;}};
 const module={exports:{}},customRequire=name=>name==='node:fs'?fakeFs:require(name);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:customRequire,Buffer,process,__filename:file},{timeout:1000});
 assert.deepEqual(module.exports.bootstrapBytes('/fixed/bootstrap.cjs'),bytes);assert.equal(reads,1);mode=0o100600;assert.throws(()=>module.exports.bootstrapBytes('/fixed/bootstrap.cjs'));assert.equal(reads,1);mode=0o100644;assert.throws(()=>module.exports.bootstrapBytes('/fixed/bootstrap.cjs'));uid=1000;mode=0o100444;assert.throws(()=>module.exports.bootstrapBytes('/fixed/bootstrap.cjs'));
});
test('actual transferred manifest bytes must match receipt, not merely parse to equivalent JSON',()=>{
 const crypto=require('node:crypto'),bytes=Buffer.from('{"schema":"example"}\n'),receipt={manifestBytes:bytes.length,manifestSha256:crypto.createHash('sha256').update(bytes).digest('hex')};actualManifestBinding(bytes,receipt);assert.throws(()=>actualManifestBinding(Buffer.from('{ "schema": "example" }\n'),receipt));assert.throws(()=>actualManifestBinding(bytes,{...receipt,manifestSha256:digest('a')}));assert.throws(()=>actualManifestBinding(bytes.toString(),receipt));
});
test('backup arguments bind only the exact existing database and never restore, replace or expose it',()=>{
 const id=digest('6');assert.deepEqual(backupArgs(id,'dump'),['exec','--user','999:999',id,'pg_dump','--username','subtrack_sandbox_bootstrap','--dbname','subtrack_sandbox','--format=custom']);assert.deepEqual(backupArgs(id,'list'),['exec','--interactive','--user','999:999',id,'pg_restore','--list']);assert.throws(()=>backupArgs('database','dump'));assert.throws(()=>backupArgs(id,'restore'));
});
test('opaque backup bytes stream to an exclusive bounded file with exact hash; partial/empty/error captures never qualify',async()=>{
 const os=require('node:os'),crypto=require('node:crypto'),{Readable}=require('node:stream'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'st253-backup-test-')),files=['archive.dump','too-large.dump','empty.dump','error.dump'];
 try{const bytes=Buffer.from('synthetic database archive'),file=path.join(temp,files[0]),result=await captureBackup(Readable.from([bytes.subarray(0,7),bytes.subarray(7)]),file,64);assert.equal(result.bytes,bytes.length);assert.equal(result.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(fs.readFileSync(file),bytes);await assert.rejects(captureBackup(Readable.from([bytes]),file,64));await assert.rejects(captureBackup(Readable.from([bytes]),path.join(temp,files[1]),3));await assert.rejects(captureBackup(Readable.from([]),path.join(temp,files[2]),64));await assert.rejects(captureBackup(new Readable({read(){this.destroy(Error('Simulated stream failure'));}}),path.join(temp,files[3]),64));await assert.rejects(captureBackup(Readable.from([bytes]),path.join(temp,'never.dump'),536870913));assert.equal(fs.existsSync(path.join(temp,'never.dump')),false);
 }finally{for(const name of files){const file=path.join(temp,name);if(fs.existsSync(file))fs.unlinkSync(file);}fs.rmdirSync(temp);}
});
test('actual upgrade awaits archive/list verification before STOP and records restored=false instead of claiming a restore',()=>{
 const source=fs.readFileSync(path.join(__dirname,'upgrade-api.cjs'),'utf8');assert.ok(source.indexOf('await privateBackup(p,stage,saved)')<source.indexOf("state='STOP_OLD_API'"));assert.ok(source.indexOf('await privateBackup(p,stage,saved)')<source.indexOf('migrationStarted=true'));assert.match(source,/setTimeout\(stop,120000\)/);assert.match(source,/pgRestoreListVerified:true,restored:false/);assert.match(source,/archive-and-toc-verified-only/);assert.match(source,/stdio:\['ignore','pipe','pipe'\]/);assert.doesNotMatch(source,/console\.log|pg_restore','--dbname/);
});
