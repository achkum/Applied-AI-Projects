import {createSandboxHouseholdApi,householdRequestId} from './sandboxHouseholdApi';
jest.mock('expo-crypto',()=>({getRandomBytesAsync:jest.fn()}));
jest.mock('./sandboxMobileApi',()=>({sandboxMobileApi:{householdBusiness:jest.fn()}}));
const id='123e4567-e89b-42d3-a456-426614174000';
it('uses the authenticated sandbox transport and strict decoders without permitting principal fields',async()=>{
 const transport=jest.fn().mockImplementation(async(_operation,_body,_token,_signal,decode)=>decode({household:null}));
 const api=createSandboxHouseholdApi(transport),signal=new AbortController().signal;
 await expect(api.read('access',signal)).resolves.toEqual({household:null});
 await api.mutate({operation:'dependant-add',requestId:id,displayName:'Example child'},'access',signal);
 expect(transport.mock.calls[1]?.slice(0,4)).toEqual(['dependant-add',{requestId:id,displayName:'Example child'},'access',signal]);
 expect(()=>api.mutate({operation:'household-create',name:' leading'},'access',signal)).toThrow();
});
it('creates version4 request intent UUIDs with fresh entropy and never mutates source bytes',async()=>{
 const bytes=new Uint8Array(16).fill(255),entropy=jest.fn().mockResolvedValue(bytes);expect(await householdRequestId(entropy)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');expect(bytes[6]).toBe(255);expect(bytes[8]).toBe(255);expect(entropy).toHaveBeenCalledWith(16);
 await expect(householdRequestId(async()=>new Uint8Array(15))).rejects.toThrow();
});
