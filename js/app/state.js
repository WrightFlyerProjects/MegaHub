/* MegaHub · js/app/state.js — game state variables, DOM helpers ($, X), hub list, startGame, pending purchases, seg() */
/* ---------------- game state ---------------- */
let destSel='', viaSel='', lastE=null, coachOff=false;
let storageOK=true, saveT=null, lastSaved=0, lastAward=null, committed={};
let schedSort='dep', schedAsc=true, schedFilter='', schedOpen=null;
let mapView=null;            // {W,H} natural viewBox of the last-rendered map
let mapZoom=1, mapPanX=0, mapPanY=0;   // zoom factor and pan offset (in natural viewBox units)
let replOpen=null;           // id of the aircraft whose replace-picker is open
let undoStack=[], undoLabel='';   // #5 undo: snapshots taken before each mutating action
/* The hub the UI is showing. The engine is hub-agnostic and receives HC explicitly;
   HUB / SPOKES / dHub are display conveniences for the same hub. */
let HC=null, HUB=null, SPOKES=[], dHub={};
/* ---- the airline's hubs (v3.8) ----
   The hub being viewed lives in the working globals every tab uses (owned, rots, gatesOwned,
   gateTiers, HC/HUB/SPOKES/dHub), so each tab simply works on "this hub". Other hubs wait in
   hubStore. hubOrder lists them all in the order they were opened. */
let hubOrder=['DFW'], hubStore={}, lastHubs={};
const HUB_FEE=40;                                          // points to open a hub (plus its gates)
function setHub(code){
  // a one-hub airline re-homed directly (as before multi-hub) keeps its hub list in step
  if(hubOrder.length===1&&!hubOrder.includes(code)&&!hubStore[code]){delete hubStore[hubOrder[0]]; delete lastHubs[hubOrder[0]]; hubOrder=[code];}
  HC=makeHub(code,(hubStore[code]&&hubStore[code].band)||0); HUB=HC.ap; SPOKES=HC.spokes; dHub=HC.dHub; refreshNet();}
/* the viewed hub's knowledge of the airline's other hubs (cross-hub flying) */
function netOthers(code){const o={}; hubOrder.forEach((c,k)=>{if(c===code)return;
  const f=(HC&&c===HC.c)?owned:(hubStore[c]?hubStore[c].fleet:[]);
  o[c]={band:(hubStore[c]&&hubStore[c].band)||0,rank:k,mt:minTurnHub(f)};}); return o;}
function refreshNet(){if(!HC)return; HC.others=netOthers(HC.c); HC.rank=Math.max(0,hubOrder.indexOf(HC.c));}
setHub('DFW');
/* park the viewed hub's working state in the store */
function stashView(){if(!HC)return; const b=(hubStore[HC.c]&&hubStore[HC.c].band)||0;
  hubStore[HC.c]={gates:gatesOwned,tiers:gateTiers,fleet:owned,rots,band:b}; lastHubs[HC.c]=lastE;}
/* bring a hub into the working state (no other side effects) */
function loadView(code){const h=hubStore[code]; setHub(code); gatesOwned=h.gates; gateTiers=h.tiers; owned=h.fleet; rots=h.rots; lastE=lastHubs[code]||null;}
/* switch the view to another hub */
function viewHub(code){
  if(!hubStore[code]&&!(HC&&code===HC.c))return; if(HC&&code===HC.c)return;
  stashView(); loadView(code);
  editIdx=null; selCity=null; destSel=''; viaSel=''; pending={}; gatesPending=0; tierPend={H:0,I:0}; mktCity=null;
  mapZoom=1; mapPanX=0; mapPanY=0;
}
/* run fn with another hub temporarily in the working state, then restore the view */
function withHub(code,fn){if(code===HC.c)return fn(); const back=HC.c; stashView(); loadView(code);
  try{return fn();}finally{stashView(); loadView(back);}}
