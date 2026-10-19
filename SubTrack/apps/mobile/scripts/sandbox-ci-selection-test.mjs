import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {URL} from 'node:url';
const require=createRequire(new URL('../package.json',import.meta.url));
const yaml=createRequire(require.resolve('expo/package.json'))('yaml');
const workflow=name=>yaml.parse(readFileSync(new URL(`../../../../.github/workflows/${name}`,import.meta.url),'utf8'));
test('native dependency changes start the selector and unknown/shared changes keep the full gate',()=>{
 const doc=workflow('subtrack-native-device-proof.yml'),paths=doc.on.pull_request.paths;
 for(const path of ['SubTrack/packages/money/**','SubTrack/packages/domain/**','SubTrack/packages/synthetic/**','SubTrack/packages/ui-tokens/**','SubTrack/pnpm-lock.yaml'])assert.ok(paths.includes(path));
 assert.ok(doc.jobs['installed-native'].needs==='select-proof');
 assert.ok(doc.jobs['select-proof'].steps.find(step=>step.id==='select').run.includes('private-runtime-change-scope.mjs'));
});
test('API PR has one real image qualification, no duplicate preparation compile or false build receipt',()=>{
 const doc=workflow('subtrack-sandbox-api-build.yml');
 assert.equal(doc.jobs['image-preparation'].if,"github.event_name == 'workflow_dispatch'");
 assert.equal(doc.jobs['api-image-policy'].if,"github.event_name == 'pull_request'");
 for(const step of doc.jobs['api-image-policy'].steps)assert.ok(!step.run?.includes('bash tools/sandbox/build-api.sh'));
 assert.ok(!doc.jobs['api-image-policy'].steps.some(step=>step.uses?.includes('upload-artifact')));
 const full=workflow('subtrack-sandbox-image-postgresql-qualification.yml');
 assert.ok(full.jobs['same-image-postgresql'].steps.some(step=>step.run?.includes('sandbox-qualify.sh')));
});

test('registered native entry point calls the exact signed install-only workflow without normal app build jobs',()=>{
 const caller=workflow('subtrack-native-device-proof.yml'),child=workflow('subtrack-sandbox-installed-android.yml');
 assert.equal(caller.on.workflow_dispatch.inputs.signed_product.default,false);
 assert.equal(caller.jobs['select-proof'].if,"${{ !(github.event_name == 'workflow_dispatch' && inputs.signed_product == true) }}");
 const target=caller.jobs['final-signed-product'];assert.equal(target.needs,'final-signed-authority');assert.equal(target.if,"github.event_name == 'workflow_dispatch' && inputs.signed_product == true");
 assert.equal(target.uses,'./.github/workflows/subtrack-sandbox-installed-android.yml');assert.equal(target.permissions.contents,'write');
 const guard=caller.jobs['final-signed-authority'].steps[0].run;
 for(const value of ['achkum/Applied-AI-Projects','refs/heads/st/native-synthetic-bank','test "$ST_FINAL_TOOLING" = "$GITHUB_SHA"','if test "$ST_FINAL_SOURCE" != "$GITHUB_SHA"; then','test "$ST_FINAL_SOURCE" = 81420b1faa8dae3143bd18653ac5cae383e8a9bc'])assert.ok(guard.includes(value));
 assert.deepEqual(Object.keys(target.with).sort(),Object.keys(child.on.workflow_call.inputs).sort());
 for(const name of ['source_head','signed_release_id','signed_sha256','verification_run']){const input=child.on.workflow_call.inputs[name];assert.equal(input.required,true);assert.equal(input.type,'string');}
 assert.deepEqual(child.on.workflow_call.inputs.tooling_head,{description:'Exact reviewed test-tooling commit (same source or immediate tooling-only child of814)',type:'string',default:''});
 assert.equal(caller.jobs['final-signed-authority'].env.ST_FINAL_TOOLING,'${{ inputs.tooling_head || github.sha }}');assert.equal(target.with.tooling_head,'${{ inputs.tooling_head || github.sha }}');
 assert.equal(caller.jobs['installed-native'].needs,'select-proof');
});
