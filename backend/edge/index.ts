import { api, Store, sha, Problem } from './api.mjs';
Deno.serve(async(req:Request)=>{
 try{
  const gateway=req.headers.get('X-Wedding-Gateway')||'';
  if(!/^[a-f0-9]{64}$/.test(gateway))return new Response('Forbidden',{status:403});
  const env={SUPABASE_URL:Deno.env.get('SUPABASE_URL')||'',SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''};
  const db=new Store(env);const expected=await db.setting('gateway_secret_hash','');
  if(!expected||await sha(gateway)!==expected)return new Response('Forbidden',{status:403});
  const primary=await db.setting('site_origin','');
  const allowed=await db.setting('site_origins',[primary]);
  const sentOrigin=req.headers.get('Origin');
  if(sentOrigin&&(!Array.isArray(allowed)||!allowed.includes(sentOrigin)))return new Response('Forbidden',{status:403});
  const origin=sentOrigin||primary;const path=req.headers.get('X-Wedding-Path')||'';const pathname=path.split('?')[0];
  if(!origin||!/^\/api\/[a-z0-9/_-]+$/.test(pathname)||path.length>2000||/[\r\n#]/.test(path))return new Response('Forbidden',{status:403});
  const headers=new Headers();for(const k of ['Cookie','Content-Type','Content-Length','Origin','CF-Connecting-IP','X-Wedding-Storage','X-Wedding-Uploads']){let value=req.headers.get(k);if(value)headers.set(k,value)}
  const incoming=new Request(origin+path,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req.body,duplex:'half'} as RequestInit);
  return await api(incoming,env,db);
 }catch(e){return new Response(JSON.stringify({error:e instanceof Problem?e.message:'The request could not be completed. Please try again.'}),{status:e instanceof Problem?e.status:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
});
