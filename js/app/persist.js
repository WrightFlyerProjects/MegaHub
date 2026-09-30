/* MegaHub · js/app/persist.js — save/load (snapshot, restore), undo, restart year, local storage, import/export, resume */
/* ---------------- save & resume ----------------
   Serialise only what cannot be recomputed. Rotations keep {ac,dst,via,dep,turn};
   block times, durations and arrivals are derived on load, so a save written under
   one engine still opens correctly under the next. */
const SAVE_KEY='megahub.save', SAVE_VERSION=1;

function slimMarkets(ms){return (ms||[]).map(m=>({i:m.i,j:m.j,n:m.n,ct:m.ct,r:m.r,v:m.v,
  P:m.P,del:m.del,need:m.need,pax:m.pax}));}
function slimLocal(ls){return (ls||[]).map(l=>({c:l.c,f:l.f,cap:l.cap,market:l.market,pax:l.pax,left:l.left}));}

function snapshot(){
  return {v:SAVE_VERSION, ts:Date.now(),
    airline:{name:airline.name,c1:airline.c1,c2:airline.c2},
    hub:HUB.c, year:year(),
    points, cumPm, results, gatesOwned, gateTiers, acSeq, launched, coachOff, lastAward, committed, startYear:era().start, yearStartSnap,
    fleet:owned.map(a=>({id:a.id,t:a.t})),
    rots:rots.map(r=>({ac:r.ac,dst:r.dst,via:r.via||null,dep:r.dep,turn:r.turn})),
    last:lastE?{year:lastE.year,pm:lastE.pm,pax:lastE.pax,peak:lastE.peak,
      markets:slimMarkets(lastE.markets),local:slimLocal(lastE.local),perFlt:lastE.perFlt||null,
      perTail:lastE.perTail||null,pairRows:lastE.pairRows||null}:null};
}

/* returns the rotations that no longer fit the rules, having dropped them */
function restore(s){
  if(!s||typeof s!=='object')throw new Error('Not a MegaHub save');
  if(s.v!==SAVE_VERSION)throw new Error(`Save is version ${s.v}, this game reads version ${SAVE_VERSION}`);
  if(!A[s.hub])throw new Error(`Unknown hub ${s.hub}`);
  setHub(s.hub); if(s.startYear)setStartYear(s.startYear); setYear(s.year);
  airline={name:s.airline?.name||'MegaHub Airways',c1:s.airline?.c1||'#2A6C99',c2:s.airline?.c2||'#16283C'};
  points=s.points|0; cumPm=s.cumPm||0; results=s.results||[];
  gatesOwned=s.gatesOwned|0; acSeq=s.acSeq||801; coachOff=!!s.coachOff; lastAward=s.lastAward||null; committed=s.committed||{}; yearStartSnap=s.yearStartSnap||null;
  owned=[];
  (s.fleet||[]).forEach(f=>{const c=CATALOG.find(x=>x.t===f.t); if(c)owned.push({id:f.id,...c});});
  rots=[]; const dropped=[];
  (s.rots||[]).forEach(r=>{
    const ac=owned.find(a=>a.id===r.ac);
    if(!ac||!A[r.dst]||r.dst===HUB.c){dropped.push({...r,why:'aircraft or city missing'});return;}
    const err=validate(rots,owned,gatesOwned,r.ac,r.dst,r.dep,r.turn,r.via||null);
    if(err){dropped.push({...r,why:err});return;}
    rots.push(mkRot(r.ac,r.dst,r.via||null,r.dep,r.turn));
  });
  /* gate tiers: saves from before gate tiers get, free, exactly the upfits their schedule needs */
  if(s.gateTiers){gateTiers={H:s.gateTiers.H|0,I:s.gateTiers.I|0};}
  else{const c=gateTierCurves(rots,owned), I=Math.min(gatesOwned,Math.max(0,...c.i)),
      H=Math.min(gatesOwned-I,Math.max(0,Math.max(0,...c.h)-I));
    gateTiers={H,I};
    tierNotice=(H||I)?`Gate tiers are new: widebodies need heavy gates and arrivals from abroad need international (customs) gates. To keep your schedule legal, ${I} of your gates were upgraded to international and ${H} to heavy, free.`:null;}
  launched=!!s.launched && dropped.length===0;
  lastE=s.last||null;
  pending={}; gatesPending=0; tierPend={H:0,I:0}; editIdx=null; selCity=null; destSel=''; viaSel='';
  return dropped;
}

/* Undo: snapshot the world before a mutating action. Reuses the same serialisation
   as save/resume, so an undo restores fleet, network, points and ledger exactly. */
