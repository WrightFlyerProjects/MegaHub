/* MegaHub · js/ui/board.js — rotation lanes, scheduled list, gate conflicts, master render(), city card, hub card */
/* ---------------- board ---------------- */
/* the out-turn-return segments of one rotation, drawn through segFn (seg for a normal lane) */
function rotBlocks(r,a,segFn){
  const sh=shape(r,a,HC), m=sh.marks, ron=r.turn>240, seg=segFn;
  let inner;
      if(!r.via){
        const al=mod(m.arrDst+tzD(r.dst,HC)), dl=mod(m.depDst+tzD(r.dst,HC));
        inner=seg(m.depHub,sh.legs[0].t,'out '+qcls(pref(al)),r.dst,`${a.id} ${HUB.c}→${r.dst} · dep ${fmt(m.depHub)} ${HUB.c} · arr ${fmt(al)} ${r.dst} (${Math.round(pref(al)*100)}%)`)
          +seg(m.arrDst,r.turn,'turn'+(ron?' ron':''),'',`${Math.round(r.turn)}m at ${r.dst}${ron?' · overnight':''}`)
          +seg(m.depDst,sh.legs[1].t,'ret '+qcls(pref(dl)),HUB.c,`${a.id} ${r.dst}→${HUB.c} · arr ${fmt(m.arrHub)} ${HUB.c} · dep ${fmt(dl)} ${r.dst} (${Math.round(pref(dl)*100)}%)`);
      }else{
        const avl=mod(m.arrVia+tzD(r.via,HC)), adl=mod(m.arrDst+tzD(r.dst,HC)), ddl=mod(m.depDst+tzD(r.dst,HC));
        inner=seg(m.depHub,sh.legs[0].t,'out '+qcls(pref(avl)),r.via,`${a.id} ${HUB.c}→${r.via} · dep ${fmt(m.depHub)} ${HUB.c} · arr ${fmt(avl)} ${r.via}`)
          +seg(m.arrVia,VIA_TURN,'turn','',`${VIA_TURN}m stop at ${r.via}`)
          +seg(m.depVia,sh.legs[1].t,'out '+qcls(pref(adl)),r.dst,`${a.id} ${r.via}→${r.dst} · arr ${fmt(adl)} local`)
          +seg(m.arrDst,r.turn,'turn'+(ron?' ron':''),'',`${Math.round(r.turn)}m at ${r.dst}${ron?' · overnight':''}`)
          +seg(m.depDst,sh.legs[2].t,'ret '+qcls(pref(ddl)),r.via,`${a.id} ${r.dst}→${r.via} · dep ${fmt(ddl)} local`)
          +seg(m.arrVia2,VIA_TURN,'turn','',`${VIA_TURN}m stop at ${r.via}`)
          +seg(m.depVia2,sh.legs[3].t,'ret',HUB.c,`${a.id} ${r.via}→${HUB.c} · arr ${fmt(m.arrHub)} ${HUB.c}`);
      }
  return inner;
}
function renderLanes(E){
  const DL=delayMap(rots,owned,HC);
  // #4 group the board by aircraft type: like aircraft sit together, in catalog order
  const order=CATALOG.map(c=>c.t);
  const sorted=owned.slice().sort((a,b)=>(order.indexOf(a.t)-order.indexOf(b.t))||(a.id<b.id?-1:1));
  const lanes=[], seen=new Set();
  sorted.forEach(a=>{if(seen.has(a.id))return; lanes.push(a); seen.add(a.id);
    if(a.pair){const p=owned.find(x=>x.id===a.pair); if(p&&!seen.has(p.id)){lanes.push(p); seen.add(p.id);}}});
  /* 2-day lines: both lanes of a pair are drawn together. A trip that runs past midnight continues
     on the partner's lane — the partner is doing, today, what this aircraft does tomorrow. */
  const lineBuf={};
  lanes.forEach(a=>{if(!isLead(a))return; const P=a.pair; lineBuf[a.id]=''; lineBuf[P]='';
    rots.forEach((r,i)=>{if(r.ac!==a.id&&r.ac!==P)return;
      const off=r.ac===a.id?0:DAY, buf={[a.id]:'',[P]:''};
      const segL=(s0,len,cls,lab,title)=>{let t=s0+off, rem=len;
        while(rem>0.01){const d=Math.floor(t/DAY), w=t-d*DAY, take=Math.min(rem,DAY-w), ln=d%2===0?a.id:P;
          buf[ln]+=`<div class="blk ${cls}" style="left:${X(w)}%;width:${X(take)}%" title="${title||''}">${lab||''}</div>`; t+=take; rem-=take;}
        return '';};
      rotBlocks(r,owned.find(x=>x.id===r.ac),segL);
      [a.id,P].forEach(ln=>{if(buf[ln])lineBuf[ln]+=`<div class="rotwrap ${i===editIdx?'ed':''}" data-editrot="${i}" title="click to edit ${r.ac} → ${r.dst}">${buf[ln]}</div>`;});});});
  let curType=null;
  $('lanes').innerHTML=lanes.map(a=>{
    const rs=rots.map((r,i)=>({r,i})).filter(o=>o.r.ac===a.id);
    const dmax=rs.length?Math.max(...rs.map(o=>DL[o.i]||0)):0;
    // each rotation wrapped so a click loads it into the editor (#6)
    const blocks=a.pair?(lineBuf[a.id]||''):rs.map(({r,i})=>{
      const inner=rotBlocks(r,a,seg);
      return `<div class="rotwrap ${i===editIdx?'ed':''}" data-editrot="${i}" title="click to edit ${a.id} → ${r.dst}">${inner}</div>`;
    }).join('');
    let bands='';
    if(a.id===$('ac').value&&editIdx===null){
      freeWindows(rots,owned,a.id).forEach(w=>{
        const s=mod(w.start), l=Math.min(w.len,DAY-s);
        bands+=`<div class="free" style="left:${X(s)}%;width:${X(l)}%" ></div>`;
        if(w.len>l&&!a.pair)bands+=`<div class="free" style="left:0;width:${X(w.len-l)}%"></div>`;});
    }
    // a light type divider when the group changes
    const head=(a.t!==curType?(curType=a.t,`<div class="lanegroup">${a.t}</div>`):'')
      +(isLead(a)?`<div class="linegroup">⇄ 2-day line · ${a.id} and ${a.pair} swap schedules every day</div>`:'');
    return head+`<div class="lane${a.pair?' paired':''}"><div class="tag"><b>${a.id}</b><i>${a.pair?`⇄ ${a.pair}`:a.t}${dmax>3?` <span class="dly ${dmax>30?'bad':''}">+${Math.round(dmax)}m</span>`:''}</i></div>
      <div class="track"><div class="hr"></div>${bands}${blocks}</div></div>`;
  }).join('')||`<div class="empty" style="padding:14px">No aircraft. Buy some.</div>`;
}

