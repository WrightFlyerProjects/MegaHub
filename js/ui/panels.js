/* MegaHub · js/ui/panels.js — hub labels, fleet panel, roster, replace/move aircraft, stats, year award, board axes */
/* ---------------- panels ---------------- */
function renderHubLabels(){
  $('gatelab').textContent=`Gates at ${HUB.c}`;
  $('deplab').textContent=`Dep ${HUB.c}`;
  $('foothub').textContent=HUB.c;
}
function renderHub(){
  renderHubLabels();
  const locked=rots.length>0||owned.length>0||(committed&&Object.keys(committed).length>0);
  $('hub').innerHTML=HUBS.map(c=>`<option value="${c}"${c===HUB.c?' selected':''}>${c} — ${A[c].n}</option>`).join('');
  $('hub').disabled=locked;
  $('hublock').textContent=locked?'· locked once you schedule':'· pick before you schedule';
  // start-year options: any data year, each showing how many rounds it yields
  const st=era().start;
  const opts=[];
  for(let y=YEAR_MIN;y<=DATA_MAX;y++) opts.push(`<option value="${y}"${y===st?' selected':''}>${y} — ${YEAR_MAX-y+1} rounds to ${YEAR_MAX}</option>`);
  $('startY').innerHTML=opts.join('');
  $('startY').disabled=locked;
  $('startlock').textContent=locked?'· locked':(st>YEAR_MIN?`· 747s from turn one`:'· pick before you schedule');
}
function renderFleetPanel(){
  const avail=availTypes();
  $('bpts').textContent=points+' pts · upkeep '+upkeepPts(owned,gatesOwned,gateTiers)+'/yr';
  $('hdrPts').innerHTML=`Points<br>${points}`;
  $('cat').innerHTML=avail.map(c=>{
    const have=owned.filter(o=>o.t===c.t).length, add=pending[c.t]||0;
    return `<div><b>${c.t}</b><i>${c.seats} seats · ${c.rng} nm · own ${have}</i></div>
      <span style="color:var(--ink3);font-size:11px">${c.cost}pt</span>
      <span class="stepper"><span data-m="${c.t}">−</span><span class="n">${add}</span><span data-p="${c.t}">+</span></span>`;}).join('');
  const cost=spendNow(), over=cost>points;
  $('gnum').textContent=gatesOwned+gatesPending;
  /* gate tiers: counts at each tier, what the schedule needs at peak, and pending upfits */
  const tn=tierNext(), tc=gateTierCurves(rots,owned), needI=Math.max(0,...tc.i), needH=Math.max(0,...tc.h);
  const std=gatesOwned+gatesPending-tn.H-tn.I;
  $('tiercat').innerHTML=`<div><b>Heavy</b><i>widebodies (200+ seats) · upkeep 2/yr</i></div>
      <span style="color:var(--ink3);font-size:11px">+${GATE_UP_H}pt</span>
      <span class="stepper"><span data-hm="1">−</span><span class="n">${tn.H}</span><span data-hp="1">+</span></span>
    <div><b>International</b><i>customs for arrivals from abroad · takes widebodies · upkeep 3/yr</i></div>
      <span style="color:var(--ink3);font-size:11px" title="+${GATE_UP_I}pt when upgrading a heavy gate">+${GATE_UP_H+GATE_UP_I}pt</span>
      <span class="stepper"><span data-im="1">−</span><span class="n">${tn.I}</span><span data-ip="1">+</span></span>`;
  const okI=tn.I>=needI, okH=tn.H+tn.I>=needH;
  $('gatemix').innerHTML=`<div class="gatemix"><span>${std} standard · ${tn.H} heavy · ${tn.I} international</span>
    <span style="color:${okI&&okH?'var(--green)':'var(--red)'}">schedule needs ${needI} intl${needH>needI?` + ${needH-needI} heavy`:''} at peak${okI&&okH?' ✓':''}</span></div>`;
  $('bbar').style.width=Math.min(100,points?cost/points*100:0)+'%';
  $('bbar').className=over?'over':'';
  const f=[...owned,...pendingList()];
  const nT=typeCount(f), turn=f.length?minTurnHub(f):0;
  $('buysum').innerHTML=
     `<div class="bs spend"><span>Spend</span><b>${cost} pt</b></div>`
    +`<div class="bs${over?' over':''}"><span>Points left</span><b>${points-cost}</b></div>`
    +`<div class="bs"><span>Fleet</span><b>${f.length} aircraft</b></div>`
    +`<div class="bs"><span>Gates</span><b>${gatesOwned+gatesPending}${tn.H||tn.I?` <span style="color:var(--ink3);font-weight:400">(${tn.H}H · ${tn.I}I)</span>`:''}</b></div>`
    +`<div class="bs"><span>Aircraft types</span><b>${f.length?nT:'—'}</b></div>`
    +`<div class="bs"><span>Hub turn</span><b>${f.length?turn+'m':'—'}</b></div>`;
  const prospect=[...owned,...pendingList()], newG=gatesOwned+gatesPending;
  let warn='';
  if(owned.length&&minTurnHub(prospect)>minTurnHub(owned)){
    const broke=scheduleViolations(rots,prospect,newG).filter(v=>v.kind==='turn').length;
    warn+=`<div style="font:500 11px/1.5 var(--mono);color:var(--amber);margin-top:8px">Hub turn rises to ${minTurnHub(prospect)}m`
      +(broke?` — strands ${broke} rotation${broke>1?'s':''}`:'')+`</div>`;}
  if(mctFor(newG)>MCTg())
    warn+=`<div style="font:500 11px/1.5 var(--mono);color:var(--amber);margin-top:4px">Min connect rises to ${mctFor(newG)}m — a bigger terminal is a slower one</div>`;
  if(!okI||!okH)
    warn+=`<div style="font:500 11px/1.5 var(--mono);color:var(--red);margin-top:4px">Not enough ${!okI?'international':'heavy-capable'} gates for your schedule — upfit ${!okI?needI-tn.I+' to international':needH-tn.H-tn.I+' to heavy'} before you launch</div>`;
  $('warn').innerHTML=warn;
  $('build').disabled=over||(cost===0);
  renderRoster();
}

