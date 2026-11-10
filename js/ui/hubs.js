/* MegaHub · js/ui/hubs.js — multi-hub UI: hub switcher, Hubs panel (open / view / close), moving idle aircraft between hubs */
let newHubPick=null, newHubGates=2, newHubOpen=false;   // the open-a-hub section starts folded away

/* violations for any hub, using live data for the one being viewed */
const hubProblems=c=>c===HC.c?scheduleViolations(rots,vFleet(),gatesOwned,gateTiers,HC):hubViol(c);

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
  const rows=hs.map(h=>`<tr class="${h.c===HC.c?'hubon':''}" title="${A[h.c].n}">
      <td><b>${h.c}</b></td><td>${h.fleet.length} ac</td>
      <td>${h.gates} gates${h.tiers.H||h.tiers.I?` <span style="color:var(--ink3)">${h.tiers.H}H·${h.tiers.I}I</span>`:''}</td>
      <td>${h.c===HC.c?'<span style="color:var(--ink3)">viewing</span>':`<span class="x" data-viewhub="${h.c}">view</span>`}${hs.length>1&&!h.fleet.length?` · <span class="x" data-closehub="${h.c}" title="no aircraft based here">close</span>`:''}</td></tr>`).join('');
  el.innerHTML=`<h2>Hubs <em>${hs.length===1?'one hub':hs.length+' hubs'}</em></h2>
    <div class="tscroll"><table class="fptab">${rows}</table></div>
    ${avail.length&&hubOrder.length<10?`<details class="openhub" id="openHubBox"${newHubOpen?' open':''}>
      <summary>Open a new hub</summary>
      <select id="newHubSel">${avail.map(c=>`<option value="${c}"${c===newHubPick?' selected':''}>${c} — ${A[c].n}</option>`).join('')}</select>
      <div class="hubopenrow"><span>Gates</span><span class="stepper"><span data-nhm="1">−</span><span class="n">${g}</span><span data-nhp="1">+</span></span>
        <button id="openHub" ${cost>points?'disabled':''}>Open ${newHubPick||''} · ${cost} pts</button></div>
      ${preNote}<div class="note">${HUB_FEE} pts to open plus ${GATE_COST} per gate${cost>points?` · you have ${points}`:''}. Each hub runs its own schedule; connecting passengers between two cities are shared, so hubs compete for them. Aircraft are bought at the hub you're viewing, and idle ones can move between hubs from the roster.</div>
    </details>`:''}`;
}

/* v3.23 airport projects at the hub being viewed: runways, concourses, ground handling */
function projectsHTML(c){
  const x=infraOf(c), pend=projPending(c), press=hubDepPressure(rots), peak=rots.length?Math.max(...press):0, free=hubFree(c);
  const dots=(k)=>{const mx=projMax(c,k), open=x[k]||0, n=projLevel(c,k);
    return Array.from({length:PROJECTS[k].max},(_,i)=>`<i class="pdot${i<open?' on':i<n?' wip':''}${i>=mx?' na':''}"></i>`).join('');};
  const rowsP=Object.keys(PROJECTS).map(k=>{const P=PROJECTS[k], mx=projMax(c,k), n=projLevel(c,k), cost=projCost(c,k), w=pend.filter(p=>p.k===k).length;
    const status=mx===0?`<span class="pno">no room to build at ${c}</span>`:n>=mx?`<span class="pok">${w?'complete when it opens':'built'}</span>`
      :`<button type="button" class="pbuy" data-buyproj="${k}" ${cost>points?'disabled':''} title="${cost>points?`you have ${points} pts`:`opens in ${YEAR+1}`}">Build · ${cost} pts</button>`;
    return `<div class="prow"><div class="ph"><b>${P.name}</b><span class="pdots" aria-label="${x[k]||0} of ${P.max} open">${dots(k)}</span>${status}</div>
      <div class="pw">${P.what}.${w?` <span class="pwip">${w>1?w+' under':'Under'} construction — opens ${YEAR+1}.</span>`:''} Upkeep ${P.upkeep} pts/yr once open${k==='conc'&&NO_RUNWAY.has(c)?` · costs more at ${c} (tight site)`:''}.</div></div>`;}).join('');
  return `<div class="projbox"><h2 class="projh">Airport projects <em>${c} — ${A[c].n}</em>${superHub(c)?'<span class="superhub">Super hub</span>':''}</h2>
    <div class="pcap"><span><b>${free}</b> departures / 30 min before delays build${rots.length?` · busiest: <b style="color:${peak>free?'var(--red)':'inherit'}">${peak}</b>`:''}</span>
      <span>gate cap <b>${maxGatesAt(c)}</b></span><span>handling <b>${x.hand?'upgraded':'standard'}</b></span></div>
    ${rowsP}<div class="note">Projects are built over the winter: bought in ${YEAR}, open for ${YEAR+1}.</div></div>`;
}
function renderProjPanel(){const el=$('projPanel'); if(el&&HC)el.innerHTML=projectsHTML(HC.c);}
function buyProject(c,k){
  const cost=projCost(c,k); if(cost>points||projLevel(c,k)>=projMax(c,k))return;
  if(!confirm(`Build ${PROJECTS[k].name.toLowerCase()} at ${c} for ${cost} points? It opens in ${YEAR+1}.`))return;
  pushUndo(`${PROJECTS[k].name.toLowerCase()} at ${c}`);
  stashView(); hubStore[c].proj=projOf(c).concat([{k,y:YEAR}]);
  points-=cost; logPts(`${PROJECTS[k].name.toLowerCase()} at ${c} (opens ${YEAR+1})`,-cost);
  renderHub(); renderFleetPanel(); render(); saveLocal();
}
function afterHubChange(){syncAC();syncDest();renderHub();renderFleetPanel();render();preview();}
function openHub(code,g){
  const cost=HUB_FEE+g*GATE_COST; if(!code||cost>points||hubOrder.includes(code))return;
  pushUndo('open hub '+code);
  stashView();
  const used=new Set(hubOrder.map(c=>hubStore[c].band||0)); let band=1; while(used.has(band))band++;
  hubStore[code]={gates:g,tiers:{H:0,I:0},fleet:[],rots:[],band}; lastHubs[code]=null;
  hubOrder.push(code); points-=cost; logPts(`opened ${code} hub with ${g} gates`,-cost);
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
  if(hubStore[to].fleet.some(x=>x.id===id)){alert(`${to} already has an aircraft numbered ${id}.`);return;}   // can't happen with unique tails; never lose an aircraft
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
  const bp=at('data-buyproj'); if(bp){buyProject(HC.c,bp);return;}
});
document.addEventListener('change',e=>{
  if(e.target.id==='newHubSel'){newHubPick=e.target.value;renderHubsPanel();return;}
  const id=e.target.getAttribute&&e.target.getAttribute('data-rebase');
  if(id&&e.target.value)rebase(id,e.target.value);
});
document.addEventListener('toggle',e=>{if(e.target.id==='openHubBox')newHubOpen=e.target.open;},true);
