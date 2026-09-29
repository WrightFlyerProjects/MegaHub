/* MegaHub · js/ui/fleetperf.js — Fleet tab performance: per-type rollup + sortable per-tail table (block hours, stage length, LF, score contribution, flags) */
let fpSort='score', fpAsc=false;
const FP_FULL=0.9, FP_DOWN=0.60, FP_LOWBLK=8;     // flags: share of legs full → upgauge · LF → downgauge · block hours/day

/* Load results per tail from one evaluation.
   lf    = pax-miles on the legs actually flown ÷ seat-miles (the industry load factor)
   score = the tail's share of the year's net pax-miles. Connecting trips are credited to
           both aircraft by leg length, so all tails add up exactly to the airline's score. */
function tailLoadStats(E){
  const idOf=rots.map(r=>r.ac), t={};
  const get=id=>t[id]||(t[id]={pm:0,pax:0,rpm:0,asm:0,legs:0,full:0});
  (E.legs||[]).forEach(l=>{const id=idOf[l.ri]; if(!id)return; const o=get(id);
    o.rpm+=l.pax*l.nm; o.asm+=l.seats*l.nm; o.legs++; if(l.pax>=l.seats*0.97)o.full++;});
  (E.perRot||[]).forEach((p,i)=>{const id=idOf[i]; if(!id)return; const o=get(id);
    o.pm+=p.pm; o.pax+=p.local+p.connect+p.pair;});
  const out={};
  Object.entries(t).forEach(([id,o])=>{out[id]={lf:o.asm?o.rpm/o.asm:0, pax:o.pax, rpm:o.rpm, asm:o.asm,
    score:o.pm-EMPTY_W*Math.max(0,o.asm-o.pm), legs:o.legs, full:o.full};});
  return out;
}

/* Schedule-derived numbers: always visible, no launch needed. */
function tailOps(){
  const o={};
  owned.forEach(a=>o[a.id]={rots:0,blk:0,nm:0,legs:0,dur:0,maxStage:0,ocean:false});
  rots.forEach(r=>{const a=owned.find(x=>x.id===r.ac); if(!a)return; const s=o[a.id];
    s.rots++; s.dur+=r.dur;
    shape(r,a).legs.forEach(L=>{const d=nm(A[L.a],A[L.b]); s.blk+=L.t; s.nm+=d; s.legs++;
      s.maxStage=Math.max(s.maxStage,d); if(A[L.a].ocean||A[L.b].ocean)s.ocean=true;});});
  owned.forEach(a=>{const s=o[a.id], w=freeWindows(rots,owned,a.id);
    s.open=s.rots?(w[0]?w[0].len:0):DAY; s.ground=DAY-s.dur;});
  return o;
}

function fpFlags(r){
  const f=[];
  if(!r.rots)f.push(['idle','f-idle','no rotations scheduled']);
  if(r.lf!=null&&r.rots){
    if(r.legsL&&r.full/r.legsL>=FP_FULL)f.push(['upgauge?','f-up',`${r.full} of ${r.legsL} legs full — demand is being turned away`]);
    else if(r.lf<FP_DOWN)f.push(['downgauge?','f-dn',`only ${Math.round(r.lf*100)}% full — empty seats cost score`]);
  }
  if(r.rots&&r.blk<FP_LOWBLK*60)f.push(['underused','f-low',`${(r.blk/60).toFixed(1)} block hours/day`]);
  return f;
}

/* nearest bigger / smaller type that can still fly this type's longest leg */
function gaugeOptions(t,maxStage,ocean){
  const me=CATALOG.find(c=>c.t===t), ok=c=>c.t!==t&&c.rng>=maxStage&&(!ocean||c.etops);
  const av=availTypes().filter(ok);
  const up=av.filter(c=>c.seats>me.seats).sort((a,b)=>a.seats-b.seats)[0];
  const dn=av.filter(c=>c.seats<me.seats).sort((a,b)=>b.seats-a.seats)[0];
  const lab=c=>c?`${c.t} <span style="color:var(--ink3)">${c.seats}s · ${c.cost}pt</span>`:'<span style="color:var(--ink3)">—</span>';
  return {up:lab(up),dn:lab(dn)};
}

