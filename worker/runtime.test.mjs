import {test} from 'node:test';
import assert from 'node:assert/strict';
import gateway from './runtime.js';
const origin='https://wedding.example';
const req=(path,body,extra={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
const id='a'.repeat(64),path='r2/3/'+id;
const env={WEDDING_GATEWAY_SECRET:'test-gateway-secret',PHOTO_STORAGE:'r2'};
function bucket(){const objects=new Map();return{objects,async put(k,bytes,options){objects.set(k,{bytes,options})},async get(k){const v=objects.get(k);return v?{body:v.bytes}:null},async delete(k){objects.delete(k)}}}
const json=(b,status=200,headers={})=>new Response(JSON.stringify(b),{status,headers:{'Content-Type':'application/json',...headers}});
async function mocked(t,fn){const original=globalThis.fetch;globalThis.fetch=fn;t.after(()=>globalThis.fetch=original)}
test('R2 uploads validate bytes, authenticate before writing, and complete metadata after object storage',async t=>{
 const b=bucket(),calls=[];await mocked(t,async(u,init)=>{calls.push({path:init.headers.get('X-Wedding-Path'),body:JSON.parse(init.body)});assert.equal(init.headers.get('X-Wedding-Storage'),'r2');assert.equal(init.headers.get('Origin'),origin);if(calls.length===1)return json({id,path});assert.ok(b.objects.has(path));assert.equal(calls[1].body.mime,'image/jpeg');return json({ok:true})});
 const r=await gateway.fetch(req('/api/upload',{data:btoa('\xff\xd8\xfftest'),caption:'A dance'}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,200);assert.equal(calls.length,2);assert.equal(b.objects.get(path).options.httpMetadata.contentType,'image/jpeg');
});
test('anonymous or declined guests cannot put R2 objects; internal paths and spoofed capability headers are blocked',async t=>{
 const b=bucket();let calls=0;await mocked(t,async()=>{calls++;return json({error:'Confirm attendance'},403)});
 let r=await gateway.fetch(req('/api/upload',{data:btoa('\xff\xd8\xff')}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,403);assert.equal(b.objects.size,0);
 r=await gateway.fetch(req('/api/_photos/complete',{id,path},{'X-Wedding-Storage':'r2'}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,403);assert.equal(calls,1);
});
test('invalid images and excessive bodies never reach R2; missing binding fails without a Supabase fallback',async t=>{
 const b=bucket();await mocked(t,async()=>json({id,path}));
 let r=await gateway.fetch(req('/api/upload',{data:btoa('<script>not a photo</script>')}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,400);assert.equal(b.objects.size,0);
 r=await gateway.fetch(req('/api/upload',{data:btoa('\xff\xd8\xff')},{'Content-Length':'4500001'}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,413);
 r=await gateway.fetch(req('/api/upload',{data:btoa('\xff\xd8\xff')}),env);assert.equal(r.status,503);
});
test('failed R2 writes never publish gallery metadata; rejected metadata cleans up the object',async t=>{
 let calls=0;await mocked(t,async()=>++calls===1?json({id,path}):json({error:'Rejected'},403));
 let r=await gateway.fetch(req('/api/upload',{data:btoa('\xff\xd8\xff')}),{...env,WEDDING_PHOTOS:{async put(){throw Error('Unavailable')}}});assert.equal(r.status,502);assert.equal(calls,1);
 calls=0;const b=bucket();r=await gateway.fetch(req('/api/upload',{data:btoa('\xff\xd8\xff')}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,403);assert.equal(b.objects.size,0);
});
test('transient metadata completion retries, retaining files when the commit outcome is uncertain',async t=>{
 const b=bucket();let calls=0;await mocked(t,async()=>++calls===1?json({id,path}):json({error:'Unavailable'},503));const r=await gateway.fetch(req('/api/upload',{data:btoa('\xff\xd8\xff')}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,503);assert.equal(calls,3);assert.equal(b.objects.size,1);
});
test('R2 photo reads authorize through backend on every request and never reveal the storage key',async t=>{
 const b=bucket();await b.put(path,new Uint8Array([255,216,255]),{});let allowed=true;
 await mocked(t,async()=>allowed?json({mime:'image/jpeg'},200,{'X-Wedding-R2-Key':path}):json({error:'Forbidden'},403));
 let r=await gateway.fetch(req('/api/photo/'+id),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private,no-store');assert.equal(r.headers.get('X-Wedding-R2-Key'),null);assert.equal((await r.arrayBuffer()).byteLength,3);
 allowed=false;r=await gateway.fetch(req('/api/photo/'+id),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,403);
});
test('legacy photos pass through and pagination cursors reach the backend; browser headers cannot enable R2',async t=>{
 await mocked(t,async(u,init)=>{assert.equal(init.headers.get('X-Wedding-Path'),'/api/photos?cursor=abc%3D');assert.equal(init.headers.get('X-Wedding-Storage'),null);assert.equal(init.headers.get('X-Wedding-Uploads'),null);return json({photos:[],next:null})});
 const r=await gateway.fetch(req('/api/photos?cursor=abc%3D',undefined,{'X-Wedding-Storage':'r2','X-Wedding-Uploads':'r2'}),{WEDDING_GATEWAY_SECRET:'test'});assert.equal(r.status,200);
});
test('owner wedding-party uploads save crop metadata, replace old objects, and serve the public portrait',async t=>{
 const b=bucket(),partyId='b'.repeat(64),partyPath='r2/party/jack/'+partyId,oldPath='r2/party/jack/'+'c'.repeat(64),calls=[];
 await b.put(oldPath,new Uint8Array([255,216,255]),{});
 await mocked(t,async(u,init)=>{const p=init.headers.get('X-Wedding-Path');calls.push(p);if(p==='/api/_party-photos/authorize')return json({id:partyId,path:partyPath});if(p==='/api/_party-photos/complete'){const body=JSON.parse(init.body);assert.deepEqual({slot:body.slot,x:body.x,y:body.y,zoom:body.zoom},{slot:'jack',x:42,y:64,zoom:1.3});return json({ok:true,oldPath})}if(p==='/api/party-photo/jack')return json({mime:'image/jpeg'},200,{'X-Wedding-R2-Key':partyPath});throw Error('Unexpected '+p)});
 let r=await gateway.fetch(req('/api/owner/party-photo',{slot:'jack',data:btoa('\xff\xd8\xffportrait'),x:42,y:64,zoom:1.3}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,200);assert.ok(b.objects.has(partyPath));assert.equal(b.objects.has(oldPath),false);
 r=await gateway.fetch(req('/api/party-photo/jack'),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'public,max-age=300');assert.equal(r.headers.get('X-Wedding-R2-Key'),null);
 r=await gateway.fetch(req('/api/_party-photos/complete',{slot:'jack'}),{...env,WEDDING_PHOTOS:b});assert.equal(r.status,403);
});