function pushUndo(label){
  try{ undoStack.push({snap:JSON.stringify(snapshot()),label:label||'last action'});
    if(undoStack.length>UNDO_MAX)undoStack.shift(); }catch(e){}
  undoLabel=label||'';
  renderUndo();
}
function doUndo(){
  const prev=undoStack.pop(); if(!prev)return;
  try{ restore(JSON.parse(prev.snap)); }catch(e){ return; }
  // restore() resets transient editor state; refresh everything
  editIdx=null; schedOpen=null;
  applyBrand(); syncAC(); syncDest(); renderHub(); renderFleetPanel(); render(); preview();
  renderUndo(); saveLocal();
}
function renderUndo(){
  const b=$('btnUndo'); if(!b)return;
  b.disabled=!undoStack.length;
  b.textContent='Undo last action';
}
function markYearStart(){
  try{ const s=snapshot(); delete s.yearStartSnap;   // never nest a checkpoint inside a checkpoint
    yearStartSnap=JSON.stringify(s); }catch(e){ yearStartSnap=null; }
}
function restartYear(){
  if(!yearStartSnap){ alert('No start-of-year checkpoint yet — this is the first year.');return; }
  const y=year();
  if(!confirm(`Restart ${y}? This rewinds to how your airline looked when ${y} began — anything you scheduled, bought, sold or edited this year is undone. Your progress through ${y-1} is kept.`))return;
  try{ restore(JSON.parse(yearStartSnap)); }catch(e){ return; }
  undoStack=[]; editIdx=null; schedOpen=null;
  applyBrand(); syncAC(); syncDest(); renderHub(); renderFleetPanel(); render(); preview();
  saveLocal();
}

function saveLocal(){
  if(!storageOK)return;
  clearTimeout(saveT);
  saveT=setTimeout(()=>{
    try{ localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot())); lastSaved=Date.now(); }
    catch(e){ storageOK=false; }
    renderSave();
  },500);
}
function loadLocal(){
  try{ const raw=localStorage.getItem(SAVE_KEY); return raw?JSON.parse(raw):null; }
  catch(e){ storageOK=false; return null; }
}
function clearLocal(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} }

function renderSave(){
  const el=$('saveState'); if(!el)return;
  if(!storageOK){ el.textContent='file only'; }
  else if(!lastSaved){ el.textContent='not yet saved'; }
  else{
    const s=Math.round((Date.now()-lastSaved)/1000);
    el.textContent = s<5?'saved just now' : s<60?`saved ${s}s ago` : `saved ${Math.round(s/60)}m ago`;
  }
  const note=$('saveNote');
  if(note){
    if(!storageOK){note.style.display='flex';
      note.innerHTML='<span>This browser blocks local storage</span><b>use Export</b>';}
    else note.style.display='none';
  }
}

function exportSave(){
  const data=JSON.stringify(snapshot(),null,1);
  try{
    const blob=new Blob([data],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(airline.name||'megahub').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
      +'-'+year()+'.megahub.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }catch(e){ alert('Could not export: '+e.message); }
}

function afterLoad(dropped){
  applyBrand(); syncAC(); syncDest(); renderHub(); renderFleetPanel(); render(); preview();
  $('resume').style.display='none';
  if(dropped&&dropped.length){
    $('viol').style.display='block';
    $('viol').innerHTML=`<h2 style="border-color:rgba(178,58,58,.3);color:var(--red)">${dropped.length} rotation${dropped.length>1?'s':''} could not be restored</h2>`
      +`<div class="empty">The rules changed since this save. These were dropped; reschedule them.</div>`
      +`<table>${dropped.slice(0,6).map(d=>`<tr><td>${d.ac} → ${d.dst}</td><td style="text-align:left;color:var(--ink3)">${d.why}</td></tr>`).join('')}</table>`;
  }
  saveLocal();
}

function importSave(text){
  let s; try{ s=JSON.parse(text); }catch(e){ alert('That file is not valid JSON.'); return; }
  let dropped;
  try{ dropped=restore(s); }catch(e){ alert('Could not load save: '+e.message); return; }
  afterLoad(dropped);
}

function bootResume(){
  const s=loadLocal();
  renderSave();
  if(!s){ $('resume').style.display='none'; return false; }
  const nm=(s.airline&&s.airline.name)||'a saved airline';
  const when=new Date(s.ts||Date.now());
  $('resume').style.display='flex';
  $('resume').innerHTML=`<div><b>${nm}</b> — ${s.hub}, ${s.year} · ${Math.round((s.cumPm||0)/1000).toLocaleString()}k pax-mi banked
      <span style="color:var(--ink3)"> · saved ${when.toLocaleDateString()}</span></div>
    <div class="acts"><button id="btnResume">Resume</button><button class="ghost" id="btnFresh">Start fresh</button></div>`;
  $('btnResume').onclick=()=>{ let d; try{ d=restore(s); }catch(e){ alert('Save could not be read: '+e.message); return; } afterLoad(d); };
  $('btnFresh').onclick=()=>{ $('resume').style.display='none'; };
  return true;
}
