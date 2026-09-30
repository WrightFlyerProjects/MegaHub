/* MegaHub · js/ui/editor.js — aircraft/destination selects, combos, preview(), mkRot */
/* ---------------- selects ---------------- */
function syncAC(){
  $('ac').innerHTML=owned.map(a=>{
    const w=freeWindows(rots,owned,a.id);
    const tag=!rots.some(r=>r.ac===a.id)?'idle':(w.length?`free ${fmt(w[0].start)}`:'full');
    return `<option value="${a.id}">${a.id} — ${a.t} · ${tag}</option>`;}).join('');
}
function acAvailability(){
  const ac=curAC(); if(!ac){$('acFree').textContent='—';return null;}
  const mine=rots.filter(r=>r.ac===ac.id).sort((a,b)=>a.dep-b.dep);
  const w=freeWindows(rots,owned,ac.id);
  if(!mine.length){$('acFree').innerHTML=`idle all day · ${ac.seats} seats · ${ac.rng} nm`;return w[0];}
  const last=mine[mine.length-1];
  if(!w.length){$('acFree').innerHTML=`<span style="color:var(--red)">no room for another rotation</span>`;return null;}
  const g=w[0];
  $('acFree').innerHTML=`lands ${fmt(last.arr)} · next free <b style="color:var(--green)">${fmt(g.start)}</b> · window ${Math.floor(g.len/60)}h${String(Math.round(g.len%60)).padStart(2,'0')}`;
  return g;
}
function snapToFree(){
  if(editIdx!==null)return;
  const g=acAvailability(); if(!g)return;
  if(!rots.some(r=>r.ac===$('ac').value))return;   // idle aircraft: leave the clock alone
  $('dep').value=Math.round(g.start);              // otherwise open at the next free minute
}
function alphaSpokes(){return SPOKES.slice().sort((a,b)=>a.c<b.c?-1:1);}
function canLeg(ac,a,b){
  if(nm(A[a],A[b])<MIN_STAGE)return false;
  if(nm(A[a],A[b])>ac.rng)return false;
  if((A[a].ocean||A[b].ocean)&&!ac.etops)return false;
  return true;}
const curAC=()=>owned.find(a=>a.id===$('ac').value);
const hm=m=>Math.floor(m/60)+'h'+String(Math.round(m%60)).padStart(2,'0');
function enforceTurn(){
  const ac=curAC(); if(!ac||!destSel)return;
  const need=turnMin(destSel,ac);
  if(+$('turn').value<need)$('turn').value=need;
}
function reachability(ac,c){
  if(canLeg(ac,HUB.c,c))return 'ok';
  if(SPOKES.some(v=>v.c!==c&&canLeg(ac,HUB.c,v.c)&&canLeg(ac,v.c,c)))return 'via';
  return 'no';}
function label(c){return `${c} — ${A[c].n}`;}

/* a good stop is both on the way and worth serving */
const viaScore=(v,dst)=>thruMult(v,dst)*A[v].w;
function comboItems(q,ac,forVia){
  q=(q||'').trim().toUpperCase();
  let list=SPOKES.slice();
  if(forVia) list=list.filter(s=>s.c!==destSel&&destSel&&canLeg(ac,HUB.c,s.c)&&canLeg(ac,s.c,destSel));
  if(q) list=list.filter(s=>s.c.startsWith(q)||s.n.toUpperCase().includes(q));
  list.sort((a,b)=>{
    const ax=a.c.startsWith(q)?0:1, bx=b.c.startsWith(q)?0:1;
    if(ax!==bx)return ax-bx;
    if(forVia)return viaScore(b.c,destSel)-viaScore(a.c,destSel);
    return dHub[a.c]-dHub[b.c];});
  return list.slice(0,60);
}
function renderCombo(which){
  const ac=curAC(); if(!ac)return;
  const forVia=which==='via';
  const q=$(forVia?'viaQ':'destQ').value;
  const items=comboItems(q,ac,forVia);
  const rows=items.map(s=>{
    if(forVia){
      const tm=thruMult(s.c,destSel), det=((dHub[s.c]+dPair[s.c+destSel])/dHub[destSel]).toFixed(2);
      return `<div class="citem" data-pick="${s.c}" data-for="via"><span><b>${s.c}</b> <em>${s.n}</em></span>
        <span><em>${det}× · ${2*hubOD(s.c)} pax mkt</em> <span class="badge ${tm>=.7?'b-ok':tm>=.4?'b-via':'b-no'}">keeps ${Math.round(tm*100)}%</span></span></div>`;
    }
    const r=reachability(ac,s.c);
    const bd=r==='ok'?'<span class="badge b-ok">nonstop</span>':r==='via'?'<span class="badge b-via">via only</span>'
      :(s.ocean&&!ac.etops?'<span class="badge b-no">no ETOPS</span>':'<span class="badge b-no">out of range</span>');
    const flag=s.intl?'<span class="badge b-via" title="customs adds 30m to inbound connections">intl</span> ':'';
    return `<div class="citem ${r==='no'?'dis':''}" ${r==='no'?'':`data-pick="${s.c}" data-for="dest"`}>
      <span><b>${s.c}</b> <em>${s.n}</em></span>
      <span><em>${Math.round(dHub[s.c])} nm · ${tzD(s.c)>=0?'+':''}${tzD(s.c)/60}h</em> ${flag}${bd}</span></div>`;
  }).join('')||`<div class="citem dis"><em>no match</em></div>`;
  const nonstopOpt=forVia?`<div class="citem" data-pick="" data-for="via"><span><b>— nonstop —</b></span></div>`:'';
  $(forVia?'viaL':'destL').innerHTML=nonstopOpt+rows;
}
function openCombo(which,open){$(which==='via'?'viaL':'destL').classList.toggle('open',open);}
function setDest(c){destSel=c;$('destQ').value=c?label(c):'';
  enforceTurn();
  if(viaSel&&(viaSel===c||!curAC()||!canLeg(curAC(),viaSel,c)))setVia('');
  const ac=curAC();
  if(ac&&c&&!canLeg(ac,HUB.c,c)&&!viaSel){
    const opt=SPOKES.filter(s=>s.c!==c&&canLeg(ac,HUB.c,s.c)&&canLeg(ac,s.c,c))
      .sort((a,b)=>viaScore(b.c,c)-viaScore(a.c,c))[0];
    if(opt)setVia(opt.c);}
  preview();}
