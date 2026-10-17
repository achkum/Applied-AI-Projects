import {getRandomBytesAsync} from 'expo-crypto';
import {getPrivateRuntime} from '@/config/privateRuntime';
import {readNativeProfile,readNativeMode,readNativeSubscriptions} from './privateMobileApi';
import {detectionRequestKey,readNativeDetections,mutateNativeDetection,readDetectionOwnerRows,type DetectionIntent} from './privateMobileDetection';
jest.mock('@/config/privateRuntime',()=>({getPrivateRuntime:jest.fn()}));
jest.mock('expo-crypto',()=>({getRandomBytesAsync:jest.fn()}));
jest.mock('./privateMobileApi',()=>({readNativeProfile:jest.fn(),readNativeMode:jest.fn(),readNativeSubscriptions:jest.fn(),PrivateMobileRequestError:class extends Error{}}));
const id='123e4567-e89b-42d3-a456-426614174000';
const key=['123e4567','e89b','42d3','a456','426614174001'].join('-');
const token='synthetic.token';
const candidate={id,revision:'1',displayName:'Netflix',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'9007199254740993',currency:'SEK',confidence:0.9,reasons:['CADENCE_MATCHED'],status:'DETECTED'};
const reviewed={candidateId:id,status:'ACTIVE',revision:'2',receiptId:key,undoUntil:'2026-10-14T00:00:00.000Z'};
const confirm:DetectionIntent={operation:'confirm',candidateId:id,expectedRevision:'1'};
function response(status:number,value:unknown,cache:string|null='no-store',content:string|null=status===409?'application/problem+json':'application/json'):Response{
 return {status,headers:{get:(name:string)=>name==='cache-control'?cache:content},text:async()=>JSON.stringify(value)} as Response;
}
let fetcher:jest.SpyInstance;
beforeEach(()=>{
 jest.resetAllMocks();jest.mocked(getPrivateRuntime).mockReturnValue({apiBaseUrl:'https://private.example.test'});
 jest.mocked(getRandomBytesAsync).mockResolvedValue(new Uint8Array(16).fill(7));
 jest.mocked(readNativeProfile).mockResolvedValue({profileComplete:true,displayName:null,avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK'});
 jest.mocked(readNativeMode).mockResolvedValue({mode:'just-me'});fetcher=jest.spyOn(globalThis,'fetch').mockResolvedValue(response(200,{items:[candidate],nextCursor:null}));
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});

it('uses exact private read transport and no mutation key with bigint string response',async()=>{
 expect(await readNativeDetections(token,new AbortController().signal)).toEqual({kind:'ready',items:[candidate],nextCursor:null});expect(fetcher.mock.calls[0]![0]).toMatch(/detections\/read$/);expect(fetcher.mock.calls[0]![1]).toMatchObject({credentials:'omit',redirect:'error',cache:'no-store',body:'{}',headers:{Authorization:'Bearer '+token}});expect(Object.keys(fetcher.mock.calls[0]![1].headers)).toHaveLength(2);
});
it('sends only frozen bodies for scan/review/undo and validates target result',async()=>{
 for(const intent of [{operation:'scan'},confirm,{operation:'reject',candidateId:id,expectedRevision:'1'},{operation:'undo',receiptId:key,candidateId:id}] as DetectionIntent[]){fetcher.mockResolvedValue(response(200,intent.operation==='scan'?{scan:'complete'}:{...reviewed,status:intent.operation==='confirm'?'ACTIVE':intent.operation==='reject'?'REJECTED':'DETECTED',undoUntil:intent.operation==='undo'?null:reviewed.undoUntil}));await mutateNativeDetection(intent,key,token,new AbortController().signal);const body=JSON.parse(fetcher.mock.calls[fetcher.mock.calls.length-1]![1].body);expect(body).toEqual(intent.operation==='scan'?{}:intent.operation==='undo'?{receiptId:key}:{candidateId:id,expectedRevision:'1'});expect(fetcher.mock.calls[fetcher.mock.calls.length-1]![1].headers['Idempotency-Key']).toBe(key);}
 fetcher.mockResolvedValue(response(200,{...reviewed,candidateId:key}));await expect(mutateNativeDetection(confirm,key,token,new AbortController().signal)).rejects.toThrow();fetcher.mockResolvedValue(response(200,{...reviewed,status:'REJECTED'}));await expect(mutateNativeDetection(confirm,key,token,new AbortController().signal)).rejects.toThrow();
});
it('generates entropy keys and fails invalid entropy/runtime/body/token/abort before request',async()=>{
 expect(await detectionRequestKey()).toMatch(/^[0-9a-f]{32}$/);for(const value of [[],new Uint8Array(15)]){jest.mocked(getRandomBytesAsync).mockResolvedValue(value as Uint8Array);await expect(detectionRequestKey()).rejects.toThrow();}
 const aborted=new AbortController();aborted.abort();await expect(readNativeDetections(token,aborted.signal)).rejects.toThrow();await expect(mutateNativeDetection(confirm,key,token,aborted.signal)).rejects.toThrow();await expect(mutateNativeDetection(confirm,'bad',token,new AbortController().signal)).rejects.toThrow();await expect(mutateNativeDetection({...confirm,candidateId:'bad'},key,token,new AbortController().signal)).rejects.toThrow();await expect(readNativeDetections('bad token',new AbortController().signal)).rejects.toThrow();jest.mocked(getPrivateRuntime).mockReturnValue(null);await expect(readNativeDetections(token,new AbortController().signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('requires saved profile and Just me and fences abort after authority reads',async()=>{
 jest.mocked(readNativeMode).mockResolvedValueOnce({mode:null});expect(await readNativeDetections(token,new AbortController().signal)).toEqual({kind:'setup-required'});jest.mocked(readNativeProfile).mockResolvedValueOnce({...await readNativeProfile(token,new AbortController().signal),profileComplete:false});expect(await readNativeDetections(token,new AbortController().signal)).toEqual({kind:'setup-required'});const late=new AbortController();jest.mocked(readNativeMode).mockImplementationOnce(async()=>{late.abort();return {mode:'just-me'};});await expect(readNativeDetections(token,late.signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('accepts only exact closed conflict wire and handles read mode separately',async()=>{
 for(const code of ['MODE_CONFLICT','DETECTION_STATE_CONFLICT','DETECTION_IDEMPOTENCY_CONFLICT','UNDO_EXPIRED']){fetcher.mockResolvedValue(response(409,{type:'about:blank',title:'Conflict',status:409,code}));expect(await mutateNativeDetection(confirm,key,token,new AbortController().signal)).toEqual({conflict:code});}
 fetcher.mockResolvedValue(response(409,{type:'about:blank',title:'Conflict',status:409,code:'MODE_CONFLICT'}));expect(await readNativeDetections(token,new AbortController().signal)).toEqual({kind:'setup-required'});
 for(const value of [null,[],{}, {type:'about:blank',title:'Conflict',status:409,code:'UNKNOWN'}, {type:'about:blank',title:'Conflict',status:409,code:'UNDO_EXPIRED',raw:'forged'}]){fetcher.mockResolvedValue(response(409,value));await expect(mutateNativeDetection(confirm,key,token,new AbortController().signal)).rejects.toThrow();}fetcher.mockResolvedValue(response(409,{type:'about:blank',title:'Conflict',status:409,code:'UNDO_EXPIRED'}));await expect(readNativeDetections(token,new AbortController().signal)).rejects.toThrow();
});
it.each([[401,'no-store','application/json'],[404,'no-store','application/problem+json'],[500,'no-store','application/problem+json'],[200,'public','application/json'],[200,'no-store','text/html'],[409,'no-store','application/json']] as const)('fails untrusted status/header %s',async(status,cache,content)=>{fetcher.mockResolvedValue(response(status,{},cache,content));await expect(readNativeDetections(token,new AbortController().signal)).rejects.toThrow();});
it('rejects malformed/oversized bodies and ignored late abort rather than accepting result',async()=>{
 for(const raw of ['{',' '.repeat(131073)]){fetcher.mockResolvedValue({...response(200,{}),text:async()=>raw});await expect(readNativeDetections(token,new AbortController().signal)).rejects.toThrow();}const late=new AbortController();fetcher.mockImplementationOnce(async()=>{late.abort();return response(200,reviewed);});await expect(mutateNativeDetection(confirm,key,token,late.signal)).rejects.toThrow();
});
it('owner read terminates and rejects duplicate/cyclic/aborted pagination',async()=>{
 jest.mocked(readNativeSubscriptions).mockResolvedValueOnce({items:[],nextCursor:'cursorA'}).mockResolvedValueOnce({items:[],nextCursor:null});expect(await readDetectionOwnerRows(token,new AbortController().signal)).toEqual([]);jest.mocked(readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:'cursorA'});await expect(readDetectionOwnerRows(token,new AbortController().signal)).rejects.toThrow();const aborted=new AbortController();aborted.abort();await expect(readDetectionOwnerRows(token,aborted.signal)).rejects.toThrow();
});
it('reads exact cursor body and rejects duplicate or late-aborted owner projections',async()=>{
 await readNativeDetections(token,new AbortController().signal,'cursorA');expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({cursor:'cursorA'});const row={id} as Awaited<ReturnType<typeof readNativeSubscriptions>>['items'][number];jest.mocked(readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null});await expect(readDetectionOwnerRows(token,new AbortController().signal)).rejects.toThrow();const late=new AbortController();jest.mocked(readNativeSubscriptions).mockImplementationOnce(async()=>{late.abort();return {items:[row],nextCursor:null};});await expect(readDetectionOwnerRows(token,late.signal)).rejects.toThrow();
});
it('timeout and abort during body decoding fail closed without retry',async()=>{
 jest.useFakeTimers();let resolve!:(value:Response)=>void;fetcher.mockReturnValueOnce(new Promise<Response>(done=>{resolve=done;}));const pending=mutateNativeDetection(confirm,key,token,new AbortController().signal);jest.advanceTimersByTime(15000);resolve(response(200,reviewed));await expect(pending).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);const late=new AbortController();fetcher.mockResolvedValueOnce({...response(200,reviewed),text:async()=>{late.abort();return JSON.stringify(reviewed);}});await expect(mutateNativeDetection(confirm,key,token,late.signal)).rejects.toThrow();
});
