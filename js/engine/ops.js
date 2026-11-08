/* MegaHub · js/engine/ops.js — rotation validation, delay model, schedule violations + auto-repair, free windows */
function validate(rots,fleet,gates,acId,dst,dep,turn,via,skipIdx,pad,H,noLimits){   // noLimits: loading a save (limits are flagged, not dropped)
  const ac=fleet.find(a=>a.id===acId);
  if(!ac)return 'Pick an aircraft';
  if(via){
    if(via===dst)return 'The stop and the destination are the same airport';
    if(via===H.c||dst===H.c)return 'A rotation cannot stop at its own hub';
  }
  return validateTrip(rots,fleet,{ac:acId,dst,via:via||null,dep:mod(dep),turn,pad:pad||0},skipIdx,H,noLimits);
}
/* any trip, classic or general (v3.19): legs, airport limits, ground time at every stop, and fit
   in the aircraft's day (or its 2-day line). cand = a rotation object. */
function validateTrip(rots,fleet,cand,skipIdx,H,noLimits){
  const ac=fleet.find(a=>a.id===cand.ac);
  if(!ac)return 'Pick an aircraft';
  const dep=cand.dep;
  if(cand.stops){const st=cand.stops, end=st[st.length-1].c;
    if(st.length<2)return 'A trip needs at least one stop before it returns to a hub';
    if(end!==H.c&&!isOwnHub(end,H))return `A trip must end at one of your hubs — ${end} isn't`;
    for(let k=0;k<st.length-1;k++){ if(st[k].c===(k?st[k-1].c:H.c))return `${st[k].c} twice in a row`;
      if(st[k].thru&&(k===st.length-2||isOwnHub(st[k].c,H)||st[k].c===H.c))return `A through stop must be a city with more flying after it — not ${st[k].c}`;}}
  const sh=shape(cand,ac,H);
  for(const L of sh.legs){
    if(nm(A[L.a],A[L.b])<MIN_STAGE)
      return `${L.a}–${L.b} is ${Math.round(nm(A[L.a],A[L.b]))} nm — nobody flies that, they drive`;
    if(nm(A[L.a],A[L.b])>ac.rng)
      return `${ac.t} can't fly ${L.a}–${L.b} — ${Math.round(nm(A[L.a],A[L.b]))} nm exceeds ${ac.rng} nm range`;
    if((A[L.a].ocean||A[L.b].ocean)&&nm(A[L.a],A[L.b])>OCEAN_LEG&&!ac.etops)
      return `${ac.t} is not certified for extended overwater flight — it cannot fly ${L.a}–${L.b}`;
  }
  if(!noLimits){                                     // airport limits (v3.17)
    const le=limitErr(cand,ac,H); if(le)return le;
    if(dcaBeyond(cand,ac,H)&&rots.some((r,i)=>i!==skipIdx&&fleet.some(a=>a.id===r.ac&&dcaBeyond(r,a,H))))
      return dcaAllowanceMsg()+' — this hub already uses it';}
  const st=sh.trip.stops;
  for(let k=0;k<st.length-1;k++){const s=st[k];       // ground time at every stop (a through stop needs VIA_TURN too)
    const tmin=s.thru?Math.max(VIA_TURN,turnAt(s.c,ac,H)):turnAt(s.c,ac,H), g=s.g;
    if(g<tmin&&isOwnHub(s.c,H)) return `${s.c} is one of your hubs — ${ac.t} needs its ${tmin} min hub turn there`;
    if(g<tmin) return A[s.c].intl
      ? `${s.c} is a foreign station — ${ac.t} needs ${tmin} min on the ground (customs, security sweep, deep clean)`
      : `${ac.t} needs ${tmin} min on the ground at ${s.c}`;}
  if(cand.via&&cand.turn<0) return '';
  const mt=minTurnHub(fleet);
  if(ac.pair){
    if(sh.dur+mt>2*DAY)return `Rotation runs ${(sh.dur/60).toFixed(1)}h — too long even for a 2-day line`;
    cand.b=sh.legs[0].t; cand.dur=sh.dur; cand.arr=mod(dep+sh.dur);
    const line=lineItems([...rots.filter((_,i)=>i!==skipIdx),cand],cand.ac,ac.pair);
    for(const o of line){
      if(o.gap<0)return `That overlaps other flying on the ${cand.ac}–${ac.pair} 2-day line`;
      if(o.gap<mt)return `${o.next.r.ac} needs ${mt} min on the ground between rotations (has ${Math.round(o.gap)})`;
    }
    return null;
  }
  if(sh.dur+mt>DAY)return `Rotation runs ${(sh.dur/60).toFixed(1)}h — no room to turn at the hub`;
  cand.b=sh.legs[0].t; cand.dur=sh.dur; cand.arr=mod(dep+sh.dur);
  const base=rots.filter((_,i)=>i!==skipIdx);
  const all=[...base,cand], rs=acRots(all,cand.ac);
  let total=0;
  for(let i=0;i<rs.length;i++){
    const arr=rs[i].arr,nxt=rs[(i+1)%rs.length].dep;
    const gap=rs.length===1?DAY-rs[i].dur:mod(nxt-arr);
    if(gap<mt)return `${cand.ac} needs ${mt} min on the ground between rotations (has ${Math.round(gap)})`;
    total+=rs[i].dur+gap;
  }
  if(rs.length>1&&Math.abs(total-DAY)>1)return `${cand.ac}'s rotations overlap`;
  // Gate-capacity peak is intentionally NOT blocked here. Mid-build, an aircraft with only
  // its first rotation entered looks like it parks at a gate all day, throwing a false
  // over-capacity error. Real over-capacity is reported at launch (scheduleViolations),
  // which sees the finished day and can auto-repair.
  return null;
}