function renderSchedule(E){
  const tools=$('schedTools'), cnt=$('schedCount');
  if(!rots.length){ $('rots').innerHTML='<div class="empty">Nothing scheduled.</div>';
    if(tools)tools.style.display='none'; if(cnt)cnt.textContent=''; return; }

  // Each rotation is TWO flights (outbound + return), each a discrete leg with its own
  // number and load. We read E.flights (per-leg records from the engine). When the current
  // year isn't launched we fall back to last year's result for the same flight number.
  const lastFlt=(!launched&&lastE&&lastE.perFlt)?lastE.perFlt:null;
  const legs=(E.flights||[]).map(f=>{
    const r=rots[f.ri];
    let local=0,connect=0,pair=0,d=f.delay,src='none';
    if(launched){ local=f.local;connect=f.connect;pair=f.pair;src='live'; }
    else if(lastFlt&&lastFlt[f.no]){ const p=lastFlt[f.no]; local=p.local;connect=p.connect;pair=p.pair;d=p.delay;src='last'; }
    const carried=local+connect+pair, lf=f.seats?Math.min(1,carried/f.seats):0;
    return {f,r,ri:f.ri,flt:f.no,dir:f.dir,from:f.from,to:f.to,via:f.via,
      dep:f.spokeTime!=null&&f.dir==='ret'?f.spokeTime:f.hubTime,   // the flight's own departure
      depShown:f.dir==='out'?f.hubTime:f.spokeTime,                 // where this leg departs
      arrShown:f.dir==='out'?f.spokeTime:f.hubTime,                 // where this leg arrives
      ron:r.turn>240, d,carried,local,connect,pair,lf,seats:f.seats,src};
  });
  if(cnt)cnt.textContent = legs.length+' flight'+(legs.length!==1?'s':'');
  if(tools)tools.style.display = legs.length>=6 ? 'block' : 'none';

  // filter
  const q=schedFilter.trim().toLowerCase();
  let view=legs;
  if(q)view=legs.filter(x=>
    (''+x.flt).includes(q) || x.from.toLowerCase().includes(q) || x.to.toLowerCase().includes(q) ||
    (x.via&&x.via.toLowerCase().includes(q)) || x.r.ac.toLowerCase().includes(q));

  // sort — keep the outbound/return pair adjacent by default (departure sort)
  const dir=schedAsc?1:-1;
  const keyed={flt:x=>x.flt, ac:x=>x.r.ac, dst:x=>x.dir==='out'?x.to:x.from, dep:x=>x.depShown, pax:x=>x.lf};
  const kf=keyed[schedSort]||keyed.dep;
  view=view.slice().sort((a,b)=>{const ka=kf(a),kb=kf(b);
    return (ka<kb?-1:ka>kb?1:(a.flt-b.flt))*dir;});

  document.querySelectorAll('.sortb').forEach(b=>{
    b.classList.toggle('on',b.getAttribute('data-sort')===schedSort);
    b.classList.toggle('asc',b.getAttribute('data-sort')===schedSort&&schedAsc);});

  const okey=x=>x.ri+':'+x.dir;   // expand key is per-leg now
  const body=view.map(x=>{
    const r=x.r, i=x.ri, open=schedOpen===okey(x);
    const via=x.via?` <span style="color:var(--brand)">via ${x.via}</span>`:'';
    const ron=x.ron?' <span style="color:var(--violet)">RON</span>':'';
    const dirchip=x.dir==='out'
      ? '<span class="dirchip out">out</span>'
      : '<span class="dirchip ret">ret</span>';
    const dly=x.d>3?`<span class="dly ${x.d>30?'bad':''}">+${x.d}m</span>`:'<span style="color:var(--ink3)">—</span>';
    const main=`<tr class="clik ${i===editIdx?'editing':''} ${open?'openrow':''}" data-open="${x.ri}" data-dir="${x.dir}" data-city="${x.dir==='out'?x.to:x.from}">
      <td><span class="fltno">${x.flt}</span></td>
      <td>${r.ac}</td>
      <td>${dirchip} ${x.from}→${x.to}${x.via&&x.via!==x.to?via:''}${ron}</td>
      <td>${fmt(x.depShown)}</td>
      <td>${fmt(x.arrShown)}</td>
      <td>${dly}</td>
      <td><span class="x" data-edit="${x.ri}">✎</span></td>
      <td><span class="x" data-del="${x.ri}">✕</span></td></tr>`;
    if(!open)return main;
    let detail;
    if(x.src==='live'||x.src==='last'){
      const lf=Math.round(x.lf*100);
      const tag = x.src==='last' ? ` <em style="color:var(--ink3);font-style:normal">· ${lastE.year} result</em>` : '';
      detail=`<div class="fldet">
        <span class="seg">Flight <b>${x.flt}</b> · ${x.from}→${x.to}${x.via&&x.via!==x.to?' via '+x.via:''}${tag}</span>
        <span class="seg"><span class="loadbar"><i style="width:${lf}%"></i></span> <b>${lf}%</b> full (${Math.round(x.carried)} of ${x.seats})</span>
        <br><span class="seg"><b>${Math.round(x.local)}</b> local</span>
        <span class="seg"><b>${Math.round(x.connect)}</b> connecting</span>
        ${x.pair?`<span class="seg"><b>${Math.round(x.pair)}</b> spoke-to-spoke</span>`:''}
        ${x.d>3?`<span class="seg" style="color:var(--red)">runs +${x.d}m late</span>`:''}</div>`;
    }else{
      const blocking=scheduleViolations(rots,owned,gatesOwned,gateTiers).length>0;
      const isNew = !launched && lastE && lastE.perFlt;
      detail=`<div class="fldet" style="color:var(--ink3)">Flight <b>${x.flt}</b> · ${x.from}→${x.to}${x.via&&x.via!==x.to?' via '+x.via:''} · departs ${fmt(x.depShown)}, arrives ${fmt(x.arrShown)}.<br>`
        + (blocking
            ? `<span style="color:var(--red)">Passenger loads appear once you launch — but the schedule has a problem blocking launch. See the red notice above the board.</span>`
            : isNew
              ? `New this year — no ${lastE.year} result to show. Launch ${era().year} to reveal its load.`
              : `Launch ${era().year} to reveal this flight's passenger load.`)
        + `</div>`;
    }
    return main+`<tr class="det"><td colspan="8">${detail}</td></tr>`;
  }).join('');

  $('rots').innerHTML=`<table><tr><th>Flt</th><th>Tail</th><th>Route</th><th>Dep</th><th>Arr</th><th>Delay</th><th></th><th></th></tr>`
    + (body||`<tr><td colspan="8" style="color:var(--ink3);padding:8px 0">No flights match "${schedFilter}".</td></tr>`)
    + `</table>`;
}

