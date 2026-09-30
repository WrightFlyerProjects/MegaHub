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

/* Unique flight numbers (v3.10). Each hub numbers the flights it owns within its own range
   (outbound odd, return the next even). A flight keeps the number its route hash gives it unless
   another flight of the same hub holds it — then the later departure takes the next free pair.
   Flights holding a unique number are never moved to make room, so few numbers change.
   Keys: ordinary rotation "HUB#ri#out" / "HUB#ri#ret"; cross-hub leg "HOME#ri#Lk". */
function numberFlights(list){
  const items={};
  const add=(o,pref,dep,keys,id)=>(items[o]=items[o]||[]).push({pref,dep,keys,id});
  list.forEach(h=>{const H=h.H;
    h.rots.forEach((r,ri)=>{const ac=h.fleet.find(a=>a.id===r.ac); if(!ac)return;
      if(crossHub(r,H)){const L=legPlan(r,ac,H), g={};
        L.forEach(l=>{const o=l.owner, x=o===l.a?l.b:l.a, k=o+'>'+x;
          const G=g[k]||(g[k]={o,x,keys:{},pref:null,dep:0});
          G.keys[o===l.a?'out':'ret']=H.c+'#'+ri+'#L'+l.k;
          if(G.pref==null){const ol=L.find(q=>q.a===o&&q.b===x)||l; G.dep=mod(ol.dep+tzD(o,H));
            G.pref=flightNo(o,x,G.dep,null,'out',hubBandOf(o,H));}});
        Object.values(g).forEach(G=>add(G.o,G.pref,G.dep,G.keys,H.c+'#'+ri+'#'+G.x));
      }else add(H.c,flightNo(H.c,r.dst,r.dep,r.via||null,'out',H.band||0),mod(r.dep),
                {out:H.c+'#'+ri+'#out',ret:H.c+'#'+ri+'#ret'},H.c+'#'+ri);});});
  const num=new Map();
  Object.values(items).forEach(arr=>{
    arr.sort((a,b)=>a.pref-b.pref||a.dep-b.dep||(a.id<b.id?-1:a.id>b.id?1:0));
    const used=new Set(), later=[];
    arr.forEach(it=>{if(used.has(it.pref))later.push(it); else{used.add(it.pref); it.no=it.pref;}});   // first claim keeps its number
    later.forEach(it=>{const b=Math.floor(it.pref/1000), lo=b*1000+101, hi=b*1000+999; let n=it.pref, guard=0;
      do{n+=2; if(n>hi)n=lo; guard++;}while(used.has(n)&&guard<460);
      used.add(n); it.no=n;});
    arr.forEach(it=>{if(it.keys.out)num.set(it.keys.out,it.no); if(it.keys.ret)num.set(it.keys.ret,it.no+1);});
  });
  return num;
}