/* Expected arrival delay, per rotation. Slack absorbs delay; a packed aircraft
   carries the morning's delay all day. Deterministic fixed point, no dice. */
function hubDepPressure(rots,extra){
  /* departures within a +/-15-min window centred on each minute (this airline alone).
     A flight caught in a crowded bank is delayed whether it is early or late in the rush. */
  const dep=new Array(DAY).fill(0);
  rots.forEach(r=>{dep[Math.round(mod(r.dep))%DAY]++;});
  (extra||[]).forEach(t=>{dep[Math.round(mod(t))%DAY]++;});        // visiting aircraft departing this hub
  const win=new Array(DAY).fill(0);
  for(let t=0;t<DAY;t++){let c=0; for(let k=-15;k<=15;k++)c+=dep[mod(t+k)]; win[t]=c;}
  return win;
}
/* Expected minutes of delay a leg ADDS. Zero by default: a short flight pushing
   back into an uncrowded bank on an on-time aircraft is on time. Delay appears only
   when a real factor is present — a crowded departure bank, or a long leg's larger
   exposure to weather/ATC beyond a free allowance. */
function legExpDelay(a,b,pressure){
  const d=nm(A[a],A[b]);
  const exposure=DLY_PER_NM*Math.max(0,d-DLY_FREE_NM);          // long legs only
  const congest =DLY_CONGEST*Math.max(0,(pressure||0)-DLY_CONGEST_FREE); // banks over ~2 deps/30min
  return exposure+congest;                                       // can be exactly 0
}
/* one trip's delay (v3.19), walked stop by stop. d = delay the aircraft brings from its last trip.
   The hub departure adds congestion (p) and exposure; padding on the first hub leg absorbs delay so
   far. Through (via) stops are scheduled at their minimum and absorb nothing; every other stop's
   spare ground time absorbs before the next leg. The last hub leg's padding absorbs again. A trip's
   delay = the worse of its state at the first turnaround and its arrival, so a congested departure
   shows even when a long turn later recovers it. Same arithmetic order as the classic shapes. */
