import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const moduleUrl = new URL('../private-onboarding.ts', import.meta.url).href;
function run(code) {
  const source = `import assert from 'node:assert/strict'; import * as p from ${JSON.stringify(moduleUrl)}; ${code}`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const id = '123e4567-e89b-42d3-a456-426614174000';
const owner = { visibility: 'owner', source: 'MANUAL', revision: '1', id, customName: 'Example', merchantId: null, merchantName: null,
  categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '999',
  currency: 'SEK', nextChargeDate: '2026-10-11', alwaysPrivate: false };

test('private HTTPS contract keeps default routes unavailable and freezes owner-only response matrix', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = mkdtempSync(join(tmpdir(), 'st238-contract-'));
  try {
    const output = join(dir, 'openapi.json');
    const bundled = spawnSync(process.execPath, [join(root, 'node_modules/@redocly/cli/bin/cli.js'),
      'bundle', join(root, 'openapi.yaml'), '--output', output], { cwd: root, encoding: 'utf8' });
    assert.equal(bundled.status, 0, bundled.stderr || bundled.stdout);
    const doc = JSON.parse(readFileSync(output, 'utf8'));
    const paths = doc.paths;
    for (const path of ['/v2/me/mode', '/v2/me/mode/read', '/v2/subscriptions/owner/read'])
      assert.equal(paths[path].post['x-runtime-availability'], 'unavailable-default');
    for (const path of ['/v2/me/mode', '/v2/me/mode/read']) {
      const operation = paths[path].post;
      assert.deepEqual(Object.keys(operation.responses), ['200', '400', '401', '403', '409', '500']);
      assert.deepEqual(operation.responses['200'], { $ref: '#/components/responses/BrowserModeView' });
      for (const status of ['400', '401', '403', '409', '500'])
        assert.deepEqual(operation.responses[status], { $ref: '#/components/responses/BrowserModeProblem' });
    }
    const list = paths['/v2/subscriptions/owner/read'].post;
    assert.deepEqual(Object.keys(list.responses), ['200', '400', '401', '403', '409', '500']);
    assert.deepEqual(list.responses['200'], { $ref: '#/components/responses/PrivateOwnerPage' });
    for (const status of ['400', '401', '403', '409', '500'])
      assert.deepEqual(list.responses[status], { $ref: '#/components/responses/PrivateSubscriptionProblem' });
    assert.match(JSON.stringify(doc.components.schemas.PrivateOwnerPage), /PrivateOwnerSubscriptionView|"visibility"/);
    assert.equal(doc.components.schemas.PrivateOwnerPage.properties.items.maxItems, 50);
    for (const [path, verb, success] of [
      ['/v2/subscriptions/{id}/read', 'post', 'PrivateOwnerSubscriptionView'],
      ['/v2/subscriptions/{id}', 'patch', 'SubscriptionLifecycleResult']]) {
      const operation = paths[path][verb];
      assert.equal(operation['x-runtime-availability'], 'unavailable-default');
      const privateSuccess = operation['x-private-https-responses']['200'];
      assert.ok(privateSuccess.$ref === `#/components/schemas/${success}` ||
        (privateSuccess.additionalProperties === false && privateSuccess.properties?.id));
      for (const status of ['400', '401', '403', '404', '409', '500']) {
        const privateError = operation['x-private-https-responses'][status];
        assert.ok(privateError.$ref === '#/components/responses/PrivateSubscriptionProblem' ||
          privateError.content?.['application/problem+json']?.schema?.$ref === '#/components/schemas/PrivateSubscriptionError');
      }
      assert.equal(operation['x-private-https-problem-codes']['404'], 'SUBSCRIPTION_NOT_FOUND');
    }
    assert.equal(paths['/v2/subscriptions/{id}/read'].post['x-private-https-problem-codes']['409'], 'MODE_CONFLICT');
    assert.deepEqual(paths['/v2/subscriptions/{id}'].patch['x-private-https-problem-codes']['409'],
      ['MODE_CONFLICT', 'LIFECYCLE_CONFLICT']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mode and page requests are closed, with only nullable persisted mode and bounded cursor', () => run(`
  assert.deepEqual(p.parseModeView({mode:null}), {mode:null});
  assert.deepEqual(p.parseModeView({mode:'just-me'}), {mode:'just-me'});
  for (const value of [{}, {mode:'household'}, {mode:null,ownerId:'x'}]) assert.throws(() => p.parseModeView(value));
  assert.deepEqual(p.parsePrivateOwnerPageRequest({}), {});
  assert.deepEqual(p.parsePrivateOwnerPageRequest({cursor:'abc'}), {cursor:'abc'});
  for (const value of [{cursor:null},{cursor:''},{limit:50},{ownerId:'x'},{cursor:'a'.repeat(513)}])
    assert.throws(() => p.parsePrivateOwnerPageRequest(value));
`));

test('owner projection rejects peer fields, invalid money, malformed dates and unknown enum values', () => run(`
  const row = ${JSON.stringify(owner)};
  assert.deepEqual(p.parsePrivateOwnerView(row), row);
  for (const bad of [
    {...row, visibility:'household'}, {...row, rawDescription:'private'}, {...row, expectedAmountMinor:9.99},
    {...row, expectedAmountMinor:'01'}, {...row, expectedAmountMinor:'9223372036854775808'},
    {...row, nextChargeDate:'2026-02-30'}, {...row, categoryCode:'UNKNOWN'}, {...row, id:row.id.toUpperCase()},
    {...row, merchantId:undefined}, {...row,source:undefined}, {...row,source:'UNKNOWN'},
    {...row,revision:undefined}, {...row,revision:'0'}, {...row,revision:'01'}, {...row,revision:1}, {...row,revision:'9223372036854775808'}
  ]) assert.throws(() => p.parsePrivateOwnerView(bad));
`));

test('owner page caps fifty and lifecycle result is a closed committed status', () => run(`
  const row = ${JSON.stringify(owner)};
  assert.deepEqual(p.parsePrivateOwnerPage({items:[],nextCursor:null}), {items:[],nextCursor:null});
  const fifty = Array.from({length:50}, (_,i) => ({...row,id:'123e4567-e89b-42d3-a456-'+String(i).padStart(12,'0')}));
  assert.equal(p.parsePrivateOwnerPage({items:fifty,nextCursor:'abc'}).items.length,50);
  for (const page of [{items:[row,row],nextCursor:null}, {items:[row],nextCursor:'abc'},
    {items:[...fifty,row],nextCursor:null}, {items:[],nextCursor:null,ownerId:'x'}])
    assert.throws(() => p.parsePrivateOwnerPage(page));
  assert.deepEqual(p.parsePrivateLifecycleResult({id:row.id,status:'PAUSED'}), {id:row.id,status:'PAUSED'});
  for (const result of [{id:row.id,status:'DETECTED'},{id:row.id,status:'ACTIVE',ownerId:'x'}])
    assert.throws(() => p.parsePrivateLifecycleResult(result));
`));

test('manual canonical form and invalid boundaries',()=>{
 run(`const v={customName:'  Example  ',categoryCode:'OTHER_SUBSCRIPTION',cadence:'MONTHLY',expectedAmountMinor:'9223372036854775807'};
 assert.deepEqual(p.parsePrivateManualCreate(v),{...v,customName:'Example',nextChargeDate:null});
 assert.deepEqual(p.parsePrivateManualCreate({...v,nextChargeDate:null}),p.parsePrivateManualCreate(v));
 for(const patch of [{customName:''},{customName:'x'.repeat(121)},{customName:String.fromCharCode(0)},{customName:String.fromCharCode(0xd800)},
 {customName:'x'+String.fromCharCode(0x200b)},{expectedAmountMinor:'0'},{expectedAmountMinor:'01'},{expectedAmountMinor:'9223372036854775808'},
 {expectedAmountMinor:'1e3'},{expectedAmountMinor:1},{cadence:'CUSTOM'},{categoryCode:'UNION_FEE'},
 {nextChargeDate:'0000-01-01'},{nextChargeDate:'2026-02-29'},{source:'MANUAL'}]) assert.throws(()=>p.parsePrivateManualCreate({...v,...patch}));
 assert.equal(p.parsePrivateManualCreate({...v,nextChargeDate:'0001-01-01'}).nextChargeDate,'0001-01-01');
 assert.equal(p.parsePrivateManualCreate({...v,nextChargeDate:'2024-02-29'}).nextChargeDate,'2024-02-29');
 const emoji=String.fromCodePoint(0x1f600); assert.equal(p.parsePrivateManualCreate({...v,customName:emoji.repeat(60)}).customName.length,120);
 assert.throws(()=>p.parsePrivateManualCreate({...v,customName:emoji.repeat(61)}));
 assert.throws(()=>p.parsePrivateManualCreated({id:'invalid'}));`);
});

test('manual wire is closed and default unavailable with exact success/error matrix',()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const dir=mkdtempSync(join(tmpdir(),'st240-contract-'));
 try {
 const output=join(dir,'openapi.json');const result=spawnSync(process.execPath,[join(root,'node_modules/@redocly/cli/bin/cli.js'),'bundle',join(root,'openapi.yaml'),'--output',output],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const doc=JSON.parse(readFileSync(output,'utf8'));const op=doc.paths['/v2/subscriptions/owner/manual'].post;
 assert.equal(op['x-runtime-availability'],'unavailable-default');assert.deepEqual(Object.keys(op.responses),['201','400','401','403','409','500']);
 assert.equal(op.responses['201'].$ref,'#/components/responses/PrivateManualCreated');
 const schema=doc.components.schemas.PrivateManualCreate;assert.equal(schema.additionalProperties,false);
 assert.deepEqual(schema.required,['customName','categoryCode','cadence','expectedAmountMinor']);assert.equal(schema.properties.categoryCode.enum.length,22);
 assert.deepEqual(doc.components.schemas.PrivateManualCreated.required,['id']);assert.deepEqual(Object.keys(doc.components.schemas.PrivateManualCreated.properties),['id']);
 assert.ok(doc.components.schemas.PrivateOwnerSubscriptionView.required.includes('source'));assert.ok(!doc.components.schemas.SubscriptionOwnerView.properties.source);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('manual Edit requires full replacement and canonical bounded revision without selectors',()=>run(`
 const row={customName:' Example ',categoryCode:'OTHER_SUBSCRIPTION',cadence:'ANNUAL',expectedAmountMinor:'1',nextChargeDate:null,expectedRevision:'9223372036854775807'};
 assert.deepEqual(p.parsePrivateManualEdit(row),{...row,customName:'Example'});
 for(const revision of [undefined,null,0,1,'0','01','-1','+1','1.0','1e3','9223372036854775808','9'.repeat(20)])
  assert.throws(()=>p.parsePrivateManualEdit({...row,expectedRevision:revision}));
 const {nextChargeDate,...missing}=row;assert.throws(()=>p.parsePrivateManualEdit(missing));
 for(const patch of [{nextChargeDate:undefined},{nextChargeDate:'0000-01-01'},{nextChargeDate:'2026-02-29'},{source:'MANUAL'},{status:'PAUSED'},{ownerId:'x'},{currency:'SEK'}])
  assert.throws(()=>p.parsePrivateManualEdit({...row,...patch}));
 assert.equal(p.parsePrivateManualEdit({...row,nextChargeDate:'9999-12-31',expectedRevision:'1'}).nextChargeDate,'9999-12-31');
 assert.deepEqual(p.parsePrivateManualEdited({id:${JSON.stringify(id)},revision:'2'}),{id:${JSON.stringify(id)},revision:'2'});
 for(const result of [{id:${JSON.stringify(id)},revision:'0'},{id:'bad',revision:'1'},{id:${JSON.stringify(id)},revision:'1',source:'MANUAL'}])assert.throws(()=>p.parsePrivateManualEdited(result));
`));

test('Edit has exact closed response matrix and private-only revision',()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const dir=mkdtempSync(join(tmpdir(),'st241-contract-'));
 try {
  const output=join(dir,'openapi.json');const result=spawnSync(process.execPath,[join(root,'node_modules/@redocly/cli/bin/cli.js'),'bundle',join(root,'openapi.yaml'),'--output',output],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const doc=JSON.parse(readFileSync(output,'utf8'));const op=doc.paths['/v2/subscriptions/owner/manual/{id}/edit'].post;
  assert.equal(op['x-runtime-availability'],'unavailable-default');assert.deepEqual(Object.keys(op.responses),['200','400','401','403','404','409','500']);
  assert.equal(op.responses['200'].$ref,'#/components/responses/PrivateManualEdited');
  const schema=doc.components.schemas.PrivateManualEdit;assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schema.required,['customName','categoryCode','cadence','expectedAmountMinor','nextChargeDate','expectedRevision']);
  assert.equal(doc.components.schemas.PrivateOwnerSubscriptionView.required.length,14);
  assert.ok(!doc.components.schemas.SubscriptionOwnerView.properties.revision);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
