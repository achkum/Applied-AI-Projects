import assert from 'node:assert/strict';
import test from 'node:test';
import {enrollmentStageDiagnostic} from './private-runtime-enrollment-stage.mjs';
const parse=log=>enrollmentStageDiagnostic({phase:'flow-identifier',log});
const calibration='ST244_ENROLLMENT calibration=mounted';
test('exact phase, bounded input, actual calibration and closed full-line markers are mandatory',()=>{
 for(const input of [{phase:'flow-enroll-add',log:calibration},{phase:'flow-identifier',log:null},{phase:'flow-identifier',log:'x'.repeat(4000001)}])assert.equal(enrollmentStageDiagnostic(input),null);
 for(const log of ['', 'private-canary', 'ST244_ENROLLMENT stage=fetch-entered',`${calibration}\nST244_ENROLLMENT stage=private-canary`,`${calibration}\nST244_ENROLLMENT stage=fetch-entered private-canary`,`${calibration}\nBearer-private-canary ST244_ENROLLMENT stage=fetch-entered`,'ST244_ENROLLMENT calibration=private-canary'])assert.equal(parse(log),null);
});
test('known stages are bounded observations, missing stages are unobserved, new calibration resets stale counts',()=>{
 const alone=parse(calibration);assert.ok(Object.isFrozen(alone));assert.equal(Object.keys(alone).length,16);for(const count of Object.values(alone))assert.equal(count,'unobserved');
 const result=parse(`private-canary\n LOG  ${calibration}\n INFO ST244_ENROLLMENT stage=submit-valid\n\u001b[31mST244_ENROLLMENT stage=fetch-entered\u001b[0m\nST244_ENROLLMENT stage=fetch-entered\nST244_ENROLLMENT stage=fetch-entered`);assert.equal(result['submit-valid'],'one');assert.equal(result['fetch-entered'],'multiple');assert.equal(result['flow-committed'],'unobserved');assert.equal(JSON.stringify(result).includes('canary'),false);
 const reset=parse(`${calibration}\nST244_ENROLLMENT stage=fetch-entered\n${calibration}\nST244_ENROLLMENT stage=config-rejected`);assert.equal(reset['fetch-entered'],'unobserved');assert.equal(reset['config-rejected'],'one');
 for(const stage of Object.keys(alone))assert.equal(parse(`${calibration}\nST244_ENROLLMENT stage=${stage}`)[stage],'one');
});
