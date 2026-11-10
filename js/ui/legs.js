/* MegaHub · js/ui/legs.js — the leg-by-leg schedule editor (v3.21)
   An aircraft's day (or a 2-day line's 48 hours) is an ordered sequence of legs. Editing inserts,
   changes or removes legs; the sequence is then cut into hub-to-hub trips wherever the aircraft
   reaches one of your hubs, and those trips are what the engine flies and the save stores. A trip
   that comes out exactly as it was keeps its original rotation (classic ones stay classic). A day
   that doesn't close yet is kept as draft trips, flagged in red, and blocks launch. */

let editTab='rt';                 // 'leg' | 'rt' — the right panel's tab (remembered per viewer)
try{const t=localStorage.getItem('mh.editTab'); if(t==='leg'||t==='rt')editTab=t;}catch(e){}
let legAfter=null;                // index in the sequence the new leg follows (-1 = start of the day)
let legEdit=null;                 // index of the leg being edited, or null
let legTo='', legDepLoc=null, legThru=false, legPad=0, legDay=1;

const isHubC=c=>c===HC.c||isOwnHub(c,HC);
const groundMin=(c,ac)=>c===HC.c?minTurnHub(owned):turnAt(c,ac,HC);
const locT=(t,c)=>mod(t+tzD(c,HC));                        // hub clock → local clock at c
const acOfId=id=>owned.find(a=>a.id===id);

/* a rotation rebuilt from its own fields (classic stays classic; general keeps its stops) */
function remkRot(r,over){
  const o={...r,...(over||{})}, ac=acOfId(o.ac);
  if(!o.stops)return mkRot(o.ac,o.dst,o.via||null,o.dep,o.turn,o.pad||0);
  const t={ac:o.ac,dep:mod(o.dep),pad:o.pad||0,...(o.from?{from:o.from}:{}),stops:o.stops.map(s=>({c:s.c,...(s.g!=null?{g:s.g}:{}),...(s.thru?{thru:true}:{})}))};
  return ac?tripMeta(t,ac,HC):t;
}
/* the comparable shape of a trip (classic rotations in their general form) */
function tripSig(r){const ac=acOfId(r.ac); if(!ac)return '';
  const st=tripStops(r,ac,HC).map(s=>[s.c,s.g==null?null:Math.round(s.g*100)/100,!!s.thru]);
  return JSON.stringify([r.ac,Math.round(mod(r.dep)*100)/100,r.pad||0,r.from||'',st]);}

/* ---- the sequence ---- */
function lineOf(id){const a=acOfId(id); if(!a)return null;
  if(a.pair){const p=acOfId(a.pair); if(p)return {tails:a.id<p.id?[a.id,p.id]:[p.id,a.id],cycle:2*DAY,ac:a};}
  return {tails:[a.id],cycle:DAY,ac:a};}
/* every leg of an aircraft's line in flying order: a, b, dep/arr (minutes from the line's start of day 1,
   hub clock), block, thru (continues through b as the same flight), pad (its trip's), ri, k */
