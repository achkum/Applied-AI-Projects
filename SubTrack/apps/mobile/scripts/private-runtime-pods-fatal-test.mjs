import assert from 'node:assert/strict';
import test from 'node:test';
import {selectPodsFatal} from './private-runtime-pods-fatal.mjs';
test('bounded exact structured Error and code fence selects known public fatal lines before support footer',()=>{
 for(const fatal of ['JSON::ParserError - unexpected token at private-canary','JSON::Ext::ParserError: invalid','ArgumentError: invalid','TypeError: invalid','RuntimeError: failed','SyntaxError: invalid','NoMethodError: missing','NameError: missing','Pod::DSLError: invalid','Pod::Informative: failed','Error parsing JSON: invalid','JSON parse invalid: failed','unexpected token at private-canary']){
  const log=`[!] Oh no, an error occurred.\nSearch for existing GitHub issues similar to yours:\n### Error\n\n\u001b[31m\`\`\`ruby\u001b[0m\n${fatal}\n/private-canary/file.rb:12\n\`\`\`\nJSON parse invalid support issue title`;
  assert.equal(selectPodsFatal(log),`${fatal}\n/private-canary/file.rb:12`);
 }
 assert.equal(selectPodsFatal('### Other\nprivate-canary\n### Error\nRuntimeError: failed'),'RuntimeError: failed');
 assert.equal(selectPodsFatal('### Error\nunknown content\n### Other\nprivate-canary'),null);
 assert.equal(selectPodsFatal('### Error\n```\nunknown\n```\nRuntimeError: private-canary'),null);
});
test('legacy exact JSON exception remains preserved; lookalikes, completed, private prefixes, header-only and unknown input fail closed',()=>{
 assert.equal(selectPodsFatal('JSON::ParserError\nSpecific failure'),'JSON::ParserError\nSpecific failure');
 for(const log of [null,'x'.repeat(4000001),'','[!] Oh no, an error occurred.\nIssue title JSON parse invalid','private-canary JSON::ParserError','JSON::ParserErrorPrivateCanary: unknown','### Error','### ErrorPrivateCanary\nRuntimeError: unknown','### Error\nRuntimeErrorPrivateCanary: unknown','### Error\nprivate-canary RuntimeError: unknown','### Error\nRuntimeError: COMPLETED','### Error\nError parsing JSONPrivateCanary: unknown','### Error\nUnknownPrivateError: failed','### Error\nRuntimeError completed'])assert.equal(selectPodsFatal(log),null);
});
test('search windows and positive block caps/stops prevent unrelated tails or footer contamination',()=>{
 assert.equal(selectPodsFatal('### Error\n'+Array(12).fill('unknown').join('\n')+'\nRuntimeError: private-canary'),null);
 assert.equal(selectPodsFatal('### Error\n'+Array(11).fill('unknown').join('\n')+'\nRuntimeError: failed\nprivate-canary'),'RuntimeError: failed');
 assert.equal(selectPodsFatal('JSON::ParserError\n'+Array(20).fill('context').join('\n')).split('\n').length,12);
 for(const stop of ['* Try:','* Get more help','BUILD FAILED','BUILD SUCCESSFUL','Analyzing dependencies','Downloading dependencies','### Other','```','[!] Oh no','Search for existing GitHub issues'])assert.equal(selectPodsFatal(`JSON::ParserError\n${stop}\nprivate-canary`),'JSON::ParserError');
 assert.equal(selectPodsFatal('### Error\nRuntimeError: failed\n### Other\nprivate-canary'),'RuntimeError: failed');
});