/* Replace aircraft (#3): swap an owned tail for a freshly-bought aircraft of another
   type. The whole schedule transfers to the new tail. You pay the new type's cost and
   recoup the old one's trade-in. A candidate type is only offered if the new aircraft can
   fly every leg the old tail currently operates (range/ocean) — otherwise routes would strand. */
function legsOfAircraft(id){
  const legs=[];
  acRots(rots,id).forEach(r=>{
    (r.via?[[HUB.c,r.via],[r.via,r.dst],[r.dst,r.via],[r.via,HUB.c]]:[[HUB.c,r.dst],[r.dst,HUB.c]])
      .forEach(([a,b])=>legs.push([a,b]));
  });
  return legs;
}
function typeCanFly(cat,legs){
  return legs.every(([a,b])=>{
    const d=nm(A[a],A[b]);
    if(d>cat.rng)return false;
    if((A[a].ocean||A[b].ocean)&&d>OCEAN_LEG&&!cat.etops)return false;
    return true;
  });
}
function replaceCandidates(id){
  const old=owned.find(a=>a.id===id); if(!old)return [];
  const legs=legsOfAircraft(id);
  const refund=tradeInValue(old.t);
  return availTypes().filter(c=>c.t!==old.t).map(c=>{
    const net=c.cost-refund;                         // points you pay (may be negative = gain)
    const flies=typeCanFly(c,legs);
    // does the new type's hub turn strand any of this aircraft's rotations?
    let turnWarn=false;
    if(flies){
      const prospect=owned.map(a=>a.id===id?{...a,...c,id}:a);
      const broke=scheduleViolations(rots,prospect,gatesOwned).filter(v=>v.kind==='turn'&&v.ac===id).length;
      turnWarn=broke>0;
    }
    return {t:c.t,seats:c.seats,rng:c.rng,cost:c.cost,net,flies,turnWarn,affordable:net<=points};
  });
}
function doReplace(id,newType){
  const old=owned.find(a=>a.id===id); if(!old)return;
  const cat=CATALOG.find(c=>c.t===newType); if(!cat)return;
  const legs=legsOfAircraft(id);
  if(!typeCanFly(cat,legs)){alert(`${newType} can't fly all of ${id}'s current routes.`);return;}
  const refund=tradeInValue(old.t), net=cat.cost-refund;
  if(net>points){alert(`Not enough points — replacing costs ${cat.cost}, you recoup ${refund} (net ${net}).`);return;}
  if(!confirm(`Replace ${id} (${old.t}) with a new ${newType}?\nPay ${cat.cost}, recoup ${refund} → net ${net>=0?'−':'+'}${Math.abs(net)} pts. Its ${acRots(rots,id).length} rotation(s) move to the new aircraft.`))return;
  pushUndo('replace aircraft');
  // swap the catalog stats in place, keep the same tail id so rotations stay attached
  const idx=owned.findIndex(a=>a.id===id);
  owned[idx]={id, ...cat};
  // rebuild this aircraft's rotations so block time, duration and arrival reflect the
  // new type's speed (otherwise the schedule keeps the old aircraft's timing)
  rots.forEach((r,i)=>{ if(r.ac===id) rots[i]=mkRot(id,r.dst,r.via||null,r.dep,r.turn,r.pad||0); });
  points-=net;
  launched=false;                                    // fleet changed -> re-launch
  replOpen=null;
  syncAC();renderHub();renderFleetPanel();render();preview();saveLocal();
}