function seqOf(id){
  const L=lineOf(id); if(!L)return {legs:[],cycle:DAY,tails:[]};
  const items=L.tails.length===2?lineItems(rots,L.tails[0],L.tails[1]).map(o=>({r:o.r,i:o.i,off:o.dep-o.r.dep}))
    :acRots(rots,id).map(r=>({r,i:rots.indexOf(r),off:0}));
  const legs=[];
  items.forEach(o=>{const ac=acOfId(o.r.ac); if(!ac)return; const T=tripOf(o.r,ac,HC), nums=rotLegs(o.r,ac,HC,HC.c,o.i);
    T.legs.forEach((l,k)=>legs.push({a:l.a,b:l.b,dep:l.dep+o.off,arr:l.arr+o.off,t:l.t,thru:!!(k<T.legs.length-1&&T.stops[k].thru),
      pad:o.r.pad||0,ri:o.i,k,cut:k===T.legs.length-1,flt:(nums[k]||{}).flt,tail:L.tails.length===2?dayTail(l.dep+o.off,L.tails[0],L.tails[1]):id}));});
  return {legs,cycle:L.cycle,tails:L.tails};
}
/* cut a leg sequence into trips. specs: [{a,b,dep (minutes in the cycle), thru, pad}] in flying order */
function splitSeq(specs,cycle,tails){
  const n=specs.length; if(!n)return {trips:[]};
  /* a trip ends at the home hub, where the chain breaks, or at another hub where a trip already ended (so
     editing one leg never restructures the rest of the day); new legs through another hub stay one trip */
  const bnd=specs.map((s,i)=>s.b===HC.c||specs[(i+1)%n].a!==s.b||(s.cut&&isHubC(s.b)));
  let first=bnd.findIndex(Boolean); if(first<0)first=n-1;
  const trips=[]; let piece=[];
  for(let j=0;j<n;j++){const i=(first+1+j)%n; piece.push(specs[i]); if(bnd[i]||j===n-1){trips.push(piece); piece=[];}}
  const out=[];
  for(const P of trips){
    const d0=((P[0].dep%cycle)+cycle)%cycle, pad=P[0].pad||0, tail=tails.length===2&&d0>=DAY?tails[1]:tails[0], ac=acOfId(tail);
    let t=d0; const stops=[];
    for(let j=0;j<P.length;j++){const s=P[j], last=j===P.length-1;
      const arr=t+legBlock(s.a,s.b,ac)+(j===0||last?pad:0);
      if(last){stops.push({c:s.b}); break;}
      let g=(((P[j+1].dep-arr)%cycle)+cycle)%cycle;
      if(g>cycle-360)return {err:`${P[j+1].a}→${P[j+1].b} leaves ${fmt(locT(P[j+1].dep,P[j+1].a))} — before the aircraft gets to ${s.b} (${fmt(locT(arr,s.b))})`};
      stops.push({c:s.b,g:Math.round(g*100)/100,...(s.thru?{thru:true}:{})}); t=arr+g;}
    out.push({ac:tail,dep:Math.round((d0%DAY)*100)/100,pad,...(P[0].a!==HC.c?{from:P[0].a}:{}),stops});
  }
  return {trips:out};
}
/* try a new sequence for an aircraft's line: {err} or {rots (the whole new list), changed} — nothing committed */
function trySeq(id,specs){
  const L=lineOf(id), {trips,err}=splitSeq(specs,L.cycle,L.tails); if(err)return {err};
  const mine=new Set(L.tails), old=rots.filter(r=>mine.has(r.ac)), bySig={};
  old.forEach(r=>{(bySig[tripSig(r)]=bySig[tripSig(r)]||[]).push(r);});
  const fleet=owned;
  let base=rots.filter(r=>!mine.has(r.ac));
  const made=[];
  for(const t of trips){const ac=acOfId(t.ac);
    const cl=classicOf(t,ac); if(cl&&tripSig(cl)===tripSig(t))Object.assign(t,{dst:cl.dst,via:cl.via,turn:cl.turn}), delete t.stops;
    const same=(bySig[tripSig(t)]||[]).shift();
    const cand=same||t;
    const e=validateTrip(base,fleet,{...cand},undefined,HC,!!same,true); if(e)return {err:e};   // an unchanged trip keeps any airport-limit flag it had
    const r=same||(t.stops?tripMeta(t,ac,HC):mkRot(t.ac,t.dst,t.via||null,t.dep,t.turn,t.pad)); base=base.concat([r]); made.push(r);}
  /* keep everyone else where they were; this line's trips take the old slots, extras go last */
  const out=[], queue=made.slice();
  rots.forEach(r=>{if(!mine.has(r.ac))out.push(r); else if(queue.length)out.push(queue.shift());});
  queue.forEach(r=>out.push(r));
  return {rots:out,changed:made.some(r=>!old.includes(r))||made.length!==old.length};
}
function commitSeq(id,specs,what){
  const res=trySeq(id,specs); if(res.err)return res.err;
  pushUndo(what||'edit day'); rots=res.rots; editIdx=null; launched=false;
  autoRebase(id);
  return null;
}
/* a trip that is an ordinary out-and-back from home (nonstop, or with one through stop each way): its classic fields */
function classicOf(t,ac){const st=t.stops; if(t.from||!st)return null;
  if(st.length===2&&!st[0].thru&&st[1].c===HC.c&&!isOwnHub(st[0].c,HC))return {ac:t.ac,dst:st[0].c,via:null,dep:t.dep,turn:st[0].g,pad:t.pad};
  if(st.length===4&&st[0].thru&&!st[1].thru&&st[2].thru&&st[3].c===HC.c&&st[0].c===st[2].c&&!isOwnHub(st[0].c,HC)&&!isOwnHub(st[1].c,HC))
    return {ac:t.ac,dst:st[1].c,via:st[0].c,dep:t.dep,turn:st[1].g,pad:t.pad};
  return null;}
const specOf=l=>({a:l.a,b:l.b,dep:l.dep,thru:l.thru,pad:l.pad,cut:l.cut});