/* every hub, current data, with its engine context */
function allHubs(){stashView(); return hubOrder.map(c=>({c,...hubStore[c],H:makeHub(c,hubStore[c].band||0)}));}
/* every hub, each context aware of the others (for cross-hub flying) */
function netHubs(){const hs=allHubs(); withOthers(hs.map(h=>h.H),hs.map(h=>h.fleet)); return hs;}
const netList=hs=>hs.map(h=>({H:h.H,rots:h.rots,fleet:h.fleet}));
/* a hub's fleet for gate purposes: its own aircraft plus other hubs' aircraft visiting it */
const vFleetOf=(c,hs)=>{hs=hs||netHubs(); const h=hs.find(x=>x.c===c); return h.fleet.concat(visitsAt(netList(hs),c));};
const vFleet=()=>{if(hubOrder.length<2)return owned; return vFleetOf(HC.c);};
const allTails=()=>allHubs().flatMap(h=>h.fleet.map(a=>a.id));
const airUpkeep=()=>allHubs().reduce((s,h)=>s+upkeepPts(h.fleet,h.gates,h.tiers),0);
/* one evaluation of the whole airline (hubs share connecting demand), cached until anything changes */
let _airE=null,_airSig='';
function airEval(){
  const hs=netHubs();
  const sig=YEAR+'|'+JSON.stringify(hs.map(h=>[h.c,h.band,h.gates,h.fleet.map(a=>a.id+'/'+a.t+'/'+(a.pair||'')),h.rots.map(r=>[r.ac,r.dst,r.via,r.dep,r.turn,r.pad||0,r.dur])]));
  if(_airE&&sig===_airSig)return _airE;
  const res=hs.length===1?[evaluate(hs[0].rots,hs[0].fleet,hs[0].gates,hs[0].H)]
    :evaluateMulti(hs.map(h=>({rots:h.rots,fleet:vFleetOf(h.c,hs),gates:h.gates,H:h.H})));
  const byHub={}; hs.forEach((h,k)=>byHub[h.c]=res[k]);
  const sum=k=>res.reduce((a,E)=>a+E[k],0), nR=hs.reduce((a,h)=>a+h.rots.length,0);
  const total={netPm:sum('netPm'),pm:sum('pm'),pax:sum('pax'),seatMi:sum('seatMi'),emptyMi:sum('emptyMi'),
    otp:nR?res.reduce((a,E,k)=>a+E.otp*hs[k].rots.length,0)/nR:1, rots:nR};
  total.lf=total.seatMi>0?total.pm/total.seatMi:0;
  /* with cross-hub flying a hub can sell seats another hub flies, so the airline's net is taken
     from its totals (exact); per-hub nets are attributions */
  if(hs.some(h=>h.rots.some(r=>crossHub(r,h.H)))){total.emptyMi=Math.max(0,total.seatMi-total.pm); total.netPm=total.pm-EMPTY_W*total.emptyMi;}
  if(hs.length===1){total.lf=res[0].lf; total.otp=res[0].otp;}              // one hub: exactly its own figures
  _airE={byHub,total,hubs:hs}; _airSig=sig; return _airE;
}
const evalView=()=>airEval().byHub[HC.c];
const hubViol=c=>{const h=hubStore[c]; return h?scheduleViolations(h.rots,vFleetOf(c),h.gates,h.tiers):[];};
let yearStartSnap=null;           // state at the start of the year currently being played
const UNDO_MAX=20;
let airline={name:'MegaHub Airways',c1:'#2A6C99',c2:'#16283C'};
let gateTiers={H:0,I:0}, tierPend={H:0,I:0}, tierNotice=null;   // gates upfit to Heavy / International (of gatesOwned), pending upfits
let owned=[], pending={}, gatesOwned=0, gatesPending=0, points=0, cumPm=0,
    rots=[], launched=false, selCity=null, editIdx=null, results=[], acSeq=801;
const $=id=>document.getElementById(id);
const X=t=>(t/DAY)*100;
const qcls=v=>v>=.72?'q-hi':v>=.45?'q-md':'q-lo';
const pcls=v=>v>=.72?'p-hi':v>=.45?'p-md':'p-lo';
const MCTg=()=>mctFor(gatesOwned);
const HUBS=['DFW','ORD','ATL','DEN','IAH','MSP','DTW','STL','CVG','PIT','CLT','SLC','PHX','LAX','JFK','MIA','RDU','DCA'];

function startGame(){
  setYear(YEAR_MIN); hubOrder=['DFW']; hubStore={}; lastHubs={}; setHub('DFW');
  owned=[];pending={};gatesOwned=0;gatesPending=0;points=START_BUDGET;cumPm=0;gateTiers={H:0,I:0};tierPend={H:0,I:0};tierNotice=null;
  rots=[];launched=false;selCity=null;editIdx=null;results=[];acSeq=801;lastE=null;committed={};
}
/* A 2-day line dissolves by itself once it no longer needs to be one: no trip longer than a day
   left, and each aircraft's own flying fits in its own day again. */
function dissolvePairs(){
  const mt=minTurnHub(owned);
  owned.forEach(a=>{
    if(!isLead(a))return; const b=owned.find(x=>x.id===a.pair);
    if(!b||b.t!==a.t){delete a.pair; if(b&&b.pair===a.id)delete b.pair; return;}
    if(rots.some(r=>(r.ac===a.id||r.ac===b.id)&&r.dur+mt>DAY))return;
    const solo=owned.map(x=>(x.id===a.id||x.id===b.id)?{...x,pair:undefined}:x);
    const turn=scheduleViolations(rots,solo,gatesOwned).some(v=>v.kind==='turn'&&(v.ac===a.id||v.ac===b.id));
    const overlap=[a.id,b.id].some(id=>{const rs=acRots(rots,id);
      return rs.length>1&&Math.abs(rs.reduce((s,r,i)=>s+r.dur+mod(rs[(i+1)%rs.length].dep-r.arr),0)-DAY)>1;});
    if(!turn&&!overlap){delete a.pair; delete b.pair;}
  });
}
const pendingList=()=>{const p=[];CATALOG.forEach(c=>{for(let i=0;i<(pending[c.t]||0);i++)p.push({t:c.t});});return p;};
const tierNext=()=>({H:gateTiers.H+tierPend.H,I:gateTiers.I+tierPend.I});
const stdFree=()=>gatesOwned+gatesPending-tierNext().H-tierNext().I;   // standard gates left to upfit
const spendNow=()=>fleetCost(pendingList())+gatesPending*GATE_COST+upfitCost(gateTiers,tierNext());

function seg(s,len,cls,lab,title){
  s=mod(s);let h='';const a=Math.min(len,DAY-s);
  h+=`<div class="blk ${cls}" style="left:${X(s)}%;width:${X(a)}%" title="${title||''}">${lab||''}</div>`;
  if(len>a)h+=`<div class="blk ${cls}" style="left:0;width:${X(len-a)}%" title="${title||''}">${lab||''}</div>`;
  return h;
}
