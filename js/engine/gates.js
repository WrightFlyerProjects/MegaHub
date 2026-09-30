/* MegaHub · js/engine/gates.js — hub gate occupancy curve, ground intervals, stand assignment */
/* --- gates: on the ground at the hub = a gate held ---------------------- */
function addArc(cur,s,len){s=Math.round(mod(s));len=Math.round(len);for(let i=0;i<len;i++)cur[(s+i)%DAY]++;}
const acRots=(rots,id)=>rots.filter(r=>r.ac===id).sort((a,b)=>a.dep-b.dep);

/* ---------------- 2-day lines ----------------
   Two aircraft of the same type can be paired (a.pair = partner's id). They swap schedules every
   day: today the partner flies what this aircraft flew yesterday. Their shared cycle is 48 hours —
   A's rotations (day 1), then B's (day 2) — so a rotation longer than a day simply carries on into
   the partner's day. Every rotation still operates once daily, flown by one tail or the other, so
   everything built on the daily schedule (demand, banks, gates, scoring) is unchanged. Unpaired
   aircraft never touch this code. */
const isLead=a=>!!a.pair&&a.id<a.pair;                // each pair is walked once, through its lead
/* the pair's cycle in time order: {r, i (index in rots), dep/arr (absolute minutes over 48h), gap to next, next} */
function lineItems(rots,A,B){
  const it=[];
  rots.forEach((r,i)=>{if(r.ac===A)it.push({r,i,dep:r.dep});else if(r.ac===B)it.push({r,i,dep:r.dep+DAY});});
  it.sort((x,y)=>x.dep-y.dep);
  const L=2*DAY,n=it.length;
  it.forEach(o=>o.arr=o.dep+o.r.dur);
  it.forEach((o,k)=>{const nx=it[(k+1)%n]; o.next=nx; o.gap=(k+1<n?nx.dep:nx.dep+L)-o.arr;});
  return it;
}
/* which tail of the pair is doing the part of the cycle at absolute time t (minutes into the 48h line) */
const dayTail=(t,A,B)=>(((t%(2*DAY))+2*DAY)%(2*DAY))<DAY?A:B;
function gateCurve(rots,fleet){
  const cur=new Array(DAY).fill(0);
  fleet.forEach(a=>{
    if(a.pair){if(isLead(a))lineItems(rots,a.id,a.pair).forEach(o=>{if(o.gap>0)addArc(cur,o.arr,o.gap);});return;}
    const rs=acRots(rots,a.id);if(!rs.length)return;
    for(let i=0;i<rs.length;i++){
      const arr=rs[i].arr,nxt=rs[(i+1)%rs.length].dep;
      let gap=rs.length===1?DAY-rs[i].dur:mod(nxt-arr);
      if(gap<=0)gap=DAY;
      addArc(cur,arr,gap);}});
  return cur;
}

/* ground intervals at the hub: [aircraft, start, length] on the circular day */
function groundIntervals(rots,fleet){
  const iv=[];
  fleet.forEach(a=>{
    if(a.pair){if(isLead(a))lineItems(rots,a.id,a.pair).forEach(o=>{if(o.gap<=0)return;
        const tail=dayTail(o.arr,a.id,a.pair);
        iv.push({ac:tail,acAfter:tail===a.id?a.pair:a.id,type:a.t,start:Math.round(mod(o.arr)),len:Math.round(o.gap),
                 from:o.r.dst,to:o.next.r.dst,last:o.r.via||o.r.dst});});
      return;}
    const rs=acRots(rots,a.id);if(!rs.length)return;
    for(let i=0;i<rs.length;i++){
      const arr=rs[i].arr,nxt=rs[(i+1)%rs.length].dep;
      let gap=rs.length===1?DAY-rs[i].dur:mod(nxt-arr);
      if(gap<=0)gap=DAY;
      iv.push({ac:a.id,type:a.t,start:Math.round(mod(arr)),len:Math.round(gap),
               from:rs[i].dst,to:rs[(i+1)%rs.length].dst,last:rs[i].via||rs[i].dst});}});
  return iv;
}
/* assign each ground interval to the lowest-numbered free stand */
function gateAssign(rots,fleet,gates,tiers){
  if(tiers)return gateAssignTiered(rots,fleet,gates,tiers);
  const iv=groundIntervals(rots,fleet).sort((a,b)=>b.len-a.len||a.start-b.start);
  const busy=Array.from({length:gates},()=>new Uint8Array(DAY));
  const out=[];
  for(const s of iv){
    let placed=-1;
    for(let g=0;g<gates;g++){
      let ok=true;
      for(let i=0;i<s.len;i++) if(busy[g][(s.start+i)%DAY]){ok=false;break;}
      if(ok){for(let i=0;i<s.len;i++)busy[g][(s.start+i)%DAY]=1;placed=g;break;}
    }
    out.push({...s,gate:placed});   // -1 = no stand available
  }
  return out.sort((a,b)=>a.gate-b.gate||a.start-b.start);
}

