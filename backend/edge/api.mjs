import {games,cleanQuestions} from './individual-games.mjs';
const enc=new TextEncoder();
export class Problem extends Error{constructor(message,status=400){super(message);this.status=status}}
export const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function sha(s){return hex(await crypto.subtle.digest('SHA-256',enc.encode(s)))}
const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const text=(s,max=1500)=>String(s??'').trim().slice(0,max);
const normalizeName=s=>text(s,150).normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ');
const integer=(x,min=1,max=Number.MAX_SAFE_INTEGER)=>{let n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Problem('Invalid number.');return n};
const required=(s,max=200)=>{s=text(s,max);if(!s)throw new Problem('Please complete the required fields.');return s};
const PARTY_SLOTS=new Set(['couple','eden','julia-butler','danielle','julia-holdren','sophia','rebecca','jack','jake','liam','jamie','tyler','will']);
const PARTY_FILES=new Set(['','homepage.webp','wedding-party-eden.webp','wedding-party-julia-butler.webp','wedding-party-danielle.webp','wedding-party-julia-holdren.webp','wedding-party-sophia.webp','wedding-party-rebecca.webp','wedding-party-jack.webp','wedding-party-jake.webp','wedding-party-jamie.webp','wedding-party-tyler.webp','wedding-party-will.webp']);
const partySlot=s=>{s=String(s||'');if(!PARTY_SLOTS.has(s))throw new Problem('Choose a wedding-party person.');return s};
const partyCrop=b=>{const x=Number(b.x),y=Number(b.y),zoom=Number(b.zoom);if(!Number.isFinite(x)||x<0||x>100||!Number.isFinite(y)||y<0||y>100||!Number.isFinite(zoom)||zoom<1||zoom>2.4)throw new Problem('Use valid photo crop controls.');return{x:Math.round(x),y:Math.round(y),zoom:Math.round(zoom*100)/100}};
const wire=h=>h?{...h,guests:JSON.stringify(h.guests),details:JSON.stringify(h.details)}:null;
export function cleanSeating(b,current){
 if(!b||!Number.isSafeInteger(b.revision)||b.revision!==current.revision)throw new Problem('The seating plan changed in another window. Reload the saved plan before saving again.',409);
 if(!Array.isArray(b.tables)||b.tables.length<1||b.tables.length>40)throw new Problem('Use 1–40 tables.');
 let guests=current.guests;
 if(b.guests!==undefined){if(!Array.isArray(b.guests)||b.guests.length>1000)throw new Problem('Use at most 1,000 guests.');const seen=new Set();guests=b.guests.map(g=>{if(!g||typeof g.id!=='string'||!/^G[0-9A-Za-z_-]{1,60}$/.test(g.id)||seen.has(g.id))throw new Problem('Each guest needs a unique valid ID.');seen.add(g.id);return{id:g.id,name:required(g.name,150),notes:text(g.notes),family:text(g.family,150),household:text(g.household,150)}})}
 const guestIds=new Set(guests.map(g=>g.id)),used=new Set(),ids=new Set();
 const tables=b.tables.map(t=>{if(!t||typeof t.id!=='string'||!/^T[0-9A-Za-z_-]{1,40}$/.test(t.id)||ids.has(t.id))throw new Problem('Each table needs a unique ID.');ids.add(t.id);if(!Array.isArray(t.seats)||t.seats.length!==8)throw new Problem('Each table must have exactly eight seat positions.');const seats=t.seats.map(id=>{if(id===null)return null;if(typeof id!=='string'||!guestIds.has(id)||used.has(id))throw new Problem('Every guest may be seated only once, using the current guest list.');used.add(id);return id});if(!Number.isFinite(t.x)||!Number.isFinite(t.y)||t.x<145||t.x>1655||t.y<220||t.y>1250)throw new Problem('Keep tables within the planning canvas.');return{id:t.id,label:required(t.label,60),x:Math.round(t.x),y:Math.round(t.y),seats}});
 return{...current,revision:current.revision+1,updatedAt:new Date().toISOString(),tables,guests};
}
export function imageBytes(data){
 let bytes;try{bytes=Uint8Array.from(atob(data||''),c=>c.charCodeAt(0))}catch{throw new Problem('Invalid image upload.')}
 if(bytes.length>3145728)throw new Problem('Choose a photo smaller than 3 MB.',413);
 let mime;if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';else if(bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')mime='image/png';else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')mime='image/webp';else throw new Problem('Use a JPEG, PNG or WebP image.');return{bytes,mime};
}
async function photoPage(db,cursor){
 const q={select:'id,caption,created',order:'created.desc,id.desc',limit:51};
 if(cursor){let c;try{c=JSON.parse(atob(cursor))}catch{throw new Problem('Invalid photo page.')}
  if(!Array.isArray(c)||!/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+]00:00)$/.test(c[0])||!Number.isFinite(Date.parse(c[0]))||!/^[a-f0-9]{64}$/.test(c[1]))throw new Problem('Invalid photo page.');
  q.or=`(created.lt.${c[0]},and(created.eq.${c[0]},id.lt.${c[1]}))`;
 }
 const rows=await db.list('w_photos',q),photos=rows.slice(0,50),last=photos.at(-1);
 return{photos:photos.map(({id,caption})=>({id,caption})),next:rows.length>50&&last?btoa(JSON.stringify([last.created,last.id])):null};
}
export const POLL_QUESTIONS=[
 'Who is most likely to turn a quick shopping trip into a three-hour adventure?',
 'Who is most likely to plan the next vacation before the current one is over?',
 'Who is most likely to cry first during the wedding ceremony?',
 'Who is most likely to overpack for a weekend trip?',
 'Who is most likely to be the first person on the dance floor?',
 'Who is most likely to suggest getting sushi for dinner?',
 'Who is most likely to fall asleep during a movie?',
 'Who is most likely to bring home another pet?',
 'Who is most likely to buy something random on Amazon at two in the morning?',
 'Who is most likely to binge-watch an entire TV show in one day?'
];
const POLL_PREFIX='couple-poll:v1:';
export function cleanPoll(answers){if(!Array.isArray(answers)||answers.length!==POLL_QUESTIONS.length||answers.some(v=>!['josh','mara'].includes(v)))throw new Problem('Choose Josh or Mara for all ten questions.');return [...answers]}
async function couplePoll(db,h){
 const own=await db.setting(POLL_PREFIX+h.id,null),done=Array.isArray(own?.answers)&&own.answers.length===10;
 const base={questions:POLL_QUESTIONS,done,answers:done?own.answers:null,isTest:!!h.details?.is_test};
 if(!done)return base;
 const houses=await db.list('w_households',{select:'id,details',limit:1000});
 const eligible=new Set(houses.filter(x=>!x.details?.is_test).map(x=>POLL_PREFIX+x.id));
 const ballots=(await db.list('w_settings',{key:'like.'+POLL_PREFIX+'*',select:'key,value',limit:1000})).filter(x=>eligible.has(x.key)&&Array.isArray(x.value?.answers)&&x.value.answers.length===10&&x.value.answers.every(a=>['josh','mara'].includes(a)));
 return{...base,ballots:ballots.length,results:POLL_QUESTIONS.map((_,i)=>{const josh=ballots.filter(b=>b.value.answers[i]==='josh').length,total=ballots.length,joshPercent=total?Math.round(josh/total*100):0;return{josh,mara:total-josh,total,joshPercent,maraPercent:total?100-joshPercent:0}})};
}
export function cleanTrivia(questions,publish=false){
 if(questions?.some(q=>q.acceptedAnswers!==undefined))return cleanQuestions(questions,publish,Problem);
 if(!Array.isArray(questions)||questions.length<1||questions.length>10)throw new Problem('Use 1–10 trivia questions.');
 const cleaned=questions.map(q=>{if(!q||!Array.isArray(q.options)||q.options.length>4)throw new Problem('Use four answer options per question.');return {question:text(q.question,250),options:q.options.map(o=>text(o,200)),correct:Number.isInteger(q.correct)&&q.correct>=0&&q.correct<=3?q.correct:null,enabled:q.enabled!==false}});
 if(publish){const enabled=cleaned.filter(q=>q.enabled);if(enabled.length<3)throw new Problem('Include at least three questions.');if(enabled.some(q=>!q.question||q.options.length!==4||q.options.some(x=>!x)||new Set(q.options.map(x=>x.toLowerCase())).size!==4||q.correct===null))throw new Problem('Fill each included question, four distinct answers, and the correct answer before publishing.');return enabled}
 return cleaned;
}
export function cleanGift(b){const status=b.status||'purchased';if(!['reported','purchased','received','returned'].includes(status))throw new Problem('Invalid gift status.');return{item:required(b.item,300),buyer:required(b.buyer),store:required(b.store,100),quantity:integer(b.quantity||1,1,1000),status,thank_you:[true,1,'1','yes','true'].includes(b.thank_you),notes:text(b.notes)}}
export function csvRows(source){let rows=[],row=[],cell='',quoted=false;source=String(source).replace(/^\uFEFF/,'');for(let i=0;i<source.length;i++){let c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw new Problem('CSV contains an unclosed quote.');if(cell||row.length){row.push(cell);if(row.some(x=>x.trim()))rows.push(row)}let headers=rows.shift()?.map(x=>x.trim());if(!headers||!['item','buyer','store'].every(k=>headers.includes(k)))throw new Problem('CSV headers must include item,buyer,store.');if(!rows.length||rows.length>1000)throw new Problem('Import 1–1,000 rows.');return rows.map(r=>cleanGift(Object.fromEntries(headers.map((h,i)=>[h,r[i]||'']))))}
function reply(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}})}
const cookie=(v,age=3600)=>`__Host-wedding=${v}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
function cookieValue(req){return req.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-wedding='))?.split('=')[1]||''}
function secure(response){const r=new Response(response.body,response);r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('Referrer-Policy','strict-origin-when-cross-origin');r.headers.set('X-Frame-Options','DENY');r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');r.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');r.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return r}
export class Store{
 constructor(env,fetcher=fetch){this.env=env;this.fetcher=fetcher}
 async call(path,{method='GET',body,prefer='return=representation'}={}){const r=await this.fetcher(this.env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+this.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body)});let v=await r.json().catch(()=>null);if(!r.ok){if(r.status===409||v?.code==='23505')throw new Problem('This entry already exists or was already submitted.');if(v?.code==='P0001')throw new Problem(text(v.message));throw new Problem('The database request could not be completed. Please try again.',503)}return v}
 async list(table,q={}){return await this.call(table+'?'+new URLSearchParams({select:'*',...q}))||[]}
 async one(table,q){return(await this.list(table,{...q,limit:1}))[0]||null}
 insert(table,body){return this.call(table,{method:'POST',body})}
 update(table,q,body){return this.call(table+'?'+new URLSearchParams(q),{method:'PATCH',body})}
 remove(table,q){return this.call(table+'?'+new URLSearchParams(q),{method:'DELETE'})}
 upsert(table,body){return this.call(table,{method:'POST',body,prefer:'resolution=merge-duplicates,return=representation'})}
 rpc(name,body){return this.call('rpc/'+name,{method:'POST',body})}
 async setting(key,fallback){return(await this.one('w_settings',{key:'eq.'+key}))?.value??fallback}
 async session(req){let raw=cookieValue(req);if(!/^[a-f0-9]{64}$/.test(raw))return null;let s=await this.one('w_sessions',{token_hash:'eq.'+await sha(raw),expires:'gt.'+new Date().toISOString()});if(!s)return null;if(s.role==='owner'){let o=await this.one('w_owners',{username:'eq.'+s.username,select:'username,name'});if(!o)return null;s.owner_name=o.name}return s}
 async storage(path,options={}){return this.fetcher(this.env.SUPABASE_URL.replace(/\/$/,'')+'/storage/v1/object/wedding-guest-photos/'+path,{...options,headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+this.env.SUPABASE_SERVICE_ROLE_KEY,...options.headers}})}
}
async function requireOwner(s){if(s?.role!=='owner')throw new Problem('Owner login required.',403)}
async function household(db,s,attending=false){if(!s||s.role!=='guest')throw new Problem('Please verify your invitation.',403);const h=await db.one('w_households',{id:'eq.'+s.household});if(!h||(attending&&h.response!=='attending'))throw new Problem('Confirm attendance to view the guest guide.',403);return h}
async function limited(db,req,scope,max=20){const ip=req.headers.get('CF-Connecting-IP')||'local';if(!await db.rpc('wedding_rate_limit',{p_key:await sha(scope+':'+ip),p_max:max,p_window:300}))throw new Problem('Too many attempts. Try again in five minutes.',429)}
async function login(db,role,hid,username){let raw=token();await db.insert('w_sessions',{token_hash:await sha(raw),role,household:hid,username,expires:new Date(Date.now()+3600000).toISOString()});return reply({ok:true},200,{'Set-Cookie':cookie(raw)})}
export async function api(req,env,db=new Store(env)){
 const url=new URL(req.url),p=url.pathname;let b={};if(req.method==='POST'){if(req.headers.get('Origin')!==url.origin)throw new Problem('Invalid request origin.',403);if(Number(req.headers.get('Content-Length')||0)>4500000)throw new Problem('Upload is too large.',413);const raw=await req.text();if(raw.length>4500000)throw new Problem('Upload is too large.',413);try{b=JSON.parse(raw)}catch{throw new Problem('Invalid request.')}if(!b||Array.isArray(b)||typeof b!=='object')throw new Problem('Invalid request.')}
 if(!['GET','POST'].includes(req.method))throw new Problem('Method not allowed.',405);
 if(p==='/api/owner/status'&&req.method==='GET')return reply({configured:true});
 if(p==='/api/registry'&&req.method==='GET')return reply({links:await db.setting('registry',{})});
 if(p==='/api/party-photos'&&req.method==='GET'){const photos=await db.setting('party_photos',{});return reply({photos:Object.fromEntries(Object.entries(photos).filter(([slot])=>PARTY_SLOTS.has(slot)).map(([slot,v])=>[slot,{source:v.source==='uploaded'?'uploaded':'static',x:v.x??50,y:v.y??50,zoom:v.zoom??1,updatedAt:v.updatedAt||''}]))})}
 if(p.startsWith('/api/party-photo/')&&req.method==='GET'){const slot=partySlot(p.split('/').pop()),photo=(await db.setting('party_photos',{}))[slot];if(!photo||photo.source!=='uploaded'||!new RegExp('^r2/party/'+slot+'/[a-f0-9]{64}$').test(photo.path))throw new Problem('Photo not found.',404);if(req.headers.get('X-Wedding-Storage')!=='r2')throw new Problem('The photo connection is not ready.',503);return reply({mime:photo.mime},200,{'X-Wedding-R2-Key':photo.path})}
 if(p==='/api/admin/login')throw new Problem('Use the owner login.',403);
 if(p==='/api/verify'&&req.method==='POST'){await limited(db,req,'login');const entered=required(b.code,100).toUpperCase(),presented=normalizeName(b.name);let h=null;if(entered==='JM-TEST'){const tests=await db.list('w_households',{select:'*','details->>is_test':'eq.true',limit:10});h=tests.find(x=>[x.name,...x.guests].some(n=>normalizeName(n)===presented))||null}else h=await db.one('w_households',{code:'eq.'+await sha(entered)});const aliases=h?await db.setting('aliases:'+h.id,[]):[];const accepted=h?[h.name,...h.guests,...(Array.isArray(aliases)?aliases:[])]:[];if(!h||!presented||!accepted.some(n=>normalizeName(n)===presented))throw new Problem('We could not verify that invitation. Check your name and code.',401);return login(db,'guest',h.id,null)}
 if(p==='/api/owner/login'&&req.method==='POST'){await limited(db,req,'login');if(!await db.rpc('wedding_rate_limit',{p_key:await sha('owner-account:'+text(b.username,50).toLowerCase()),p_max:20,p_window:300}))throw new Problem('Too many attempts. Try again in five minutes.',429);const owners=await db.rpc('wedding_check_owner',{p_username:text(b.username,50).toLowerCase(),p_password:String(b.password||'')});if(!owners?.length)throw new Problem('Account or password could not be verified.',401);return login(db,'owner',null,owners[0].username)}
 const s=await db.session(req);
 if(p==='/api/logout'&&req.method==='POST'){if(s)await db.remove('w_sessions',{token_hash:'eq.'+s.token_hash});return reply({ok:true},200,{'Set-Cookie':cookie('',0)})}
 if(p==='/api/me'&&req.method==='GET'){if(s?.role==='owner')return reply({admin:true,owner_name:s.owner_name});return reply({guest:s?wire(await household(db,s)):null})}
 if(p==='/api/meals'&&req.method==='GET'){if(!s)throw new Problem('Please verify your invitation.',403);return reply({meals:await db.setting('meals',[])})}
 if(p.startsWith('/api/admin/')||p==='/api/admin'||p.startsWith('/api/owner/')){
  await requireOwner(s);
  if(req.method==='GET'){
   if(p==='/api/admin'){const houses=await db.list('w_households',{order:'id'});const names=new Map(houses.map(h=>[h.id,h.name]));return reply({households:houses.map(wire),activities:(await db.list('w_activities',{order:'id.desc',limit:1000})).map(a=>({...a,name:names.get(a.household)||''}))})}
   if(p==='/api/admin/trivia')return reply({draft:await db.setting('trivia_draft',null),active:!!await db.setting('trivia',null)});
   if(p==='/api/admin/seating')return reply({plan:await db.setting('seating_plan',null)});
   if(p==='/api/admin/aliases'){const houses=await db.list('w_households',{order:'id'});return reply({households:await Promise.all(houses.map(async h=>({id:h.id,name:h.name,guests:h.guests,aliases:await db.setting('aliases:'+h.id,[])})))})}
   if(p==='/api/admin/candidates')return reply({entries:(await db.list('w_candidates')).sort((a,b)=>+a.source_cell.slice(1)-+b.source_cell.slice(1)).map(x=>({...x,notes:JSON.stringify(x.notes)}))});
   if(p==='/api/admin/extras')return reply({settings:Object.fromEntries((await db.list('w_settings')).map(x=>[x.key,x.value])),guest_settings:await db.list('w_guest_settings')});
   if(p==='/api/owner/gifts')return reply({gifts:(await db.list('w_gifts',{order:'id.desc'})).map(g=>({...g,thank_you:Number(g.thank_you)})),owner:s.owner_name});
   if(p==='/api/owner/party-photos')return reply({photos:await db.setting('party_photos',{})});
  }else{
   await limited(db,req,'owner-write',200);
   if(p==='/api/admin/activate'){let cells=b.cells,names=b.names;if(!Array.isArray(cells)||!Array.isArray(names)||cells.length!==names.length||cells.length<1||cells.length>12||new Set(cells).size!==cells.length)throw new Problem('Select 1–12 guests.');let code=required(b.code,100).toUpperCase();if(code.length<4)throw new Problem('Use an invitation code of at least four characters.');await db.rpc('wedding_activate',{p_cells:cells.map(c=>required(c,20)),p_names:names.map(n=>required(n,150)),p_name:required(b.name,150),p_code:await sha(code)});return reply({ok:true})}
   if(p==='/api/admin/household'){let guests=b.guests;if(!Array.isArray(guests)||guests.length<1||guests.length>12)throw new Problem('Enter 1–12 guests.');let code=required(b.code,100).toUpperCase();if(code.length<4)throw new Problem('Use an invitation code of at least four characters.');await db.insert('w_households',{name:required(b.name,150),code:await sha(code),guests:guests.map(n=>required(n,150))});return reply({ok:true})}
   if(p==='/api/admin/seating'){const current=await db.setting('seating_plan',null);if(!current)throw new Problem('The seating plan has not been initialized.',503);const plan=cleanSeating(b,current);const saved=await db.update('w_settings',{key:'eq.seating_plan','value->>revision':'eq.'+current.revision},{value:plan});if(!saved?.length)throw new Problem('The seating plan changed in another window. Reload the saved plan before saving again.',409);return reply({ok:true,plan})}
   if(p==='/api/admin/aliases'){const id=integer(b.household);if(!await db.one('w_households',{id:'eq.'+id}))throw new Problem('Choose a household.');if(!Array.isArray(b.aliases)||b.aliases.length>30||b.aliases.some(n=>typeof n!=='string'||!n.trim()||n.trim().length>150))throw new Problem('Enter up to 30 alternate names, each under 151 characters.');const seen=new Set();const aliases=b.aliases.map(n=>n.trim().replace(/\s+/g,' ')).filter(n=>{const key=normalizeName(n);if(seen.has(key))return false;seen.add(key);return true});await db.upsert('w_settings',{key:'aliases:'+id,value:aliases});return reply({ok:true})}
   if(p==='/api/admin/personal'){const id=integer(b.household);if(!await db.one('w_households',{id:'eq.'+id}))throw new Problem('Choose a household.');await db.upsert('w_guest_settings',{household:id,seat:text(b.seat,500),events:text(b.events,2000)});return reply({ok:true})}
   if(p==='/api/admin/trivia'){if(!['save','publish'].includes(b.mode))throw new Problem('Choose save or publish.');const questions=cleanTrivia(b.questions,b.mode==='publish');await db.upsert('w_settings',{key:'trivia_draft',value:{questions:cleanTrivia(b.questions)}});if(b.mode==='publish'){const current=await db.setting('trivia',null);const same=current&&JSON.stringify(current.questions)===JSON.stringify(questions);await db.upsert('w_settings',{key:'trivia',value:{round:same?current.round:token(),questions}})}return reply({ok:true})}
   if(p==='/api/admin/settings'){let {key,value}=b;if(!['registry','travel','meals'].includes(key))throw new Problem('Invalid setting.');if(key==='registry'){if(!value||typeof value!=='object'||Array.isArray(value))throw new Problem('Invalid registry.');for(let[k,v]of Object.entries(value)){if(!['target','amazon','home'].includes(k))throw new Problem('Invalid registry store.');let u;try{u=new URL(v.url)}catch{throw new Problem('Use a complete HTTPS registry URL.')}if(u.protocol!=='https:'||u.username||u.password)throw new Problem('Use a complete HTTPS registry URL.');v.name=required(v.name,80);v.url=u.href}}if(key==='meals'&&(!Array.isArray(value)||value.length>20||value.some(x=>typeof x!=='string'||!x.trim()||x.length>200)))throw new Problem('Use a list of meal names.');if(key==='travel'&&(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['directions','parking','hotels','transport'].includes(k))||Object.values(value).some(x=>typeof x!=='string'||x.length>2000)))throw new Problem('Invalid travel details.');await db.upsert('w_settings',{key,value});return reply({ok:true})}
   if(p==='/api/owner/gift'){let g={...cleanGift(b),updated_by:s.username,updated_at:new Date().toISOString()};if(b.id){let r=await db.update('w_gifts',{id:'eq.'+integer(b.id)},g);if(!r?.length)throw new Problem('Gift not found.')}else await db.insert('w_gifts',g);return reply({ok:true})}
   if(p==='/api/owner/import'){let rows=csvRows(String(b.csv||'')).map(g=>({...g,updated_by:s.username}));await db.insert('w_gifts',rows);return reply({ok:true,count:rows.length})}
   if(p==='/api/owner/party-photo-crop'){const slot=partySlot(b.slot),crop=partyCrop(b),photos=await db.setting('party_photos',{}),current=photos[slot]||{};if(current.source!=='uploaded'){const file=String(b.file||'');if(!PARTY_FILES.has(file)||!file)throw new Problem('Choose a photo before saving.');photos[slot]={source:'static',file,...crop,updatedAt:new Date().toISOString()}}else photos[slot]={...current,...crop,updatedAt:new Date().toISOString()};await db.upsert('w_settings',{key:'party_photos',value:photos});return reply({ok:true,photo:photos[slot]})}
  }
  throw new Problem('Owner route not found.',404);
 }
 if(p==='/api/rsvp'&&req.method==='POST'){const h=await household(db,s);const incoming=b.answers;if(!Array.isArray(incoming)||incoming.length<1||incoming.length>h.guests.length)throw new Problem('Select at least one invited guest to respond for.');const seen=new Set();for(const a of incoming){if(!a||!h.guests.includes(a.name)||seen.has(a.name)||!['yes','no','maybe'].includes(a.attending))throw new Problem('Choose a valid response for each selected invited guest.');seen.add(a.name)}let choices=await db.setting('meals',[]);if(choices.length&&incoming.some(a=>a.attending==='yes'&&!choices.includes(a.meal)))throw new Problem('Choose a meal for each selected guest who is attending.');let email=b.email===undefined?text(h.details?.email,200):text(b.email,200);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Problem('Enter a valid contact email.');const old=Array.isArray(h.details?.answers)?h.details.answers:[],updates=new Map(incoming.map(a=>[a.name,a])),saved=h.guests.map(name=>{const next=updates.get(name);if(next)return{name,attending:next.attending,diet:text(next.diet,500),meal:next.attending==='yes'?text(next.meal,200):''};const prev=old.find(a=>a.name===name);return prev?{name,attending:prev.attending,diet:text(prev.diet,500),meal:prev.attending==='yes'?text(prev.meal,200):''}:null}).filter(Boolean);const allResponded=saved.length===h.guests.length,response=saved.some(a=>a.attending==='yes')?'attending':saved.some(a=>a.attending==='maybe')?'maybe':allResponded?'declined':'pending';await db.update('w_households',{id:'eq.'+h.id},{response,details:{...h.details,answers:saved,email,note:b.note===undefined?text(h.details?.note,1000):text(b.note,1000)}});return reply({ok:true,response,answered:saved.length,total:h.guests.length})}
 // Owner wedding-party uploads are coordinated through the Cloudflare R2 gateway.
 if(p.startsWith('/api/_party-photos/')){
  await requireOwner(s);if(req.headers.get('X-Wedding-Storage')!=='r2'||req.headers.get('X-Wedding-Uploads')!=='r2')throw new Problem('Photo gateway required.',403);const slot=partySlot(b.slot);
  if(p==='/api/_party-photos/authorize'){const id=token();return reply({id,path:'r2/party/'+slot+'/'+id})}
  if(p==='/api/_party-photos/complete'){const crop=partyCrop(b);if(!/^[a-f0-9]{64}$/.test(b.id)||b.path!=='r2/party/'+slot+'/'+b.id||!['image/jpeg','image/png','image/webp'].includes(b.mime))throw new Problem('Invalid photo upload.');const photos=await db.setting('party_photos',{}),oldPath=photos[slot]?.source==='uploaded'?photos[slot].path:'';photos[slot]={source:'uploaded',path:b.path,mime:b.mime,...crop,updatedAt:new Date().toISOString()};await db.upsert('w_settings',{key:'party_photos',value:photos});return reply({ok:true,oldPath})}
  throw new Problem('Photo route not found.',404);
 }
 const h=s?.role==='owner'?null:await household(db,s,true);
 if(['/api/games','/api/games/quiz','/api/games/poll'].includes(p)){if(!h)throw new Problem('Use a guest invitation to play.',403);return games(req,b,db,h,{Problem,sha,reply,limited,POLL_QUESTIONS})}
 if(p.startsWith('/api/photo/')&&req.method==='GET'){let id=p.split('/').pop();if(!/^[a-f0-9]{64}$/.test(id))throw new Problem('Photo not found.',404);let photo=await db.one('w_photos',{id:'eq.'+id});if(!photo)throw new Problem('Photo not found.',404);if(photo.path.startsWith('r2/')){if(req.headers.get('X-Wedding-Storage')!=='r2')throw new Problem('The photo album connection is not ready.',503);return reply({mime:photo.mime},200,{'X-Wedding-R2-Key':photo.path})}const r=await db.storage(photo.path);if(!r.ok)throw new Problem('Photo is unavailable.',404);return new Response(r.body,{headers:{'Content-Type':photo.mime,'Cache-Control':'private,no-store'}})}
 if(!h)throw new Problem('Verify an invitation to enter guest activities.',403);
 if(req.method==='GET'){
  if(p==='/api/photos')return reply(await photoPage(db,url.searchParams.get('cursor')));
  if(p==='/api/photo-options')return reply({storage:req.headers.get('X-Wedding-Uploads')==='r2'?'r2':'supabase',householdLimit:req.headers.get('X-Wedding-Uploads')==='r2'?null:30,maxBytes:3145728});
  if(p==='/api/portal'){const event=await db.setting('event',{});return reply({venue:event.venue||'Venue to be confirmed',date:event.date||'October 2027 · tentative',time:event.time||'Time to be announced',travel:'See your private travel details below. More information will be added as plans are confirmed.',schedule:['Arrival · time to be announced','Ceremony','Cocktail hour','Dinner & dancing'],activities:await db.list('w_activities',{household:'eq.'+h.id,order:'id.desc'})})}
  if(p==='/api/community'){const trivia=await db.setting('trivia',null);const activities=await db.list('w_activities',{order:'id.desc',limit:1000}),votes=await db.list('w_votes'),houses=await db.list('w_households',{select:'id,name,details'}),names=new Map(houses.map(x=>[x.id,x.name]));return reply({songs:activities.filter(a=>a.kind==='song').map(a=>({id:a.id,body:a.body,votes:votes.filter(v=>v.song===a.id).length})).sort((a,b)=>b.votes-a.votes),voted:votes.filter(v=>v.household===h.id).map(v=>v.song),leaderboard:(trivia?await db.list('w_quiz',{round:'eq.'+trivia.round,order:'score.desc',limit:1000}):[]).filter(q=>!houses.find(h=>h.id===q.household)?.details?.is_test).slice(0,20).map(q=>({name:names.get(q.household),score:q.score,total:q.total})),guestbook:activities.filter(a=>a.kind==='guestbook').map(a=>({name:names.get(a.household),body:a.body})),...await photoPage(db,null),hunt:(await db.one('w_hunt',{household:'eq.'+h.id}))?.items||[],personal:await db.one('w_guest_settings',{household:'eq.'+h.id})||{seat:'',events:''},travel:await db.setting('travel',{}),meals:await db.setting('meals',[]),trivia:trivia?{round:trivia.round,questions:trivia.questions.map(q=>({question:q.question,options:q.options||[]}))}:null,poll:await couplePoll(db,h),quizDone:trivia?!!await db.one('w_quiz',{household:'eq.'+h.id,round:'eq.'+trivia.round}):false})}
 }else{
  await limited(db,req,'guest-write',100);
  if(p==='/api/poll'){await db.upsert('w_settings',{key:POLL_PREFIX+h.id,value:{answers:cleanPoll(b.answers)}});return reply({ok:true,poll:await couplePoll(db,h)})}
  if(p==='/api/activity'){if(!['song','memory','advice','guestbook'].includes(b.kind))throw new Problem('Unknown activity.');await db.insert('w_activities',{household:h.id,kind:b.kind,body:required(b.body,1500)});return reply({ok:true})}
  if(p==='/api/vote'){await db.rpc('wedding_vote',{p_household:h.id,p_song:integer(b.song)});return reply({ok:true})}
  if(p==='/api/quiz'){const trivia=await db.setting('trivia',null);if(!trivia)throw new Problem('Personal trivia is not open yet.');if(b.round!==trivia.round)throw new Problem('A new trivia round is available. Refresh before playing.');const answers=b.answers;if(!Array.isArray(answers)||answers.length!==trivia.questions.length||answers.some(a=>!Number.isInteger(a)||a<0||a>3))throw new Problem('Answer every trivia question.');const score=trivia.questions.filter((q,i)=>q.correct===answers[i]).length;await db.insert('w_quiz',{household:h.id,round:trivia.round,total:trivia.questions.length,score});return reply({ok:true,score,total:trivia.questions.length})}
  if(p==='/api/hunt'){let items=b.items;if(!Array.isArray(items)||items.some(i=>!['dance','details','friends','toast','blue'].includes(i)))throw new Problem('Invalid checklist.');await db.upsert('w_hunt',{household:h.id,items:[...new Set(items)]});return reply({ok:true})}
  // These routes are server-to-server only. The gateway blocks public access,
  // validates image bytes, and sets the capability headers after authenticating.
  if(p.startsWith('/api/_photos/')){
   if(req.headers.get('X-Wedding-Storage')!=='r2'||req.headers.get('X-Wedding-Uploads')!=='r2')throw new Problem('Photo gateway required.',403);
   if(p==='/api/_photos/authorize'){const id=token();return reply({id,path:'r2/'+h.id+'/'+id})}
   if(p==='/api/_photos/complete'){
    if(!/^[a-f0-9]{64}$/.test(b.id)||b.path!=='r2/'+h.id+'/'+b.id||!['image/jpeg','image/png','image/webp'].includes(b.mime))throw new Problem('Invalid photo upload.');
    const existing=await db.one('w_photos',{id:'eq.'+b.id});if(existing){if(existing.household!==h.id||existing.path!==b.path)throw new Problem('Invalid photo upload.',403);return reply({ok:true})}
    await db.insert('w_photos',{id:b.id,household:h.id,path:b.path,mime:b.mime,caption:text(b.caption,200)});return reply({ok:true});
   }
   throw new Problem('Photo route not found.',404);
  }
  if(p==='/api/upload'){const {bytes,mime}=imageBytes(b.data);let id=token(),path=h.id+'/'+id;await db.rpc('wedding_photo_reserve',{p_id:id,p_household:h.id,p_path:path,p_mime:mime,p_caption:text(b.caption,200)});let uploaded=false;try{const r=await db.storage(path,{method:'POST',headers:{'Content-Type':mime},body:bytes});if(!r.ok)throw new Problem('The photo could not be uploaded.',503);uploaded=true}finally{if(!uploaded)await db.remove('w_photos',{id:'eq.'+id})}return reply({ok:true})}
 }
 throw new Problem('Route not found.',404);
}
export default{async fetch(req,env){try{if(env.APP_MODE!=='live')return secure(new Response('Josh & Mara · This wedding website is being prepared. Guest access is not open yet.',{status:503,headers:{'Content-Type':'text/plain;charset=UTF-8','Cache-Control':'no-store'}}));let url=new URL(req.url);if(url.pathname.startsWith('/api/')){if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Problem('The site database connection has not been configured.',503);return secure(await api(req,env))}if(req.method!=='GET'&&req.method!=='HEAD')throw new Problem('Method not allowed.',405);return secure(await env.ASSETS.fetch(req))}catch(e){return secure(reply({error:e instanceof Problem?e.message:'The request could not be completed. Please try again.'},e.status||500))}}};