/* #2 — find the exact windows where required stands exceed leased gates.
   Returns a list of {start,end,peak} describing each over-capacity stretch. */
function gateConflicts(rots,fleet,gates){
  const cur=gateCurve(rots,fleet);
  const windows=[]; let s=-1;
  for(let t=0;t<DAY;t++){
    const over=cur[t]>gates;
    if(over&&s<0)s=t;
    if(!over&&s>=0){windows.push([s,t]);s=-1;}
  }
  if(s>=0){ // wraps past midnight — stitch to a leading window if present
    if(windows.length&&windows[0][0]===0)windows[0][0]=s-DAY; else windows.push([s,DAY]);
  }
  return windows.map(([a,b])=>{
    let peak=0; for(let t=a;t<b;t++){const tt=mod(t);if(cur[tt]>peak)peak=cur[tt];}
    return {start:mod(a),end:mod(b),peak};
  });
}

function render(){
  dissolvePairs();
  const E=evalView();
  renderStats(E);renderAward();renderAxes();renderLanes(E);syncACLabels();renderUndo();
  const cur=E.cur,w=100/DAY;let bars='';
  for(let t=0;t<DAY;t+=5){const v=Math.max(...cur.slice(t,t+5));if(!v)continue;
    const h=Math.min(v,gatesOwned+2)/(gatesOwned+1)*30;
    bars+=`<div class="gcol ${v>gatesOwned?'over':''}" style="left:${t*w}%;width:${5*w}%;height:${h}px"></div>`;}
  let banks='';
  for(let t=0;t<DAY;t+=10){
    const inb=rots.filter(r=>mod(r.arr-t)<40).length,outb=rots.filter(r=>mod(r.dep-t-MCTg())<50).length;
    if(inb>=2&&outb>=2)banks+=`<div class="bank" style="left:${X(t)}%;width:${X(MCTg()+50)}%"></div>`;}
  const over=E.peak>gatesOwned;
  $('gates').innerHTML=banks+bars+`<div class="glab"${over?' style="color:var(--red)"':''}>Gate occupancy · peak ${E.peak} of ${gatesOwned}${over?` · over by ${E.peak-gatesOwned} — lease more or park a plane overnight`:''} · shaded = connecting bank</div>`;

  // #2 — spell out each over-capacity window in plain language
  if(over){
    const confs=gateConflicts(rots,owned,gatesOwned);
    $('gateconf').innerHTML=`<div class="gconf"><h3>Gate over-capacity windows</h3>`
      +confs.map(cf=>{const wrap=cf.end<cf.start?' <span style="color:var(--ink3)">(overnight)</span>':'';
        return `<div class="gcline">${cf.peak} aircraft trying to use ${gatesOwned} gates from <b>${fmt(cf.start)}–${fmt(cf.end)}</b>${wrap}</div>`;}).join('')
      +`<div class="hint">Retime an arrival or departure inside a window to clear it — e.g. pull an ${fmt(confs[0].end)} departure a few minutes earlier, or park a plane overnight at a spoke.</div></div>`;
  } else $('gateconf').innerHTML='';

renderSchedule(E);

  renderMarketsTab(E);
  renderFleetPerf(E);
  renderRoster();          // status, pairs and sell/replace locks follow the schedule
  renderHubSwitch(); renderHubsPanel();
  renderHubStats(E); renderHistory(); renderSeasons();
  renderCoach();
  renderMap(E); renderTerminal(E);
  saveLocal();
  if(selCity)renderCity(selCity,E);
}

