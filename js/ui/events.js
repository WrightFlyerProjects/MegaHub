/* MegaHub · js/ui/events.js — all event listeners (fleet, editor, schedule, map, save buttons, launch/advance) */
/* ---------------- events ---------------- */
$('cat').addEventListener('click',e=>{
  const p=e.target.getAttribute('data-p'),m=e.target.getAttribute('data-m');
  if(p)pending[p]=(pending[p]||0)+1;
  if(m)pending[m]=Math.max(0,(pending[m]||0)-1);
  if(p||m)renderFleetPanel();});
document.addEventListener('click',e=>{
  const g=e.target.getAttribute&&e.target.getAttribute('data-gp'),gm=e.target.getAttribute&&e.target.getAttribute('data-gm');
  if(g){gatesPending=Math.min(MAX_GATES-gatesOwned,gatesPending+1);renderFleetPanel();return;}
  if(gm){if(gatesPending>0&&stdFree()>0)gatesPending--;renderFleetPanel();return;}
  const tq=a=>e.target.getAttribute&&e.target.getAttribute(a);
  if(tq('data-hp')){if(stdFree()>0)tierPend.H++;renderFleetPanel();return;}
  if(tq('data-hm')){if(tierPend.H>0)tierPend.H--;renderFleetPanel();return;}
  if(tq('data-ip')){if(stdFree()>0)tierPend.I++;else if(tierNext().H>0){tierPend.H--;tierPend.I++;}renderFleetPanel();return;}
  if(tq('data-im')){if(tierPend.I>0){tierPend.I--;if(tierPend.H<0)tierPend.H++;}renderFleetPanel();return;}
  if(tq('data-tnclose')){tierNotice=null;render();return;}
  // move a route to another aircraft (#4)
  const mv=e.target.closest&&e.target.closest('[data-move]');
  if(mv){doMove(mv.getAttribute('data-move'));return;}
  // replace-aircraft: open/close the picker, or pick a replacement type
  const ro=e.target.getAttribute&&e.target.getAttribute('data-replopen');
  if(ro){replOpen=(replOpen===ro?null:ro);renderFleetPanel();return;}
  const rpick=e.target.closest&&e.target.closest('[data-repl]');
  if(rpick){doReplace(rpick.getAttribute('data-repl'),rpick.getAttribute('data-rtype'));return;}
  const sell=e.target.getAttribute&&e.target.getAttribute('data-sell');
  if(sell){
    const a=owned.find(x=>x.id===sell); if(!a)return;
    if(rots.some(r=>r.ac===sell)){alert('That aircraft still flies scheduled rotations. Unschedule them before selling.');return;}
    const val=tradeInValue(a.t);
    if(!confirm(`Sell ${a.id} (${a.t}) back for ${val} points?`))return;
    pushUndo('sell aircraft');
    owned=owned.filter(x=>x.id!==sell); points+=val;
    launched=false;               // fleet changed -> the year must be re-launched
    syncAC();renderHub();renderFleetPanel();render();preview();saveLocal();return;
  }
  const d=e.target.getAttribute&&e.target.getAttribute('data-del');
  if(d!==null&&d!==undefined){pushUndo('delete');rots.splice(+d,1);if(editIdx===+d)editIdx=null;launched=false;render();preview();return;}
  const ed=e.target.getAttribute&&e.target.getAttribute('data-edit');
  if(ed!==null&&ed!==undefined){
    const r=rots[+ed];editIdx=+ed;
    $('ac').value=r.ac;setDest(r.dst);setVia(r.via||'');
    $('dep').value=r.dep;$('turn').value=r.turn;preview();
    document.getElementById('add').scrollIntoView({block:'center',behavior:'smooth'});return;}
  if(e.target.id==='cityclose'){selCity=null;$('city').style.display='none';return;}
  // sort buttons
  const sb=e.target.closest&&e.target.closest('.sortb');
  if(sb){const k=sb.getAttribute('data-sort');
    if(schedSort===k)schedAsc=!schedAsc; else{schedSort=k;schedAsc=(k==='dep'||k==='flt'||k==='ac');}
    render();return;}
  // expand / collapse a scheduled row for its flight-level results
  const er=e.target.closest&&e.target.closest('[data-editrot]');
  if(er){
    const idx=+er.getAttribute('data-editrot'); const r=rots[idx]; if(!r)return;
    editIdx=idx;
    $('ac').value=r.ac;setDest(r.dst);setVia(r.via||'');
    $('dep').value=r.dep;$('turn').value=r.turn;preview();
    document.getElementById('add').scrollIntoView({block:'center',behavior:'smooth'});return;
  }
  const op=e.target.closest&&e.target.closest('tr[data-open]');
  if(op&&!e.target.getAttribute('data-edit')&&!e.target.getAttribute('data-del')){
    const key=op.getAttribute('data-open')+':'+op.getAttribute('data-dir');
    schedOpen = schedOpen===key ? null : key;
    renderCity(op.getAttribute('data-city'),evaluate(rots,owned,gatesOwned));
    render();return;}
  // generic: any element carrying data-city (Frequency & Capture rows, map nodes) opens the city card
  const cityEl=e.target.closest&&e.target.closest('[data-city]');
  if(cityEl){
    const c=cityEl.getAttribute('data-city');
    if(c&&c!==HUB.c){ renderCity(c,evaluate(rots,owned,gatesOwned));
      const card=$('city'); if(card&&card.scrollIntoView)card.scrollIntoView({block:'nearest',behavior:'smooth'}); }
    else if(c===HUB.c){ renderHubCard(evaluate(rots,owned,gatesOwned));
      const card=$('city'); if(card&&card.scrollIntoView)card.scrollIntoView({block:'nearest',behavior:'smooth'}); }
    return;}
});
$('schedFind').addEventListener('input',e=>{schedFilter=e.target.value;renderSchedule(evaluate(rots,owned,gatesOwned));});
$('hub').addEventListener('change',()=>{setHub($('hub').value);rots=[];launched=false;selCity=null;mapReset();
  $('city').style.display='none';destSel='';viaSel='';$('viaQ').value='';syncDest();renderHub();renderFleetPanel();render();preview();});

