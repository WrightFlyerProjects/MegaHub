/* MegaHub · js/engine/rotation.js — one-stop circuity tax, trip geometry (tripOf / shape) */
/* one-stop tax: circuity of hub->via->dst against the nonstop */
function thruMult(via,dst,H){
  const direct=H.dHub[dst], circ=(H.dHub[via]+dPair[via+dst])/direct;
  const tol=0.18+0.00022*direct;
  return THRU_TAX/(1+Math.pow(Math.max(0,circ-1)/tol,2));
}

/* ---- trips (v3.19) ----
   A rotation is one hub-to-hub trip: it leaves its hub, calls at any stops, and ends at a hub.
   General form: r.stops = [{c, g, thru}, …, {c: end hub}] — g = minutes on the ground at that stop,
   thru = the aircraft continues as the same flight (a "via" stop: through passengers stay aboard).
   The classic forms are the two simplest trips and are converted on the fly, so saves keep them:
     out-and-back  {dst, turn}       → [{c:dst, g:turn}, {c:hub}]
     via           {dst, via, turn}  → [{c:via, g:tv, thru}, {c:dst, g:turn}, {c:via, g:tv, thru}, {c:hub}]
   (tv = the via stop's ground time, max(VIA_TURN, the stop's turn) — recomputed every time, as before).
   Times accumulate leg by leg exactly as the classic shapes did, so results are unchanged to the bit. */
function tripStops(r,ac,H){
  if(r.stops)return r.stops;
  if(!r.via)return [{c:r.dst,g:r.turn},{c:H.c}];
  const tv=Math.max(VIA_TURN,turnAt(r.via,ac,H));        // a stop at another of your hubs takes that hub's turn
  return [{c:r.via,g:tv,thru:true},{c:r.dst,g:r.turn},{c:r.via,g:tv,thru:true},{c:H.c}];
}
/* the trip's label destination: its last turnaround stop (the classic r.dst) */
const tripVia=T=>T.stops[0].thru?T.stops[0].c:null;   // the stop the outbound flight continues through (classic r.via)
const tripDst=st=>{for(let k=st.length-2;k>=0;k--)if(!st[k].thru)return st[k].c; return st[st.length-1].c;};
function tripOf(r,ac,H){
  const st=tripStops(r,ac,H), pad=r.pad||0, n=st.length, legs=[];
  let t=r.dep, at=r.from||H.c;                           // v3.20: a trip may start at another of your hubs
  for(let k=0;k<n;k++){
    const blk=legBlock(at,st[k].c,ac)+(k===0||k===n-1?pad:0);   // padding sits on the two hub legs
    const arr=t+blk;
    legs.push({k,a:at,b:st[k].c,t:blk,dep:t,arr});
    if(k<n-1)t=arr+st[k].g;
    at=st[k].c;
  }
  /* duration: the classic out-and-back summed its parts (out + back + turn); everything else counts
     the clock forward. Both kept, so float arithmetic matches earlier versions exactly. */
  const dur=n===2?legs[0].t+legs[1].t+st[0].g:legs[n-1].arr-r.dep;
  return {stops:st,legs,dur,dst:tripDst(st),end:st[n-1].c};
}
/* geometry of a rotation — legs + classic marks (depHub, arrDst, depDst, arrHub; via: arrVia, depVia,
   arrVia2, depVia2), which the board and terminal read */
function shape(r,ac,H){
  const T=tripOf(r,ac,H), L=T.legs, n=L.length;
  let marks;
  if(!r.stops&&r.via)marks={depHub:r.dep,arrVia:L[0].arr,depVia:L[1].dep,arrDst:L[1].arr,depDst:L[2].dep,arrVia2:L[2].arr,depVia2:L[3].dep,arrHub:L[3].arr};
  else if(!r.stops)marks={depHub:r.dep,arrDst:L[0].arr,depDst:L[1].dep,arrHub:L[1].arr};
  else{const k=T.stops.findIndex(s=>s.c===T.dst); marks={depHub:r.dep,arrDst:L[k].arr,depDst:(L[k+1]||L[k]).dep,arrHub:L[n-1].arr};}
  const out={legs:L.map(l=>({a:l.a,b:l.b,t:l.t})),dur:T.dur,marks};
  Object.defineProperty(out,'trip',{value:T,enumerable:false});     // the full trip, for engine callers
  return out;
}
const rotDur=(r,ac,H)=>shape(r,ac,H).dur;
/* labels that need no hub context: the trip's destination and the last stop before it gets home */
const rotDst=r=>r.stops?tripDst(r.stops):r.dst;
/* v3.20 — where a trip starts and ends: null = the aircraft's home hub (every classic rotation) */
const tripFrom=r=>r.from||null;
const tripEndAt=(r,home)=>{if(!r.stops)return null; const e=r.stops[r.stops.length-1].c; return e===home?null:e;};
const awayEnd=r=>r.endAt||null;                      // derived, stored on the rotation by tripMeta()
/* the flights of a trip: legs joined through "thru" stops form one flight; every other stop ends one */
function tripSegs(T){const segs=[]; let cur=[];
  T.legs.forEach((l,k)=>{cur.push(k); if(k===T.legs.length-1||!T.stops[k].thru){segs.push(cur); cur=[];}});
  return segs;}
/* a trip that starts and ends at the same hub with no other hub in between: that hub; else null */
function loopHub(r,H){const from=r.from||H.c, st=r.stops||null;
  if(!st)return isOwnHub(r.dst,H)||isOwnHub(r.via,H)?null:H.c;
  if(st[st.length-1].c!==from)return null;
  for(let k=0;k<st.length-1;k++)if(st[k].c===H.c||isOwnHub(st[k].c,H))return null;
  return from;}
/* derived fields every rotation carries: b (first block), dur, arr (hub clock), endAt (hub it ends at, if not home) */
function tripMeta(r,ac,H){const sh=shape(r,ac,H); r.b=sh.legs[0].t; r.dur=sh.dur; r.arr=mod(r.dep+sh.dur);
  const e=tripEndAt(r,H.c); if(e)r.endAt=e; else delete r.endAt; return r;}
const lastStop=r=>r.stops?(r.stops.length>1?r.stops[r.stops.length-2].c:(r.from||null)):(r.via||r.dst);   // a one-leg hub-to-hub trip came from where it started