/* Every leg a rotation flies: flight number, origin, destination, and departure/arrival times
   each in the local time of its own airport (hub local = the hub's clock). A through flight
   keeps one number across both legs of its direction. */
function rotLegs(r,ac){
  const m=shape(r,ac,HC).marks, out=flightNo(HUB.c,r.dst,r.dep,r.via||null,'out'), ret=flightNo(HUB.c,r.dst,r.dep,r.via||null,'ret');
  const tailAt=t=>ac.pair?dayTail(t,r.ac,ac.pair):r.ac;        // 2-day line: whoever is on this part of the cycle today
  const L=(flt,a,b,dep,arr)=>({flt,a,b,dep:mod(dep+tzD(a,HC)),arr:mod(arr+tzD(b,HC)),ac:tailAt(dep),t:ac.t});
  return r.via
    ?[L(out,HUB.c,r.via,m.depHub,m.arrVia),L(out,r.via,r.dst,m.depVia,m.arrDst),L(ret,r.dst,r.via,m.depDst,m.arrVia2),L(ret,r.via,HUB.c,m.depVia2,m.arrHub)]
    :[L(out,HUB.c,r.dst,m.depHub,m.arrDst),L(ret,r.dst,HUB.c,m.depDst,m.arrHub)];
}
function renderCity(c,E){
  const s=A[c]; if(!s||c===HUB.c){$('city').style.display='none';return;}
  selCity=c;$('city').style.display='block';
  const arr=[], dep=[];
  rots.forEach(r=>{const ac=owned.find(a=>a.id===r.ac); if(!ac)return;
    rotLegs(r,ac).forEach(l=>{if(l.b===c)arr.push(l); if(l.a===c)dep.push(l);});});
  arr.sort((a,b)=>a.arr-b.arr); dep.sort((a,b)=>a.dep-b.dep);
  const fl=E.flows[c]||{out:0,in:0}, mk=E.markets.filter(m=>m.i===c||m.j===c).slice(0,8);
  $('city').innerHTML=`<div class="cityhead">
      <div><b>${c} — ${s.n}</b><br><i>${Math.round(dHub[c])} nm from ${HUB.c} · local ${tzD(c,HC)>=0?'+':''}${tzD(c,HC)/60}h · two-way hub market ${2*hubOD(c)} pax/day · expects ${halfLocal(c,HC).toFixed(1)}× daily</i></div>
      <div><span class="x" data-explore="${c}" style="margin-right:14px">explore market →</span><span class="x" id="cityclose">✕ close</span></div></div>
    <div class="cols" style="margin-top:0">
      <div><h2>Arrivals <em>local times</em></h2>${arr.length?`<table class="fptab"><tr><th>Flight</th><th style="text-align:left">From</th><th>Departs</th><th>Arrives</th><th style="text-align:left;padding-left:18px">Aircraft</th></tr>`+
        arr.map(o=>`<tr class="clik" data-city="${o.a}"><td><span class="fltno">${o.flt}</span></td><td style="text-align:left">${o.a}</td><td>${fmt(o.dep)}</td><td>${fmt(o.arr)}</td>
          <td style="text-align:left;padding-left:18px">${o.t} <span style="color:var(--ink3)">${o.ac}</span></td></tr>`).join('')+`</table>`:`<div class="empty">No service.</div>`}</div>
      <div><h2>Departures <em>local times</em></h2>${dep.length?`<table class="fptab"><tr><th>Flight</th><th style="text-align:left">To</th><th>Departs</th><th>Arrives</th><th style="text-align:left;padding-left:18px">Aircraft</th></tr>`+
        dep.map(o=>`<tr class="clik" data-city="${o.b}"><td><span class="fltno">${o.flt}</span></td><td style="text-align:left">${o.b}</td><td>${fmt(o.dep)}</td><td>${fmt(o.arr)}</td>
          <td style="text-align:left;padding-left:18px">${o.t} <span style="color:var(--ink3)">${o.ac}</span></td></tr>`).join('')+`</table>`:`<div class="empty">No service.</div>`}</div>
    </div>
    ${launched?`<div style="margin-top:16px"><h2>Connecting flow through ${HUB.c}</h2>
      <div class="rowv" style="margin-bottom:8px"><span>${Math.round(fl.out)} pax originate ${c} and connect onward</span><span>${Math.round(fl.in)} pax connect to ${c}</span></div>
      ${mk.length?`<table><tr><th>Market</th><th>Conn</th><th>Detour</th><th>Pax</th><th></th></tr>`+
        mk.map(m=>`<tr><td>${m.i}–${m.j}</td><td>${Math.round(m.ct)}m</td><td>${m.r.toFixed(2)}×</td><td>${Math.round(m.pax)}</td>
        <td><span class="pill ${pcls(m.v)}">${Math.round(m.v*100)}%</span></td></tr>`).join('')+`</table>`:`<div class="empty">No connecting traffic yet.</div>`}</div>`
      :`<div class="empty" style="margin-top:12px">Passenger flow hidden until you launch.</div>`}`;
}

