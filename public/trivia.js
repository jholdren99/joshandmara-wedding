export const TRIVIA_PROMPTS=[
 'Where did Josh and Mara meet?',
 'Who made the first move?',
 'How many days apart are our birthdays?',
 'When did we officially start dating?',
 'Who said “I love you” first?',
 'Where did Josh propose?',
 'What is our favorite food to go out for?',
 'Where did we take our first trip together?',
 'How many years apart are we?',
 'What would our ideal last-minute vacation be?'
];
export async function mountTriviaOwner({app,api,esc,toast}){
 const d=await api('admin/trivia');const questions=d.draft?.questions||TRIVIA_PROMPTS.map(question=>({question,acceptedAnswers:[],enabled:true}));
 const panel=document.createElement('section');panel.className='section';panel.dataset.ownerView='settings';app.append(panel);
 panel.innerHTML=`<h2>Private trivia editor</h2><p>Guests type their answers. Add accepted alternatives, one per line. Capitalization, punctuation and small typos are handled automatically. Answer keys stay private.</p><label>Import ten-question JSON<input id="trivia-import" type="file" accept=".json,application/json"></label><form id="trivia-editor">${questions.map((q,i)=>`<div class="trivia-owner-item"><label><input type="checkbox" name="enabled-${i}" style="width:auto" ${q.enabled!==false?'checked':''}> Include question ${i+1}</label><label>Question<input name="question-${i}" maxlength="250" value="${esc(q.question)}"></label><label>Accepted answers, one per line<textarea name="answers-${i}" rows="4">${esc((q.acceptedAnswers??[q.options?.[q.correct]??'']).join('\n'))}</textarea></label></div>`).join('')}<button>Save private draft</button><button type="button" id="publish-trivia">Publish trivia round</button><p class="error" role="alert"></p></form>`;
 const fail=e=>panel.querySelector('.error').textContent=e.message;
 panel.querySelector('#trivia-import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>65536)throw Error('Use a file smaller than 64 KB.');const payload=JSON.parse(await file.text());if(payload.questions?.length!==10)throw Error('Import exactly ten questions.');await api('admin/trivia',{mode:'save',questions:payload.questions});panel.remove();await mountTriviaOwner({app,api,esc,toast});toast('Imported as a private draft. Review and publish.')}catch(e){fail(e)}};
 const save=async mode=>{try{const f=new FormData(panel.querySelector('form'));await api('admin/trivia',{mode,questions:questions.map((_,i)=>({question:f.get('question-'+i),acceptedAnswers:String(f.get('answers-'+i)).split('\n').map(x=>x.trim()).filter(Boolean),enabled:f.has('enabled-'+i)}))});toast(mode==='publish'?'Trivia published.':'Private draft saved.')}catch(e){fail(e)}};
 panel.querySelector('form').onsubmit=e=>{e.preventDefault();save('save')};panel.querySelector('#publish-trivia').onclick=()=>{if(confirm('Publish this quiz? Changed questions start a new round; previous results remain stored.'))save('publish')};
}
export function guestTrivia(){return ''}