/* Move a route to a different aircraft (#4): when editing a rotation, offer the other
   owned aircraft that could legally take it — right range, and a free slot that doesn't
   break turn timing. One click reassigns the rotation's tail. */
function moveTargets(editIdx){
  const r=rots[editIdx]; if(!r)return [];
  return owned.filter(a=>a.id!==r.ac).map(a=>{
    // validate this rotation on aircraft a, ignoring the rotation's current slot
    const err=validate(rots,owned,gatesOwned,a.id,r.dst,r.dep,r.turn,r.via||null,editIdx,r.pad||0);
    const w=freeWindows(rots,owned,a.id);
    return {id:a.id,t:a.t,ok:!err,why:err||'',
      tag:!rots.some(x=>x.ac===a.id)?'idle':(w.length?`free ${fmt(w[0].start)}`:'full')};
  });
}
function renderMoveRow(){
  const row=$('moverow'); if(!row)return;
  if(editIdx===null||!rots[editIdx]){row.style.display='none';row.innerHTML='';return;}
  const r=rots[editIdx];
  const targets=moveTargets(editIdx).filter(t=>t.ok);
  row.style.display='block';
  row.innerHTML=`<div class="mh">Move ${r.ac} → ${r.dst}${r.via?' via '+r.via:''} to another aircraft</div>`
    +(targets.length
      ? `<div class="mchips">`+targets.map(t=>`<span class="mchip" data-move="${t.id}">${t.id} <span class="d">${t.t} · ${t.tag}</span></span>`).join('')+`</div>`
      : `<div class="mnone">No other aircraft can take this rotation right now (range or no free slot).</div>`);
}
function doMove(newId){
  if(editIdx===null||!rots[editIdx])return;
  const r=rots[editIdx];
  const err=validate(rots,owned,gatesOwned,newId,r.dst,r.dep,r.turn,r.via||null,editIdx,r.pad||0);
  if(err){$('err').textContent=err;return;}
  pushUndo('move route');
  // rebuild the rotation on the new aircraft so block time, duration and arrival
  // are recomputed for its speed — not carried over from the old tail
  rots[editIdx]=mkRot(newId,r.dst,r.via||null,r.dep,r.turn,r.pad||0);
  editIdx=null; launched=false;
  syncAC();render();preview();saveLocal();
}

