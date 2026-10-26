import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{api,Problem,sha,csvRows,cleanGift} from './worker.mjs';
const request=(path,body,origin='https://wedding.example')=>new Request('https://wedding.example/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json',Origin:origin},body:body===undefined?undefined:JSON.stringify(body)});
class Memory{
 constructor(){this.tables={w_households:[{id:1,name:'Test Household',code:'',guests:['Guest One','Guest Two'],response:'pending',details:{}}],w_sessions:[],w_settings:[],w_gifts:[],w_quiz:[],w_votes:[],w_activities:[],w_hunt:[],w_photos:[],w_guest_settings:[],w_candidates:[],w_owners:[{username:'fixture-owner',name:'Josh & Mara'}]};this.current=null;this.seq=0;this.limit=true}
 async list(t,q={}){return (this.tables[t]||[]).filter(x=>Object.entries(q).every(([k,v])=>!String(v).startsWith('eq.')||String(x[k])===String(v).slice(3)))}
 async one(t,q){return(await this.list(t,q))[0]||null}
 async insert(t,b){let rows=Array.isArray(b)?b:[b];if(t==='w_settings'&&rows.some(r=>this.tables[t].some(x=>x.key===r.key)))throw new Problem('Already submitted.');if(t==='w_quiz'&&rows.some(r=>this.tables[t].some(x=>x.household===r.household&&x.round===r.round)))throw new Problem('Already submitted.');for(const r of rows)this.tables[t].push({...r,id:r.id||++this.seq});return rows}
 async update(t,q,b){let rows=await this.list(t,q);rows.forEach(r=>Object.assign(r,b));return rows}
 async remove(t,q){const rows=await this.list(t,q);this.tables[t]=this.tables[t].filter(x=>!rows.includes(x));if(t==='w_sessions')this.current=null}
 async upsert(t,b){const key=t==='w_settings'?'key':'household';const row=this.tables[t].find(x=>x[key]===b[key]);if(row)Object.assign(row,b);else this.tables[t].push(b)}
 async session(){return this.current}
 async setting(k,f){return this.tables.w_settings.find(x=>x.key===k)?.value??f}
 async rpc(name,b){if(name==='wedding_rate_limit')return this.limit;if(name==='wedding_check_owner')return b.p_username==='fixture-owner'&&b.p_password==='fixture-password'?[{username:'fixture-owner',name:'Josh & Mara'}]:[];if(name==='wedding_vote'){if(!this.tables.w_votes.some(x=>x.song===b.p_song&&x.household===b.p_household))this.tables.w_votes.push({song:b.p_song,household:b.p_household});return}throw Error('Unexpected RPC '+name)}
}
async function fail(path,body,db,status=403){await assert.rejects(()=>api(request(path,body),{},db),e=>e.status===status)}
test('review lock blocks publication and API access',async()=>{let r=await worker.fetch(request('owner/status'),{APP_MODE:'review'});assert.equal(r.status,503);assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/)});
test('unconfigured live API fails safely',async()=>{let r=await worker.fetch(request('me'),{APP_MODE:'live'});assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store')});
test('private endpoints reject anonymous visitors',async()=>{const db=new Memory();for(let p of ['admin','admin/candidates','owner/gifts','portal','community','photo/'+'a'.repeat(64)])await fail(p,undefined,db)});
test('cross-origin posts are rejected before database access',async()=>{await assert.rejects(()=>api(request('owner/login',{username:'fixture-owner',password:'fixture-password'},'https://evil.example'),{},new Memory()),e=>e.status===403)});
test('owner login issues a secure opaque cookie and stores only token hash',async()=>{const db=new Memory();let r=await api(request('owner/login',{username:'fixture-owner',password:'fixture-password'}),{},db);assert.equal(r.status,200);let c=r.headers.get('Set-Cookie');assert.match(c,/HttpOnly; Secure; SameSite=Strict/);const raw=c.split(';')[0].split('=')[1];assert.notEqual(raw,db.tables.w_sessions[0].token_hash);assert.equal(await sha(raw),db.tables.w_sessions[0].token_hash);assert.equal(db.tables.w_sessions[0].role,'owner');await fail('owner/login',{username:'fixture-owner',password:'wrong'},db,401);db.limit=false;await fail('owner/login',{username:'fixture-owner',password:'fixture-password'},db,429)});
test('guest must know the correct name and code',async()=>{const db=new Memory();db.tables.w_households[0].code=await sha('TESTCODE');await fail('verify',{name:'Wrong name',code:'TESTCODE'},db,401);let r=await api(request('verify',{name:'test household',code:'testcode'}),{},db);assert.equal(r.status,200);assert.equal(db.tables.w_sessions[0].household,1)});
test('RSVP checks guest names, meal choices, and portal access after decline',async()=>{const db=new Memory();db.current={role:'guest',household:1};await fail('portal',undefined,db);await fail('rsvp',{answers:[{name:'Intruder',attending:'yes'}]},db,400);let answers=[{name:'Guest One',attending:'yes',meal:'Vegetarian'},{name:'Guest Two',attending:'no'}];await api(request('rsvp',{answers,email:'guest@example.com'}),{},db);assert.equal(db.tables.w_households[0].response,'attending');let r=await api(request('portal'),{},db);assert.equal(r.status,200);db.tables.w_settings.push({key:'meals',value:['Chicken']});await fail('rsvp',{answers},db,400);answers[0].attending='no';await api(request('rsvp',{answers}),{},db);await fail('portal',undefined,db)});
test('a household member can RSVP for selected people and later responses merge without overwriting others',async()=>{const db=new Memory();db.current={role:'guest',household:1};db.tables.w_households[0].guests=['Aunt Angela','Liam','Sam'];let r=await api(request('rsvp',{answers:[{name:'Liam',attending:'yes',meal:'Chicken'}]}),{},db);let state=await r.json();assert.equal(state.response,'attending');assert.equal(state.answered,1);assert.deepEqual(db.tables.w_households[0].details.answers.map(a=>a.name),['Liam']);await api(request('rsvp',{answers:[{name:'Sam',attending:'no'}]}),{},db);assert.deepEqual(db.tables.w_households[0].details.answers.map(a=>a.name),['Liam','Sam']);assert.equal(db.tables.w_households[0].details.answers.find(a=>a.name==='Liam').attending,'yes');await fail('rsvp',{answers:[]},db,400);await fail('rsvp',{answers:[{name:'Liam',attending:'yes'},{name:'Liam',attending:'no'}]},db,400);await fail('rsvp',{answers:[{name:'Intruder',attending:'yes'}]},db,400)});
test('guest cannot read owner data or write gifts',async()=>{const db=new Memory();db.current={role:'guest',household:1};await fail('owner/gifts',undefined,db);await fail('owner/gift',{item:'Denied'},db);await fail('admin/activate',{cells:['A2']},db)});
test('gift records validate and are shared only with owners',async()=>{const db=new Memory();db.current={role:'owner',username:'fixture-owner',owner_name:'Josh & Mara'};await api(request('owner/gift',{item:'Dinner set',buyer:'Test giver',store:'Target',quantity:1,status:'received'}),{},db);let r=await api(request('owner/gifts'),{},db);assert.equal((await r.json()).gifts[0].buyer,'Test giver');assert.equal(db.tables.w_gifts[0].updated_by,'fixture-owner');await fail('owner/gift',{item:'No buyer'},db,400)});
test('CSV parser handles quoted commas, multiline notes and all-or-nothing validation',()=>{let r=csvRows('item,buyer,store,notes\r\n"Bowls, set",Test,Target,"line 1\nline 2"\r\n');assert.equal(r[0].item,'Bowls, set');assert.equal(r[0].notes,'line 1\nline 2');assert.throws(()=>csvRows('item,buyer,store,quantity\nBowl,Test,Target,0'));assert.throws(()=>csvRows('bad,headers\na,b'));assert.throws(()=>cleanGift({item:'X',buyer:'Y',store:'Z',status:'invented'}))});
test('registry URLs cannot be executable or credential-bearing',async()=>{const db=new Memory();db.current={role:'owner',username:'fixture-owner'};await fail('admin/settings',{key:'registry',value:{amazon:{name:'Amazon',url:'javascript:alert(1)'}}},db,400);await fail('admin/settings',{key:'registry',value:{amazon:{name:'Amazon',url:'https://user:pass@example.com'}}},db,400);await api(request('admin/settings',{key:'registry',value:{amazon:{name:'Amazon',url:'https://example.com/registry'}}}),{},db);assert.equal((await db.setting('registry')).amazon.name,'Amazon')});
test('trivia uses private owner answers, separates rounds, rejects missing and stale answers and prevents replay',async()=>{const db=new Memory();db.current={role:'guest',household:1};db.tables.w_households[0].response='attending';const questions=Array.from({length:3},(_,i)=>({question:'Question '+i,options:['A','B','C','D'],correct:i,enabled:true}));await db.upsert('w_settings',{key:'trivia',value:{round:'round1',questions}});let r=await api(request('quiz',{round:'round1',answers:[0,1,2]}),{},db);assert.equal((await r.json()).score,3);await fail('quiz',{round:'round1',answers:[0,1,2]},db,400);await fail('quiz',{round:'old',answers:[0,1,2]},db,400);await fail('quiz',{round:'round1',answers:[0]},db,400);const community=await(await api(request('community'),{},db)).json();assert.equal(community.trivia.questions[0].correct,undefined);await db.upsert('w_settings',{key:'trivia',value:{round:'round2',questions}});r=await api(request('quiz',{round:'round2',answers:[0,0,0]}),{},db);assert.equal((await r.json()).score,1)});
test('logout deletes persistent session',async()=>{const db=new Memory();db.current={role:'owner',username:'fixture-owner',token_hash:'testhash'};db.tables.w_sessions.push({token_hash:'testhash'});let r=await api(request('logout',{}),{},db);assert.match(r.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal(db.current,null)});
test('saved nicknames and every listed household member work only with the correct code',async()=>{const db=new Memory();db.tables.w_households[0].code=await sha('TESTCODE');db.current={role:'owner',username:'fixture-owner'};await api(request('admin/aliases',{household:1,aliases:['Nickname One','  NICKNAME   ONE  ','Other Nickname']}),{},db);assert.deepEqual(await db.setting('aliases:1'),['Nickname One','Other Nickname']);let data=await(await api(request('admin/aliases'),{},db)).json();assert.equal(data.households[0].aliases.length,2);db.current=null;for(const name of ['Test Household','Guest Two','  nickname   ONE ','Other Nickname'])assert.equal((await api(request('verify',{name,code:'testcode'}),{},db)).status,200);await fail('verify',{name:'Nickname One',code:'WRONGCODE'},db,401);await fail('verify',{name:'Nickname',code:'TESTCODE'},db,401);await fail('admin/aliases',undefined,db);await fail('admin/aliases',{household:1,aliases:['Intruder']},db);db.current={role:'guest',household:1};await fail('admin/aliases',{household:1,aliases:['Intruder']},db);db.current={role:'owner',username:'fixture-owner'};await fail('admin/aliases',{household:999,aliases:['Nobody']},db,400);await fail('admin/aliases',{household:1,aliases:['']},db,400);await api(request('admin/aliases',{household:1,aliases:[]}),{},db);db.current=null;await fail('verify',{name:'Nickname One',code:'TESTCODE'},db,401)});
test('Maybe is saved distinctly, test metadata survives updates, and only Yes unlocks the guide',async()=>{const db=new Memory();db.current={role:'guest',household:1};db.tables.w_households[0].details={is_test:true};const answer=attending=>({answers:db.tables.w_households[0].guests.map(name=>({name,attending}))});let r=await api(request('rsvp',answer('maybe')),{},db);assert.equal((await r.json()).response,'maybe');assert.equal(db.tables.w_households[0].response,'maybe');assert.equal(db.tables.w_households[0].details.is_test,true);await fail('portal',undefined,db);r=await api(request('rsvp',answer('no')),{},db);assert.equal((await r.json()).response,'declined');await fail('portal',undefined,db);r=await api(request('rsvp',answer('yes')),{},db);assert.equal((await r.json()).response,'attending');assert.equal((await api(request('portal'),{},db)).status,200);assert.equal(db.tables.w_households[0].details.is_test,true);await fail('rsvp',answer('surprise'),db,400)});

test('only owners can configure trivia and incomplete answer keys cannot be published',async()=>{const db=new Memory();db.current={role:'guest',household:1};await fail('admin/trivia',{mode:'publish',questions:[]},db,403);db.current={role:'owner'};await fail('admin/trivia',{mode:'publish',questions:[{question:'First date?',options:[],correct:null}]},db,400);const questions=Array.from({length:3},(_,i)=>({question:'Question '+i,options:['A','B','C','D'],correct:i}));assert.equal((await api(request('admin/trivia',{mode:'publish',questions}),{},db)).status,200);const saved=await db.setting('trivia');assert.equal(saved.questions.length,3);assert.equal(saved.questions[1].correct,1)});

test('R2 metadata requires trusted gateway and attending guest, validates paths, and completes idempotently',async()=>{
 const db=new Memory(),id='a'.repeat(64),path='r2/1/'+id;
 const call=(route,body)=>{const r=request(route,body);r.headers.set('X-Wedding-Storage','r2');r.headers.set('X-Wedding-Uploads','r2');return api(r,{},db)};
 await assert.rejects(()=>call('_photos/authorize',{}),e=>e.status===403);
 db.current={role:'guest',household:1};await assert.rejects(()=>call('_photos/authorize',{}),e=>e.status===403);db.tables.w_households[0].response='attending';
 await fail('_photos/authorize',{},db,403);let r=await call('_photos/authorize',{});assert.match((await r.json()).path,/^r2\/1\/[a-f0-9]{64}$/);
 await assert.rejects(()=>call('_photos/complete',{id,path:'r2/2/'+id,mime:'image/jpeg'}),e=>e.status===400);
 for(let i=0;i<2;i++)assert.equal((await call('_photos/complete',{id,path,mime:'image/jpeg',caption:'Dance'})).status,200);
 assert.equal(db.tables.w_photos.length,1);r=await call('photo/'+id);assert.equal(r.headers.get('X-Wedding-R2-Key'),path);
 db.tables.w_households[0].response='declined';await assert.rejects(()=>call('photo/'+id),e=>e.status===403);
});
test('wedding-party photos are owner-managed, publicly cropped, and stored only through the trusted R2 gateway',async()=>{
 const db=new Memory(),id='b'.repeat(64),path='r2/party/jack/'+id;
 let publicState=await(await api(request('party-photos'),{},db)).json();assert.deepEqual(publicState.photos,{});await fail('owner/party-photos',undefined,db);
 db.current={role:'owner',username:'fixture-owner'};await api(request('owner/party-photo-crop',{slot:'jack',file:'wedding-party-jack.webp',x:62,y:41,zoom:1.2}),{},db);
 publicState=await(await api(request('party-photos'),{},db)).json();assert.deepEqual(publicState.photos.jack,{source:'static',x:62,y:41,zoom:1.2,updatedAt:db.tables.w_settings[0].value.jack.updatedAt});
 const call=(route,body)=>{const r=request(route,body);r.headers.set('X-Wedding-Storage','r2');r.headers.set('X-Wedding-Uploads','r2');return api(r,{},db)};
 let auth=await(await call('_party-photos/authorize',{slot:'jack'})).json();assert.match(auth.path,/^r2\/party\/jack\/[a-f0-9]{64}$/);
 await call('_party-photos/complete',{slot:'jack',id,path,mime:'image/jpeg',x:35,y:70,zoom:1.45});
 const image=await api(request('party-photo/jack'),{},db).catch(e=>e);assert.equal(image.status,503);
 const read=request('party-photo/jack');read.headers.set('X-Wedding-Storage','r2');const ready=await api(read,{},db);assert.equal(ready.headers.get('X-Wedding-R2-Key'),path);
 await fail('owner/party-photo-crop',{slot:'unknown',x:50,y:50,zoom:1},db,400);db.current={role:'guest',household:1};await fail('_party-photos/authorize',{slot:'jack'},db,403);
});
test('photo pages continue beyond 500 records and reject malformed cursors',async()=>{
 const db=new Memory();db.current={role:'guest',household:1};db.tables.w_households[0].response='attending';
 const photos=Array.from({length:551},(_,i)=>({id:(551-i).toString(16).padStart(64,'0'),caption:'Photo '+i,created:'2026-10-24T12:00:00+00:00'}));
 const original=db.list.bind(db);db.list=async(t,q={})=>{if(t!=='w_photos')return original(t,q);let rows=photos;if(q.or){const id=q.or.match(/id.lt.([a-f0-9]{64})/)[1];rows=rows.filter(x=>x.id<id)}return rows.slice(0,q.limit)};
 let next=null,loaded=[];do{const page=await(await api(request('photos'+(next?'?cursor='+encodeURIComponent(next):'')),{},db)).json();loaded.push(...page.photos);next=page.next}while(next);
 assert.equal(loaded.length,551);assert.equal(new Set(loaded.map(x=>x.id)).size,551);await fail('photos?cursor=bad',undefined,db,400);
});
test('non-attending RSVP answers discard stale meals and cannot unlock private activities',async()=>{
 const db=new Memory();db.current={role:'guest',household:1};await db.upsert('w_settings',{key:'meals',value:['Chicken','Steak']});
 await api(request('rsvp',{answers:db.tables.w_households[0].guests.map(name=>({name,attending:'no',meal:'Steak'}))}),{},db);assert.equal(db.tables.w_households[0].response,'declined');assert.ok(db.tables.w_households[0].details.answers.every(a=>a.meal===''));
 for(const route of ['portal','community','photos','photo-options'])await fail(route,undefined,db);
});

test('couple poll hides percentages until submission and validates every answer',async()=>{
 const db=new Memory();db.current={role:'guest',household:1};await fail('poll',{answers:Array(10).fill('josh')},db);db.tables.w_households[0].response='attending';
 let state=(await(await api(request('community'),{},db)).json()).poll;assert.equal(state.questions.length,10);assert.equal(state.done,false);assert.equal(state.results,undefined);
 for(const answers of [[],Array(9).fill('josh'),[...Array(9).fill('josh'),'both']])await fail('poll',{answers},db,400);
 await api(request('poll',{answers:Array(10).fill('josh')}),{},db);state=(await(await api(request('community'),{},db)).json()).poll;assert.equal(state.results[0].joshPercent,100);assert.equal(state.ballots,1);
 await api(request('poll',{answers:Array(10).fill('mara')}),{},db);state=(await(await api(request('community'),{},db)).json()).poll;assert.equal(state.ballots,1);assert.equal(state.results[0].maraPercent,100);assert.equal(db.tables.w_settings.filter(x=>x.key.startsWith('couple-poll:')).length,1);
});
test('poll results aggregate households, exclude test ballots, and expose no individual votes',async()=>{
 const db=new Memory();db.current={role:'guest',household:1};db.tables.w_households[0].response='attending';
 for(let id=2;id<=4;id++)db.tables.w_households.push({id,name:'House '+id,guests:['Guest'],response:'attending',details:id===4?{is_test:true}:{}});
 for(let id=1;id<=4;id++){db.current.household=id;await api(request('poll',{answers:Array(10).fill(id===1?'josh':'mara')}),{},db)}
 const state=(await(await api(request('community'),{},db)).json()).poll;assert.equal(state.ballots,3);assert.deepEqual(state.results[0],{josh:1,mara:2,total:3,joshPercent:33,maraPercent:67});assert.equal(state.isTest,true);assert.equal(JSON.stringify(state).includes('House 2'),false);
 db.current=null;await fail('poll',{answers:Array(10).fill('josh')},db);
});
test('short-answer grading accepts spelling and case but rejects wrong places and numbers',async()=>{
 const {matchesAnswer}=await import('./edge/individual-games.mjs');
 for(const [answer,expected,result] of [['CRUIS',['cruise'],true],['SUN & SKI!',['Sun and Ski'],true],['Lake Lure',['Lake Badin'],false],['May 2023',['May 2024'],false],['2 days',['2 days'],true],['Mara',['Josh'],false]])assert.equal(matchesAnswer(answer,expected),result);
});
test('individual scores and votes persist separately, reject impersonation, and isolate test totals',async()=>{
 const db=new Memory();db.current={role:'guest',household:1};db.tables.w_households[0].response='attending';db.tables.w_households[0].details.is_test=true;
 db.tables.w_households.push({id:2,name:'Real',guests:['Real Guest'],response:'attending',details:{}});
 db.tables.w_settings.push({key:'trivia',value:{round:'typed-round',questions:[{question:'Vacation?',acceptedAnswers:['cruise']}]}});
 const state=async()=>await(await api(request('games'),{},db)).json();const d=await state();const [a,b]=d.members;
 await fail('games/quiz',{member:'intruder',round:'typed-round',answers:['cruise']},db);
 await fail('games/quiz',{member:a.id,round:'stale',answers:['cruise']},db,409);
 await api(request('games/quiz',{member:a.id,round:'typed-round',answers:['CRUIS']}),{},db);
 await api(request('games/quiz',{member:b.id,round:'typed-round',answers:['beach']}),{},db);
 assert.deepEqual((await state()).leaderboard.map(x=>x.score),[1,0]);
 await assert.rejects(()=>api(request('games/quiz',{member:a.id,round:'typed-round',answers:['cruise']}),{},db));
 for(const [member,vote] of [[a.id,'josh'],[b.id,'mara']])await api(request('games/poll',{member,answers:Array(10).fill(vote)}),{},db);
 assert.equal((await state()).pollResults[0].joshPercent,50);
 await api(request('games/poll',{member:a.id,answers:Array(10).fill('mara')}),{},db);
 const saved=await state();assert.equal(saved.pollResults[0].total,2);assert.equal(saved.pollResults[0].maraPercent,100);assert.equal(saved.members[0].quiz.score,1);assert.deepEqual(saved.members[0].quiz.review[0],{question:'Vacation?',answer:'CRUIS',correct:true,correctAnswer:'cruise'});assert.equal(saved.members[1].quiz.review[0].correct,false);
 db.current.household=2;const real=await state();assert.equal(real.leaderboard.length,0);assert.equal(real.pollResults[0].total,0);
 db.current=null;await fail('games',undefined,db);
});
