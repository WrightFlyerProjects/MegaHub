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
function setHub(code){HC=makeHub(code); HUB=HC.ap; SPOKES=HC.spokes; dHub=HC.dHub;}
setHub('DFW');
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
const HUBS=['DFW','ORD','ATL','DEN','IAH','MSP','DTW','STL','CVG','PIT','CLT','SLC','PHX','LAX','JFK','MIA','RDU'];

function startGame(){
  setYear(YEAR_MIN); setHub('DFW');
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
