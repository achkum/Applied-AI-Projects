import {getRandomBytesAsync} from 'expo-crypto';
import {getPrivateRuntime} from '@/config/privateRuntime';
import {readNativeProfile,readNativeMode} from './privateMobileApi';
import {bankRequestKey,readNativeBank,mutateNativeBank,type BankIntent} from './privateMobileBank';
jest.mock('@/config/privateRuntime',()=>({getPrivateRuntime:jest.fn()}));
jest.mock('expo-crypto',()=>({getRandomBytesAsync:jest.fn()}));
jest.mock('./privateMobileApi',()=>({readNativeProfile:jest.fn(),readNativeMode:jest.fn(),PrivateMobileRequestError:class extends Error{}}));
const id='123e4567-e89b-42d3-a456-426614174000';
const key=['123e4567','e89b','42d3','a456','426614174001'].join('-');
const token='synthetic.token';
const active={connectionId:id,provider:'SYNTHETIC',institutionId:'synthetic-demo-v1',status:'ACTIVE',disposition:'retained',accountCount:1,transactionCount:7,lastSyncAt:null};
const connect:BankIntent={operation:'connect',institutionId:'synthetic-demo-v1'},sync:BankIntent={operation:'sync',connectionId:id},disconnect:BankIntent={operation:'disconnect',connectionId:id,purge:true};
function response(status:number,value:unknown,cache:string|null='no-store',content:string|null=status===409?'application/problem+json':'application/json'):Response{
 return {status,headers:{get:(name:string)=>name==='cache-control'?cache:content},text:async()=>JSON.stringify(value)} as Response;
}
let fetcher:jest.SpyInstance;
beforeEach(()=>{
 jest.resetAllMocks();jest.mocked(getPrivateRuntime).mockReturnValue({apiBaseUrl:'https://private.example.test'});
 jest.mocked(getRandomBytesAsync).mockResolvedValue(new Uint8Array(16).fill(7));
 jest.mocked(readNativeProfile).mockResolvedValue({profileComplete:true,displayName:null,avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK'});
 jest.mocked(readNativeMode).mockResolvedValue({mode:'just-me'});fetcher=jest.spyOn(globalThis,'fetch').mockResolvedValue(response(200,{connections:[active]}));
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
it('uses fixed private Bearer transport and no mutation key on current read',async()=>{
 expect(await readNativeBank(token,new AbortController().signal)).toEqual({kind:'ready',connections:[active]});
 const [url,options]=fetcher.mock.calls[0]!;expect(url).toMatch(/\/banks\/synthetic\/read$/);expect(options).toMatchObject({method:'POST',credentials:'omit',redirect:'error',cache:'no-store',body:'{}',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}});expect(Object.keys(options.headers)).toHaveLength(2);
});
it.each([connect,sync,disconnect])('uses one frozen UUID per explicit $operation and validates matching receipt',async intent=>{
 const connection=intent.operation==='disconnect'?{...active,status:'REVOKED',disposition:'purged',accountCount:0,transactionCount:0}:active;
 fetcher.mockResolvedValue(response(200,{operation:intent.operation,connection}));const signal=new AbortController().signal;
 expect(await mutateNativeBank(intent,key,token,signal)).toEqual({operation:intent.operation,connection});
 await mutateNativeBank(intent,key,token,signal);expect(fetcher.mock.calls.map(call=>call[1].headers['Idempotency-Key'])).toEqual([key,key]);
 expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(intent.operation==='connect'?{institutionId:'synthetic-demo-v1'}:intent.operation==='sync'?{connectionId:id}:{connectionId:id,purge:true});
});
it('creates valid v4 entropy keys and rejects wrong entropy shape and length',async()=>{
 expect(await bankRequestKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 jest.mocked(getRandomBytesAsync).mockResolvedValue([] as unknown as Uint8Array);await expect(bankRequestKey()).rejects.toThrow();
 jest.mocked(getRandomBytesAsync).mockResolvedValue(new Uint8Array(15));await expect(bankRequestKey()).rejects.toThrow();
});
it.each([false,true])('requires both saved profile and Just-me mode (%s)',async complete=>{
 jest.mocked(readNativeProfile).mockResolvedValue({...await readNativeProfile(token,new AbortController().signal),profileComplete:complete});jest.mocked(readNativeMode).mockResolvedValue({mode:complete?null:'just-me'});
 expect(await readNativeBank(token,new AbortController().signal)).toEqual({kind:'setup-required'});expect(fetcher).not.toHaveBeenCalled();
});
it('rejects pre-aborted authority and abort between profile/mode and bank request',async()=>{
 const controller=new AbortController();controller.abort();await expect(readNativeBank(token,controller.signal)).rejects.toThrow();expect(readNativeProfile).not.toHaveBeenCalled();
 const later=new AbortController();jest.mocked(readNativeMode).mockImplementation(async()=>{later.abort();return {mode:'just-me'};});await expect(readNativeBank(token,later.signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('returns known conflict without inventing snapshot and mode conflict blocks read',async()=>{
 fetcher.mockResolvedValue(response(409,{type:'about:blank',title:'Conflict',status:409,code:'MODE_CONFLICT'}));expect(await readNativeBank(token,new AbortController().signal)).toEqual({kind:'setup-required'});
 for(const code of ['MODE_CONFLICT','BANK_STATE_CONFLICT','BANK_IDEMPOTENCY_CONFLICT']){
  fetcher.mockResolvedValue(response(409,{type:'about:blank',title:'Conflict',status:409,code}));expect(await mutateNativeBank(sync,key,token,new AbortController().signal)).toEqual({conflict:code});
 }
 fetcher.mockResolvedValue(response(409,{type:'about:blank',title:'Conflict',status:409,code:'BANK_STATE_CONFLICT'}));await expect(readNativeBank(token,new AbortController().signal)).rejects.toThrow();
});
it.each([null,[],{},{type:'wrong',title:'Conflict',status:409,code:'BANK_STATE_CONFLICT'},{type:'about:blank',title:'wrong',status:409,code:'BANK_STATE_CONFLICT'},{type:'about:blank',title:'Conflict',status:400,code:'BANK_STATE_CONFLICT'},{type:'about:blank',title:'Conflict',status:409,code:'UNKNOWN'},{type:'about:blank',title:'Conflict',status:409,code:'BANK_STATE_CONFLICT',owner:'forged'}])('rejects malformed conflict %j',async value=>{
 fetcher.mockResolvedValue(response(409,value));await expect(mutateNativeBank(sync,key,token,new AbortController().signal)).rejects.toThrow();
});
it.each([[200,'public','application/json'],[401,'no-store','application/json'],[409,'no-store','application/json'],[200,'no-store',null],[200,'no-store','text/html']] as const)('rejects untrusted response %s %s %s',async(status,cache,content)=>{
 fetcher.mockResolvedValue(response(status,{connections:[active]},cache,content));await expect(readNativeBank(token,new AbortController().signal)).rejects.toThrow();
});
it('rejects missing runtime, bad token, pre-aborted mutation and invalid key/body',async()=>{
 jest.mocked(getPrivateRuntime).mockReturnValue(null);await expect(readNativeBank(token,new AbortController().signal)).rejects.toThrow();jest.mocked(getPrivateRuntime).mockReturnValue({apiBaseUrl:'https://private.example.test'});
 await expect(readNativeBank('bad token',new AbortController().signal)).rejects.toThrow();const aborted=new AbortController();aborted.abort();await expect(mutateNativeBank(sync,key,token,aborted.signal)).rejects.toThrow();
 await expect(mutateNativeBank(sync,'invalid',token,new AbortController().signal)).rejects.toThrow();await expect(mutateNativeBank({...sync,connectionId:'bad'} as BankIntent,key,token,new AbortController().signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('fails closed on malformed, oversized and wrong-receipt readback',async()=>{
 for(const raw of ['{',' '.repeat(131073)]){fetcher.mockResolvedValue({...response(200,{}),text:async()=>raw});await expect(readNativeBank(token,new AbortController().signal)).rejects.toThrow();}
 fetcher.mockResolvedValue(response(409,{type:'about:blank',title:'Conflict',status:409,code:'BANK_STATE_CONFLICT'}));fetcher.mockResolvedValueOnce({...response(409,{}),text:async()=> ' '.repeat(4097)});await expect(mutateNativeBank(sync,key,token,new AbortController().signal)).rejects.toThrow();
 fetcher.mockResolvedValue(response(200,{operation:'connect',connection:active}));await expect(mutateNativeBank(sync,key,token,new AbortController().signal)).rejects.toThrow();
 fetcher.mockResolvedValue(response(200,{operation:'sync',connection:{...active,connectionId:'223e4567-e89b-42d3-a456-426614174000'}}));await expect(mutateNativeBank(sync,key,token,new AbortController().signal)).rejects.toThrow();
 fetcher.mockResolvedValue(response(200,{operation:'disconnect',connection:{...active,status:'REVOKED'}}));await expect(mutateNativeBank(disconnect,key,token,new AbortController().signal)).rejects.toThrow();
});
it('aborts live transport and hides late body, with no mutation retry',async()=>{
 const controller=new AbortController();fetcher.mockImplementation(async()=>{controller.abort();return response(200,{connections:[active]});});await expect(readNativeBank(token,controller.signal)).rejects.toThrow();expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
 const later=new AbortController();fetcher.mockResolvedValue({...response(200,{}),text:async()=>{later.abort();return JSON.stringify({connections:[active]});}});await expect(readNativeBank(token,later.signal)).rejects.toThrow();
 fetcher.mockRejectedValue(new Error('lost receipt'));await expect(mutateNativeBank(connect,key,token,new AbortController().signal)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(3);
});
it('enforces bounded deadline before response and body completion',async()=>{
 jest.useFakeTimers();fetcher.mockImplementation(async()=>{jest.advanceTimersByTime(15000);return response(200,{connections:[active]});});await expect(readNativeBank(token,new AbortController().signal)).rejects.toThrow();
 fetcher.mockResolvedValue({...response(200,{}),text:async()=>{jest.advanceTimersByTime(15000);return '{}';}});await expect(readNativeBank(token,new AbortController().signal)).rejects.toThrow();
});
