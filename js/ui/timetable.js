/* MegaHub · js/ui/timetable.js — published-timetable view (v3.13): every nonstop, one-stop and connecting
   itinerary to and from a city, across all hubs, with local times — like a printed airline timetable */
let ttCity=null, ttFilter='', ttKey='', ttHTML='';

const TZ_FIX={PHX:'MST',TUS:'MST',HNL:'HST',OGG:'HST',KOA:'HST',LIH:'HST',SJU:'AST',STT:'AST',STX:'AST'};
function tzLabel(c){
  if(TZ_FIX[c])return TZ_FIX[c];
  const u=A[c].utc;
  if(!A[c].intl){const m={'-240':'EDT','-300':'CDT','-360':'MDT','-420':'PDT','-480':'AKDT','-600':'HST'}[u]; if(m)return m;}
  return 'UTC'+(u>=0?'+':'−')+(Math.abs(u)/60)+(u%60?'':'');
}

/* every leg the airline flies today: local times at each end, block time, the rotation it belongs to */
function ttAllLegs(){
  const out=[], hs=hubOrder.length>1?netHubs():[{c:HC.c,H:HC,rots,fleet:owned}];
  hs.forEach(h=>h.rots.forEach((r,ri)=>{const ac=h.fleet.find(a=>a.id===r.ac); if(!ac)return;
    rotLegs(r,ac,h.c===HC.c?HC:h.H,h.c,ri).forEach((l,k)=>{
      const depU=l.dep-A[l.a].utc, arrU=l.arr-A[l.b].utc;
      out.push({...l,rk:h.c+'#'+ri,k,depU:mod(depU),dur:mod(arrU-depU)});});}));
  return out;
}

/* All published itineraries from O (to every destination): nonstops, through flights (one number,
   one stop) and single connections at one of the airline's hubs, timed within the same connection
   window the passenger model sells (minimum connect, + customs from abroad, up to 5 hours) and
   no more roundabout than the model would carry. Dominated options (leave earlier AND arrive later
   than another) are dropped, as a printed timetable would. */
function ttFrom(O,ix){
  const segsFrom=c=>{const S=[];
    (ix.from[c]||[]).forEach(l=>{S.push({legs:[l],a:c,b:l.b,dep:l.dep,depU:l.depU,el:l.dur,arrB:l.arr});
      const n=ix.next[l.rk+'#'+(l.k+1)];
      if(n&&n.flt===l.flt&&n.b!==c){const g=mod(n.depU-(l.depU+l.dur)); S.push({legs:[l,n],a:c,b:n.b,stop:l.b,dep:l.dep,depU:l.depU,el:l.dur+g+n.dur,arrB:n.arr});}});
    return S;};
  const res={}, add=(D,it)=>{(res[D]=res[D]||[]).push(it);};
  const first=segsFrom(O);
  first.forEach(s=>{
    add(s.b,{dep:s.dep,el:s.el,segs:[s]});
    const H=s.b; if(!ix.hubs[H]||H===O)return;
    const last=s.legs[s.legs.length-1], need=ix.mct[H]+(customsIn(last.a)?CUSTOMS:0);
    segsFrom(H).forEach(t=>{
      const D=t.b; if(D===O||D===H||(s.stop&&s.stop===D)||(t.stop&&t.stop===O))return;
      if(t.legs[0].rk===last.rk&&t.legs[0].k===last.k+1&&t.legs[0].flt===last.flt)return;   // that's the through flight
      const ct=mod(t.dep-s.arrB); if(ct<need||ct>MAXCT)return;
      const d=dPair[O+D]; if(!d)return;
      const r=(nm(A[O],A[H])+nm(A[H],A[D]))/d, tol=0.18+0.00022*d;
      if(1/(1+Math.pow(Math.max(0,r-1)/tol,2))<0.2)return;                                // too roundabout to sell
      add(D,{dep:s.dep,el:s.el+ct+t.el,segs:[s,t],via:H});});
  });
  Object.keys(res).forEach(D=>{
    const L=res[D].map(it=>({...it,legsN:it.segs.reduce((a,s)=>a+s.legs.length,0)}));
    const keep=L.filter(x=>!L.some(y=>y!==x&&y.dep>=x.dep&&y.dep+y.el<=x.dep+x.el&&(y.dep>x.dep||y.dep+y.el<x.dep+x.el||y.legsN<x.legsN)));
    const seen=new Set();
    res[D]=keep.filter(x=>{const k=x.dep+'|'+x.el+'|'+x.segs.map(s=>s.legs.map(l=>l.flt).join()).join('/'); if(seen.has(k))return false; seen.add(k); return true;})
      .sort((a,b)=>a.dep-b.dep||a.el-b.el);
  });
  return res;
}

function ttIndex(){
  const legs=ttAllLegs(), ix={from:{},next:{},hubs:{},mct:{}};
  legs.forEach(l=>{(ix.from[l.a]=ix.from[l.a]||[]).push(l); ix.next[l.rk+'#'+l.k]=l;});
  hubOrder.forEach(c=>{ix.hubs[c]=1; ix.mct[c]=mctFor(c===HC.c?gatesOwned:hubStore[c].gates);});
  return {legs,ix};
}

