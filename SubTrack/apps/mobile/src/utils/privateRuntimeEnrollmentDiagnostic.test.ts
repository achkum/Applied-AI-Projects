import {calibrateEnrollmentDiagnostic,beginEnrollmentDiagnostic,createEnrollmentDiagnosticChannel,emitEnrollmentDiagnostic,type EnrollmentDiagnosticStage,type StartupDiagnosticStage,observeStartupStage} from './privateRuntimeEnrollmentDiagnostic';
const valid={development:true,platform:'ios',proof:'true',enabled:'true',url:'https://localhost:3443'};
test('explicit native development/proof/enabled/exact-local gates and nonthrowing unavailable context',()=>{
 for(const patch of [{development:false},{platform:'web'},{proof:undefined},{proof:'false'},{enabled:'false'},{url:'https://private-canary.invalid'}]){const sink=jest.fn(),channel=createEnrollmentDiagnosticChannel(()=>({...valid,...patch}),sink);channel.calibrate()();expect(channel.begin()).toBeUndefined();channel.observe('submit-valid');expect(sink).not.toHaveBeenCalled();}
 const sink=jest.fn(),unavailable=createEnrollmentDiagnosticChannel(()=>{throw new Error('private-canary');},sink);expect(()=>unavailable.calibrate()()).not.toThrow();expect(unavailable.begin()).toBeUndefined();expect(sink).not.toHaveBeenCalled();
 // Exercise actual default-off wrapper and its statically inlined configuration without changing it.
 calibrateEnrollmentDiagnostic()();expect(beginEnrollmentDiagnostic()).toBeUndefined();
});
test('opaque mount/invocation ownership retires stale publishers and unknown stages',()=>{
 const sink=jest.fn(),channel=createEnrollmentDiagnosticChannel(()=>valid,sink);expect(channel.begin()).toBeUndefined();channel.observe('submit-valid');expect(sink).not.toHaveBeenCalled();
 const firstClose=channel.calibrate(),first=channel.begin();first?.stage('fetch-entered');const second=channel.begin();first?.stage('flow-obsolete');first?.retire();second?.stage('entropy-accepted');second?.retire();second?.stage('fetch-entered');
 const nextClose=channel.calibrate(),next=channel.begin();firstClose();next?.stage('config-accepted');channel.observe('private-canary' as EnrollmentDiagnosticStage);nextClose();next?.stage('flow-committed');expect(sink.mock.calls.map(([line])=>line)).toEqual(['ST244_ENROLLMENT calibration=mounted','ST244_ENROLLMENT stage=fetch-entered','ST244_ENROLLMENT stage=entropy-accepted','ST244_ENROLLMENT calibration=mounted','ST244_ENROLLMENT stage=config-accepted']);
});
test('Android channel, runtime gate retirement, sink failures and throwing observers do not escape',()=>{
 let gate={...valid,platform:'android'};const sink=jest.fn(()=>{throw new Error('private-canary');}),channel=createEnrollmentDiagnosticChannel(()=>gate,sink);const close=channel.calibrate(),observer=channel.begin();expect(()=>observer?.stage('fetch-entered')).not.toThrow();gate={...gate,development:false};observer?.stage('flow-committed');close();emitEnrollmentDiagnostic(undefined,'fetch-entered');expect(()=>emitEnrollmentDiagnostic({stage:()=>{throw new Error('private-canary');},retire:()=>{}},'fetch-entered')).not.toThrow();
});

test('pure owned channel exercises the same default console sink used by runtime',()=>{
 const output=jest.spyOn(console,'info').mockImplementation(()=>{});try{const channel=createEnrollmentDiagnosticChannel(()=>valid),close=channel.calibrate(),observer=channel.begin();observer?.stage('config-accepted');close();expect(output.mock.calls.map(([line])=>line)).toEqual(['ST244_ENROLLMENT calibration=mounted','ST244_ENROLLMENT stage=config-accepted']);}finally{output.mockRestore();}
});

test('startup milestones use all existing gates without enrollment calibration or private values',()=>{
 for(const patch of [{development:false},{platform:'web'},{proof:undefined},{proof:'false'},{enabled:'false'},{url:'https://private-canary.invalid'}]){const sink=jest.fn(),channel=createEnrollmentDiagnosticChannel(()=>({...valid,...patch}),sink);channel.startup('root-entered');expect(sink).not.toHaveBeenCalled();}
 const sink=jest.fn(),channel=createEnrollmentDiagnosticChannel(()=>valid,sink);for(const stage of ['root-entered','fonts-ready','welcome-committed'] as const)channel.startup(stage);channel.startup('private-canary' as StartupDiagnosticStage);expect(sink.mock.calls.map(([line])=>line)).toEqual(['ST244_STARTUP stage=root-entered','ST244_STARTUP stage=fonts-ready','ST244_STARTUP stage=welcome-committed']);
 expect(()=>createEnrollmentDiagnosticChannel(()=>valid,()=>{throw Error('private-canary');}).startup('root-entered')).not.toThrow();expect(()=>createEnrollmentDiagnosticChannel(()=>{throw Error('private-canary');},sink).startup('root-entered')).not.toThrow();observeStartupStage('root-entered');
});

test('private startup hides only developer notification UI once after all exact gates pass',()=>{
 for(const patch of [{development:false},{platform:'web'},{proof:undefined},{proof:'false'},{enabled:'false'},{url:'https://private-canary.invalid'}]){const prepareUi=jest.fn(),channel=createEnrollmentDiagnosticChannel(()=>({...valid,...patch}),jest.fn(),prepareUi);channel.startup('root-entered');expect(prepareUi).not.toHaveBeenCalled();}
 for(const platform of ['android','ios']){const events:string[]=[],prepareUi=jest.fn(()=>{events.push('ui');}),channel=createEnrollmentDiagnosticChannel(()=>({...valid,platform}),fixed=>events.push(fixed),prepareUi);channel.startup('private-canary' as StartupDiagnosticStage);expect(prepareUi).not.toHaveBeenCalled();channel.startup('root-entered');channel.startup('fonts-ready');expect(prepareUi).toHaveBeenCalledTimes(1);expect(events).toEqual(['ui','ST244_STARTUP stage=root-entered','ST244_STARTUP stage=fonts-ready']);}
 const sink=jest.fn(),channel=createEnrollmentDiagnosticChannel(()=>valid,sink,()=>{throw Error('private-canary');});expect(()=>channel.startup('root-entered')).not.toThrow();expect(sink).toHaveBeenCalledWith('ST244_STARTUP stage=root-entered');
});