/* ---- map zoom / pan interaction (delegated, survives re-render) ---- */
document.addEventListener('click',e=>{
  if(e.target.id==='mapin'){mapZoomBy(1.5);return;}
  if(e.target.id==='mapout'){mapZoomBy(1/1.5);return;}
  if(e.target.id==='mapreset'){mapReset();return;}
});
// convert a client (px) point to natural viewBox coordinates of the current view
function mapClientToView(svg,clientX,clientY){
  const r=svg.getBoundingClientRect();
  const vb=svg.getAttribute('viewBox').split(' ').map(Number);
  const fx=vb[0]+((clientX-r.left)/r.width)*vb[2];
  const fy=vb[1]+((clientY-r.top)/r.height)*vb[3];
  return [fx,fy];
}
document.addEventListener('wheel',e=>{
  const svg=e.target.closest&&e.target.closest('#mapsvg'); if(!svg)return;
  e.preventDefault();
  const [fx,fy]=mapClientToView(svg,e.clientX,e.clientY);
  mapZoomBy(e.deltaY<0?1.18:1/1.18,fx,fy);
},{passive:false});
let mapDrag=null;
document.addEventListener('pointerdown',e=>{
  const svg=e.target.closest&&e.target.closest('#mapsvg'); if(!svg)return;
  if(e.target.closest('.mapnode'))return;    // let node clicks open city cards
  mapDrag={svg,x:e.clientX,y:e.clientY,px:mapPanX,py:mapPanY};
  svg.classList.add('grabbing');
});
document.addEventListener('pointermove',e=>{
  if(!mapDrag||!mapView)return;
  const svg=mapDrag.svg, r=svg.getBoundingClientRect();
  const z=Math.max(1,mapZoom);
  const dx=(e.clientX-mapDrag.x)/r.width*(mapView.W/z);
  const dy=(e.clientY-mapDrag.y)/r.height*(mapView.H/z);
  mapPanX=mapDrag.px-dx; mapPanY=mapDrag.py-dy;
  applyMapView();
});
document.addEventListener('pointerup',()=>{
  if(mapDrag){mapDrag.svg.classList.remove('grabbing');mapDrag=null;}
});
$('startY').addEventListener('change',()=>{
  const y=+$('startY').value; setStartYear(y); setYear(y);
  launched=false; lastAward=null; committed={};
  renderHub();renderFleetPanel();render();preview();saveLocal();
});
$('build').onclick=()=>{
  const cost=spendNow(); if(cost>points||!cost)return;
  pushUndo('purchase');
  pendingList().forEach(x=>owned.push({id:'N'+(acSeq++),...CATALOG.find(c=>c.t===x.t)}));
  gatesOwned+=gatesPending; gateTiers=tierNext(); points-=cost; pending={};gatesPending=0;tierPend={H:0,I:0};
  syncAC();syncDest();renderHub();renderFleetPanel();render();preview();};