/* an aircraft whose day only touches one hub that isn't its home moves there (v3.21) */
function autoRebase(id){
  const a=acOfId(id); if(!a||a.pair||hubOrder.length<2)return;
  const mine=rots.filter(r=>r.ac===id); if(!mine.length)return;
  const hubs=new Set(); let home=false;
  mine.forEach(r=>{const T=tripOf(r,a,HC); [T.legs[0].a,...T.stops.map(s=>s.c)].forEach(c=>{if(c===HC.c)home=true; else if(isOwnHub(c,HC))hubs.add(c);});});
  if(home||hubs.size!==1)return;
  const Y=[...hubs][0]; if(!hubStore[Y]||hubStore[Y].fleet.some(x=>x.id===id))return;
  const dz=tzD(Y,HC);                                                  // Y's clock = this hub's clock + dz
  const moved=mine.map(r=>{const st=tripStops(r,a,HC).map(s=>({c:s.c,...(s.g!=null?{g:s.g}:{}),...(s.thru?{thru:true}:{})}));
    const from=r.from||HC.c; return {ac:id,dep:mod(r.dep+dz),pad:r.pad||0,...(from!==Y?{from}:{}),stops:st};});
  rots=rots.filter(r=>r.ac!==id); owned.splice(owned.indexOf(a),1);
  stashView(); hubStore[Y].fleet.push(a);
  viewHub(Y); refreshNet();
  moved.forEach(t=>rots.push(tripMeta(t,a,HC)));
  afterHubChange();
  rebaseNote=`${id} only touches ${Y} now, so it moved there — you're viewing ${Y}.`;
  $('ac').value=id;
}
let rebaseNote=null;

/* ---- what the editor shows ---- */
const levels=()=>{try{return airEval().levels||{};}catch(e){return {};}};
/* nonstop legs flown per direction, airline-wide — counted once per evaluation (v3.22) */
function legCounts(){const AE=airEval(); if(AE.legCnt)return AE.legCnt; const m={};
  AE.hubs.forEach(h=>{const F=new Map(h.fleet.map(a=>[a.id,a])); h.rots.forEach(r=>{const ac=F.get(r.ac); if(!ac)return;
    tripOf(r,ac,h.H).legs.forEach(l=>{m[l.a+l.b]=(m[l.a+l.b]||0)+1;});});});
  return AE.legCnt=m;}
