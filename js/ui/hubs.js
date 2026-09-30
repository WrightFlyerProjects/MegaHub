/* MegaHub · js/ui/hubs.js — multi-hub UI: hub switcher, Hubs panel (open / view / close), moving idle aircraft between hubs */
let newHubPick=null, newHubGates=2;

/* violations for any hub, using live data for the one being viewed */
const hubProblems=c=>c===HC.c?scheduleViolations(rots,vFleet(),gatesOwned,gateTiers):hubViol(c);

function renderHubSwitch(){
  const el=$('hubsw'); if(!el)return;
  if(hubOrder.length<2){el.innerHTML='';el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=hubOrder.map(c=>`<button type="button" data-viewhub="${c}" class="${c===HC.c?'on':''}" title="${A[c].n}${hubProblems(c).length?' — schedule needs fixing':''}">${c}${hubProblems(c).length?' <span class="hw">⚠</span>':''}</button>`).join('');
}

function renderHubsPanel(){
  const el=$('hubsPanel'); if(!el)return;
  const hs=allHubs(), avail=HUBS.filter(c=>!hubOrder.includes(c));
  if(!avail.includes(newHubPick))newHubPick=avail[0]||null;
  const g=Math.max(1,newHubGates), cost=HUB_FEE+g*GATE_COST;
  /* opening a hub where your other hubs already fly turns those flights into trunks, which then use its gates */
  let preNote='';
  if(newHubPick){const hs2=allHubs().map(h=>({H:makeHub(h.c,h.band||0),rots:h.rots,fleet:h.fleet}));
    const X={H:makeHub(newHubPick,9),rots:[],fleet:[]}; withOthers([...hs2,X].map(h=>h.H),[...hs2,X].map(h=>h.fleet));
    const vis=visitsAt([...hs2,X],newHubPick);
    if(vis.length){const cur=gateCurve([],vis), tc=gateTierCurves([],vis), pk=Math.max(...cur), nI=Math.max(0,...tc.i), nH=Math.max(0,...tc.h);
      const from=[...new Set(vis.map(v=>v.visit))].join(' and ');
      preNote=`<div class="note" style="color:var(--amber)">${from} already fl${from.includes(' and ')?'y':'ies'} to ${newHubPick}: ${vis.reduce((a,v)=>a+v.visitIv.length,0)} visits a day. Those become trunks and use ${newHubPick}'s gates — up to ${pk} at once${nH?`, ${nH} needing a heavy gate${nI?` (${nI} international)`:''}`:''}.</div>`;}}
  const rows=hs.map(h=>`<tr class="${h.c===HC.c?'hubon':''}" title="${A[h.c].n} · flight numbers ${h.band?h.band+'100–'+h.band+'999':'100–999'}">
      <td><b>${h.c}</b></td><td>${h.fleet.length} ac</td>
      <td>${h.gates} gates${h.tiers.H||h.tiers.I?` <span style="color:var(--ink3)">${h.tiers.H}H·${h.tiers.I}I</span>`:''}</td>
      <td>${h.c===HC.c?'<span style="color:var(--ink3)">viewing</span>':`<span class="x" data-viewhub="${h.c}">view</span>`}${hs.length>1&&!h.fleet.length?` · <span class="x" data-closehub="${h.c}" title="no aircraft based here">close</span>`:''}</td></tr>`).join('');
  el.innerHTML=`<h2>Hubs <em>${hs.length===1?'one hub':hs.length+' hubs'}</em></h2>
    <div class="tscroll"><table class="fptab">${rows}</table></div>
    ${avail.length&&hubOrder.length<10?`<div class="openhub">
      <label for="newHubSel">Open a new hub</label>
      <select id="newHubSel">${avail.map(c=>`<option value="${c}"${c===newHubPick?' selected':''}>${c} — ${A[c].n}</option>`).join('')}</select>
      <div class="openrow"><span>Gates</span><span class="stepper"><span data-nhm="1">−</span><span class="n">${g}</span><span data-nhp="1">+</span></span>
        <button id="openHub" ${cost>points?'disabled':''}>Open ${newHubPick||''} · ${cost} pts</button></div>
      ${preNote}<div class="note">${HUB_FEE} pts to open plus ${GATE_COST} per gate${cost>points?` · you have ${points}`:''}. Each hub runs its own schedule; connecting passengers between two cities are shared, so hubs compete for them. Aircraft are bought at the hub you're viewing, and idle ones can move between hubs from the roster.</div>
    </div>`:''}`;
}

function afterHubChange(){syncAC();syncDest();renderHub();renderFleetPanel();render();preview();}
function openHub(code,g){
  const cost=HUB_FEE+g*GATE_COST; if(!code||cost>points||hubOrder.includes(code))return;
  pushUndo('open hub '+code);
  stashView();
  const used=new Set(hubOrder.map(c=>hubStore[c].band||0)); let band=1; while(used.has(band))band++;
  hubStore[code]={gates:g,tiers:{H:0,I:0},fleet:[],rots:[],band}; lastHubs[code]=null;
  hubOrder.push(code); points-=cost;
  viewHub(code); afterHubChange();
}
function closeHub(code){
  const h=code===HC.c?{fleet:owned}:hubStore[code]; if(!h||h.fleet.length||hubOrder.length<2)return;
  if(!confirm(`Close ${code}? Its ${code===HC.c?gatesOwned:hubStore[code].gates} gates are given up, with no refund.`))return;
  pushUndo('close hub '+code);
  if(code===HC.c)viewHub(hubOrder.find(c=>c!==code));
  hubOrder=hubOrder.filter(c=>c!==code); delete hubStore[code]; delete lastHubs[code];
  afterHubChange();
}
/* an idle, unpaired aircraft can be based at another hub */
function rebase(id,to){
  const a=owned.find(x=>x.id===id); if(!a||a.pair||rots.some(r=>r.ac===id)||!hubStore[to])return;
  pushUndo(`move ${id} to ${to}`);
  owned.splice(owned.indexOf(a),1); hubStore[to].fleet.push(a);
  afterHubChange();
}

document.addEventListener('click',e=>{
  const t=e.target, at=k=>t.closest&&t.closest(`[${k}]`)&&t.closest(`[${k}]`).getAttribute(k);
  const v=at('data-viewhub'); if(v){viewHub(v);afterHubChange();return;}
  const cl=at('data-closehub'); if(cl){closeHub(cl);return;}
  if(at('data-nhp')){newHubGates=Math.min(MAX_GATES,newHubGates+1);renderHubsPanel();return;}
  if(at('data-nhm')){newHubGates=Math.max(1,newHubGates-1);renderHubsPanel();return;}
  if(t.id==='openHub'){openHub(newHubPick,Math.max(1,newHubGates));return;}
});
document.addEventListener('change',e=>{
  if(e.target.id==='newHubSel'){newHubPick=e.target.value;renderHubsPanel();return;}
  const id=e.target.getAttribute&&e.target.getAttribute('data-rebase');
  if(id&&e.target.value)rebase(id,e.target.value);
});
