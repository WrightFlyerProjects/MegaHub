/* MegaHub · js/ui/markets.js — Markets tab: market explorer, opportunities (unserved cities, spill, missed connections), connecting markets + frequency & capture */
let mktCity=null, mkFilter='', mkE=null;

/* Circuity factor for connecting i→hub→j, exactly as evaluate() applies it. */
function circF(i,j){
  const d=dPair[i+j]; if(!d||dHub[i]==null||dHub[j]==null)return 0;
  const r=(dHub[i]+dHub[j])/d, tol=0.18+0.00022*d;
  return 1/(1+Math.pow(Math.max(0,r-1)/tol,2));
}
/* Connecting demand i→j that ONE well-timed daily connection can win, by evaluate()'s own rules:
   a market served by a single itinerary is capped at capture(1,HALF_CONN) of its demand, and the
   itinerary's own value (0.94 × circuity at a perfectly timed connection) caps it again. */
const connPot=(i,j)=>spill(i,j)*Math.min(capture(1,HALF_CONN),0.94*circF(i,j));
const servedSet=()=>new Set(rots.flatMap(r=>r.via?[r.dst,r.via]:[r.dst]));

/* Connection timing at the hub, using the same window evaluate() uses:
   minimum connect (+ customs from abroad) up to MAXCT. */
function connTiming(){
  const inb={}, outb={};
  rots.forEach((r,ri)=>(r.via?[r.dst,r.via]:[r.dst]).forEach(c=>{
    (inb[c]=inb[c]||[]).push({ri,t:r.arr}); (outb[c]=outb[c]||[]).push({ri,t:r.dep});}));
  return {inb,outb,mct:mctFor(gatesOwned)};
}
function pairTiming(T,i,j){
  const need=T.mct+(A[i].intl?CUSTOMS:0); let ok=0,best=null;
  (T.inb[i]||[]).forEach(a=>(T.outb[j]||[]).forEach(b=>{
    if(a.ri===b.ri)return;
    const ct=mod(b.t-a.t);
    if(ct>=need&&ct<=MAXCT){ok++;return;}
    const miss=ct<need?need-ct:ct-MAXCT;
    if(!best||miss<best.miss)best={miss,ct,short:ct<need,arr:a.t,dep:b.t};}));
  return {ok,best,need};
}
function missText(m){
  const b=m.best; if(!b)return '<span style="color:var(--ink3)">no service pattern</span>';
  return b.short
    ? `closest: arr ${fmt(b.arr)} → dep ${fmt(b.dep)}, <b>${Math.max(1,Math.round(b.miss))}m short</b> of ${m.need}m`
    : `closest: ${hm(Math.round(b.ct))} wait (limit ${hm(MAXCT)})`;
}
function missedConnections(served,T){
  const S=[...served], out=[];
  S.forEach(i=>S.forEach(j=>{
    if(i===j)return; const pot=connPot(i,j); if(pot<2)return;
    const t=pairTiming(T,i,j); if(t.ok)return;
    out.push({i,j,pot,best:t.best,need:t.need});}));
  return out.sort((a,b)=>b.pot-a.pot);
}
const smallestReach=c=>{const f=owned.filter(a=>canLeg(a,HUB.c,c)).sort((a,b)=>a.seats-b.seats)[0]; return f?f.t:null;};