function tripDelay(d,r,a,H,p){
  const T=tripOf(r,a,H), L=T.legs, st=T.stops, n=L.length, pad=r.pad||0, cx=crossCong(r,a,H);
  let k=0;
  d+=legExpDelay(L[0].a,L[0].b,p); d=Math.max(0,d-pad);
  while(k<n-1&&st[k].thru){k++; d+=legExpDelay(L[k].a,L[k].b,0);}
  if(cx)d+=cx.out;
  let outbound=d;                                        // as the aircraft sits at its first turnaround
  k++;
  while(k<n){
    const s=st[k-1];
    d=Math.max(0,d-Math.max(0,s.g-turnAt(s.c,a,H)));     // spare ground time absorbs before the next leg
    let sum=0; do{sum+=legExpDelay(L[k].a,L[k].b,0); k++;}while(k<n&&st[k-1].thru);
    d+=sum;
    if(k<n)outbound=Math.max(outbound,d);                // a later turnaround (general trips only)
  }
  if(cx)d+=cx.ret;
  d=Math.max(0,d-pad);
  d=Math.min(DELAY_CAP,d);
  return {d,rec:Math.min(DELAY_CAP,Math.max(outbound,d))};
}
function delayMap(rots,fleet,H,pressIn){
  const mt=minTurnHub(fleet), out={}, press=pressIn||hubDepPressure(rots);
  fleet.forEach(a=>{
    if(a.pair){if(isLead(a))lineDelays(rots,a,H,mt,press,out);return;}
    const rs=acRots(rots,a.id); if(!rs.length)return;
    let d=0;
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<rs.length;i++){
        const prev=rs[(i-1+rs.length)%rs.length];
        // inherited delay from the previous rotation, reduced by ground slack before this one
        const gap=rs.length===1?DAY:mod(rs[i].dep-prev.arr);
        if(rs.length>1)d=Math.max(0,d-Math.max(0,gap-mt));  // hub slack absorbs inherited delay
        else d=0;                                            // a lone rotation inherits nothing
        const r=rs[i], p=press[Math.round(mod(r.dep))%DAY];
        const q=tripDelay(d,r,a,H,p); d=q.d;
        out[rots.indexOf(rs[i])]=q.rec;
      }
    }
  });
  return out;
}
/* the same delay model, walked around a 2-day line (ground slack = the line's own gaps) */
function lineDelays(rots,a,H,mt,press,out){
  const it=lineItems(rots,a.id,a.pair), n=it.length; if(!n)return;
  let d=0;
  for(let pass=0;pass<3;pass++){
    for(let k=0;k<n;k++){
      const o=it[k], r=o.r, gap=it[(k-1+n)%n].gap;
      if(n>1)d=Math.max(0,d-Math.max(0,gap-mt)); else d=0;
      const p=press[Math.round(mod(r.dep))%DAY];
      const q=tripDelay(d,r,a,H,p); d=q.d;
      out[o.i]=q.rec;
    }
  }
}
const otpOf=d=>1/(1+d/90);                     // local passengers dislike a late airline
/* probability a connection actually connects. Slack = minutes beyond the minimum connect time
   after inbound delay. On time at exactly the minimum: 79% (was 21% — the minimum is, by
   definition, a connection the airline expects to make). */
const pMake=slack=>1/(1+Math.exp(-(slack+8)/6));

/* Every rotation must still be legal after the fleet changes.
   Buying a third aircraft type lengthens the hub turn and can strand old rotations. */
