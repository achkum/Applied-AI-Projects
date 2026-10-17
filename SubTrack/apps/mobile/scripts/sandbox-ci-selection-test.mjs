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