$('ac').addEventListener('input',()=>{syncDest();enforceTurn();snapToFree();preview();});
document.addEventListener('change',e=>{
  const t=e.target.getAttribute&&e.target.getAttribute('data-tail');
  if(t==null)return;
  let v=(e.target.value||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,6);
  const a=owned.find(x=>x.id===t);
  if(!a){return;}
  if(!v){e.target.value=a.id;return;}                       // empty -> revert
  if(v!==a.id && owned.some(x=>x.id===v)){alert('That tail number is already in use.');e.target.value=a.id;return;}
  pushUndo('rename tail');
  const old=a.id; a.id=v;
  rots.forEach(r=>{if(r.ac===old)r.ac=v;});                 // keep rotations attached
  if(editIdx!=null && rots[editIdx] && rots[editIdx].ac===v){/* stays valid */}
  syncAC();renderFleetPanel();render();preview();saveLocal();
});
['dest','via'].forEach(w=>{
  const q=$(w==='via'?'viaQ':'destQ');
  q.addEventListener('focus',()=>{q.select();renderCombo(w);openCombo(w,true);});
  q.addEventListener('input',()=>{renderCombo(w);openCombo(w,true);});
  q.addEventListener('keydown',e=>{
    if(e.key==='Escape'){openCombo(w,false);q.blur();}
    if(e.key==='Enter'){const first=$(w==='via'?'viaL':'destL').querySelector('.citem[data-pick]');
      if(first){const c=first.getAttribute('data-pick');w==='via'?(setVia(c),preview()):setDest(c);openCombo(w,false);q.blur();}}});
  q.addEventListener('blur',()=>setTimeout(()=>openCombo(w,false),160));
});
document.addEventListener('mousedown',e=>{
  const it=e.target.closest&&e.target.closest('.citem[data-pick]');
  if(!it)return;
  const c=it.getAttribute('data-pick'), forWhich=it.getAttribute('data-for');
  if(forWhich==='via'){setVia(c);preview();}else{setDest(c);}
  openCombo(forWhich,false);
});
$('alName').addEventListener('input',()=>{airline.name=$('alName').value;applyBrand();});
$('c1').addEventListener('input',()=>{airline.c1=$('c1').value;applyBrand();render();});
$('c2').addEventListener('input',()=>{airline.c2=$('c2').value;applyBrand();render();});
$('tclock').addEventListener('input',()=>{$('tclockOut').textContent=fmt(+$('tclock').value);renderTerminal();});
$('dep').addEventListener('input',preview);
$('turn').addEventListener('input',preview);
$('depT').addEventListener('input',()=>{const v=$('depT').value;
  if(/^\d{1,2}:\d{2}$/.test(v)){const m=hhmm(v);if(m>=0&&m<DAY){$('dep').value=m;preview();}}});
$('depT').addEventListener('change',()=>{$('dep').value=hhmm($('depT').value);preview();});
$('turnN').addEventListener('input',()=>{const v=+$('turnN').value;
  if(Number.isFinite(v)&&v>=25&&v<=720){$('turn').value=v;preview();}});
$('turnN').addEventListener('blur',()=>{const v=Math.max(25,Math.min(720,+$('turnN').value||45));
  $('turn').value=v;$('turnN').value=String(v);preview();});