function scheduleViolations(rots,fleet,gates,tiers,H){          // H given → airport limits are checked too (v3.17)
  const v=[], mt=minTurnHub(fleet);
  fleet.forEach(a=>{
    if(a.pair){if(isLead(a))lineItems(rots,a.id,a.pair).forEach(o=>{
        if(o.gap<mt-0.5)v.push({kind:'turn',ac:o.next.r.ac,idx:o.next.i,need:mt,have:Math.max(0,Math.round(o.gap)),overlap:o.gap<0,dst:rotDst(o.next.r)});});
      return;}
    const rs=acRots(rots,a.id); if(!rs.length)return;
    for(let i=0;i<rs.length;i++){
      const arr=rs[i].arr, nxt=rs[(i+1)%rs.length].dep;
      const gap=rs.length===1?DAY-rs[i].dur:mod(nxt-arr);
      if(gap<mt-0.5) v.push({kind:'turn',ac:a.id,idx:rots.indexOf(rs[(i+1)%rs.length]),
        need:mt,have:Math.round(gap),dst:rotDst(rs[(i+1)%rs.length])});
    }
  });
  const peak=rots.length?Math.max(...gateCurve(rots,fleet)):0;
  if(peak>gates) v.push({kind:'gates',peak,gates});
  tierViolations(rots,fleet,tiers).forEach(x=>v.push(x));
  if(H){rots.forEach((r,i)=>{const ac=fleet.find(a=>a.id===r.ac); if(!ac)return; const msg=limitErr(r,ac,H);
      if(msg)v.push({kind:'limit',idx:i,ac:r.ac,dst:rotDst(r),via:r.via||null,msg});});
    dcaOverflow(rots,fleet,H).forEach(i=>{if(!v.some(x=>x.kind==='limit'&&x.idx===i))
      v.push({kind:'limit',idx:i,ac:rots[i].ac,dst:rotDst(rots[i]),via:rots[i].via||null,msg:dcaAllowanceMsg()+' — this hub already uses it'});});}
  return v;
}
/* minimal repair: push the offending departures later, cascading, never reordering */
function repairSchedule(rots,fleet,gates,tiers){
  const mt=minTurnHub(fleet);
  const out=rots.map(r=>({...r}));
  for(let pass=0;pass<3;pass++){
    fleet.forEach(a=>{
      if(a.pair)return;                                  // 2-day lines are never auto-shifted
      const rs=out.filter(r=>r.ac===a.id).sort((x,y)=>x.dep-y.dep);
      if(rs.length<1)return;
      for(let i=0;i<rs.length-1;i++){
        const gap=mod(rs[i+1].dep-rs[i].arr);
        if(gap<mt){const sh=mt-gap; rs[i+1].dep=mod(rs[i+1].dep+sh); rs[i+1].arr=mod(rs[i+1].dep+rs[i+1].dur);}
      }
    });
  }
  const left=scheduleViolations(out,fleet,gates,tiers);
  return {ok:left.length===0,rots:out,left};
}
/* when is this aircraft actually free? windows a new rotation could start in */
function freeWindows(rots,fleet,acId){
  const me=fleet.find(a=>a.id===acId);
  if(me&&me.pair){
    const mt=minTurnHub(fleet), it=lineItems(rots,acId,me.pair), w=[];
    if(!it.length)return [{start:0,len:DAY,full:true}];
    it.forEach(o=>{const s=o.arr+mt, e=o.arr+o.gap-mt; if(e-s<1)return;
      [0,2*DAY].forEach(k=>{const lo=Math.max(s,k), hi=Math.min(e,k+DAY); if(hi>lo)w.push({start:mod(lo),len:e-lo,after:rotDst(o.r)});});});
    return w.sort((a,b)=>b.len-a.len);
  }
  const mt=minTurnHub(fleet), rs=acRots(rots,acId);
  if(!rs.length)return [{start:0,len:DAY,full:true}];
  const w=[];
  for(let i=0;i<rs.length;i++){
    const arr=rs[i].arr, nxt=rs[(i+1)%rs.length].dep;
    const gap=rs.length===1?DAY-rs[i].dur:mod(nxt-arr);
    const start=mod(arr+mt), len=gap-2*mt;
    if(len>0)w.push({start,len,after:rotDst(rs[i])});
  }
  return w.sort((a,b)=>b.len-a.len);
}