function setVia(c){viaSel=c;$('viaQ').value=c?label(c):'';}
function syncDest(){
  const ac=curAC(); if(!ac)return;
  if(destSel&&reachability(ac,destSel)==='no'){destSel='';$('destQ').value='';}
  if(!destSel){const first=SPOKES.slice().sort((a,b)=>dHub[a.c]-dHub[b.c]).find(s=>reachability(ac,s.c)!=='no');
    if(first)setDest(first.c);}
  if(viaSel&&(!destSel||!canLeg(ac,viaSel,destSel)||!canLeg(ac,HUB.c,viaSel)))setVia('');
  $('rangeNote').textContent=`· ${SPOKES.filter(s=>canLeg(ac,HUB.c,s.c)).length} of ${SPOKES.length} nonstop${ac.etops?' · ETOPS':''}`;
}

function preview(){
  const ac=owned.find(a=>a.id===$('ac').value);
  // #6 clear-this-aircraft button reflects the selected tail and its scheduled count
  const cab=$('clearac');
  if(cab){
    const n=ac?rots.filter(r=>r.ac===ac.id).length:0;
    if(ac&&n){cab.style.display='block';cab.textContent=`Clear ${ac.id}'s schedule (${n} flight${n>1?'s':''})`;}
    else cab.style.display='none';
  }
  if(!ac){$('err').textContent='Buy an aircraft first';$('add').disabled=true;renderMoveRow();return;}
  if(gatesOwned<1){$('err').textContent='Lease at least one gate before you schedule';$('add').disabled=true;renderMoveRow();return;}
  $('add').disabled=false;
  const dst=destSel,dep=+$('dep').value,turn=+$('turn').value,via=viaSel||null,pad=+$('padSel').value||0;
  if(!dst){$('fcard').innerHTML='<div class="empty">Pick a destination.</div>';$('add').disabled=true;return;}
  if(document.activeElement!==$('depT'))$('depT').value=hhmmStr(dep);
  if(document.activeElement!==$('turnN'))$('turnN').value=String(turn);
  const sh=shape({dst,via,dep,turn,pad},ac), m=sh.marks, arr=mod(dep+sh.dur);
  const al=mod((via?m.arrDst:m.arrDst)+tzD(dst)), dl=mod(m.depDst+tzD(dst));
  renderFCard(ac,dst,via,dep,turn,sh,al,dl,arr,pad);
  const verr=validate(rots,owned,gatesOwned,ac.id,dst,dep,turn,via,editIdx===null?undefined:editIdx,pad);
  const heads=[];
  if(!verr&&acTier(ac)&&gateTiers.H+gateTiers.I===0)heads.push(`${ac.t} is a widebody — it needs a heavy gate at ${HUB.c}`);
  if(!verr&&customsIn(via||dst)&&gateTiers.I===0)heads.push(`the return from ${via||dst} arrives from abroad — it needs an international gate`);
  if(verr)$('err').textContent=verr;
  else $('err').innerHTML=heads.length?`<span style="color:var(--amber)">Heads up: ${heads.join('; ')}. Upfit one on the Fleet tab before you launch.</span>`:'';
  $('add').textContent=editIdx===null?'Schedule rotation':'Update rotation';
  $('canceledit').style.display=editIdx===null?'none':'block';
  renderMoveRow();
  renderAxes();
}
const hhmm=v=>{const [h,m]=v.split(':').map(Number);return mod(h*60+m);};
const hhmmStr=m=>{m=mod(Math.round(m));return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};  // 24h for <input type=time>
function mkRot(acId,dst,via,dep,turn,pad){
  pad=pad||0;
  const ac=owned.find(a=>a.id===acId), sh=shape({dst,via,dep,turn,pad},ac);
  return {ac:acId,dst,via:via||null,dep:mod(dep),turn,pad,b:sh.legs[0].t,dur:sh.dur,arr:mod(dep+sh.dur)};
}
