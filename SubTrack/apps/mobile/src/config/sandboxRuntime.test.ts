import { resolveSandboxPreparation, resolveSandboxRuntime, sandboxConfigurationSelected, readSandboxMarker } from './sandboxRuntime';

const valid = { variant: 'sandbox', apiBaseUrl: 'https://198.44.116.159', platform: 'ios', development: false };

describe('sandbox configuration preparation', () => {
  it.each(['ios', 'android'])('preserves disabled release and development preparation on %s', platform => {
    for (const development of [false, true]) {
      const input = { ...valid, platform, development };
      const prepared = resolveSandboxPreparation(input);
      expect(prepared).toEqual({ variant: 'sandbox', apiBaseUrl: valid.apiBaseUrl,
        runtimeEnabled: false, publicationEnabled: false, privateDiagnosticsEnabled: false });
      expect(Object.isFrozen(prepared)).toBe(true);
      expect(resolveSandboxRuntime(input)).toBeNull();
    }
  });
  it.each([undefined, '', 'production', 'development', 'Sandbox'])('rejects variant %s without fallback', variant => {
    expect(resolveSandboxPreparation({ ...valid, variant })).toBeNull();
    expect(resolveSandboxRuntime({ ...valid, variant })).toBeNull();
  });
  it.each(['web', 'windows', ''])('rejects platform %s', platform => {
    expect(resolveSandboxPreparation({ ...valid, platform })).toBeNull();
  });
  it.each([undefined, '', 'http://198.44.116.159', 'https://198.44.116.159/',
    'https://198.44.116.159/path', 'https://198.44.116.159?key=value', 'https://198.44.116.159#fragment',
    'https://user:password@198.44.116.159', 'https://198.44.116.159:443', 'HTTPS://198.44.116.159',
    ' https://198.44.116.159', 'https://198.44.116.159\n', 'https://localhost:3443',
    'https://api.subtrack.app', 'https://other.example'])('rejects noncanonical/unapproved origin %s', apiBaseUrl => {
    expect(resolveSandboxPreparation({ ...valid, apiBaseUrl })).toBeNull();
    expect(resolveSandboxRuntime({ ...valid, apiBaseUrl })).toBeNull();
  });
});
const activeMarker = { variant: 'sandbox', apiBaseUrl: valid.apiBaseUrl, runtimeEnabled: true, publicationEnabled: false, privateDiagnosticsEnabled: false };
it.each(['ios','android'])('accepts only the explicit five-field active marker on %s', platform => {
  for (const development of [true,false]) { const result=resolveSandboxRuntime({marker:activeMarker,platform,development});expect(result).toEqual(activeMarker);expect(Object.isFrozen(result)).toBe(true); }
});
it('rejects disabled, malformed, inherited, getter, proxy and extra marker fields without getter evaluation',()=>{
  for(const key of Object.keys(activeMarker)){const marker:Record<string,unknown>={...activeMarker};delete marker[key];expect(resolveSandboxRuntime({marker,platform:'ios'})).toBeNull();}
  for(const marker of [null,undefined,[],Object.create(null),Object.assign(Object.create({}),activeMarker),{...activeMarker,runtimeEnabled:false},{...activeMarker,runtimeEnabled:'true'},{...activeMarker,variant:'private'},{...activeMarker,apiBaseUrl:'https://other.example'},{...activeMarker,publicationEnabled:true},{...activeMarker,privateDiagnosticsEnabled:true},{...activeMarker,extra:true},{...activeMarker,[Symbol()]:true}])expect(resolveSandboxRuntime({marker,platform:'ios'})).toBeNull();
  let reads=0;const accessor={...activeMarker};Object.defineProperty(accessor,'runtimeEnabled',{enumerable:true,get(){reads++;return true;}});expect(resolveSandboxRuntime({marker:accessor,platform:'ios'})).toBeNull();expect(reads).toBe(0);
  const hidden={...activeMarker};Object.defineProperty(hidden,'runtimeEnabled',{value:true,enumerable:false});expect(resolveSandboxRuntime({marker:hidden,platform:'ios'})).toBeNull();
  const hostile=new Proxy(activeMarker,{getPrototypeOf(){throw Error('private');}});expect(resolveSandboxRuntime({marker:hostile,platform:'ios'})).toBeNull();
  const noReads=new Proxy(activeMarker,{get(){throw Error('must not read');}});expect(resolveSandboxRuntime({marker:noReads,platform:'ios'})).toEqual(activeMarker);
  for(const platform of ['web','windows',''])expect(resolveSandboxRuntime({marker:activeMarker,platform})).toBeNull();
});

it('configuration descriptor presence isolates undefined/accessors/hostile inspection and preserves only genuine absence',()=>{
 for(const config of [null,undefined,{}, {extra:null},{extra:undefined},{extra:{} }]){expect(sandboxConfigurationSelected(config)).toBe(false);expect(readSandboxMarker(config)).toBeUndefined();}
 for(const config of [1,[],{extra:1},{extra:[]},Object.create({extra:{}}),{extra:Object.create({subtrackSandbox:activeMarker})},{extra:{subtrackSandbox:undefined}},{extra:{subtrackSandbox:null}}])expect(sandboxConfigurationSelected(config)).toBe(true);
 let reads=0;for(const config of [Object.defineProperty({},'extra',{get(){reads++;throw Error('private');}}),{extra:Object.defineProperty({},'subtrackSandbox',{get(){reads++;throw Error('private');}})},new Proxy({},{getOwnPropertyDescriptor(){throw Error('private');}}),new Proxy({},{has(){throw Error('private');}})]){expect(sandboxConfigurationSelected(config)).toBe(true);expect(readSandboxMarker(config)).toBeUndefined();}
 expect(reads).toBe(0);expect(readSandboxMarker({extra:{subtrackSandbox:activeMarker}})).toBe(activeMarker);expect(sandboxConfigurationSelected({extra:{subtrackSandbox:activeMarker}})).toBe(true);
});
