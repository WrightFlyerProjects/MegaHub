/* MegaHub · js/app/state.js — game state variables, DOM helpers ($, X), hub list, startGame, pending purchases, seg() */
/* ---------------- game state ---------------- */
let destSel='', viaSel='', lastE=null, coachOff=false;
let storageOK=true, saveT=null, lastSaved=0, lastAward=null, committed={};
let schedSort='dep', schedAsc=true, schedFilter='', schedOpen=null;
let mapView=null;            // {W,H} natural viewBox of the last-rendered map
let mapZoom=1, mapPanX=0, mapPanY=0;   // zoom factor and pan offset (in natural viewBox units)
let replOpen=null;           // id of the aircraft whose replace-picker is open
let undoStack=[], undoLabel='';   // #5 undo: snapshots taken before each mutating action
let yearStartSnap=null;           // state at the start of the year currently being played
const UNDO_MAX=20;
let airline={name:'MegaHub Airways',c1:'#2A6C99',c2:'#16283C'};
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
  owned=[];pending={};gatesOwned=0;gatesPending=0;points=START_BUDGET;cumPm=0;
  rots=[];launched=false;selCity=null;editIdx=null;results=[];acSeq=801;lastE=null;committed={};
}
const pendingList=()=>{const p=[];CATALOG.forEach(c=>{for(let i=0;i<(pending[c.t]||0);i++)p.push({t:c.t});});return p;};
const spendNow=()=>fleetCost(pendingList())+gatesPending*GATE_COST;

function seg(s,len,cls,lab,title){
  s=mod(s);let h='';const a=Math.min(len,DAY-s);
  h+=`<div class="blk ${cls}" style="left:${X(s)}%;width:${X(a)}%" title="${title||''}">${lab||''}</div>`;
  if(len>a)h+=`<div class="blk ${cls}" style="left:0;width:${X(len-a)}%" title="${title||''}">${lab||''}</div>`;
  return h;
}