function wayBack(a,b,L){
  const lv=L[b+a]||0, n=legCounts()[b+a]||0;
  if(lv>=3)return `<span class="chip okc">${n>1?n+' nonstops':'nonstop'} ${b} → ${a}</span>`;
  if(lv===2)return `<span class="chip warn" title="Travellers can only get back by connecting — about ${Math.round((1-RET_PART)*100)}% go elsewhere">back only by connection · −${Math.round((1-RET_PART)*100)}%</span>`;
  if(lv===1)return `<span class="chip warn" title="The only way back changes planes twice">back only via 2 hubs · −${Math.round((1-RET_PART)*100)}%</span>`;
  return `<span class="chip bad" title="Most travellers buy round trips — with no way back on your airline only about ${Math.round(RET_NONE*100)}% will book">no way back · keeps ~${Math.round(RET_NONE*100)}%</span>`;
}
/* day problems for this line, and the fixes the panel offers */
function dayState(id,S){
  const legs=S.legs, n=legs.length, cyc=S.cycle;
  if(!n)return {idle:true};
  const breaks=[]; legs.forEach((l,i)=>{const nx=legs[(i+1)%n]; if(nx.a!==l.b)breaks.push({i,at:l.b,next:nx});});
  const viol=lineViolations(rots,owned,HC).filter(v=>S.tails.includes(v.ac)||S.tails.includes((rots[v.idx]||{}).ac));
  return {breaks,viol,closed:!breaks.length&&!viol.length};
}
function renderDayPanel(){
  const el=$('dayPanel'); if(!el)return;
  const ac=curAC(); if(!ac||!$('pRot')){el.innerHTML='';return;}
  const S=seqOf(ac.id), legs=S.legs, cyc=S.cycle, X2=v=>(v/DAY*100);
  const st=dayState(ac.id,S), L=levels(), pair=S.tails.length===2;
  const title=pair?`2-day line — ${S.tails.join(' + ')} · ${ac.t} · based ${HC.c}`:`Aircraft day — ${ac.id} · ${ac.t} · based ${HC.c}`;
  const sub=legs.length?`${legs.length} leg${legs.length>1?'s':''} · times ${HC.c} clock, local at each city`:'idle';
  /* timeline: one row per day */
  const rows=[];
  for(let d=0;d<cyc/DAY;d++){
    const lo=d*DAY, hi=lo+DAY; let h='';
    const put=(s,len,html)=>{let t=s,rem=len; while(rem>0.5){const w=((t%cyc)+cyc)%cyc, take=Math.min(rem,DAY-(w%DAY)); if(w>=lo&&w<hi)h+=html(w-lo,take); t+=take; rem-=take;}};
    legs.forEach((l,i)=>{
      const cls=isHubC(l.a)?'out':isHubC(l.b)?'ret':'s2s';
      put(l.dep,l.arr-l.dep,(x,w)=>`<div class="blk ${cls}" style="left:${X2(x)}%;width:${X2(w)}%" title="${l.flt||''} ${l.a}→${l.b}">${w>40?l.b:''}</div>`);
      const nx=legs[(i+1)%legs.length]; if(nx.a!==l.b)return;
      let g=((nx.dep-l.arr)%cyc+cyc)%cyc; if(legs.length===1)g=cyc-(l.arr-l.dep);
      const hub=isHubC(l.b), ron=!hub&&g>240;
      put(l.arr,g,(x,w)=>`<div class="dgnd${hub?' hub':''}${ron?' ron':''}" style="left:${X2(x)}%;width:${X2(w)}%" title="${Math.round(g)}m at ${l.b}">${w>70?(ron?'overnight '+l.b:hub?l.b+' · gate':l.b):''}</div>`);});
    if(st.breaks)st.breaks.forEach(b=>{const l=legs[b.i]; const g=((b.next.dep-l.arr)%cyc+cyc)%cyc;
      put(l.arr,g,(x,w)=>`<div class="dopen" style="left:${X2(x)}%;width:${X2(w)}%">${w>200?`open — at ${l.b}, next leg leaves ${b.next.a}`:''}</div>`);});
    rows.push(`<div class="dayrow">${pair?`<div class="daytag"><b>Day ${d+1}</b><i>${S.tails[d]} today</i></div>`:''}<div class="daytrack">${h}</div></div>`);
  }
  const axis=`<div class="dayaxis${pair?' pair':''}">${[0,3,6,9,12,15,18,21].map(hh=>`<i style="left:${hh/24*100}%">${fmtHour(hh)}</i>`).join('')}</div>`;
  /* status + fixes */
  let status='';
  if(st.idle)status=`<div class="dstat idle">${ac.id} is idle — it sits at a ${HC.c} gate all day. Add its first leg, or a round trip.</div>`;
  else if(st.closed){const blk=legs.reduce((x,l)=>x+l.t,0), hubsT=legs.filter(l=>isHubC(l.b)).length;
    status=`<div class="dstat ok">Day closes — ${pair?'the line connects across both days':`${ac.id} starts and ends at ${legs[0].a}`} · touches a hub ${hubsT}× · ${hm(blk)} block</div>`;}
  else{
    const b=st.breaks[0], fixes=[];
    if(b){const l=legs[b.i], arrAt=l.arr, need=groundMin(l.b,ac), earliest=arrAt+need;
      if(canLeg(ac,l.b,b.next.a))fixes.push(`<button class="sug" type="button" data-fixhome="${b.i}"><span><b>${b.next.a===legs[0].a&&b.i===legs.length-1?'Fly it home':'Connect it'}</b> · ${l.b} → ${b.next.a}, earliest ${fmt(locT(earliest,l.b))} ${l.b}</span><span class="chip okc">closes the gap</span></button>`);
      fixes.push(`<button class="sug" type="button" data-fixmore="${b.i}"><span><b>Keep flying</b> · add another leg from ${l.b}</span><span class="chip s2sc">${l.b} → …</span></button>`);
      if(!ac.pair&&pairCands(ac).length)fixes.push(`<button class="sug" type="button" data-fixpair="${pairCands(ac)[0].id}"><span><b>Make it a 2-day line</b> · pair with ${pairCands(ac)[0].id} (idle ${ac.t}); day 2 starts at ${l.b}</span><span class="chip ronc">48h cycle</span></button>`);}
    const msg=b?`Day open — ${legs[b.i].tail} is at ${legs[b.i].b} after ${legs[b.i].flt||'its leg'}, but the next leg leaves from ${b.next.a}. Launch is blocked until it closes.`
      :(st.viol[0]||{}).msg;
    status=`<div class="dstat bad"><div>${msg}</div>${fixes.join('')}</div>`;}
  /* leg list, grouped into trips */
  let lastRi=null, tripNo=0;
  const rowsL=legs.map((l,i)=>{let head='';
    if(l.ri!==lastRi){lastRi=l.ri; tripNo++; const r=rots[l.ri], T=tripOf(r,acOfId(r.ac),HC), path=[T.legs[0].a,...T.stops.map(s=>s.c)].join('–');
      const ron=T.stops.some((s,k)=>k<T.stops.length-1&&!s.thru&&s.g>240);
      head=`<tr class="triph"><td colspan="8">${pair?`Day ${Math.floor(((l.dep%cyc)+cyc)%cyc/DAY)+1} · `:''}Trip ${tripNo} · ${path}${ron?' · overnight away <span class="chip ronc">RON</span>':''}${r.stops?'':''}</td></tr>`;}
    const nx=legs[(i+1)%legs.length], open=nx.a!==l.b;
    let g=((nx.dep-l.arr)%cyc+cyc)%cyc; if(legs.length===1)g=cyc-(l.arr-l.dep);
    const then=open?`<span style="color:var(--red)">day open</span>`:!isHubC(l.b)&&g>240?`<b style="color:var(--violet)">${hm(g)} overnight at ${l.b}</b>`:`${hm(g)} at ${l.b}${l.thru?' · same flight':''}`;
    const cls=isHubC(l.a)?'out':isHubC(l.b)?'ret':'s2s';
    return head+`<tr class="${legEdit===i?'editing':''}"><td><span class="fltno ${cls}">${l.flt||'—'}</span></td>
      <td><b>${l.a} → ${l.b}</b>${cls==='s2s'?' <span class="chip s2sc">spoke to spoke</span>':''}</td>
      <td>${fmt(locT(l.dep,l.a))}${tzD(l.a,HC)?' <i>'+legTz(l.a)+'</i>':''}</td><td>${fmt(locT(l.arr,l.b))}${tzD(l.b,HC)?' <i>'+legTz(l.b)+'</i>':''}</td>
      <td>${hm(l.t)}</td><td>${then}</td><td>${wayBack(l.a,l.b,L)}</td>
      <td style="white-space:nowrap"><button class="ib" type="button" data-legedit="${i}" aria-label="Edit ${l.a} to ${l.b}">✎</button><button class="ib" type="button" data-legdel="${i}" aria-label="Remove ${l.a} to ${l.b}">✕</button></td></tr>`;}).join('');
  el.innerHTML=`<h2>${title} <em>${sub}</em></h2>
    ${rebaseNote?`<div class="dstat note">${rebaseNote} <span class="x" data-rbclose="1">✕</span></div>`:''}
    <div class="daybox">${axis}${rows.join('')}
      <div class="daylegend"><span><i class="lg out"></i>from a hub</span><span><i class="lg ret"></i>into a hub</span><span><i class="lg s2s"></i>spoke to spoke</span><span><i class="lg gh"></i>on the ground at a hub (holds a gate)</span><span><i class="lg gs"></i>on the ground at a spoke</span></div></div>
    ${status}
    ${legs.length?`<div class="daylegs"><table><tr><th>Flt</th><th>Leg</th><th>Dep</th><th>Arr</th><th>Block</th><th>Then</th><th>Way back on your airline</th><th></th></tr>${rowsL}</table></div>`:''}`;
}
const legTz=c=>{const d=tzD(c,HC)/60; return (d>0?'+':'')+d+'h';};