$('add').onclick=()=>{
  const acId=$('ac').value,dst=destSel,dep=+$('dep').value,turn=+$('turn').value,via=viaSel||null;
  const err=validate(rots,owned,gatesOwned,acId,dst,dep,turn,via,editIdx===null?undefined:editIdx);
  if(err){$('err').textContent=err;return;}
  pushUndo(editIdx===null?'schedule':'edit');
  const r=mkRot(acId,dst,via,dep,turn);
  if(editIdx===null)rots.push(r); else{rots[editIdx]=r;editIdx=null;}
  launched=false;render();preview();};
$('canceledit').onclick=()=>{editIdx=null;preview();renderMoveRow();};
$('btnUndo').onclick=doUndo;
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){
    const tag=(document.activeElement&&document.activeElement.tagName)||'';
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;   // let text fields keep native undo
    e.preventDefault(); doUndo();
  }
});
$('clear').onclick=()=>{if(!rots.length)return;pushUndo('clear board');rots=[];launched=false;editIdx=null;selCity=null;$('city').style.display='none';render();preview();};
$('clearac').onclick=()=>{
  const id=$('ac').value; const n=rots.filter(r=>r.ac===id).length; if(!n)return;
  pushUndo(`clear ${id}`);
  rots=rots.filter(r=>r.ac!==id);
  if(editIdx!=null){editIdx=null;}   // the edited rotation may be gone
  launched=false; render(); preview();
};
$('launch').onclick=()=>{
  if(!rots.length||launched)return;
  if(scheduleViolations(rots,owned,gatesOwned,gateTiers).length)return;
  const E=evaluate(rots,owned,gatesOwned);
  const e=era();
  const score=E.netPm;                        // NET pax-miles is the score
  const gross=grossPts(Math.max(0,score)), up=upkeepPts(owned,gatesOwned,gateTiers), net=gross-up;
  launched=true; editIdx=null;
  // per-flight results keyed by flight number, so they survive schedule changes into next year
  // capture per-LEG results keyed by discrete flight number, so each flight (out and
  // return) carries its own last-year load into next year's planning
  const perFlt={};
  (E.flights||[]).forEach(f=>{
    perFlt[f.no]={from:f.from,to:f.to,via:f.via,ac:f.ac,seats:f.seats,
      local:f.local,connect:f.connect,pair:f.pair,delay:f.delay};
  });
  lastE={year:e.year,pm:E.pm,netPm:E.netPm,lf:E.lf,pax:E.pax,peak:E.peak,markets:E.markets,local:E.local,perFlt,
    perTail:tailLoadStats(E),pairRows:(E.pairRows||[]).map(p=>({i:p.i,j:p.j,pax:p.pax}))};
  // Commit this year exactly once. If the player already launched this year, then
  // edited and re-launched, REPLACE the prior result rather than banking it twice.
  const seasonRec={y:e.year,pm:score,lf:E.lf,otp:E.otp,pax:E.pax,fleet:owned.length,gates:gatesOwned,rots:rots.length};
  const prior=committed[e.year];
  if(prior){ cumPm+=score-prior.score; points=points-prior.net+net;
    const ix=results.findIndex(r=>r.y===e.year); if(ix>=0)results[ix]=seasonRec; }
  else { cumPm+=score; points=Math.max(0,points+net); results.push(seasonRec); }
  committed[e.year]={score,net};
  points=Math.max(0,points);
  lastAward={year:e.year,pm:E.pm,netPm:E.netPm,lf:E.lf,gross,up,net};
  render();                                   // reveals the year just flown; calendar advances on Continue
  saveLocal();
};

$('btnExport').onclick=exportSave;
$('btnImport').onclick=()=>$('importFile').click();
$('importFile').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0]; if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>importSave(String(rd.result));
  rd.onerror=()=>alert('Could not read that file.');
  rd.readAsText(f);
  e.target.value='';
});
$('btnNew').onclick=()=>{
  if(rots.length||owned.length){ if(!confirm('Start a new game? This clears your saved progress and cannot be undone.'))return; }
  clearLocal(); lastSaved=0; startGame(); applyBrand(); syncAC(); syncDest();
  renderHub(); renderFleetPanel(); render(); preview();
  $('resume').style.display='none'; $('viol').style.display='none';
};
$('btnRestartYear').onclick=restartYear;
setInterval(renderSave,15000);