/* ---------------- gate tiers ---------------- */
const customsIn=c=>!!(A[c]&&A[c].intl&&!PRECLEAR.has(c));   // an arrival from here needs customs
const acTier=a=>a&&a.seats>=HEAVY_SEATS?1:0;                  // 1 = needs a heavy-capable gate
const tierName=['standard','heavy','international'];

/* Each hub ground interval, split into the gate tier it needs over time. Widebodies need a
   heavy gate throughout. An arrival from abroad needs a customs (international) gate to
   deplane; if it stays 90m+ it only needs it for the first 45m, then can be towed off. */
function gateSegments(rots,fleet){
  const segs=[];
  groundIntervals(rots,fleet).forEach((iv,k)=>{
    const size=acTier(fleet.find(a=>a.id===iv.ac)), cust=customsIn(iv.last);
    if(cust&&iv.len>=TOW_MIN_GROUND){
      segs.push({iv:k,ac:iv.ac,start:iv.start,len:TOW_AFTER,need:2});
      segs.push({iv:k,ac:iv.ac,start:mod(iv.start+TOW_AFTER),len:iv.len-TOW_AFTER,need:size});
    }else segs.push({iv:k,ac:iv.ac,start:iv.start,len:iv.len,need:cust?2:size});
  });
  return segs;
}
/* aircraft on the ground each minute that need at least a heavy gate (h) / a customs gate (i) */
function gateTierCurves(rots,fleet){
  const h=new Array(DAY).fill(0), i=new Array(DAY).fill(0);
  gateSegments(rots,fleet).forEach(s=>{if(s.need>=1)addArc(h,s.start,s.len); if(s.need>=2)addArc(i,s.start,s.len);});
  return {h,i};
}
/* windows where a tier is over capacity: {kind:'gatetier',tier,peak,have,start,end} */
function tierViolations(rots,fleet,tiers){
  if(!tiers)return [];
  const {h,i}=gateTierCurves(rots,fleet), out=[];
  [[i,tiers.I,2],[h,tiers.H+tiers.I,1]].forEach(([cur,have,tier])=>{
    const over=cur.map(v=>v>have); if(!over.some(Boolean))return;
    let t0=over.findIndex(v=>!v); if(t0<0)t0=0;            // start scanning from a clear minute (circular day)
    for(let k=0;k<DAY;k++){const t=(t0+k)%DAY; if(!over[t])continue;
      let e=k; while(e+1<DAY&&over[(t0+e+1)%DAY])e++;
      let pk=0; for(let q=k;q<=e;q++)pk=Math.max(pk,cur[(t0+q)%DAY]);
      out.push({kind:'gatetier',tier,peak:pk,have,start:t,end:(t0+e+1)%DAY}); k=e;}
  });
  return out;
}
/* Tier-aware parking, simulated minute by minute over the circular day (warmed up on the day
   before). Each arrival takes the lowest-tier free gate it's allowed; a smaller aircraft may
   borrow a bigger gate when that's all that's free. If nothing it may use is free, everyone on
   the ground is re-parked most-demanding first, preferring to stay put — anyone who has to move
   is towed. When every tier count fits (tierViolations is empty), this always finds room.
   Returns one record per gate stay; a towed aircraft yields two records. */