function renderHubCard(E){
  selCity=HUB.c; $('city').style.display='block';
  // every hub departure and arrival across the whole schedule, in hub-local time
  const deps=[], arrs=[];
  rots.forEach(r=>{const ac=owned.find(a=>a.id===r.ac); if(!ac)return;
    rotLegs(r,ac).forEach(l=>{if(l.a===HUB.c)deps.push(l); if(l.b===HUB.c)arrs.push(l);});});
  deps.sort((a,b)=>a.dep-b.dep); arrs.sort((a,b)=>a.arr-b.arr);
  const peak=E.peak, gates=gatesOwned;
  $('city').innerHTML=`<div class="cityhead">
      <div><b>${HUB.c} — ${A[HUB.c].n}</b><br><i>your hub · ${rots.length} rotation${rots.length!==1?'s':''} · peak ${peak} of ${gates} gates in use${peak>gates?' · <span style=\'color:var(--red)\'>over capacity</span>':''}</i></div>
      <div><span class="x" id="cityclose">✕ close</span></div></div>
    <div class="cols" style="margin-top:0">
      <div><h2>Departures <em>local times</em></h2>${deps.length?`<table class="fptab"><tr><th>Flight</th><th style="text-align:left">To</th><th>Departs</th><th>Arrives</th><th style="text-align:left;padding-left:18px">Aircraft</th></tr>`+
        deps.map(o=>`<tr class="clik" data-city="${o.b}"><td><span class="fltno">${o.flt}</span></td><td style="text-align:left">${o.b}</td><td>${fmt(o.dep)}</td><td>${fmt(o.arr)}</td>
          <td style="text-align:left;padding-left:18px">${o.t} <span style="color:var(--ink3)">${o.ac}</span></td></tr>`).join('')+`</table>`:`<div class="empty">No departures.</div>`}</div>
      <div><h2>Arrivals <em>local times</em></h2>${arrs.length?`<table class="fptab"><tr><th>Flight</th><th style="text-align:left">From</th><th>Departs</th><th>Arrives</th><th style="text-align:left;padding-left:18px">Aircraft</th></tr>`+
        arrs.map(o=>`<tr class="clik" data-city="${o.a}"><td><span class="fltno">${o.flt}</span></td><td style="text-align:left">${o.a}</td><td>${fmt(o.dep)}</td><td>${fmt(o.arr)}</td>
          <td style="text-align:left;padding-left:18px">${o.t} <span style="color:var(--ink3)">${o.ac}</span></td></tr>`).join('')+`</table>`:`<div class="empty">No arrivals.</div>`}</div>
    </div>`;
}

function syncACLabels(){
  const keep=$('ac').value;
  $('ac').innerHTML=owned.map(a=>{
    const w=freeWindows(rots,owned,a.id);
    const tag=!rots.some(r=>r.ac===a.id)?'idle':(w.length?`free ${fmt(w[0].start)}`:'full');
    return `<option value="${a.id}"${a.id===keep?' selected':''}>${a.id} — ${a.t} · ${tag}</option>`;}).join('');
  if(keep)$('ac').value=keep;
}
