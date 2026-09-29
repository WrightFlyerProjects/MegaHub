// Engine golden master. Loads js/data + js/engine (in index.html order) into a Node VM — no browser, no DOM —
// restores every game state in a save (the save itself + its start-of-year checkpoint) and dumps all engine outputs.
// usage: node tools/engine_gm.js <build-dir> <save.json> [out.json]
// Same save + same engine => same sha256. Any engine refactor must reproduce it exactly.
const fs=require('fs'), vm=require('vm'), crypto=require('crypto'), path=require('path');
const [,,dir='.',savePath,outPath]=process.argv;
if(!savePath){console.error('usage: node tools/engine_gm.js <build-dir> <save.json> [out.json]');process.exit(1);}
const files=[...fs.readFileSync(path.join(dir,'index.html'),'utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>m[1])
  .filter(f=>/^js\/(data|engine)\//.test(f));
const src=files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const save=JSON.parse(fs.readFileSync(savePath,'utf8'));
const states=[['current',save]]; if(save.yearStartSnap)states.push(['yearStart',JSON.parse(save.yearStartSnap)]);
const harness=`
function runState(s){
  setHub(s.hub); setStartYear(s.startYear); setYear(s.year);
  const owned=[]; s.fleet.forEach(f=>{const c=CATALOG.find(x=>x.t===f.t); if(c)owned.push({id:f.id,...c});});
  const mk=(acId,dst,via,dep,turn)=>{const ac=owned.find(a=>a.id===acId), sh=shape({dst,via,dep,turn},ac);
    return {ac:acId,dst,via:via||null,dep:mod(dep),turn,b:sh.legs[0].t,dur:sh.dur,arr:mod(dep+sh.dur)};};
  const rots=[], dropped=[];
  s.rots.forEach(r=>{const err=validate(rots,owned,s.gatesOwned,r.ac,r.dst,r.dep,r.turn,r.via||null);
    if(err){dropped.push([r,err]);return;} rots.push(mk(r.ac,r.dst,r.via||null,r.dep,r.turn));});
  const E=evaluate(rots,owned,s.gatesOwned);
  return {dropped,rots,E,viol:scheduleViolations(rots,owned,s.gatesOwned),
    repair:repairSchedule(rots,owned,s.gatesOwned),delay:delayMap(rots,owned),
    gates:gateAssign(rots,owned,s.gatesOwned),
    free:owned.map(a=>freeWindows(rots,owned,a.id)),
    pts:{gross:grossPts(Math.max(0,E.netPm)),up:upkeepPts(owned,s.gatesOwned),
      trade:CATALOG.map(c=>tradeInValue(c.t)),mct:mctFor(s.gatesOwned),turn:minTurnHub(owned)},
    era:era(),avail:availTypes().map(c=>c.t)};
}`;
const ctx={}; vm.createContext(ctx);
vm.runInContext(src+'\n'+harness+'\nthis.runState=runState;',ctx);
const out={}; states.forEach(([k,s])=>out[k]=ctx.runState(s));
const json=JSON.stringify(out);
if(outPath)fs.writeFileSync(outPath,json);
for(const [k] of states){const E=out[k].E;
  console.log(k.padEnd(9),'rots',out[k].rots.length,'dropped',out[k].dropped.length,'netPm',Math.round(E.netPm),'pax',Math.round(E.pax),'LF',E.lf.toFixed(4),'otp',E.otp.toFixed(4),'flights',E.flights.length);}
console.log('sha256',crypto.createHash('sha256').update(json).digest('hex'));