/* ---- the leg form ---- */
/* cities an aircraft can fly to from a city, sorted (home, your hubs, then nearest first), with their <option>
   markup — the same for every redraw until the type, city, hubs or year change (v3.22) */
const _dests=new Map();
function destsFrom(ac,from){
  const key=[ac.t,from,HC.c,hubOrder.join(','),YEAR].join('|'); let L=_dests.get(key); if(L)return L;
  const seen=new Set(), o=A[from];
  L=[A[HC.c],...hubOrder.map(h=>A[h]),...SPOKES].filter(s=>s&&!seen.has(s.c)&&seen.add(s.c)&&s.c!==from&&canLeg(ac,from,s.c))
    .map(s=>({c:s.c,n:s.n,hub:isHubC(s.c),own:s.c===HC.c?2:isOwnHub(s.c,HC)?1:0,d:nm(o,s)}))
    .sort((x,y)=>(y.own-x.own)||(x.d-y.d)).slice(0,400);
  L.forEach(d=>d.html=`<option value="${d.c}">${d.c} — ${d.n}${d.hub?' (hub)':''} · ${Math.round(d.d)} nm</option>`);
  if(_dests.size>200)_dests.clear(); _dests.set(key,L); return L;
}
function legFormInit(){
  const S=seqOf($('ac').value), n=S.legs.length;
  if(legAfter==null||legAfter>=n)legAfter=n?n-1:-1;
}
function legCtx(){
  const ac=curAC(); if(!ac)return null;
  const S=seqOf(ac.id), legs=S.legs, n=legs.length, cyc=S.cycle;
  legFormInit();
  const editing=legEdit!=null&&legEdit<n;
  const prevI=editing?(legEdit-1+n)%n:legAfter;
  const prev=n&&(editing?n>1:prevI>=0)?legs[prevI]:(n&&prevI<0?legs[n-1]:null);
  const from=editing?legs[legEdit].a:(prev?prev.b:HC.c);
  const arr=prev?prev.arr:null;
  return {ac,S,legs,n,cyc,editing,prevI,prev,from,arr};
}
function renderLegForm(){
  const box=$('legForm'); if(!box)return; const c=legCtx();
  if(!c){box.innerHTML='<div class="empty">Buy an aircraft first.</div>';return;}
  const {ac,legs,n,cyc,editing,prev,from}=c;
  const afterOpts=(n?`<option value="-1"${legAfter===-1?' selected':''}>Start of the day (before ${legs[0].flt||legs[0].a+'→'+legs[0].b})</option>`:'<option value="-1">First leg of the day</option>')
    +legs.map((l,i)=>`<option value="${i}"${legAfter===i?' selected':''}>${l.flt||''} ${l.a} → ${l.b} · arr ${fmt(locT(l.arr,l.b))}${tzD(l.b,HC)?' '+legTz(l.b):''}</option>`).join('');
  const dests=destsFrom(ac,from);
  if(!editing&&legTo&&!dests.some(s=>s.c===legTo))legTo='';
  if(editing&&legTo==='' )legTo=legs[legEdit].b;
  /* default departure: as soon as the aircraft is ready */
  const ready=prev?prev.arr+groundMin(from,ac):(cyc>DAY?(legDay-1)*DAY+420:420);
  if(legDepLoc==null){legDepLoc=editing?locT(legs[legEdit].dep,from):locT(ready,from);
    if(cyc>DAY)legDay=((((editing?legs[legEdit].dep:ready)%cyc)+cyc)%cyc)>=DAY?2:1;}
  box.innerHTML=`<h2>${editing?'Edit leg':'Add a leg'} <em>${ac.id} ${editing?'· '+(legs[legEdit].flt||''):'is at '+from}</em></h2>
    ${editing?'':`<label for="legAfter">After</label><select id="legAfter">${afterOpts}</select>`}
    ${cyc>DAY?`<label>Day</label><div class="daysel"><button type="button" data-legday="1" class="${legDay===1?'on':''}">Day 1</button><button type="button" data-legday="2" class="${legDay===2?'on':''}">Day 2</button></div>`:''}
    <label>From</label><div class="fromfix">${from} — ${A[from].n} <span>· where ${ac.id} ${prev||editing?'will be':'starts'}</span></div>
    <label for="legToSel">To <span style="text-transform:none;letter-spacing:0">· ${dests.length} cities in range</span></label>
    <select id="legToSel"><option value="">pick a city…</option>${dests.map(d=>d.html.replace(`value="${legTo}"`,`value="${legTo}" selected`)).join('')}</select>
    <div class="duo trio" style="margin-top:4px">
      <div><label for="legDepT">Dep (${from} local)</label><input type="time" id="legDepT" step="60" value="${hhmmStr(legDepLoc)}"></div>
      <div><label>At ${from}</label><div class="fromfix" id="legGnd">—</div></div>
      <div><label for="legPadSel" title="Extra block time on a leg to or from a hub">Pad (min)</label><select id="legPadSel">${[0,5,10,15,20,25,30].map(v=>`<option${v===legPad?' selected':''}>${v}</option>`).join('')}</select></div>
    </div>
    <input type="range" id="legDep" min="0" max="1439" step="1" value="${Math.round(legDepLoc)}">
    <label class="chk"><input type="checkbox" id="legThru"${legThru?' checked':''}> <span>Continue as the same flight (through stop at ${from}) — only one stop out of, or into, a hub</span></label>
    <div class="fcard" id="legCard"></div>
    <div class="err" id="legErr"></div>
    <button id="legAdd" type="button">${editing?'Update leg':'Add leg'}</button>
    ${editing?'<button class="ghost" id="legCancel" type="button">Cancel edit</button>':''}
    ${legs.length?`<button class="ghost" id="legClear" type="button">Clear ${c.S.tails.join(' + ')}'s day</button>`:''}`;
  legPreview();
}
/* the sequence this form would make, its first problem, and a flight card */
function legDraft(){
  const c=legCtx(); if(!c||!legTo)return {c,err:legTo?null:'Pick a destination.'};
  const {ac,legs,n,cyc,editing,prevI,from}=c;
  const dayOff=cyc>DAY?(legDay-1)*DAY:0;
  let depHub=mod(legDepLoc-tzD(from,HC))+dayOff;
  const specs=legs.map(specOf), nl={a:from,b:legTo,dep:depHub,thru:false,pad:legPad};
  if(editing){nl.thru=legs[legEdit].thru; nl.cut=legs[legEdit].cut; specs[legEdit]=nl; if(n>1)specs[(legEdit-1+n)%n].thru=legThru;}
  else{ if(prevI>=0&&n)specs[prevI].thru=legThru; specs.splice(prevI+1,0,nl);}
  if(legThru){const prevLeg=editing?legs[(legEdit-1+n)%n]:(prevI>=0?legs[prevI]:null);
    if(!prevLeg||isHubC(from))return {c,err:'A through stop has to be a city, right after another leg.'};
    if(!isHubC(prevLeg.a)&&!isHubC(legTo))return {c,err:`Through service needs a hub at one end: ${prevLeg.a}–${from}–${legTo} has none.`};}
  const res=trySeq(ac.id,specs);
  return {c,specs,err:res.err||null,res,nl,depHub};
}
function legPreview(){
  const card=$('legCard'), err=$('legErr'), btn=$('legAdd'); if(!card)return;
  const D=legDraft(), c=D.c; if(!c)return;
  const {ac,prev,from}=c;
  if(!legTo){card.innerHTML='<div class="empty">Pick a destination.</div>'; err.textContent=''; btn.disabled=true; $('legGnd').textContent='—'; return;}
  const blk=legBlock(from,legTo,ac)+((isHubC(from)||isHubC(legTo))?legPad:0), arrHub=D.depHub+blk;
  const g=prev?(((D.depHub-prev.arr)%c.cyc)+c.cyc)%c.cyc:null;
  $('legGnd').textContent=g==null?'—':hm(g);
  const L=levels(), back=(L[legTo+from]||0)>=3||c.legs.some(l=>l.a===legTo&&l.b===from);
  const opens=c.legs.find(l=>l.a===legTo&&l.b===from);
  const closes=D.res&&!D.err&&(()=>{const S2=D.res.rots; const v=lineViolations(S2,owned,HC).filter(x=>c.S.tails.includes(x.ac)); return !v.length;})();
  card.innerHTML=`<div class="rowv"><span>Distance</span><b>${Math.round(nm(A[from],A[legTo]))} nm</b></div>
    <div class="rowv"><span>Block</span><b>${hm(blk)}${legPad&&(isHubC(from)||isHubC(legTo))?` · incl. ${legPad}m pad`:''}</b></div>
    <div class="rowv"><span>Arrives ${legTo}</span><b>${fmt(locT(arrHub,legTo))}${tzD(legTo,HC)?' '+legTz(legTo):''}</b></div>
    <div class="chips">${closes?`<span class="chip okc">closes ${c.S.tails.join(' + ')}'s day</span>`:''}${opens?`<span class="chip okc">gives ${opens.flt||opens.a+'→'+opens.b} its way back</span>`:''}
      ${back?`<span class="chip okc">way back: ${legTo} → ${from} nonstop</span>`:`<span class="chip warn">no nonstop ${legTo} → ${from} yet</span>`}
      ${!isHubC(from)&&!isHubC(legTo)?'<span class="chip s2sc">spoke to spoke</span>':''}</div>`;
  err.textContent=D.err||''; btn.disabled=!!D.err;
}
function legCommit(){
  const D=legDraft(); if(!D.c||D.err)return;
  pushUndo(legEdit!=null?'edit leg':'add leg');
  rots=D.res.rots; editIdx=null; launched=false;
  const id=D.c.ac.id; legEdit=null; legTo=''; legDepLoc=null; legThru=false;
  legAfter=null; autoRebase(id);
  render(); preview();
}
function setEditTab(t,quiet){editTab=t; if(!quiet)try{localStorage.setItem('mh.editTab',t);}catch(e){}
  document.querySelectorAll('[data-etab]').forEach(b=>{const on=b.getAttribute('data-etab')===t; b.classList.toggle('on',on); b.setAttribute('aria-selected',on);});
  $('rtForm').style.display=t==='rt'?'block':'none'; $('legForm').style.display=t==='leg'?'block':'none';
  const fr=$('acFree'); if(fr&&fr.parentNode)fr.parentNode.style.display=t==='leg'?'none':'';
  if(t==='leg'){if(editIdx!=null){editIdx=null; renderMoveRow();} if(!quiet)renderLegForm();}
  else if(legEdit!=null){legEdit=null; renderDayPanel();}}
/* open a leg of a general trip for editing (board / schedule clicks) */
function openLegOf(ri){const r=rots[ri]; if(!r)return; $('ac').value=r.ac;
  const S=seqOf(r.ac), i=S.legs.findIndex(l=>l.ri===ri); legEdit=i>=0?i:null; legTo=''; legDepLoc=null; legThru=false; legPad=r.pad||0;
  if(legEdit!=null){legTo=S.legs[i].b; legThru=i>0&&S.legs[i-1].thru;}
  setEditTab('leg'); renderDayPanel(); renderLegForm();
  const f=$('legForm'); if(f&&f.scrollIntoView)f.scrollIntoView({block:'center',behavior:'smooth'});}

document.addEventListener('click',e=>{
  const t=e.target, at=k=>t.closest&&t.closest(`[${k}]`)&&t.closest(`[${k}]`).getAttribute(k);
  const tab=at('data-etab'); if(tab){setEditTab(tab);return;}
  const ld=at('data-legday'); if(ld){legDay=+ld; legDepLoc=null; renderLegForm();return;}
  const le=at('data-legedit'); if(le!=null){const S=seqOf($('ac').value), i=+le, l=S.legs[i]; if(!l)return;
    legEdit=i; legTo=l.b; legDepLoc=locT(l.dep,l.a); legPad=l.pad||0; legThru=i>0&&S.legs[(i-1+S.legs.length)%S.legs.length].thru;
    legDay=S.cycle>DAY&&(((l.dep%S.cycle)+S.cycle)%S.cycle)>=DAY?2:1; setEditTab('leg'); renderDayPanel(); return;}
  const del=at('data-legdel'); if(del!=null){const id=$('ac').value, S=seqOf(id); const specs=S.legs.map(specOf); specs.splice(+del,1);
    const er=commitSeq(id,specs,'remove leg'); if(er){alert(er);return;} legEdit=null; legAfter=null; render(); preview(); return;}
  const fh=at('data-fixhome'); if(fh!=null){const S=seqOf($('ac').value), i=+fh, l=S.legs[i], nx=S.legs[(i+1)%S.legs.length];
    legEdit=null; legAfter=i; legTo=nx.a; legDepLoc=locT(l.arr+groundMin(l.b,curAC()),l.b); legThru=false;
    legDay=S.cycle>DAY&&(((l.arr%S.cycle)+S.cycle)%S.cycle)>=DAY?2:1; setEditTab('leg'); return;}
  const fm=at('data-fixmore'); if(fm!=null){legEdit=null; legAfter=+fm; legTo=''; legDepLoc=null; setEditTab('leg'); const s=$('legToSel'); if(s)s.focus(); return;}
  const fp=at('data-fixpair'); if(fp){const a=curAC(), b=acOfId(fp); if(!a||!b||b.pair||rots.some(r=>r.ac===b.id))return;
    const S=seqOf(a.id), bk=S.legs.findIndex((l,i)=>S.legs[(i+1)%S.legs.length].a!==l.b);
    pushUndo('make a 2-day line'); a.pair=b.id; b.pair=a.id; launched=false; legEdit=null; legAfter=bk>=0?bk:null; legTo=''; legDepLoc=null;
    setEditTab('leg'); render(); preview(); return;}
  if(at('data-rbclose')){rebaseNote=null; renderDayPanel(); return;}
  if(t.id==='legAdd'){legCommit();return;}
  if(t.id==='legCancel'){legEdit=null; legTo=''; legDepLoc=null; legThru=false; renderDayPanel(); renderLegForm(); return;}
  if(t.id==='legClear'){const id=$('ac').value, S=seqOf(id); if(!S.legs.length)return;
    if(!confirm(`Clear ${S.tails.join(' + ')}'s whole day?`))return; pushUndo('clear day'); rots=rots.filter(r=>!S.tails.includes(r.ac)); launched=false; legEdit=null; legAfter=null; render(); preview(); return;}
});
document.addEventListener('change',e=>{const id=e.target.id;
  if(id==='legAfter'){legAfter=+e.target.value; legDepLoc=null; legThru=false; renderLegForm();}
  else if(id==='legToSel'){legTo=e.target.value; legPreview();}
  else if(id==='legPadSel'){legPad=+e.target.value; legPreview();}
  else if(id==='legThru'){legThru=e.target.checked; legPreview();}
  else if(id==='legDepT'){const v=e.target.value; if(/^\d{1,2}:\d{2}$/.test(v)){legDepLoc=hhmm(v); $('legDep').value=Math.round(legDepLoc); legPreview();}}});
