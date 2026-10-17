import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {URL} from 'node:url';
import vm from 'node:vm';

const workflow=readFileSync(new URL('../../../../.github/workflows/subtrack-native-device-proof.yml',import.meta.url),'utf8');
const expression=workflow.match(/^ {8}include: \$\{\{ (.+) \}\}$/m)?.[1];
assert.ok(expression);
// Execute the actual matrix expression's boolean/JSON subset with trusted fixtures.
const script=new vm.Script(expression.replace(/^fromJSON\(/,'JSON.parse(').replaceAll('needs.select-proof.',"needs['select-proof']."));
const approved={event_name:'pull_request',repository:'achkum/Applied-AI-Projects',event:{pull_request:{number:297,head:{repo:{full_name:'achkum/Applied-AI-Projects'},ref:'codex/android-product-completion'},base:{ref:'st/native-synthetic-bank'}}}};
function platforms(github=approved,scope='full',inputs={}){
 return Array.from(script.runInNewContext({github,needs:{'select-proof':{outputs:{scope}}},inputs}),row=>row.platform);
}
test('the approved exact PR runs full Android acceptance without claiming iOS',()=>assert.deepEqual(platforms(),['android']));
test('foreign PR, source, repository and target retain the full two-platform matrix',()=>{
 for(const change of [g=>{g.event.pull_request.number=298;},g=>{g.repository='other/repository';},g=>{g.event.pull_request.head.repo.full_name='fork/repository';},g=>{g.event.pull_request.head.ref='codex/other';},g=>{g.event.pull_request.base.ref='main';}]){
  const github=JSON.parse(JSON.stringify(approved));change(github);assert.deepEqual(platforms(github),['android','ios']);
 }
});
test('existing profile and explicit manual platform selections are preserved',()=>{
 const other=JSON.parse(JSON.stringify(approved));other.event.pull_request.number=298;
 assert.deepEqual(platforms(other,'profile'),['android']);
 const manual={event_name:'workflow_dispatch'};
 assert.deepEqual(platforms(manual,'full',{platform:'android'}),['android']);
 assert.deepEqual(platforms(manual,'full',{platform:'ios'}),['ios']);
 assert.deepEqual(platforms(manual,'full',{platform:'all'}),['android','ios']);
});
