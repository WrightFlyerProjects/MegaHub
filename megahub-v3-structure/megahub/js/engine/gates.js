/* MegaHub · js/engine/gates.js — hub gate occupancy curve, ground intervals, stand assignment */
/* --- gates: on the ground at the hub = a gate held ---------------------- */
function addArc(cur,s,len){s=Math.round(mod(s));len=Math.round(len);for(let i=0;i<len;i++)cur[(s+i)%DAY]++;}
const acRots=(rots,id)=>rots.filter(r=>r.ac===id).sort((a,b)=>a.dep-b.dep);
function gateCurve(rots,fleet){
  const cur=new Array(DAY).fill(0);
  fleet.forEach(a=>{const rs=acRots(rots,a.id);if(!rs.length)return;
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
  fleet.forEach(a=>{const rs=acRots(rots,a.id);if(!rs.length)return;
    for(let i=0;i<rs.length;i++){
      const arr=rs[i].arr,nxt=rs[(i+1)%rs.length].dep;
      let gap=rs.length===1?DAY-rs[i].dur:mod(nxt-arr);
      if(gap<=0)gap=DAY;
      iv.push({ac:a.id,type:a.t,start:Math.round(mod(arr)),len:Math.round(gap),
               from:rs[i].dst,to:rs[(i+1)%rs.length].dst});}});
  return iv;
}
/* assign each ground interval to the lowest-numbered free stand */
function gateAssign(rots,fleet,gates){
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