function renderMarketsTab(E){
  mkE=E;
  const live=launched, stale=!launched&&!!lastE, show=live?E:(lastE||null);
  const sc=stale?'stale':'';
  const served=servedSet(), T=connTiming(), missed=missedConnections(served,T);
  const locals=live?E.local:(lastE?lastE.local:null);
  const pairRows=live?E.pairRows:((lastE&&lastE.pairRows)||null);

  /* ---------- explorer ---------- */
  if(!mktCity||!A[mktCity]||mktCity===HUB.c||dHub[mktCity]==null){
    const big=[...served].sort((a,b)=>hubOD(b)-hubOD(a))[0];
    mktCity=big||SPOKES.slice().sort((a,b)=>hubOD(b.c)-hubOD(a.c))[0].c;
  }
  const c=mktCity, isServed=served.has(c);
  const uns=SPOKES.filter(s=>!served.has(s.c)).sort((a,b)=>hubOD(b.c)-hubOD(a.c));
  $('mktSel').innerHTML=`<optgroup label="Served (${served.size})">`
    +[...served].sort().map(x=>`<option value="${x}"${x===c?' selected':''}>${x} — ${A[x].n}</option>`).join('')
    +`</optgroup><optgroup label="Not served — biggest hub market first">`
    +uns.map(s=>`<option value="${s.c}"${s.c===c?' selected':''}>${s.c} — ${s.n} · ${2*hubOD(s.c)}/day</option>`).join('')+`</optgroup>`;

  const f=rots.filter(r=>r.dst===c||r.via===c).length, half=halfLocal(c), market=2*hubOD(c);
  const tys=[...new Set(rots.filter(r=>r.dst===c||r.via===c).map(r=>owned.find(a=>a.id===r.ac)).filter(Boolean).map(a=>a.t))];
  const Lc=locals?locals.find(l=>l.c===c):null;
  const kv=(k,v,cls)=>`<tr><td>${k}</td><td class="${cls||''}">${v}</td></tr>`;
  const plus1=Math.round(market*(capture(f+1,half)-capture(f,half)));
  let loc;
  if(isServed){
    loc=`<table>${kv('Two-way hub market',`${market} pax/day`)}${kv('Passengers expect',`${half.toFixed(1)}× daily`)}
      ${kv('You fly',`${f}× daily · ${tys.join(', ')}`)}${kv('Share at this frequency',`${Math.round(capture(f,half)*100)}%`)}
      ${Lc?kv('Carried',`${Math.round(Lc.pax)} pax/day`,sc)+kv('Spilled (not carried)',`${Math.round(Lc.left)} pax/day`,sc):kv('Carried / spilled','hidden until you launch')}
      ${kv('One more daily frequency',`≈ +${plus1} pax/day of demand`)}</table>
      <div class="note">"One more" is the demand a 1× increase unlocks before seat limits and time-of-day effects.</div>`;
  }else{
    const reach=owned.filter(a=>canLeg(a,HUB.c,c)).map(a=>a.t), ry=[...new Set(reach)];
    loc=`<table>${kv('Two-way hub market',`${market} pax/day`)}${kv('Passengers expect',`${half.toFixed(1)}× daily`)}
      ${kv('Not served','—')}${kv('1× daily would win',`${Math.round(capture(1,half)*100)}% ≈ ${Math.round(market*capture(1,half))} pax/day`)}
      ${kv('2× daily would win',`${Math.round(capture(2,half)*100)}% ≈ ${Math.round(market*capture(2,half))} pax/day`)}
      ${kv('Your fleet can fly it nonstop',ry.length?ry.join(', '):'<span style="color:var(--red)">no type in range</span>')}</table>`;
  }
  // connecting flows (or, if unserved, what it could feed)
  let conn;
  if(isServed){
    const ms=show?show.markets.filter(m=>m.i===c||m.j===c).sort((a,b)=>b.pax-a.pax):null;
    conn=!ms?`<div class="empty">Connecting traffic hidden until you launch.</div>`
      :!ms.length?`<div class="empty">No connecting traffic through ${HUB.c} yet.</div>`
      :`<div class="${sc}"><table><tr><th>Market</th><th>Pax</th><th>Itin</th><th>Conn</th><th>Detour</th></tr>`
        +ms.slice(0,14).map(m=>`<tr class="clik" data-mcity="${m.i===c?m.j:m.i}"><td>${m.i}→${m.j}</td><td>${Math.round(m.pax)}</td><td>${m.n}</td><td>${Math.round(m.ct)}m</td><td>${m.r.toFixed(2)}×</td></tr>`).join('')
        +`</table>${ms.length>14?`<div class="note">+ ${ms.length-14} more markets</div>`:''}</div>`;
  }else{
    const pot=[...served].map(x=>({x,p:connPot(c,x)+connPot(x,c)})).filter(o=>o.p>=1).sort((a,b)=>b.p-a.p);
    const tot=pot.reduce((a,o)=>a+o.p,0);
    conn=pot.length?`<table><tr><th>Via ${HUB.c} to/from</th><th>Pax/day</th></tr>`
      +pot.slice(0,12).map(o=>`<tr class="clik" data-mcity="${o.x}"><td>${o.x} — ${A[o.x].n}</td><td>${Math.round(o.p)}</td></tr>`).join('')
      +`</table><div class="note">≈ ${Math.round(tot)} connecting pax/day of demand if each market gets one well-timed daily connection. One round trip seats at most twice its capacity, so a big number means room for a larger aircraft or more frequencies.</div>`
      :`<div class="empty">Little connecting potential with your current network.</div>`;
  }
  const mc=missed.filter(m=>m.i===c||m.j===c).slice(0,8);
  const missHtml=!isServed?'':mc.length?`<table><tr><th>Market</th><th>Potential</th><th style="text-align:left;padding-left:10px">Why it misses</th></tr>`
      +mc.map(m=>`<tr class="clik" data-mcity="${m.i===c?m.j:m.i}"><td>${m.i}→${m.j}</td><td>${Math.round(m.pot)}</td><td style="text-align:left;padding-left:10px;color:var(--ink2)">${missText(m)}</td></tr>`).join('')+`</table>`
      :`<div class="empty">Every sizable market through ${c} has a workable connection.</div>`;
  const pr=isServed&&pairRows?pairRows.filter(p=>p.i===c||p.j===c):null;
  const prHtml=pr&&pr.length?`<h3 class="sub3">Stop-en-route traffic</h3><div class="${sc}"><table><tr><th>Market</th><th>Pax/day</th></tr>`
      +pr.map(p=>`<tr><td>${p.i}→${p.j}</td><td>${Math.round(p.pax)}</td></tr>`).join('')+`</table></div>`:'';

  $('mexplab').textContent=live?`${era().year} results`:stale?`loads: ${lastE.year} · last year`:'loads hidden until you launch';
  $('mexp').innerHTML=`<div class="mexphead"><div><b>${c} — ${A[c].n}</b><br>
      <i>${Math.round(dHub[c])} nm from ${HUB.c} · local ${tzD(c)>=0?'+':''}${tzD(c)/60}h${A[c].intl?' · international (customs on connections)':''}</i></div>
      <div><span class="x" data-city="${c}" style="margin-right:14px">city card</span><span class="x" data-mdest="${c}">schedule a flight here →</span></div></div>
    <div class="cols" style="margin-top:6px">
      <div><h3 class="sub3">Local market (to/from ${HUB.c})</h3>${loc}${prHtml}</div>
      <div><h3 class="sub3">${isServed?`Connecting flows via ${HUB.c}`:`If served: connecting potential`}</h3>${conn}
        ${isServed?`<h3 class="sub3">Connections your banks miss</h3>${missHtml}`:''}</div>
    </div>`;

  /* ---------- opportunities ---------- */
  const unsList=uns.map(s=>{let cp=0; served.forEach(x=>{cp+=connPot(s.c,x)+connPot(x,s.c);});
      return {c:s.c,d:dHub[s.c],mkt:Math.round(2*hubOD(s.c)*capture(1,halfLocal(s.c))),cp,reach:smallestReach(s.c)};})
    .sort((a,b)=>(b.mkt+b.cp)-(a.mkt+a.cp)).slice(0,12);
  $('oppUnserved').innerHTML=unsList.length?`<table><tr><th>City</th><th>nm</th><th>Local 1×</th><th>Conn</th><th>Reach</th></tr>`
    +unsList.map(u=>`<tr class="clik" data-mcity="${u.c}"><td>${u.c}</td><td>${Math.round(u.d)}</td><td>${u.mkt}</td><td>${Math.round(u.cp)}</td>
      <td style="color:${u.reach?'var(--ink2)':'var(--red)'}">${u.reach||'none'}</td></tr>`).join('')+`</table>
    <div class="note">Demand a 1× daily round trip could draw, pax/day: Local 1× = its share of the hub market · Conn = one well-timed connection per market with your network · Reach = smallest aircraft you own that can fly it nonstop.</div>`
    :`<div class="empty">You serve every city in range.</div>`;

  const legLF={}; if(live)(E.legs||[]).forEach(l=>{const x=l.a===HUB.c?l.b:l.a;(legLF[x]=legLF[x]||{p:0,s:0});legLF[x].p+=l.pax;legLF[x].s+=l.seats;});
  const spillL=locals?locals.filter(l=>l.left>=1).sort((a,b)=>b.left-a.left).slice(0,12):null;
  $('oppSpill').innerHTML=!spillL?`<div class="empty">Hidden until you launch.</div>`
    :!spillL.length?`<div class="empty">No meaningful spill.</div>`
    :`<div class="${sc}"><table><tr><th>City</th><th>Daily</th><th>Carried</th><th>Spilled</th><th style="text-align:left;padding-left:10px">Try</th></tr>`
      +spillL.map(l=>{const ll=legLF[l.c], full=ll&&ll.s&&ll.p/ll.s>=0.95;
        const hint=full?'upgauge — flights are full':l.f<Math.round(halfLocal(l.c))?'add a frequency':'retime for better hours';
        return `<tr class="clik" data-mcity="${l.c}"><td>${l.c}</td><td>${l.f}×</td><td>${Math.round(l.pax)}</td><td>${Math.round(l.left)}</td><td style="text-align:left;padding-left:10px;color:var(--ink2)">${hint}</td></tr>`;}).join('')
      +`</table></div><div class="note">Spilled = local demand you didn't carry: too few frequencies, too few seats, or poor departure times.</div>`;

  $('oppMissed').innerHTML=missed.length?`<table><tr><th>Market</th><th>Pot.</th><th style="text-align:left;padding-left:10px">Why it misses</th></tr>`
    +missed.slice(0,12).map(m=>`<tr class="clik" data-mcity="${m.i}"><td>${m.i}→${m.j}</td><td>${Math.round(m.pot)}</td><td style="text-align:left;padding-left:10px;color:var(--ink2)">${missText(m)}</td></tr>`).join('')
    +`</table><div class="note">Markets with real demand but no connection that fits between ${T.mct}m (+${CUSTOMS}m customs from abroad) and ${hm(MAXCT)}. Retime an arrival or departure to capture them.</div>`
    :`<div class="empty">No sizable market is missing a connection.</div>`;
  $('opplab').textContent=`${served.size} cities served · ${uns.length} in range not served`;

  /* ---------- network-wide connecting markets (searchable) + frequency & capture ---------- */
  $('mklab').textContent=stale?`${lastE.year} · last year`:'';
  const q=mkFilter.trim().toUpperCase();
  const ms=show?show.markets.filter(m=>!q||m.i.includes(q)||m.j.includes(q)||(m.i+'–'+m.j).includes(q)):null;
  $('markets').innerHTML=!show?`<div class="empty">Hidden until you launch.</div>`
    :`<div class="${sc}">`+(ms.length?`<table><tr><th>Market</th><th>Itin</th><th>Conn</th><th>Detour</th><th>Pax</th><th></th></tr>`+
      ms.slice(0,20).map(m=>`<tr class="clik" data-mcity="${m.i}"><td>${m.i}–${m.j}</td><td>${m.n}</td><td>${Math.round(m.ct)}m</td>
        <td>${m.r.toFixed(2)}×</td><td>${Math.round(m.pax)}</td><td><span class="pill ${pcls(m.v)}">${Math.round(m.v*100)}%</span></td></tr>`).join('')
      +`</table>${ms.length>20?`<div class="note">showing 20 of ${ms.length} — search to narrow</div>`:''}`
    :show.markets.length?`<div class="empty">No market matches "${mkFilter}".</div>`
    :`<div class="empty">No connections. Land two aircraft, wait ${MCTg()}+ minutes, push them out again.</div>`)+`</div>`;

  $('fqlab').textContent=stale?`${lastE.year} · last year`:'click a city';
  $('freq').innerHTML=!locals||!locals.length?`<div class="empty">Serve a spoke once and you capture a fraction of it. Serve it four times and you capture most of it.</div>`
    :`<div class="${sc}"><table><tr><th>Spoke</th><th>Daily</th><th>Share</th><th>Pax</th><th>Left</th></tr>`+
      locals.slice(0,14).map(l=>`<tr class="clik" data-city="${l.c}"><td>${l.c}</td><td>${l.f}×</td>
        <td>${Math.round(l.cap*100)}%</td><td>${Math.round(l.pax)}</td>
        <td style="color:var(--ink3)">${Math.round(l.left)}</td></tr>`).join('')+`</table></div>`;
}

function exploreMarket(c){
  mktCity=c; renderMarketsTab(mkE||evaluate(rots,owned,gatesOwned));
  const p=$('mexpPanel'); if(p&&p.scrollIntoView)p.scrollIntoView({block:'start',behavior:'smooth'});
}
$('mktSel').addEventListener('change',e=>exploreMarket(e.target.value));
$('mktFind').addEventListener('input',e=>{mkFilter=e.target.value;renderMarketsTab(mkE||evaluate(rots,owned,gatesOwned));});
document.addEventListener('click',e=>{
  const m=e.target.closest&&e.target.closest('[data-mcity]');
  if(m){exploreMarket(m.getAttribute('data-mcity'));return;}
  const x=e.target.closest&&e.target.closest('[data-explore]');
  if(x){showTab('markets');exploreMarket(x.getAttribute('data-explore'));return;}
  const d=e.target.closest&&e.target.closest('[data-mdest]');
  if(d){const c=d.getAttribute('data-mdest'); showTab('schedule'); setDest(c); preview();
    const r=$('pRot'); if(r&&r.scrollIntoView)r.scrollIntoView({block:'start',behavior:'smooth'});}
});