function renderRoster(){
  const host=$('roster'); if(!host)return;
  if(!owned.length){host.innerHTML='';return;}
  // group by type, in catalog order, so like aircraft sit together (#4)
  const order=CATALOG.map(c=>c.t);
  const byType={};
  owned.forEach(a=>{(byType[a.t]=byType[a.t]||[]).push(a);});
  const types=Object.keys(byType).sort((x,y)=>order.indexOf(x)-order.indexOf(y));
  host.innerHTML='<div style="border-top:1px solid var(--rule);margin:12px 0 2px"></div>'
    +'<div class="rgh" style="border:none;margin-bottom:2px"><span>Your fleet</span><em>rename · replace · sell</em></div>'
    +types.map(t=>{
      const list=byType[t], c=CATALOG.find(x=>x.t===t), val=tradeInValue(t);
      return `<div class="rgroup"><div class="rgh"><span>${t} <em>× ${list.length}</em></span><em>sell → +${val}pt</em></div>`
        +list.map(a=>{
          const flying=rots.some(r=>r.ac===a.id);
          let box='';
          if(replOpen===a.id){
            const cands=replaceCandidates(a.id);
            const rows=cands.map(cd=>{
              const disabled=!cd.flies||!cd.affordable;
              const why=!cd.flies?'out of range for a current route':!cd.affordable?`need ${cd.net} pts`:cd.turnWarn?'may strand a rotation (slower turn)':'';
              const netTxt=cd.net>=0?`−${cd.net}`:`+${-cd.net}`;
              return `<div class="replopt ${disabled?'bad':''}" ${disabled?'':`data-repl="${a.id}" data-rtype="${cd.t}"`}>
                <span><b>${cd.t}</b> <span class="d">${cd.seats}s · ${cd.rng}nm</span></span>
                <span class="d">${disabled?why:`net ${netTxt} pt${cd.turnWarn?' ⚠':''}`}</span></div>`;
            }).join('');
            box=`<div class="replbox"><div class="rh">Replace ${a.id} — pick a new aircraft (schedule transfers)</div>${rows||'<div class="replnote">No other types available this year.</div>'}<div class="replnote">You pay the new price and recoup ${val}pt for the old ${t}.</div></div>`;
          }
          return `<div class="rline">
            <input class="tail" value="${a.id}" data-tail="${a.id}" maxlength="6" spellcheck="false">
            <span class="rst ${flying?'flying':''}">${flying?'in service':'idle'}</span>
            <button class="repl" data-replopen="${a.id}">${replOpen===a.id?'cancel':'replace'}</button>
            <button class="sell" data-sell="${a.id}" ${flying?'disabled title="unschedule its flights first"':''}>sell +${val}</button>
          </div>`+box;}).join('')
        +`</div>`;}).join('');
}
function renderStats(E){
  const mt=owned.length?minTurnHub(owned):0, m=v=>launched?v:'—', cls=launched?'v':'v mask';
  const e=era(), pv=launched?prevResult(e.year):null, vs=d=>d?`${d} vs ${pv.y}`:'';
  $('erabar').innerHTML=`Year ${e.year} · round ${e.round} of ${e.rounds} · data: ${e.data}${e.leap?' <span style="color:var(--mag)">new snapshot</span>':''}`;
  $('hdrPts').innerHTML=`Points<br>${points}`;
  $('cumbar').innerHTML=`Cumulative net<br>${cumPm?Math.round(cumPm).toLocaleString()+' pax-mi':'—'}`;
  $('stats').innerHTML=[
    ['Net pax-miles',m(Math.round(E.netPm).toLocaleString()),launched?(pv?vs(yoy(E.netPm,pv.pm)):'filled − empty'):'launch to reveal',cls],
    ['Passengers',m(Math.round(E.pax).toLocaleString()),launched?(pv&&pv.pax!=null?vs(yoy(E.pax,pv.pax)):'boarded'):'hidden',cls],
    ['Load factor',m(Math.round((E.lf||0)*100)+'%'),launched?(pv&&pv.lf!=null?vs(yoy(E.lf,pv.lf,true)):'filled ÷ seats'):'hidden',cls],
    ['Peak gates',E.peak+' / '+gatesOwned,`${E.rons} away · ${E.vias} via`,'v'],
    ['Hub turn',mt+'m',typeCount(owned)+' fleet type'+(typeCount(owned)>1?'s':''),'v'],
    ['Min connect',MCTg()+'m',gatesOwned+' gates leased','v'],
    ['On-time',rots.length?Math.round(E.otp*100)+'%':'—',
      rots.length?`avg delay +${Math.round(E.delays.reduce((a,d)=>a+d,0)/E.delays.length)}m`:'no flying','v']
  ].map(s=>`<div class="stat"><div class="k">${s[0]}</div><div class="${s[3]}">${s[1]}</div><div class="n">${s[2]}</div></div>`).join('');
  const viol=scheduleViolations(rots,owned,gatesOwned,gateTiers);
  if(viol.length){
    const turns=viol.filter(v=>v.kind==='turn'), gate=viol.find(v=>v.kind==='gates'), tiers=viol.filter(v=>v.kind==='gatetier');
    $('viol').style.display='block';
    $('viol').innerHTML=`<h2 style="border-color:rgba(178,58,58,.3);color:var(--red)">Schedule no longer legal</h2>`
      +(turns.length?`<div class="rowv" style="margin-bottom:6px"><span>${turns.length} rotation${turns.length>1?'s':''} break the ${minTurnHub(owned)}-minute hub turn</span></div>`
        +`<table>${turns.slice(0,6).map(v=>`<tr><td>${v.ac} → ${v.dst}</td><td>${v.have}m on the ground</td><td style="color:var(--red)">needs ${v.need}m</td></tr>`).join('')}</table>`:'')
      +(gate?`<div class="rowv" style="margin-top:6px"><span>Peak gate demand ${gate.peak} exceeds ${gate.gates} leased</span></div>`:'')
      +(tiers.length?`<table style="margin-top:6px">${tiers.slice(0,6).map(v=>`<tr><td style="text-align:left">${v.tier===2
          ?`${v.peak} arrivals from abroad need customs gates`:`${v.peak} aircraft need heavy-capable gates <span style="color:var(--ink3)">(widebodies + customs arrivals)</span>`}</td>
          <td>${fmt(v.start)}–${fmt(v.end)}</td><td style="color:var(--red)">you have ${v.have}</td></tr>`).join('')}</table>
          <div class="note">Upfit gates on the Fleet tab, or retime so fewer overlap. International gates also take widebodies.</div>`:'')
      +(turns.length?`<button id="autofix">Nudge departures later</button>`:'');
    if(turns.length)$('autofix').onclick=()=>{
      const r=repairSchedule(rots,owned,gatesOwned,gateTiers);
      rots=r.rots; launched=false; editIdx=null; render(); preview();};
  } else $('viol').style.display='none';
  const tnb=$('tiernote'); if(tnb){tnb.style.display=tierNotice?'block':'none';
    if(tierNotice)tnb.innerHTML=`<span>${tierNotice}</span><span class="x" data-tnclose="1">✕</span>`;}
  const e0=era(), lastYear=e0.year===YEAR_MAX;
  $('launch').textContent = launched ? `${e0.year} flown` :
    viol.length ? 'Fix the schedule first' :
    !rots.length ? 'Launch schedule' :
    lastYear ? `Launch ${e0.year} schedule & see results` : `Launch ${e0.year} schedule & see results`;
  $('launch').disabled=launched||!rots.length||viol.length>0;
}
function renderAward(){
  if(!launched||!lastAward){$('award').style.display='none';return;}
  const {year:flownYear,pm,netPm,lf,gross,up,net}=lastAward;
  const last=flownYear===YEAR_MAX;
  const nextLeap=!last&&isLeap(flownYear+1);
  $('award').style.display='block';
  $('award').innerHTML=`<h2>${flownYear} results</h2>
    <div class="rowv"><span>Filled pax-miles</span><b>${Math.round(pm).toLocaleString()}</b></div>
    <div class="rowv"><span>Empty-seat penalty</span><b style="color:var(--red)">−${Math.round(pm-netPm).toLocaleString()}</b></div>
    <div class="rowv"><span><b>Net pax-miles</b></span><b>${Math.round(netPm).toLocaleString()}</b></div>
    <div class="rowv"><span>Load factor</span><b>${Math.round((lf||0)*100)}%</b></div>
    <div class="rowv" style="margin-top:4px"><span>Cumulative net</span><b>${Math.round(cumPm).toLocaleString()}</b></div>
    <div style="border-top:1px solid var(--rule);margin:8px 0"></div>
    <div class="rowv"><span>Traffic points earned</span><b>+${gross}</b></div>
    <div class="rowv"><span>Fleet &amp; gate upkeep</span><b style="color:var(--red)">−${up}</b></div>
    <div class="rowv" style="margin-top:4px"><span><b>Net carried forward</b></span><b style="color:${net>=0?'var(--green)':'var(--red)'}">${net>=0?'+':''}${net}</b></div>
    ${results.length?`<div style="border-top:1px solid var(--rule);margin:8px 0"></div><div style="font:400 11px/1.7 var(--mono);color:var(--ink3)">`
      +results.slice(-6).map(r=>`${r.y}: ${Math.round(r.pm/1000).toLocaleString()}k`).join(' · ')+`</div>`:''}
    ${last?`<div class="empty">${era().start}–${YEAR_MAX} complete. Final net: ${Math.round(cumPm).toLocaleString()} pax-mi.</div>`
      :`<button id="advance">Continue to ${flownYear+1}${nextLeap?' — new schedule data':''}</button>`}`;
  if(!last)$('advance').onclick=()=>{
    setYear(flownYear+1);                     // roll the calendar forward now
    launched=false; editIdx=null; pending={}; gatesPending=0; tierPend={H:0,I:0}; lastAward=null;
    undoStack=[];                             // a new year is a fresh undo context
    markYearStart();                          // remember how the airline looks as the year opens
    renderHub();renderFleetPanel();render();preview();
    window.scrollTo({top:0,behavior:'smooth'});
    saveLocal();
  };
}
function renderAxes(){
  let a='<b>'+HUB.c+'</b>';for(let h=0;h<24;h+=2)a+=`<i style="left:${X(h*60)}%">${fmtHour(h)}</i>`;
  $('axis').innerHTML=a;
  const d=destSel;
  if(!d||!A[d]||d===HUB.c){$('axis2').innerHTML='<b>—</b>';return;}
  const tz=tzD(d);let b=`<b>${d}</b>`;
  for(let h=0;h<24;h+=2){const loc=Math.floor(mod(h*60+tz)/60);b+=`<i style="left:${X(h*60)}%">${fmtHour(loc)}</i>`;}
  $('axis2').innerHTML=b;
  $('axlab').textContent=`${HUB.c} local · magenta row = ${d} local (${tz>=0?'+':''}${tz/60}h)`;
}
