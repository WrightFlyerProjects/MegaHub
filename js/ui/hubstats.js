/* MegaHub · js/ui/hubstats.js — Hub tab analytics: bank chart, tightest connections, delay-prone flights (with cause), gate utilization */

/* flight numbers per rotation, from evaluate()'s per-leg records */
function fltNos(E){const m={};(E.flights||[]).forEach(f=>{(m[f.ri]=m[f.ri]||{})[f.dir]=f.no;});return m;}

/* Split a rotation's expected delay into its sources, using the delay model's own terms. */
function delayCauses(r,i,E,press){
  const p=press[Math.round(mod(r.dep))%DAY];
  const bank=DLY_CONGEST*Math.max(0,p-DLY_CONGEST_FREE);
  const legs=r.via?[[HUB.c,r.via],[r.via,r.dst],[r.dst,r.via],[r.via,HUB.c]]:[[HUB.c,r.dst],[r.dst,HUB.c]];
  const expo=legs.reduce((a,[x,y])=>a+DLY_PER_NM*Math.max(0,nm(A[x],A[y])-DLY_FREE_NM),0);
  const tot=E.delays[i]||0, knock=Math.max(0,tot-bank-expo);
  return {tot,bank,expo,knock,p};
}

function renderBankChart(E){
  const host=$('bankchart'); if(!host)return;
  if(!rots.length){host.innerHTML='<div class="empty" style="padding:18px 14px">Schedule some flying to see your banks.</div>';$('banklab').textContent='';return;}
  const BIN=15, NB=DAY/BIN, arr=new Array(NB).fill(0), dep=new Array(NB).fill(0), ca=new Array(NB).fill(0), cd=new Array(NB).fill(0);
  const live=launched;
  rots.forEach((r,i)=>{const a=Math.floor(mod(r.arr)/BIN)%NB, d=Math.floor(mod(r.dep)/BIN)%NB; arr[a]++; dep[d]++;
    if(live&&E.perRot[i]){ca[a]+=E.perRot[i].retConnect; cd[d]+=E.perRot[i].outConnect;}});
  const W=760,H=190,P=34,mid=H/2, bw=(W-2*P)/NB, mf=Math.max(1,...arr,...dep), mp=Math.max(1,...ca,...cd);
  const x=i=>P+i*bw, yb=v=>v/mf*(mid-22), yl=v=>v/mp*(mid-22);
  let g='';
  for(let h=0;h<=24;h+=2){const xx=P+h*60/BIN*bw; g+=`<line x1="${xx.toFixed(1)}" y1="14" x2="${xx.toFixed(1)}" y2="${H-14}" stroke="rgba(22,40,60,.07)"/>`
    +(h<24?`<text x="${(xx+2).toFixed(1)}" y="${H-3}" font-size="8.5" font-family="IBM Plex Mono,monospace" fill="#7C8A99">${fmtHour(h)}</text>`:'');}
  const bars=arr.map((v,i)=>v?`<rect x="${(x(i)+0.5).toFixed(1)}" y="${(mid-yb(v)).toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${yb(v).toFixed(1)}" fill="${airline.c1}" opacity=".78"><title>${fmt(i*BIN)}–${fmt((i+1)*BIN)} · ${v} arrival${v>1?'s':''}${live?` · ${Math.round(ca[i])} connecting pax`:''}</title></rect>`:'').join('')
    +dep.map((v,i)=>v?`<rect x="${(x(i)+0.5).toFixed(1)}" y="${mid.toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${yb(v).toFixed(1)}" fill="#B02A6B" opacity=".7"><title>${fmt(i*BIN)}–${fmt((i+1)*BIN)} · ${v} departure${v>1?'s':''}${live?` · ${Math.round(cd[i])} connecting pax`:''}</title></rect>`:'').join('');
  const line=(vals,up)=>'M'+vals.map((v,i)=>`${(x(i)+bw/2).toFixed(1)} ${(up?mid-yl(v):mid+yl(v)).toFixed(1)}`).join(' L');
  const lines=live?`<path d="${line(ca,true)}" fill="none" stroke="#5A7C33" stroke-width="1.6"/><path d="${line(cd,false)}" fill="none" stroke="#5A7C33" stroke-width="1.6" stroke-dasharray="3 2"/>`:'';
  const pk=(a)=>{const m=Math.max(...a),i=a.indexOf(m);return [m,i];};
  const [ma,ia]=pk(arr),[md,id]=pk(dep);
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Arrival and departure banks by time of day">${g}
    <line x1="${P}" y1="${mid}" x2="${W-P}" y2="${mid}" stroke="rgba(22,40,60,.35)"/>${bars}${lines}
    <text x="${P}" y="12" font-size="9" font-family="IBM Plex Mono,monospace" fill="#4A5B6E">▲ arrivals per 15 min</text>
    <text x="${P}" y="${H-16}" font-size="9" font-family="IBM Plex Mono,monospace" fill="#4A5B6E">▼ departures per 15 min</text></svg>
    <div class="maplegend">busiest: ${ma} arrivals at ${fmt(ia*BIN)} · ${md} departures at ${fmt(id*BIN)}${live?' · green line = connecting passengers on those flights (solid arriving, dashed departing)':' · connecting passengers appear after you launch'}</div>`;
  $('banklab').textContent=`${rots.length} arrivals · ${rots.length} departures · ${HUB.c} local time`;
}

function renderHubStats(E){
  if(!$('hubTight'))return;
  renderBankChart(E);
  const nos=fltNos(E);

  /* tightest connections: best itinerary per market (evaluate() keeps its make-probability) */
  const live=launched, stale=!launched&&!!lastE, ms=live?E.markets:(lastE?lastE.markets:null);
  $('tightlab').textContent=stale?`${lastE.year} · last year`:'';
  const tight=ms?ms.filter(m=>m.P!=null&&m.P<0.9).map(m=>({...m,lost:m.pax*(1-m.P)/Math.max(0.05,m.P)})).sort((a,b)=>b.lost-a.lost).slice(0,10):null;
  $('hubTight').innerHTML=!tight?`<div class="empty">Hidden until you launch.</div>`
    :!tight.length?`<div class="empty">No tight connections — every market's best connection has a healthy buffer.</div>`
    :`<div class="${stale?'stale':''}"><table class="fptab"><tr><th>Market</th><th>Conn</th><th>Need</th><th>Late in</th><th>Makes</th><th>Lost</th></tr>`
      +tight.map(m=>`<tr class="clik" data-mcity="${m.i}"><td>${m.i}→${m.j}</td><td>${Math.round(m.ct)}m</td><td>${m.need}m</td><td>+${Math.round(m.del)}m</td>
        <td><span class="pill ${m.P>=0.75?'p-md':'p-lo'}">${Math.round(m.P*100)}%</span></td><td>${Math.round(m.lost)}</td></tr>`).join('')
      +`</table></div><div class="note">Connections where a late inbound eats the buffer. Makes = chance the connection works · Lost = pax/day of demand the risk costs you. Retime the inbound earlier or the outbound later.</div>`;

  /* delay-prone flights, with the model's own causes */
  const press=hubDepPressure(rots);
  const dl=rots.map((r,i)=>({r,i,...delayCauses(r,i,E,press)})).filter(x=>x.tot>=1).sort((a,b)=>b.tot-a.tot).slice(0,10);
  $('hubDelay').innerHTML=!rots.length?`<div class="empty">No flying yet.</div>`:!dl.length?`<div class="empty">Nothing expects meaningful delay.</div>`
    :`<table class="fptab"><tr><th>Flight</th><th>Tail</th><th>Dep</th><th>Delay</th><th style="text-align:left;padding-left:10px">Main cause</th></tr>`
      +dl.map(x=>{const c=[[x.bank,`crowded bank (${x.p} departures within ±15m)`],[x.expo,'long-leg exposure'],[x.knock,'knock-on from an earlier rotation']].sort((a,b)=>b[0]-a[0])[0];
        return `<tr class="clik" data-city="${x.r.dst}"><td><span class="fltno">${(nos[x.i]||{}).out||'—'}</span> ${x.r.dst}</td><td>${x.r.ac}</td><td>${fmt(x.r.dep)}</td>
          <td style="color:${x.tot>=20?'var(--red)':'var(--amber)'}">+${Math.round(x.tot)}m</td><td style="text-align:left;padding-left:10px;color:var(--ink2);white-space:normal">${c[1]}</td></tr>`;}).join('')
      +`</table><div class="note">Banks over ${DLY_CONGEST_FREE} departures per 30 minutes add delay; legs over ${DLY_FREE_NM} nm pick up weather/ATC exposure; ground slack absorbs knock-on delay.</div>`;

  /* gate utilization over the day */
  const cur=E.cur||[], G=gatesOwned;
  if(!rots.length||!cur.length){$('hubGates').innerHTML=`<div class="empty">No flying yet.</div>`;return;}
  const avg=cur.reduce((a,v)=>a+v,0)/cur.length, idle=cur.reduce((a,v)=>a+Math.max(0,G-v),0)/60;
  const hot=cur.filter(v=>v>=G*0.9).length, spare=G-E.peak;
  const pkT=[];cur.forEach((v,t)=>{if(v===E.peak&&(!pkT.length||t-pkT[pkT.length-1][1]>1))pkT.push([t,t]);else if(v===E.peak)pkT[pkT.length-1][1]=t;});
  const tc=gateTierCurves(rots,owned), nI=Math.max(0,...tc.i), nH=Math.max(0,...tc.h);
  const park=gateAssign(rots,owned,G,gateTiers), br=park.filter(s=>s.borrowed), tw=park.filter(s=>s.tow).length;
  const kv=(k,v)=>`<tr><td>${k}</td><td>${v}</td></tr>`;
  $('hubGates').innerHTML=`<table>${kv('Gates leased',G)}${kv('Peak in use',`${E.peak} (${Math.round(E.peak/G*100)}%)`)}
    ${kv('Average in use',`${avg.toFixed(1)} (${Math.round(avg/G*100)}%)`)}${kv('Idle gate-hours / day',Math.round(idle))}
    ${kv('Time at 90%+ full',hm(hot))}${kv('Peak moments',pkT.slice(0,3).map(([a,b])=>b>a?`${fmt(a)}–${fmt(b)}`:fmt(a)).join(', ')+(pkT.length>3?' …':''))}
    ${kv('International gates',`${gateTiers.I} · peak need ${nI}`)}${kv('Heavy-capable gates',`${gateTiers.H+gateTiers.I} · peak need ${nH}`)}
    ${kv('Borrowed bigger gate',br.length?`${new Set(br.map(s=>s.ac)).size} aircraft · ${hm(br.reduce((a,s)=>a+s.len,0))}/day`:'never')}${kv('Tows',tw||'none')}</table>
    <div class="note">${spare>0?`${spare} gate${spare>1?'s':''} sit empty even at peak — room to add peak-time flying without leasing more.`
      :`Every gate is used at peak. New flying in the peak ${pkT.length>1?'windows':'window'} needs another gate or a retimed departure.`}</div>`;
}
