const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function timestamp(value:unknown):value is string{
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)&&!value.startsWith('0000-')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);
}
function uuid(value:unknown):value is string{return typeof value==='string'&&UUID.test(value);}
export function encodePrivateMobileCursor(createdAt:unknown,id:unknown):string{
 if(!timestamp(createdAt)||!uuid(id))throw new Error('mobile-cursor');
 return Buffer.from(JSON.stringify({v:1,endpoint:'private-owner-subscriptions',createdAt,id})).toString('base64url');
}
export function parsePrivateMobileCursor(raw?:string):Readonly<{createdAt:string;id:string}>|null{
 if(raw===undefined)return null;if(raw.length>512||!/^[A-Za-z0-9_-]+$/.test(raw))throw new Error('wire');
 const bytes=Buffer.from(raw,'base64url'); //512 canonical encoded characters bound decoded bytes to384.
 if(bytes.toString('base64url')!==raw)throw new Error('wire');
 let p:unknown;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('wire');}
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!=='createdAt,endpoint,id,v')throw new Error('wire');
 const row=p as Record<string,unknown>;if(row.v!==1||row.endpoint!=='private-owner-subscriptions'||!timestamp(row.createdAt)||!uuid(row.id))throw new Error('wire');
 if(encodePrivateMobileCursor(row.createdAt,row.id)!==raw)throw new Error('wire');return {createdAt:row.createdAt,id:row.id};
}
