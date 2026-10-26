import {prepareGuestPhoto} from './guest-details.js';

const slots=[
 ['couple','Bride & Groom','Mara & Josh','homepage.webp'],
 ['eden','By Mara’s side','Eden Wilt',''],['julia-butler','By Mara’s side','Julia Butler',''],
 ['danielle','By Mara’s side','Danielle Dameron',''],['julia-holdren','By Mara’s side','Julia Holdren',''],
 ['sophia','By Mara’s side','Sophia Krehnbrink',''],['rebecca','By Mara’s side','Rebecca Auten',''],
 ['jack','By Josh’s side','Jack Trimble','wedding-party-jack.webp'],['jake','By Josh’s side','Jake Dameron','wedding-party-jake.webp'],
 ['liam','By Josh’s side','Liam Stack',''],['jamie','By Josh’s side','Jamie Richardson','wedding-party-jamie.webp'],
 ['tyler','By Josh’s side','Tyler Gilreath','wedding-party-tyler.webp'],['will','By Josh’s side','Will Myrick','wedding-party-will.webp']
];

const src=(slot,file,p)=>p?.source==='uploaded'?`/api/party-photo/${slot}?v=${encodeURIComponent(p.updatedAt||Date.now())}`:file?`images/${file}`:'';
const initials=name=>name.split(/\s+/).map(x=>x[0]).join('').slice(0,3);
const style=p=>`--photo-x:${Number(p?.x??50)}%;--photo-y:${Number(p?.y??50)}%;--photo-zoom:${Number(p?.zoom??1)}`;

export async function mountPartyPhotos({app,api,esc,toast}){
 const data=await api('owner/party-photos'),photos=data.photos||{};
 const section=document.createElement('section');section.className='section party-photo-owner';section.dataset.ownerView='partyphotos';
 section.innerHTML=`<div class="eyebrow">Wedding party photo studio</div><h2>Make every portrait fit beautifully.</h2><p>Choose a photo, then use the controls to zoom and move it inside the frame. The public wedding-party page updates as soon as you save.</p><p class="hint">JPEG, PNG, or WebP · up to 25 MB before optimization. Portraits share the same frame size so both sides line up.</p><div class="party-photo-editor-grid">${slots.map(([slot,group,name,file])=>{const p=photos[slot]||{},image=src(slot,file,p);return `<article class="party-photo-editor" data-slot="${slot}"><div class="party-photo-editor-heading"><div><small>${group}</small><h3>${name}</h3></div><span class="badge">${p.source==='uploaded'?'Uploaded':file?'Current site photo':'Photo needed'}</span></div><div class="party-photo-preview party-photo-frame" style="${style(p)}">${image?`<img src="${image}" alt="Preview for ${esc(name)}">`:`<span>${initials(name)}</span>`}</div><label for="photo-${slot}">Choose or replace photo</label><input id="photo-${slot}" class="party-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><div class="party-photo-controls"><label>Zoom <output>${Number(p.zoom??1).toFixed(2)}×</output><input class="crop-zoom" type="range" min="1" max="2.4" step=".01" value="${Number(p.zoom??1)}"></label><label>Move left / right <output>${Math.round(Number(p.x??50))}%</output><input class="crop-x" type="range" min="0" max="100" step="1" value="${Number(p.x??50)}"></label><label>Move up / down <output>${Math.round(Number(p.y??50))}%</output><input class="crop-y" type="range" min="0" max="100" step="1" value="${Number(p.y??50)}"></label></div><div class="party-photo-actions"><button class="save-party-photo">${p.source==='uploaded'||file?'Save crop & position':'Upload photo'}</button><button class="secondary center-party-photo" type="button">Center photo</button></div><p class="party-photo-status" role="status"></p></article>`}).join('')}</div>`;
 app.append(section);
 for(const card of section.querySelectorAll('.party-photo-editor')){
  const slot=card.dataset.slot,[,group,name,file]=slots.find(x=>x[0]===slot),preview=card.querySelector('.party-photo-preview'),input=card.querySelector('.party-photo-file');let localUrl='';
  const values=()=>({x:Number(card.querySelector('.crop-x').value),y:Number(card.querySelector('.crop-y').value),zoom:Number(card.querySelector('.crop-zoom').value)});
  const update=()=>{const v=values();preview.style.setProperty('--photo-x',v.x+'%');preview.style.setProperty('--photo-y',v.y+'%');preview.style.setProperty('--photo-zoom',v.zoom);card.querySelector('.crop-x').previousElementSibling.textContent=Math.round(v.x)+'%';card.querySelector('.crop-y').previousElementSibling.textContent=Math.round(v.y)+'%';card.querySelector('.crop-zoom').previousElementSibling.textContent=v.zoom.toFixed(2)+'×'};
  card.querySelectorAll('input[type=range]').forEach(x=>x.oninput=update);
  card.querySelector('.center-party-photo').onclick=()=>{card.querySelector('.crop-x').value=50;card.querySelector('.crop-y').value=50;card.querySelector('.crop-zoom').value=1;update()};
  input.onchange=()=>{const chosen=input.files[0];if(!chosen)return;if(localUrl)URL.revokeObjectURL(localUrl);localUrl=URL.createObjectURL(chosen);preview.innerHTML=`<img src="${localUrl}" alt="New preview for ${esc(name)}">`;card.querySelector('.save-party-photo').textContent='Upload & save photo';card.querySelector('.party-photo-status').textContent='Move and zoom the preview, then save.'};
  card.querySelector('.save-party-photo').onclick=async()=>{const button=card.querySelector('.save-party-photo'),status=card.querySelector('.party-photo-status'),crop=values();button.disabled=true;try{if(input.files[0]){button.textContent='Preparing photo…';const image=await prepareGuestPhoto(input.files[0]);button.textContent='Uploading…';await api('owner/party-photo',{slot,data:image,...crop})}else{button.textContent='Saving…';await api('owner/party-photo-crop',{slot,file,...crop})}status.textContent='Saved. The wedding-party page now uses this placement.';toast(`${name}’s photo is saved.`);setTimeout(()=>location.reload(),350)}catch(e){status.textContent=e.message;button.disabled=false;button.textContent='Try again'}finally{if(localUrl)URL.revokeObjectURL(localUrl)}};
 }
}