function gateAssignTiered(rots,fleet,gates,tiers){
  const ivs=groundIntervals(rots,fleet), segs=gateSegments(rots,fleet);
  const I=Math.min(gates,tiers.I|0), H=Math.min(gates-I,tiers.H|0);
  const gt=[...Array(gates).keys()].map(g=>g<I?2:g<I+H?1:0);
  const ev=new Map(), at=t=>{if(!ev.has(t))ev.set(t,{arr:[],dep:[],chg:[]});return ev.get(t);};
  const insts=[];
  for(let d=-1;d<=1;d++) ivs.forEach((iv,k)=>{
    const ss=segs.filter(s=>s.iv===k), s0=iv.start+d*DAY;
    const o={k,d,iv,start:s0,end:s0+iv.len,need:ss[0].need,maxNeed:Math.max(...ss.map(s=>s.need)),gate:-1,pieces:[]};
    insts.push(o); at(o.start).arr.push(o); at(o.end).dep.push(o);
    if(ss.length>1)at(s0+TOW_AFTER).chg.push([o,ss[1].need]);
  });
  const holder=new Array(gates).fill(null);
  const move=(o,g,t)=>{if(o.gate===g)return; if(o.gate>=0&&holder[o.gate]===o)holder[o.gate]=null;
    o.gate=g; if(g>=0){holder[g]=o;o.pieces.push({gate:g,from:t,tow:o.pieces.length>0});}};
  const resolve=(present,t)=>{
    const was=new Map(present.map(o=>[o,o.gate])), claimed=new Array(gates).fill(null);
    [...present].sort((a,b)=>b.need-a.need||(a.gate<0)-(b.gate<0)).forEach(o=>{
      const cur=was.get(o);
      if(cur>=0&&gt[cur]>=o.need&&!claimed[cur]){claimed[cur]=o;return;}
      let best=-1,bk=null;
      for(let g=0;g<gates;g++){ if(claimed[g]||gt[g]<o.need)continue;
        const key=[holder[g]&&holder[g]!==o?1:0,gt[g],g];
        if(!bk||key[0]<bk[0]||(key[0]===bk[0]&&(key[1]<bk[1]||(key[1]===bk[1]&&key[2]<bk[2])))){bk=key;best=g;}}
      if(best>=0)claimed[best]=o; o._to=best;});
    claimed.forEach((o,g)=>{if(o)o._to=g;});
    present.forEach(o=>{if(o.gate>=0&&holder[o.gate]===o)holder[o.gate]=null;});
    present.forEach(o=>{const g=o._to; delete o._to;
      if(g==null||g<0){if(o.gate>=0)o.pieces.push({gate:-1,from:t,tow:false}); o.gate=-1;return;}
      if(o.gate!==g){o.gate=g;o.pieces.push({gate:g,from:t,tow:o.pieces.length>0});}
      holder[g]=o;});
  };
  [...ev.keys()].sort((a,b)=>a-b).forEach(t=>{
    const e=ev.get(t);
    e.dep.forEach(o=>{if(o.gate>=0&&holder[o.gate]===o)holder[o.gate]=null; o.gone=true;});
    e.chg.forEach(([o,n])=>{o.need=n;});
    e.arr.sort((a,b)=>b.need-a.need).forEach(o=>{
      let best=-1;
      for(let g=0;g<gates;g++)if(!holder[g]&&gt[g]>=o.need&&(best<0||gt[g]<gt[best]))best=g;
      if(best>=0){move(o,best,t);return;}
      const present=insts.filter(x=>x.start<=t&&x.end>t&&!x.gone&&(x.gate>=0||x===o));
      resolve(present,t);
    });
  });
  /* Report one continuous 24h window of the simulation (the second simulated day), so the
     picture can never double-book a gate. A stay crossing midnight is split at the window edge. */
  const W0=DAY, W1=2*DAY, out=[];
  insts.forEach(o=>{
    if(o.end<=W0||o.start>=W1)return;
    const base={ac:o.iv.ac,type:o.iv.type,from:o.iv.from,to:o.iv.to,last:o.iv.last,need:o.maxNeed,customs:customsIn(o.iv.last)};
    if(!o.pieces.length){const f=Math.max(o.start,W0),e=Math.min(o.end,W1);
      out.push({...base,start:Math.round(f-W0),len:Math.round(e-f),gate:-1,gtier:-1});return;}
    o.pieces.forEach((p,j)=>{const pe=j+1<o.pieces.length?o.pieces[j+1].from:o.end;
      const f=Math.max(p.from,W0), e=Math.min(pe,W1); if(e<=f)return;
      if(p.gate<0){out.push({...base,start:Math.round(f-W0),len:Math.round(e-f),gate:-1,gtier:-1});return;}
      const who=(f>p.from&&o.iv.acAfter&&f===W0)?{ac:o.iv.acAfter}:{};     // after midnight, a paired stay is the partner's
      out.push({...base,...who,start:Math.round(f-W0),len:Math.round(e-f),gate:p.gate,gtier:gt[p.gate],
        tow:p.tow&&p.from>=W0,borrowed:gt[p.gate]>o.maxNeed});});
  });
  return out.sort((a,b)=>a.gate-b.gate||a.start-b.start);
}
