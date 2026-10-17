import {describe,it,expect,vi} from 'vitest';
import {AssertionError} from 'node:assert';
import {OwnedPrivateBankDiagnostics,PRIVATE_BANK_PROOF_PHASES,PRIVATE_BANK_TWO_OWNER_STEPS,privateBankFailureCategory,privateBankFailureLabel,safePrivateBankFailure} from './private-mobile-bank-diagnostics.js';
const sqlError=(code:string)=>Object.assign(new Error('private-canary-do-not-output'),{code,detail:'private-row-canary',hint:'private-key-canary'});
const map={42501:'PERMISSION',42703:'UNDEFINED_COLUMN','42P01':'UNDEFINED_TABLE',23503:'FOREIGN_KEY',23505:'UNIQUE',23514:'CHECK',23502:'NOT_NULL',42804:'TYPE_MISMATCH','22P02':'INVALID_INPUT',22003:'NUMERIC_RANGE',40001:'SERIALIZATION','40P01':'DEADLOCK'} as const;
describe('closed bank proof failure projection',()=>{
 it('maps only the exact approved SQLSTATE codes, never raw details/messages',()=>{
  for(const [code,category]of Object.entries(map))expect(privateBankFailureCategory(sqlError(code))).toBe(category);
  for(const value of [sqlError('private-canary'),sqlError('42501 '),new Error('private-canary'),{code:'42501'},null,'private-canary',Object.assign(new Error(),{code:42})])expect(privateBankFailureCategory(value)).toBe('OTHER');
  const inherited=Object.create(sqlError('42501')) as Error;expect(privateBankFailureCategory(inherited)).toBe('OTHER');
 });
 it('only a real AssertionError has the assertion category; code getters/proxies disclose nothing',()=>{
  expect(privateBankFailureCategory(new AssertionError({actual:'private',expected:'canary',operator:'strictEqual'}))).toBe('ASSERTION');
  expect(privateBankFailureCategory(sqlError('ERR_ASSERTION'))).toBe('OTHER');
  const getter=vi.fn(()=>{throw new Error('private-canary');});const error=new Error();Object.defineProperty(error,'code',{get:getter});
  expect(privateBankFailureCategory(error)).toBe('OTHER');expect(getter).not.toHaveBeenCalled();
  const proxy=new Proxy(new Error(),{getPrototypeOf(){throw new Error('private-canary');}});expect(privateBankFailureCategory(proxy)).toBe('OTHER');
  const descriptorProxy=new Proxy(new Error(),{getOwnPropertyDescriptor(){throw new Error('private-canary');}});expect(privateBankFailureCategory(descriptorProxy)).toBe('OTHER');
 });
 it('accepts every fixed legacy phase and exact expanded step/category; rejects canaries and trailing data',()=>{
  for(const phase of PRIVATE_BANK_PROOF_PHASES)expect(safePrivateBankFailure(privateBankFailureLabel(phase,null,null))).toBe(true);
  for(const step of PRIVATE_BANK_TWO_OWNER_STEPS)for(const category of [...Object.values(map),'ASSERTION','OTHER']){
   const line=privateBankFailureLabel('TWO_OWNER',step,category);expect(line).toBe(`ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=${step} category=${category}`);expect(safePrivateBankFailure(line)).toBe(true);
  }
  for(const [step,category]of [[null,'OTHER'],['private-canary','OTHER'],['B_SESSION','private-canary'],['B_SESSION',42]])expect(privateBankFailureLabel('TWO_OWNER',step,category)).toBe('ST248_BANK_PROOF_FAILURE phase=TWO_OWNER');
  for(const value of [null,42,'private-canary','ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=private-canary category=OTHER','ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=B_SESSION category=private-canary','ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=B_SESSION category=OTHER trailing','ST248_BANK_PROOF_FAILURE phase=TWO_OWNER\nprivate-canary','ST248_BANK_PROOF_FAILURE phase=TWO_OWNER\n','ST248_BANK_PROOF_FAILURE phase=TWO_OWNER\r'])expect(safePrivateBankFailure(value)).toBe(false);
  expect(()=>privateBankFailureLabel('private-canary' as never,'B_SESSION','OTHER')).toThrow('Bank proof diagnostic unavailable');
 });
});
describe('owned query diagnostics scope and propagation',()=>{
 it('is inactive outside an exact active graph step and retains only its first recognized category',()=>{
  const state=new OwnedPrivateBankDiagnostics();expect(()=>state.beginStep('B_SESSION')).toThrow();state.captureQueryFailure()(sqlError('42501'));expect(state.failureCategory('B_SESSION')).toBeNull();
  state.startGraph();expect(()=>state.beginStep('private-canary' as never)).toThrow();state.captureQueryFailure()(sqlError('42501'));expect(state.failureCategory('B_SESSION')).toBeNull();
  state.beginStep('B_SESSION');const observe=state.captureQueryFailure();observe(sqlError('private-canary'));expect(state.failureCategory('B_SESSION')).toBeNull();observe(sqlError('42501'));observe(sqlError('23503'));expect(state.failureCategory('B_SESSION')).toBe('PERMISSION');expect(state.failureCategory('B_SYNC')).toBeNull();
  state.clearStep();expect(state.failureCategory('B_SESSION')).toBeNull();observe(sqlError('23503'));expect(state.failureCategory('B_SESSION')).toBeNull();
 });
 it('fences old callbacks across reset, graph stop/restart and disposal without retaining private errors',()=>{
  const state=new OwnedPrivateBankDiagnostics();state.startGraph();state.beginStep('B_SESSION');const first=state.captureQueryFailure();
  state.beginStep('B_SESSION');first(sqlError('42501'));expect(state.failureCategory('B_SESSION')).toBeNull();state.captureQueryFailure()(sqlError('23503'));expect(state.failureCategory('B_SESSION')).toBe('FOREIGN_KEY');
  const prior=state.captureQueryFailure();state.stopGraph();expect(state.failureCategory('B_SESSION')).toBeNull();prior(sqlError('42501'));expect(state.failureCategory('B_SESSION')).toBeNull();
  state.startGraph();state.beginStep('B_SESSION');prior(sqlError('42501'));expect(state.failureCategory('B_SESSION')).toBeNull();
  const late=state.captureQueryFailure();state.startGraph();state.beginStep('B_SESSION');late(sqlError('42501'));expect(state.failureCategory('B_SESSION')).toBeNull();state.stopGraph();expect(()=>state.beginStep('B_SESSION')).toThrow();
 });
 it('returns the identical result and rethrows the identical query failure while projecting only an enum',async()=>{
  const state=new OwnedPrivateBankDiagnostics();state.startGraph();state.beginStep('B_SESSION');const result={rows:[{private:'canary'}]};expect(await state.observedQuery(()=>Promise.resolve(result))).toBe(result);expect(state.failureCategory('B_SESSION')).toBeNull();
  const failure=sqlError('42703');await expect(state.observedQuery(()=>Promise.reject(failure))).rejects.toBe(failure);expect(state.failureCategory('B_SESSION')).toBe('UNDEFINED_COLUMN');
  state.beginStep('B_SYNC');const unknown=sqlError('private-canary');await expect(state.observedQuery(()=>{throw unknown;})).rejects.toBe(unknown);expect(state.failureCategory('B_SYNC')).toBeNull();
 });
 it('a delayed failing query cannot overwrite a new step or graph',async()=>{
  const state=new OwnedPrivateBankDiagnostics();state.startGraph();state.beginStep('B_SESSION');let reject!:(error:unknown)=>void;
  const query=state.observedQuery(()=>new Promise((_ok,no)=>{reject=no;}));const expectation=expect(query).rejects.toMatchObject({code:'42501'});
  state.beginStep('B_SYNC');reject(sqlError('42501'));await expectation;expect(state.failureCategory('B_SYNC')).toBeNull();
 });
});
