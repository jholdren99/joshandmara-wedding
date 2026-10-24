function secured(r){const h=new Headers(r.headers);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('X-Frame-Options','DENY');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');h.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(r.body,{status:r.status,headers:h})}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
class PhotoProblem extends Error{constructor(message,status=400){super(message);this.status=status}}
async function uploadBody(req){
 if(Number(req.headers.get('Content-Length')||0)>4500000)throw new PhotoProblem('Upload is too large.',413);
 const reader=req.body?.getReader();if(!reader)throw new PhotoProblem('Choose a photo.');
 let size=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4500000){await reader.cancel();throw new PhotoProblem('Upload is too large.',413)}chunks.push(value)}}finally{reader.releaseLock()}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
 let b;try{b=JSON.parse(new TextDecoder().decode(all))}catch{throw new PhotoProblem('Invalid image upload.')}
 if(!b||Array.isArray(b)||typeof b!=='object'||typeof b.data!=='string')throw new PhotoProblem('Invalid image upload.');
 let bytes;try{bytes=Uint8Array.from(atob(b.data),c=>c.charCodeAt(0))}catch{throw new PhotoProblem('Invalid image upload.')}
 if(bytes.length>3145728)throw new PhotoProblem('Choose a photo smaller than 3 MB.',413);
 let mime;if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';else if(bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')mime='image/png';else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')mime='image/webp';else throw new PhotoProblem('Use a JPEG, PNG or WebP image.');
 return{bytes,mime,caption:String(b.caption??'').trim().slice(0,200)};
}
export default{async fetch(req,env){try{
 const url=new URL(req.url);
 if(url.pathname.startsWith('/api/')){
  if(!['GET','POST'].includes(req.method))return secured(json({error:'Method not allowed.'},405));
  if(req.method==='POST'&&req.headers.get('Origin')!==url.origin)return secured(json({error:'Invalid request origin.'},403));
  // No browser may call internal storage coordination routes or supply capabilities.
  if(url.pathname.startsWith('/api/_photos/'))return secured(json({error:'Photo gateway required.'},403));
  if(!env.WEDDING_GATEWAY_SECRET)return secured(json({error:'The site connection is not yet ready.'},503));
  const headers=new Headers({'X-Wedding-Gateway':env.WEDDING_GATEWAY_SECRET,'X-Wedding-Path':url.pathname+url.search});
  for(const k of ['Cookie','Content-Type','CF-Connecting-IP']){const v=req.headers.get(k);if(v)headers.set(k,v)}
  // Always pass the actual site origin, including for same-origin GET requests.
  headers.set('Origin',url.origin);
  if(env.WEDDING_PHOTOS)headers.set('X-Wedding-Storage','r2');
  if(env.PHOTO_STORAGE==='r2'&&env.WEDDING_PHOTOS)headers.set('X-Wedding-Uploads','r2');
  const upstream=(path,body)=>{const h=new Headers(headers);if(path)h.set('X-Wedding-Path',path);if(body!==undefined)h.set('Content-Type','application/json');return fetch('https://eucviawdbrnplxoxhvxw.supabase.co/functions/v1/wedding-api',{method:body===undefined?req.method:'POST',headers:h,body:body===undefined?(req.method==='POST'?req.body:undefined):JSON.stringify(body),redirect:'manual',duplex:'half'})};
  if(url.pathname==='/api/upload'&&req.method==='POST'&&env.PHOTO_STORAGE==='r2'){
   if(!env.WEDDING_PHOTOS)return secured(json({error:'The photo album is being connected. Please try again later.'},503));
   const auth=await upstream('/api/_photos/authorize',{});if(!auth.ok)return secured(auth);
   const {id,path}=await auth.json();if(!/^[a-f0-9]{64}$/.test(id)||!new RegExp('^r2/[0-9]+/'+id+'$').test(path))throw new PhotoProblem('The photo album connection is not ready.',503);
   const {bytes,mime,caption}=await uploadBody(req);
   await env.WEDDING_PHOTOS.put(path,bytes,{httpMetadata:{contentType:mime},customMetadata:{photoId:id}});
   // Completion is idempotent. Retry a transient failure without uploading again.
   let completed;for(let attempt=0;attempt<2;attempt++){try{completed=await upstream('/api/_photos/complete',{id,path,mime,caption});if(completed.status<500)break;if(attempt===0)await completed.body?.cancel()}catch{completed=null}}
   if(!completed||completed.status>=500){return secured(json({error:'We could not confirm that photo was saved. Refresh the album before trying again.'},503))}
   if(!completed.ok){await env.WEDDING_PHOTOS.delete(path);return secured(completed)}
   return secured(completed);
  }
  const response=await upstream();
  const key=response.headers.get('X-Wedding-R2-Key');
  if(key&&response.ok&&req.method==='GET'&&/^\/api\/photo\/[a-f0-9]{64}$/.test(url.pathname)){
   if(!env.WEDDING_PHOTOS||!/^r2\/[0-9]+\/[a-f0-9]{64}$/.test(key))return secured(json({error:'The photo album connection is not ready.'},503));
   const {mime}=await response.json();if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new PhotoProblem('Photo is unavailable.',404);
   const object=await env.WEDDING_PHOTOS.get(key);if(!object)return secured(json({error:'Photo is unavailable.'},404));
   return secured(new Response(object.body,{headers:{'Content-Type':mime,'Cache-Control':'private,no-store'}}));
  }
  const result=new Response(response.body,response);result.headers.delete('X-Wedding-R2-Key');result.headers.set('Cache-Control','no-store');return secured(result);
 }
 if(!['GET','HEAD'].includes(req.method))return secured(new Response('Method not allowed',{status:405}));
 let path=url.pathname==='/'?'/index.html':url.pathname;
 if(!ASSETS[path]&&!path.split('/').pop().includes('.'))path+='.html';
 const asset=ASSETS[path];if(!asset)return secured(new Response('Page not found',{status:404}));
 const body=req.method==='HEAD'?null:asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
 return secured(new Response(body,{headers:{'Content-Type':asset.type,'Cache-Control':asset.binary?'public,max-age=3600':'no-cache'}}));
 }catch(e){return secured(json({error:e instanceof PhotoProblem?e.message:'The site could not complete that request. Please try again.'},e instanceof PhotoProblem?e.status:502))}}};