function renderFleetPerf(E){
  const host=$('ftails'), th=$('ftypes'); if(!host)return;
  if(!owned.length){th.innerHTML='';$('fplab').textContent='';
    host.innerHTML='<div class="empty">Buy aircraft and schedule them — each one\'s utilization, stage length and loads show up here.</div>';return;}
  const ops=tailOps();
  const live=launched, stale=!launched&&!!(lastE&&lastE.perTail);
  const L=live?tailLoadStats(E):(stale?lastE.perTail:null);
  $('fplab').textContent=live?`${era().year} results`:stale?`loads: ${lastE.year} · last year`:'loads hidden until you launch';
  const sc=stale?' fpst':'';

  const rows=owned.map(a=>{const o=ops[a.id], l=L&&L[a.id];
    return {id:a.id,t:a.t,seats:a.seats,rots:o.rots,blk:o.blk,ground:o.ground,open:o.open,
      stage:o.legs?o.nm/o.legs:null,legs:o.legs,nmSum:o.nm,maxStage:o.maxStage,ocean:o.ocean,
      pax:l?l.pax:null,lf:l?l.lf:null,score:l?l.score:null,rpm:l?l.rpm:0,asm:l?l.asm:0,
      full:l?l.full:null,legsL:l?l.legs:0,fullShare:l&&l.legs?l.full/l.legs:null};});

  /* ---- per-type rollup ---- */
  const order=CATALOG.map(c=>c.t), types={};
  rows.forEach(r=>{(types[r.t]=types[r.t]||[]).push(r);});
  const tt=Object.keys(types).sort((a,b)=>order.indexOf(a)-order.indexOf(b)).map(t=>{
    const rs=types[t], n=rs.length, legs=rs.reduce((a,r)=>a+r.legs,0), asm=rs.reduce((a,r)=>a+r.asm,0);
    const g=gaugeOptions(t,Math.max(...rs.map(r=>r.maxStage)),rs.some(r=>r.ocean));
    return `<tr><td><b>${t}</b></td><td>${n}${rs.some(r=>!r.rots)?` <span style="color:var(--red)">(${rs.filter(r=>!r.rots).length} idle)</span>`:''}</td><td>${rs[0].seats}</td>
      <td>${(rs.reduce((a,r)=>a+r.blk,0)/n/60).toFixed(1)}</td>
      <td>${legs?Math.round(rs.reduce((a,r)=>a+r.nmSum,0)/legs):'—'}</td>
      <td class="${sc}">${L&&asm?Math.round(rs.reduce((a,r)=>a+r.rpm,0)/asm*100)+'%':'—'}</td>
      <td class="${sc}">${L?Math.round(rs.reduce((a,r)=>a+(r.pax||0),0)/n):'—'}</td>
      <td class="${sc}">${L?Math.round(rs.reduce((a,r)=>a+(r.score||0),0)/n/1000).toLocaleString()+'k':'—'}</td>
      <td>+${tradeInValue(t)}pt</td><td style="text-align:left;padding-left:14px">${g.up}</td><td style="text-align:left;padding-left:10px">${g.dn}</td></tr>`;}).join('');
  th.innerHTML=`<h3 class="sub3">By aircraft type</h3><div class="tscroll"><table class="fptab">
    <tr><th>Type</th><th>Aircraft</th><th>Seats</th><th>Block h</th><th>Stage nm</th><th>LF</th><th>Pax/ac</th><th>Score/ac</th><th>Trade-in</th>
    <th style="text-align:left;padding-left:14px">Next size up</th><th style="text-align:left;padding-left:10px">Next size down</th></tr>${tt}</table></div>`;

  /* ---- per-tail table ---- */
  const k=fpSort, dir=fpAsc?1:-1;
  rows.sort((a,b)=>{const x=a[k],y=b[k];
    if(x==null&&y==null)return 0; if(x==null)return 1; if(y==null)return -1;
    return (typeof x==='string'?x.localeCompare(y):x-y)*dir;});
  const H=(key,lab,left)=>`<th data-fsort="${key}" class="${k===key?'on':''}"${left?' style="text-align:left"':''}>${lab}${k===key?(fpAsc?' ▲':' ▼'):''}</th>`;
  const total=rows.reduce((a,r)=>a+(r.score||0),0);
  host.innerHTML=`<h3 class="sub3">By aircraft <em>click a column to sort</em></h3><div class="tscroll"><table class="fptab">
    <tr>${H('id','Tail',1)}${H('t','Type',1)}${H('rots','Rot')}${H('blk','Block h')}${H('ground','Hub gnd')}${H('open','Open')}${H('stage','Stage nm')}${H('pax','Pax')}${H('lf','LF')}${H('fullShare','Full legs')}${H('score','Score')}<th style="text-align:left;padding-left:10px">Flags</th><th></th></tr>`
    +rows.map(r=>{const fl=fpFlags(r);
      const lfc=r.lf==null?'':r.lf<FP_DOWN?'color:var(--red)':'';
      return `<tr><td><b>${r.id}</b></td><td style="text-align:left;color:var(--ink2)">${r.t}</td><td>${r.rots}</td>
        <td>${(r.blk/60).toFixed(1)}</td><td>${hm(r.ground)}</td><td>${hm(r.open)}</td><td>${r.stage==null?'—':Math.round(r.stage)}</td>
        <td class="${sc}">${r.pax==null?'—':Math.round(r.pax)}</td>
        <td class="${sc}" style="${lfc}">${r.lf==null?'—':Math.round(r.lf*100)+'%'}</td>
        <td class="${sc}"${r.fullShare>=FP_FULL?' style="color:var(--green)"':''}>${r.full==null?'—':r.full+'/'+r.legsL}</td>
        <td class="${sc}">${r.score==null?'—':Math.round(r.score/1000).toLocaleString()+'k'}</td>
        <td style="text-align:left;padding-left:10px">${fl.map(f=>`<span class="flag ${f[1]}" title="${f[2]}">${f[0]}</span>`).join('')}</td>
        <td><span class="x" data-replopen="${r.id}" title="open replace options in the roster">replace</span></td></tr>`;}).join('')
    +`</table></div>
    <div class="note"><b>Block h</b> = hours airborne + taxi per day · <b>Hub gnd</b> = time on the ground at ${HUB.c} · <b>Open</b> = longest window free for another rotation ·
    <b>Stage</b> = average leg length · <b>LF</b> = seats filled on the legs flown (the industry measure; the headline load factor counts connecting passengers by their straight-line trip, so it runs lower) ·
    <b>Full legs</b> = legs flown 97%+ full (passengers turned away) · <b>Score</b> = the aircraft's share of net pax-miles${L?` (all aircraft sum to ${Math.round(total).toLocaleString()})`:''} ·
    flags: upgauge? ${FP_FULL*100}%+ of legs full · downgauge? LF &lt; ${FP_DOWN*100}% · underused &lt; ${FP_LOWBLK} block h/day</div>`;
}

document.addEventListener('click',e=>{
  const h=e.target.closest&&e.target.closest('[data-fsort]');
  if(h){const key=h.getAttribute('data-fsort');
    if(fpSort===key)fpAsc=!fpAsc; else{fpSort=key;fpAsc=(key==='id'||key==='t');}
    renderFleetPerf(evaluate(rots,owned,gatesOwned));return;}
  // "replace" in the table uses the roster's existing handler; bring that roster line into view
  const rp=e.target.closest&&e.target.closest('#ftails [data-replopen]');
  if(rp){const id=rp.getAttribute('data-replopen');
    setTimeout(()=>{const el=document.querySelector(`#roster [data-tail="${id}"]`);
      if(el)el.scrollIntoView({block:'center',behavior:'smooth'});},0);}
});
