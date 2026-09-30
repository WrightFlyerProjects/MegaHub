/* MegaHub · js/engine/network.js — cross-hub flying (v3.9): another of the airline's hubs as a rotation's stop or destination */

/* A hub context may carry H.others = {code:{band, mt, rank, press}} — the airline's OTHER hubs:
   their flight-number band, minimum hub turn, order (rank), and (during evaluation) departure
   pressure. Without H.others every rotation is an ordinary spoke rotation, exactly as before. */
const isOwnHub=(c,H)=>!!(c&&H&&H.others&&H.others[c]);
const crossHub=(r,H)=>isOwnHub(r.dst,H)||isOwnHub(r.via,H);
const hubBandOf=(c,H)=>c===H.c?(H.band||0):((H.others[c]&&H.others[c].band)||0);
/* minimum ground time at a city: a visited hub imposes its own hub turn */
const turnAt=(c,ac,H)=>isOwnHub(c,H)?Math.max(turnMin(c,ac),H.others[c].mt):turnMin(c,ac);

/* give every hub context in a list knowledge of the others (fleets optional, for hub turns) */
function withOthers(Hs,fleets){
  Hs.forEach((H,k)=>{H.rank=k; H.others={};
    Hs.forEach((X,j)=>{if(X.c!==H.c)H.others[X.c]={band:X.band||0,rank:j,mt:minTurnHub((fleets&&fleets[j])||[])};});});
  return Hs;
}

/* Every leg of a rotation: endpoints, block, departure/arrival (home-hub clock), which hub owns it
   (the hub it departs, else the hub it arrives), and its flight number. A cross-hub rotation's
   legs are separate flights — nobody rides through an intermediate spoke to another hub. */
function legPlan(r,ac,H){
  const sh=shape(r,ac,H), m=sh.marks;
  const T=r.via?[[m.depHub,m.arrVia],[m.depVia,m.arrDst],[m.depDst,m.arrVia2],[m.depVia2,m.arrHub]]
               :[[m.depHub,m.arrDst],[m.depDst,m.arrHub]];
  const hubAt=c=>c===H.c||isOwnHub(c,H);
  const legs=sh.legs.map((l,k)=>({k,a:l.a,b:l.b,t:l.t,dep:T[k][0],arr:T[k][1],aHub:hubAt(l.a),bHub:hubAt(l.b)}));
  legs.forEach(l=>{l.owner=l.aHub?l.a:l.b;});
  /* each hub numbers the flights it owns; the two directions between a hub and a city pair up odd/even */
  legs.forEach(l=>{const o=l.owner, x=o===l.a?l.b:l.a, dir=o===l.a?'out':'ret';
    const outLeg=legs.find(q=>q.a===o&&q.b===x)||l;
    l.no=flightNo(o,x,mod(outLeg.dep+tzD(o,H)),null,dir,hubBandOf(o,H));});
  return legs;
}

/* Aircraft from other hubs that spend time on the ground at `code`, as pseudo-aircraft carrying
   their ground intervals (visitIv) — gate curves, tiers and parking treat them like any stay. */
function visitsAt(list,code){
  const out=[];
  list.forEach(h=>{ if(h.H.c===code)return;
    h.rots.forEach((r,ri)=>{ if(!crossHub(r,h.H))return; const ac=h.fleet.find(a=>a.id===r.ac); if(!ac)return;
      const legs=legPlan(r,ac,h.H), iv=[];
      legs.forEach((l,k)=>{const nx=legs[k+1];
        if(l.b===code&&nx&&nx.a===code)iv.push({start:Math.round(mod(l.arr+tzD(code,h.H))),len:Math.round(nx.dep-l.arr),from:l.a,to:nx.b,last:l.a});});
      if(iv.length)out.push({...ac,visit:h.H.c,visitRi:ri,visitIv:iv});});});
  return out;
}

/* extra delay a cross-hub rotation picks up departing another hub's bank: {out, ret} halves */
function crossCong(r,ac,H){
  if(!crossHub(r,H))return null;
  const legs=legPlan(r,ac,H), half=legs.length/2, res={out:0,ret:0};
  legs.forEach(l=>{ if(l.a===H.c||!isOwnHub(l.a,H))return;
    const P=H.others[l.a].press, p=P?P[Math.round(mod(l.dep+tzD(l.a,H)))%DAY]:0;
    res[l.k<half?'out':'ret']+=DLY_CONGEST*Math.max(0,p-DLY_CONGEST_FREE);});
  return res;
}
