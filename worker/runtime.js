
function secured(r){const h=new Headers(r.headers);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('X-Frame-Options','DENY');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');h.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(r.body,{status:r.status,headers:h})}
export default{async fetch(req,env){try{
 const url=new URL(req.url);
 if(url.pathname.startsWith('/api/')){
  if(!['GET','POST'].includes(req.method))return secured(new Response('Method not allowed',{status:405}));
  if(req.method==='POST'&&req.headers.get('Origin')!==url.origin)return secured(new Response(JSON.stringify({error:'Invalid request origin.'}),{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
  if(!env.WEDDING_GATEWAY_SECRET)return secured(new Response(JSON.stringify({error:'The site connection is not yet ready.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
  const headers=new Headers({'X-Wedding-Gateway':env.WEDDING_GATEWAY_SECRET,'X-Wedding-Path':url.pathname});
  for(const k of ['Cookie','Content-Type','Origin','CF-Connecting-IP']){const v=req.headers.get(k);if(v)headers.set(k,v)}
  const response=await fetch('https://eucviawdbrnplxoxhvxw.supabase.co/functions/v1/wedding-api',{method:req.method,headers,body:req.method==='POST'?req.body:undefined,redirect:'manual'});
  const result=new Response(response.body,response);result.headers.set('Cache-Control','no-store');return secured(result);
 }
 if(!['GET','HEAD'].includes(req.method))return secured(new Response('Method not allowed',{status:405}));
 let path=url.pathname==='/'?'/index.html':url.pathname;
 // Support clean document URLs as well as the existing explicit .html links.
 if(!ASSETS[path]&&!path.split('/').pop().includes('.'))path+='.html';
 const asset=ASSETS[path];if(!asset)return secured(new Response('Page not found',{status:404}));
 const body=req.method==='HEAD'?null:asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
 return secured(new Response(body,{headers:{'Content-Type':asset.type,'Cache-Control':asset.binary?'public,max-age=3600':'no-cache'}}));
 }catch{return secured(new Response(JSON.stringify({error:'The site could not complete that request. Please try again.'}),{status:502,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}))}}};