document.addEventListener('input',e=>{const id=e.target.id;
  if(id==='legDep'){legDepLoc=+e.target.value; $('legDepT').value=hhmmStr(legDepLoc); legPreview();}
  else if(id==='legDepT'){const v=e.target.value; if(/^\d{1,2}:\d{2}$/.test(v)){legDepLoc=hhmm(v); $('legDep').value=Math.round(legDepLoc); legPreview();}}});

/* every preview (aircraft, form or schedule change) also refreshes the day panel and the leg form */
const _previewRT=preview;
preview=function(){_previewRT(); renderDayPanel(); if(editTab==='leg')renderLegForm();};
$('ac').addEventListener('input',()=>{legEdit=null; legAfter=null; legTo=''; legDepLoc=null; legThru=false; legDay=1; rebaseNote=null;});
setEditTab(editTab,true);
/* does this trip spend a night away (a long stop at a spoke)? classic: its turn */
const tripRon=r=>r&&r.stops?r.stops.some((s,k)=>k<r.stops.length-1&&!s.thru&&s.g>240&&!isHubC(s.c)):!!(r&&r.turn>240);

/* v3.22: clicks made while the page was busy redrawing land on whatever the redraw put under the pointer
   (a second "Add leg" adds the next leg twice). Any click that happened before the last redraw finished is dropped. */
let uiBusyUntil=0;
const _renderAll=render;
render=function(){const r=_renderAll.apply(this,arguments); uiBusyUntil=performance.now(); return r;};
document.addEventListener('click',e=>{if(e.timeStamp&&e.timeStamp<uiBusyUntil){e.stopImmediatePropagation(); e.preventDefault();}},true);