function ttRow(it,O,D){
  const days=Math.floor((it.dep+it.el+(A[D].utc-A[O].utc))/DAY);
  const arr=mod(it.dep+it.el+(A[D].utc-A[O].utc));
  const flts=it.segs.map(s=>s.legs[0].flt).join('/');
  const stops=it.segs.reduce((a,s)=>a+(s.stop?1:0),0);
  const how=it.via?`via ${it.via}${stops?` · ${stops} stop${stops>1?'s':''}`:''}`:stops?`1 stop ${it.segs[0].stop}`:'Nonstop';
  const eq=[...new Set(it.segs.flatMap(s=>s.legs.map(l=>l.t)))].join('/');
  return `<tr><td>${fmt(it.dep)}</td><td>${fmt(arr)}${days>0?`<sup>+${days}</sup>`:''}</td><td><span class="fltno">${flts}</span></td>
    <td class="tthow${it.via?' conn':''}">${how}</td><td class="tteq">${eq}</td></tr>`;
}
function ttHalf(list,O,D,dir){
  const head=`<div class="tthead">${dir==='to'?'To':'From'} <b>${A[dir==='to'?D:O].n}</b> <i>${dir==='to'?D:O} · ${tzLabel(dir==='to'?D:O)}</i></div>`;
  if(!list||!list.length)return head+`<div class="ttnone">no service</div>`;
  return head+`<table class="tttab"><colgroup><col style="width:14%"><col style="width:16%"><col style="width:22%"><col style="width:22%"><col></colgroup><tr><th>Leave</th><th>Arrive</th><th>Flight</th><th>Stops / via</th><th>Equip</th></tr>${list.map(it=>ttRow(it,O,D)).join('')}</table>`;
}

function renderTimetable(force){
  const host=$('ttbody'); if(!host)return;
  if(!force&&typeof curTab!=='undefined'&&curTab!=='markets')return;         // only built when you're looking at it
  const {legs,ix}=ttIndex();
  const cities=[...new Set(legs.flatMap(l=>[l.a,l.b]))].sort((a,b)=>A[a].n.localeCompare(A[b].n));
  if(!cities.length){$('ttSel').innerHTML='';host.innerHTML='<div class="empty">Schedule some flights and your timetable appears here.</div>';$('ttlab').textContent='';return;}
  if(!cities.includes(ttCity))ttCity=cities.includes(mktCity)?mktCity:(cities.includes(HC.c)?HC.c:cities[0]);
  const key=(typeof _airSig==='string'?_airSig:'')+'|'+ttCity+'|'+ttFilter+'|'+JSON.stringify(ix.mct);
  $('ttSel').innerHTML=cities.map(c=>`<option value="${c}"${c===ttCity?' selected':''}>${A[c].n} (${c})${hubOrder.includes(c)?' · hub':''}</option>`).join('');
  if(key===ttKey&&host.innerHTML){return;}
  const X=ttCity, out=ttFrom(X,ix), inn={};
  cities.forEach(Y=>{if(Y===X)return; const r=ttFrom(Y,ix)[X]; if(r&&r.length)inn[Y]=r;});
  const q=ttFilter.trim().toUpperCase();
  const dests=[...new Set([...Object.keys(out),...Object.keys(inn)])].filter(D=>D!==X)
    .filter(D=>!q||D.includes(q)||A[D].n.toUpperCase().includes(q)).sort((a,b)=>A[a].n.localeCompare(A[b].n));
  const nIt=dests.reduce((a,D)=>a+((out[D]||[]).length+(inn[D]||[]).length),0);
  $('ttlab').textContent=`${dests.length} cities · ${nIt} itineraries · all operate daily`;
  host.innerHTML=`<div class="ttcity"><h3>${A[X].n.toUpperCase()}</h3><i>${X} · ${tzLabel(X)}${hubOrder.includes(X)?' · your hub':''}</i></div>`
    +(dests.length?dests.map(D=>`<div class="ttblock" id="tt-${D}"><div>${ttHalf(out[D],X,D,'to')}</div><div>${ttHalf(inn[D],D,X,'from')}</div></div>`).join('')
      :`<div class="empty">No city matches "${ttFilter}".</div>`)
    +`<div class="note">Times are local at each airport (<sup>+1</sup> = arrives the next day). Connections are shown where they fit the connection window passengers will book — ${hubOrder.map(c=>`${ix.mct[c]}m at ${c}`).join(', ')} minimum (+${CUSTOMS}m customs from abroad), up to ${hm(MAXCT)} — and aren't too roundabout. An option that leaves earlier and arrives later than another is left out.</div>`;
  ttKey=key;
}

$('ttSel').addEventListener('change',e=>{ttCity=e.target.value;renderTimetable(true);});
$('ttFind').addEventListener('input',e=>{ttFilter=e.target.value;renderTimetable(true);});
document.addEventListener('click',e=>{
  const t=e.target.closest&&e.target.closest('[data-tt]'); if(!t)return;
  ttCity=t.getAttribute('data-tt'); ttFilter=''; $('ttFind').value='';
  showTab('markets'); renderTimetable(true);
  const p=$('ttPanel'); if(p&&p.scrollIntoView)p.scrollIntoView({block:'start',behavior:'smooth'});
});
