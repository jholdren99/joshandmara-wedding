// Individual game records use existing private w_settings storage; no schema change.
export function normalized(value){return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next}return row[b.length]}
export function matchesAnswer(answer,accepted){const a=normalized(answer);if(!a)return false;return accepted.some(value=>{const b=normalized(value);if(a===b)return true;if(a.replace(/\D/g,'')!==b.replace(/\D/g,''))return false;const longest=Math.max(a.length,b.length);return longest>=5&&distance(a,b)<=Math.min(2,Math.floor(longest*.18))})}
export function cleanQuestions(questions,publish,Problem){if(!Array.isArray(questions)||questions.length<1||questions.length>10)throw new Problem('Use 1–10 questions.');const q=questions.map(q=>{const aliases=q.acceptedAnswers??(Number.isInteger(q.correct)&&q.options?.[q.correct]?[q.options[q.correct]]:[]);if(!Array.isArray(aliases)||aliases.length>20||aliases.some(x=>typeof x!=='string'||x.length>250))throw new Problem('Use up to 20 accepted answers per question.');return {question:String(q.question??'').trim().slice(0,250),acceptedAnswers:[...new Set(aliases.map(x=>x.trim()).filter(Boolean))],enabled:q.enabled!==false}});if(publish){const included=q.filter(x=>x.enabled);if(included.length<3||included.some(x=>!x.question||!x.acceptedAnswers.length))throw new Problem('Complete at least three questions and their accepted answers.');return included}return q}
export async function games(req,b,db,h,{Problem,sha,reply,limited,POLL_QUESTIONS}){
 const members=await Promise.all(h.guests.map(async(name,i)=>({id:await sha(name+'|'+h.guests.slice(0,i).filter(n=>n===name).length),name})));
 const test=!!h.details?.is_test,round=await db.setting('trivia',null),prefix='games-v2:';
 if(req.method==='POST'){
  const m=members.find(x=>x.id===b.member);if(!m)throw new Problem('Choose a guest on your invitation.',403);
  await limited(db,req,'guest-games',100);
  if(new URL(req.url).pathname==='/api/games/poll'){
   if(!Array.isArray(b.answers)||b.answers.length!==10||b.answers.some(a=>!['josh','mara'].includes(a)))throw new Problem('Answer all ten poll questions.');
   await db.upsert('w_settings',{key:prefix+'poll:'+h.id+':'+m.id,value:{household:h.id,member:m.id,answers:b.answers}});return reply({ok:true});
  }
  if(!round||round.round!==b.round)throw new Problem('Refresh to load the current trivia round.',409);
  if(!Array.isArray(b.answers)||b.answers.length!==round.questions.length||b.answers.some(a=>typeof a!=='string'||!a.trim()||a.length>250))throw new Problem('Type an answer for every question (up to 250 characters).');
  const score=round.questions.filter((q,i)=>matchesAnswer(b.answers[i],q.acceptedAnswers??[q.options?.[q.correct]??''])).length;
  await db.insert('w_settings',{key:prefix+'quiz:'+round.round+':'+h.id+':'+m.id,value:{household:h.id,member:m.id,score,total:round.questions.length,answers:b.answers}});return reply({ok:true,score,total:round.questions.length});
 }
 const houses=await db.list('w_households',{select:'id,name,guests,details,response',limit:10000});
 const eligible=new Map(houses.filter(x=>x.response==='attending'&&!!x.details?.is_test===test).map(x=>[x.id,x]));
 const records=await db.list('w_settings',{key:'like.'+prefix+'*',select:'key,value',limit:10000});
 const identities=new Map();for(const house of eligible.values())for(let i=0;i<house.guests.length;i++){const name=house.guests[i],id=await sha(name+'|'+house.guests.slice(0,i).filter(n=>n===name).length);identities.set(house.id+':'+id,name)}
 const ballots=records.filter(x=>x.key.startsWith(prefix+'poll:')&&identities.has(x.value.household+':'+x.value.member));
 const quiz=round?records.filter(x=>x.key.startsWith(prefix+'quiz:'+round.round+':')&&identities.has(x.value.household+':'+x.value.member)):[];
 const leaderboard=quiz.map(x=>({name:identities.get(x.value.household+':'+x.value.member),score:x.value.score,total:x.value.total})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,100);
 const memberData=members.map(m=>{const saved=quiz.find(x=>x.value.household===h.id&&x.value.member===m.id)?.value??null;const review=saved&&round?round.questions.map((q,i)=>{const accepted=q.acceptedAnswers??[q.options?.[q.correct]??''];return{question:q.question,answer:saved.answers?.[i]||'',correct:matchesAnswer(saved.answers?.[i],accepted),correctAnswer:accepted[0]||''}}):null;return{...m,quiz:saved?{...saved,review}:null,poll:ballots.find(x=>x.value.household===h.id&&x.value.member===m.id)?.value.answers??null}});
 return reply({isTest:test,members:memberData,trivia:round?{round:round.round,questions:round.questions.map(q=>({question:q.question}))}:null,leaderboard,pollQuestions:POLL_QUESTIONS,pollResults:POLL_QUESTIONS.map((_,i)=>{const josh=ballots.filter(x=>x.value.answers[i]==='josh').length;return {joshPercent:ballots.length?Math.round(josh/ballots.length*100):0,maraPercent:ballots.length?100-Math.round(josh/ballots.length*100):0,total:ballots.length}})});
}
