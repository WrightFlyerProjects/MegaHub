/* MegaHub · js/engine/evaluate.js — sellable products + evaluate(): local O&D, spoke pairs, hub connections, scoring, per-leg flights */
/* products = sellable itineraries on a rotation, each consuming one or more legs */
function productsOf(rots,fleet,H,capsPre){
  const out=[],inn=[],pairs=[],rotCaps=[];
  rots.forEach((r,ri)=>{
    const ac=fleet.find(a=>a.id===r.ac);
    const sh=shape(r,ac,H), m=sh.marks;
    const caps=capsPre?capsPre[ri]:sh.legs.map(L=>({left:ac.seats,seats:ac.seats,a:L.a,b:L.b,t:L.t}));
    rotCaps[ri]=caps;
    const hubTz=tzD(H.c,H);
    if(crossHub(r,H)){             // separate flights: only the legs touching THIS hub are sold here
      legPlan(r,ac,H).forEach(l=>{
        if(l.a===H.c)out.push({ri,k:l.k,dir:'out',spoke:l.b,legs:[caps[l.k]],depHub:mod(l.dep),depHubLoc:mod(l.dep+hubTz),destLocal:mod(l.arr+tzD(l.b,H)),block:l.t,mult:1});
        if(l.b===H.c)inn.push({ri,k:l.k,dir:'ret',spoke:l.a,legs:[caps[l.k]],arrHub:mod(l.arr),arrHubLoc:mod(l.arr+hubTz),origLocal:mod(l.dep+tzD(l.a,H)),block:l.t,mult:1});
        if(!l.aHub&&!l.bHub&&l.owner===H.c)              // v3.20: a leg between two spokes sells their local market
          pairs.push({ri,k:l.k,i:l.a,j:l.b,legs:[caps[l.k]],depLocal:mod(l.dep+tzD(l.a,H)),arrLocal:mod(l.arr+tzD(l.b,H))});});
      return;}
    if(r.stops){loopProducts(sh.trip,H.c,H,H,caps,ri,{},out,inn,pairs); return;}   // v3.20: any trip looping at this hub
    /* a trip that returns to this hub without touching another: sold from its stops (v3.19).
       out: hub → first stop, and through to the next stop when the aircraft continues (a via stop);
       in: last stop → hub, and through from the stop before; pairs: every leg between two spokes. */
    const T=sh.trip, L=T.legs, st=T.stops, n=L.length, tz=c=>tzD(c,H);
    const o0=L[0], s0=st[0];
    out.push({ri,dir:'out',spoke:o0.b,legs:[caps[0]],depHub:m.depHub,depHubLoc:mod(m.depHub+hubTz),destLocal:mod(o0.arr+tz(o0.b)),block:o0.t,mult:1});
    const thruOut=s0.thru&&n>2, thruIn=n>2&&st[n-2].thru;
    if(thruOut){const o1=L[1];
      out.push({ri,dir:'out',spoke:o1.b,legs:[caps[0],caps[1]],depHub:m.depHub,depHubLoc:mod(m.depHub+hubTz),destLocal:mod(o1.arr+tz(o1.b)),block:o0.t+o1.t,mult:thruMult(o0.b,o1.b,H)});}
    const i1=L[n-1];
    inn.push({ri,dir:'ret',spoke:i1.a,legs:[caps[n-1]],arrHub:m.arrHub,arrHubLoc:mod(m.arrHub+hubTz),origLocal:mod(i1.dep+tz(i1.a)),block:i1.t,mult:1});
    if(thruIn){const i0=L[n-2];
      inn.push({ri,dir:'ret',spoke:i0.a,legs:[caps[n-2],caps[n-1]],arrHub:m.arrHub,arrHubLoc:mod(m.arrHub+hubTz),origLocal:mod(i0.dep+tz(i0.a)),block:i0.t+i1.t,mult:thruMult(i1.a,i0.a,H)});}
    for(let k=1;k<n-1;k++){const l=L[k];
      pairs.push({ri,i:l.a,j:l.b,legs:[caps[k]],depLocal:mod(l.dep+tz(l.a)),arrLocal:mod(l.arr+tz(l.b))});}
  });
  return {out,inn,pairs,rotCaps};
}
/* v3.20 — what a trip looping at hub X sells there, whoever's aircraft flies it (Hh = its home hub's
   context; times are in Hh's clock). Out: X → first stop, and through to the next when the aircraft
   continues (a through stop); in: last stop → X, and through from the stop before; every leg between
   two spokes sells their local market. Every product knows which flight (segment) it rides. */
function loopProducts(T,X,HX,Hh,caps,ri,base,out,inn,pairs){
  const L=T.legs, st=T.stops, n=L.length, tz=tzD(X,Hh), lt=(t,c)=>mod(t+tzD(c,Hh)), segOf=[];
  const hubT=t=>X===Hh.c?t:mod(t+tz);                 // own trips keep hub times unwrapped, as classic rotations always have (float-identical)
  tripSegs(T).forEach((g,j)=>g.forEach(k=>segOf[k]=j));
  const tag=(o,seg)=>tagP(o,{...base,seg});
  const o0=L[0];
  out.push(tag({ri,dir:'out',spoke:o0.b,legs:[caps[0]],depHub:hubT(o0.dep),depHubLoc:mod(o0.dep+tz),destLocal:lt(o0.arr,o0.b),block:o0.t,mult:1},segOf[0]));
  if(st[0].thru&&n>2){const o1=L[1];
    out.push(tag({ri,dir:'out',spoke:o1.b,legs:[caps[0],caps[1]],depHub:hubT(o0.dep),depHubLoc:mod(o0.dep+tz),destLocal:lt(o1.arr,o1.b),block:o0.t+o1.t,mult:thruMult(o0.b,o1.b,HX)},segOf[0]));}
  const i1=L[n-1];
  inn.push(tag({ri,dir:'ret',spoke:i1.a,legs:[caps[n-1]],arrHub:hubT(i1.arr),arrHubLoc:mod(i1.arr+tz),origLocal:lt(i1.dep,i1.a),block:i1.t,mult:1},segOf[n-1]));
  if(n>2&&st[n-2].thru){const i0=L[n-2];
    inn.push(tag({ri,dir:'ret',spoke:i0.a,legs:[caps[n-2],caps[n-1]],arrHub:hubT(i1.arr),arrHubLoc:mod(i1.arr+tz),origLocal:lt(i0.dep,i0.a),block:i0.t+i1.t,mult:thruMult(i1.a,i0.a,HX)},segOf[n-1]));}
  for(let k=1;k<n-1;k++){const l=L[k];
    pairs.push(tag({ri,i:l.a,j:l.b,legs:[caps[k]],depLocal:lt(l.dep,l.a),arrLocal:lt(l.arr,l.b)},segOf[k]));}
}
/* the flights of a looping trip as records (one per segment), times in hub X's clock */
function loopFlights(T,X,Hh,r,ac,i,pr,del,num,keyBase,extra){
  const segs=tripSegs(T), tz=tzD(X,Hh), S=(pr&&pr.segs)||[];
  return segs.map((g,j)=>{const a=T.legs[g[0]], z=T.legs[g[g.length-1]], dir=j===0?'out':j===segs.length-1?'ret':'mid', q=S[j]||{};
    return {...(extra||{}),ri:i,dir,seg:j,ac:r.ac,seats:ac.seats,no:(num&&num.get(keyBase+segKey(j,segs.length)))||flightNo(a.a,z.b,mod(a.dep+tzD(a.a,Hh)),g.length>1?a.b:null,'out',ac),
      from:a.a,to:z.b,via:g.length>1?a.b:null,depLoc:mod(a.dep+tzD(a.a,Hh)),arrLoc:mod(z.arr+tzD(z.b,Hh)),
      hubTime:mod((dir==='ret'?z.arr:a.dep)+tz),spokeTime:dir==='ret'?mod(a.dep+tzD(a.a,Hh)):mod(z.arr+tzD(z.b,Hh)),
      local:q.local||0,connect:q.connect||0,pair:q.pair||0,delay:Math.round(del||0)};});
}
const segKey=(j,n)=>j===0?'out':j===n-1?'ret':'F'+j;
const roomOf=p=>Math.min(...p.legs.map(l=>l.left));
const takeFrom=(p,n)=>p.legs.forEach(l=>l.left-=n);

/* evaluate() in three stages so several hubs can share one pool of connecting demand:
   evalPrep (per hub: local traffic, stop-en-route pairs, candidate connections), a joint
   allocation of connecting passengers best-connection-first across all hubs, and finish (per
   hub: scoring and records). With one hub this is the same computation in the same order. */
// per-rotation passenger attribution: local (hub O&D) vs connecting vs spoke-to-spoke
const newPerRot=()=>({local:0,connect:0,pair:0,pm:0,
    outLocal:0,outConnect:0,outPair:0,   // hub->spoke leg (the flight's listed departure)
    retLocal:0,retConnect:0,retPair:0}); // spoke->hub leg (the return)
/* bookkeeping on a product that must never appear in results: who is credited (pr), its
   rotation's delay (del), a rotation key unique across hubs (rk) */
const tagP=(p,o)=>{Object.keys(o).forEach(k=>Object.defineProperty(p,k,{value:o[k],enumerable:false,writable:true}));return p;};
/* cross-hub rotations credit traffic to each leg as well (their legs are separate flights) */
const legAdd=(p,key,take)=>{if(p.k==null||!p.pr)return; const L=p.pr.legs||(p.pr.legs=[]); const o=L[p.k]=L[p.k]||{local:0,connect:0}; o[key]=(o[key]||0)+take;};
/* general trips (v3.20) credit each flight (segment) too */
const segAdd=(p,key,take)=>{if(p.seg==null||!p.pr)return; const S=p.pr.segs||(p.pr.segs=[]); (S[p.seg]=S[p.seg]||{local:0,connect:0,pair:0})[key]+=take;};
function evalPrep(rots,fleet,gates,H,pre){
  pre=pre||{};
  const MCT_G=mctFor(gates);
  const D=pre.D||delayMap(rots,fleet,H);
  const {out,inn,pairs,rotCaps}=productsOf(rots,fleet,H,pre.caps);
  let pm=0,pax=0;
  const perRot=pre.perRot||rots.map(newPerRot);
  [...out,...inn].forEach(p=>tagP(p,{pr:perRot[p.ri],del:D[p.ri]||0,rk:H.c+':'+p.ri}));
  pairs.forEach(p=>{if(!p.pr)tagP(p,{pr:perRot[p.ri]});});
  if(pre.visitOut){pre.visitOut.forEach(p=>out.push(p)); pre.visitIn.forEach(p=>inn.push(p));}   // other hubs' aircraft, this hub's flights
  if(pre.visitPairs)pre.visitPairs.forEach(p=>pairs.push(p));
  const freq={}; [...out].forEach(p=>freq[p.spoke]=(freq[p.spoke]||0)+1);

  /* connections over the hub */
  const cands=[], simple={}, conn=new Set();
  const addSimple=(k,t)=>(simple[k]=simple[k]||[]).push(t);
  pairs.forEach(p=>addSimple(p.i+p.j,p.depLocal));
  inn.forEach(Ap=>out.forEach(Bp=>{
    if(Ap.spoke===Bp.spoke)return;
    if(Ap.rk===Bp.rk&&!(Ap.k!=null&&Bp.k===Ap.k+1))return;   // staying aboard through a hub stop is a connection
    const i=Ap.spoke,j=Bp.spoke;
    const need=MCT_G+(customsIn(i)?CUSTOMS:0);
    /* attractiveness is judged against the customs-inclusive minimum for every arrival from abroad,
       so preclearance only ever helps: it makes 40–69m connections possible and adds buffer,
       without making an existing 70m+ connection look slower. (Identical to before elsewhere.) */
    const refMin=MCT_G+(A[i].intl?CUSTOMS:0);        // clearing customs takes time
    const ct=mod(Bp.depHub-Ap.arrHub); if(ct<need||ct>MAXCT)return;
    const d=dPair[i+j];
    const r=(H.dHub[i]+H.dHub[j])/d, tol=0.18+0.00022*d;
    const del=Ap.del;
    const P=pMake(ct-need-del);                    // late inbound eats the buffer
    const timeF=Math.min(1,Math.pow(0.80,(ct-refMin)/60));
    const circF=1/(1+Math.pow(Math.max(0,r-1)/tol,2));
    if(circF>=0.2){addSimple(i+j,Ap.origLocal); conn.add(i+j);}   // a one-stop a passenger could book (the timetable lists it)
    const v=0.94*timeF*circF*P*pw(Ap.origLocal)*pw(Bp.destLocal)*Ap.mult*Bp.mult;
    if(v<0.02)return;
    cands.push({Ap,Bp,i,j,d,ct,r,v,P,del,need});
  }));
  const local=[], pairRows=[];
  const book=(ret,used)=>{
  /* hub local O&D, both directions */
  const spokesServed=[...new Set([...out,...inn].map(p=>p.spoke))];
  spokesServed.forEach(c=>{
    const trunk=isOwnHub(c,H);
    if(trunk&&H.others[c].rank<H.rank)return;           // one DEN–RDU market, sold once (by the hub listed first)
    const f=freq[c]||0, half=halfLocal(c,H), cap=capture(f,half);
    const market=trunk?hubOD(c)+hubOD(H.c):2*hubOD(c), pool=trunk?market/2*cap:hubOD(c)*cap;   // trunk: the average of the two hubs' views
    let got=0;
    [[out,'out'],[inn,'in']].forEach(([arr,dir])=>{
      const ps=arr.filter(p=>p.spoke===c); if(!ps.length)return;
      /* share of the pool is set by schedule quality; reliability then destroys demand
         rather than handing it to the flight next door. */
      const wts=ps.map(p=>(dir==='out'
        ? endpointW(p.depHubLoc,p.destLocal,p.block,true)*endpointW(p.destLocal,p.depHubLoc,p.block,false)
        : endpointW(p.origLocal,p.arrHubLoc,p.block,true)*endpointW(p.arrHubLoc,p.origLocal,p.block,false)
      )*p.mult);
      const tot=wts.reduce((a,b)=>a+b,0)||1;
      ps.forEach((p,i)=>{const f=ret?(dir==='out'?ret(H.c,c,p.legs.length===1?3:2):ret(c,H.c,p.legs.length===1?3:2)):1;
        const take=Math.min(roomOf(p),f===1?pool*(wts[i]/tot)*otpOf(p.del):pool*(wts[i]/tot)*otpOf(p.del)*f);
        if(take<=0)return; takeFrom(p,take); pm+=take*H.dHub[c]; pax+=take; got+=take;
        const q=p.pr; if(q){q.local+=take; q.pm+=take*H.dHub[c];
          if(dir==='out')q.outLocal+=take; else q.retLocal+=take; legAdd(p,'local',take); segAdd(p,'local',take);}});
    });
    local.push({c,f,half,cap,market,pax:got,left:Math.max(0,market-got)});
  });

  /* spoke-to-spoke nonstops created by a via stop */
  const pfreq={}; pairs.forEach(p=>pfreq[p.i+p.j]=(pfreq[p.i+p.j]||0)+1);
  pairs.forEach(p=>{
    let av=spill(p.i,p.j)*capture(pfreq[p.i+p.j],HALF_PAIR)*pw(p.depLocal)*pw(p.arrLocal);
    if(ret){const f=ret(p.i,p.j,3); if(f<1)av*=f;}
    const take=Math.min(roomOf(p),av);
    if(take<=0.5)return;
    takeFrom(p,take); pm+=take*dPair[p.i+p.j]; pax+=take;
    if(used)used[p.i+p.j]=(used[p.i+p.j]||0)+take;         // your nonstop and your connections share one pool
    const q=p.pr||perRot[p.ri];
    if(q){q.pair+=take; q.pm+=take*dPair[p.i+p.j];
      q.outPair+=take; legAdd(p,'pair',take); segAdd(p,'pair',take);}
    pairRows.push({i:p.i,j:p.j,pax:take});
  });

  };
  const mk={},flows={};
  return {cands,simple,conn,inn,out,pairs,MCT_G,H,perRot,mk,flows,book,addPm:(a,b)=>{pm+=a;pax+=b;},finish:()=>{
  const cur=gateCurve(rots,fleet), peak=rots.length?Math.max(...cur):0;
  const seatMi=rots.reduce((a,r)=>{const ac=fleet.find(x=>x.id===r.ac);
    if(crossHub(r,H))return a+legPlan(r,ac,H).filter(l=>l.owner===H.c).reduce((s,l)=>s+ac.seats*nm(A[l.a],A[l.b]),0);
    return a+shape(r,ac,H).legs.reduce((s,L)=>s+ac.seats*nm(A[L.a],A[L.b]),0);},0)+(pre.visitSeatMi||0);
  // NET pax-miles = filled seat-miles minus empty seat-miles.
  // Empty seats are a real cost even with no money: flying capacity you can't sell is
  // punished, so a half-empty widebody at 1am scores negative. EMPTY_W scales the bite.
  const emptyMi=Math.max(0,seatMi-pm);
  const netPm=pm-EMPTY_W*emptyMi;
  const lf=seatMi>0?pm/seatMi:0;
  const delays=rots.map((r,i)=>D[i]||0);
  const otp=rots.length?delays.reduce((a,d)=>a+Math.exp(-d/45),0)/rots.length:1;
  /* Per-LEG flight records: each rotation yields an outbound and a return flight,
     each with its own number, endpoints, hub+spoke times, seats and load. This is the
     unit the schedule/timetable UI reads, and it stays correct under multi-hub routing. */
  const flights=[];
  rots.forEach((r,i)=>{
    const ac=fleet.find(a=>a.id===r.ac); if(!ac)return;
    if(crossHub(r,H)){             // one record per leg this hub owns, each with its own number
      const pr=perRot[i]||{}, del=Math.round(delays[i]||0);
      legPlan(r,ac,H).forEach(l=>{ if(l.owner!==H.c)return; const L=(pr.legs||[])[l.k]||{}, dep=l.a===H.c;
        flights.push({ri:i,dir:dep?'out':'ret',leg:l.k,ac:r.ac,seats:ac.seats,no:(pre.num&&pre.num.get(H.c+'#'+i+'#L'+l.k))||l.no,from:l.a,to:l.b,via:null,
          hubTime:mod(dep?l.dep:l.arr),spokeTime:mod(dep?l.arr+tzD(l.b,H):l.dep+tzD(l.a,H)),
          local:L.local||0,connect:L.connect||0,pair:0,delay:del});});
      return;}
    if(r.stops){flights.push(...loopFlights(shape(r,ac,H).trip,H.c,H,r,ac,i,perRot[i],delays[i],pre.num,H.c+'#'+i+'#')); return;}   // v3.20
    const sh=shape(r,ac,H), m=sh.marks, pr=perRot[i]||{}, T=sh.trip, dst=T.dst, via=tripVia(T);
    const tzd=tzD(dst,H), hubC=H.c, seats=ac.seats, del=Math.round(delays[i]||0);
    // outbound: hub -> (via ->) dst
    flights.push({ri:i, dir:'out', ac:r.ac, seats,
      no:(pre.num&&pre.num.get(hubC+'#'+i+'#out'))||flightNo(hubC,dst,r.dep,via,'out',ac),
      from:hubC, to:dst, via,
      depHub:mod(m.depHub), depHubLoc:mod(m.depHub),        // hub local = depHub (hub tz baseline)
      arrSpokeLoc:mod(m.arrDst+tzd),
      hubTime:mod(m.depHub), spokeTime:mod(m.arrDst+tzd),
      local:pr.outLocal||0, connect:pr.outConnect||0, pair:pr.outPair||0, delay:del});
    // return: dst -> (via ->) hub
    flights.push({ri:i, dir:'ret', ac:r.ac, seats,
      no:(pre.num&&pre.num.get(hubC+'#'+i+'#ret'))||flightNo(hubC,dst,r.dep,via,'ret',ac),
      from:dst, to:hubC, via,
      depSpokeLoc:mod(m.depDst+tzd), arrHub:mod(m.arrHub),
      hubTime:mod(m.arrHub), spokeTime:mod(m.depDst+tzd),
      local:pr.retLocal||0, connect:pr.retConnect||0, pair:pr.retPair||0, delay:del});
  });
  (pre.visitFlights||[]).forEach(v=>{
    if(v.loop){const q=((v.pr.segs||[])[v.rec.seg])||{}; flights.push({...v.rec,local:q.local||0,connect:q.connect||0,pair:q.pair||0}); return;}
    const L=(v.pr.legs||[])[v.k]||{}; flights.push({...v.rec,local:L.local||0,connect:L.connect||0,pair:0});});
  /* per-LEG loads: seats and passengers on every leg actually flown (read-only view) */
  const legs=[];
  rotCaps.forEach((caps,ri)=>caps.forEach((c,k)=>legs.push({ri,k,a:c.a,b:c.b,t:c.t,seats:c.seats,
    pax:c.seats-c.left,nm:nm(A[c.a],A[c.b])})));
  return {pm,netPm,lf,emptyMi,pax,peak,seatMi,cur,flows,pairRows,perRot,flights,delays,otp,legs,
    rons:rots.filter(r=>{const ac=fleet.find(x=>x.id===r.ac); return ac&&tripStops(r,ac,H).some((s,k,a)=>k<a.length-1&&!s.thru&&s.g>240);}).length,
    vias:rots.filter(r=>{const ac=fleet.find(x=>x.id===r.ac); return ac&&tripStops(r,ac,H).some(s=>s.thru);}).length,
    markets:Object.values(mk).sort((a,b)=>b.pax-a.pax),
    local:local.sort((a,b)=>b.pax-a.pax)};
  }};
}
/* list: [{rots,fleet,gates,H}] → one result per hub. Connecting demand between two cities is
   counted once airline-wide: every hub's candidate connections compete in one ranking, and a
   market's capacity grows with the total number of itineraries offered across hubs. */
function evaluateMulti(list){
  const NUM=numberFlights(list), pre=list.map(()=>({num:NUM}));
  if(list.some(o=>o.rots.some(r=>crossHub(r,o.H))))crossPrep(list,pre);
  const S=list.map((o,h)=>evalPrep(o.rots,o.fleet,o.gates,o.H,pre[h]));
  const dbl=list.length>1?doubleCands(S):[];
  /* v3.20: every hub's offer is known before anyone books, so each direction can be judged by its return */
  const ret=RETURN_RULE?returnOffers(S,dbl):null, used={};
  S.forEach(s=>s.book(ret,PAIR_SHARE?used:null));
  evaluateMulti.lastLevels=ret?ret.level:null;          // v3.21: read by the schedule editor (way-back chips)
  const all=[]; S.forEach((st,h)=>st.cands.forEach(c=>all.push({c,h})));
  if(ret){all.forEach(({c})=>{const f=ret(c.i,c.j,2); if(f<1)c.v*=f;}); dbl.forEach(c=>{const f=ret(c.i,c.j,1); if(f<1)c.v*=f;});}
  const nItin={}; all.forEach(({c})=>nItin[c.i+c.j]=(nItin[c.i+c.j]||0)+1);
  const nD={}; dbl.forEach(c=>nD[c.i+c.j]=(nD[c.i+c.j]||0)+1);   // doubles never change how one-stops sell
  all.sort((x,y)=>y.c.v-x.c.v);
  all.forEach(({c,h})=>{const s=S[h], perRot=s.perRot, mk=s.mk, flows=s.flows, H=s.H;
    const k=c.i+c.j, av=spill(c.i,c.j);
    const capK=av*capture(nItin[k],HALF_CONN), room=capK-(used[k]||0);
    if(room<=0)return;
    const take=Math.min(room,roomOf(c.Ap),roomOf(c.Bp),av*c.v);
    if(take<=0.5)return;
    used[k]=(used[k]||0)+take; takeFrom(c.Ap,take); takeFrom(c.Bp,take);
    s.addPm(take*c.d,take);
    const shA=H.dHub[c.i]/(H.dHub[c.i]+H.dHub[c.j]);          // attribution only: score is unchanged
    const qa=c.Ap.pr, qb=c.Bp.pr;
    if(qa)qa.pm+=take*c.d*shA;
    if(qb)qb.pm+=take*c.d*(1-shA);
    if(qa){qa.connect+=take;
      if(c.Ap.dir==='out')qa.outConnect+=take; else qa.retConnect+=take; legAdd(c.Ap,'connect',take); segAdd(c.Ap,'connect',take);}
    if(qb){qb.connect+=take;
      if(c.Bp.dir==='out')qb.outConnect+=take; else qb.retConnect+=take; legAdd(c.Bp,'connect',take); segAdd(c.Bp,'connect',take);}
    if(!mk[k]){mk[k]={...c,pax:0,n:nItin[k]}; if(ret){const f=ret(c.i,c.j,2); if(f<1)mk[k].ret=f;}}   // v3.20: penalized for its way back
    mk[k].pax+=take;
    (flows[c.i]=flows[c.i]||{out:0,in:0}).out+=take;
    (flows[c.j]=flows[c.j]||{out:0,in:0}).in+=take;
  });
  /* double connections go last: only seats nobody simpler wanted (they never crowd out one-stops) */
  dbl.sort((x,y)=>y.v-x.v).forEach(c=>{const s=S[c.h], k=c.i+c.j, av=spill(c.i,c.j);
    const room=av*capture((nItin[k]||0)+nD[k],HALF_CONN)-(used[k]||0); if(room<=0)return;
    const seats=Math.min(roomOf(c.Ap),roomOf(c.T),roomOf(c.Bp)); if(seats<=0.25)return;
    const take=Math.min(room,seats,av*c.v);
    if(take<=0.25)return;
    used[k]=(used[k]||0)+take; [c.Ap,c.T,c.Bp].forEach(p=>takeFrom(p,take));
    s.addPm(take*c.d,take);
    const tot=c.dl[0]+c.dl[1]+c.dl[2];
    [c.Ap,c.T,c.Bp].forEach((p,q)=>{const pr=p.pr; if(!pr)return; pr.pm+=take*c.d*c.dl[q]/tot; pr.connect+=take;
      if(p.dir==='out')pr.outConnect+=take; else pr.retConnect+=take; legAdd(p,'connect',take); segAdd(p,'connect',take);});
    const mk=s.mk, kk=k+'|2';
    if(!mk[kk])mk[kk]={i:c.i,j:c.j,d:c.d,ct:c.ct1+c.ct2,ct1:c.ct1,ct2:c.ct2,r:c.r,v:c.v,P:c.P,del:c.del,need:c.need,dbl:true,via:[c.A,c.B],pax:0,n:(nItin[k]||0)+nD[k]};
    mk[kk].pax+=take;
    (s.flows[c.i]=s.flows[c.i]||{out:0,in:0}).out+=take;
    (s.flows[c.j]=s.flows[c.j]||{out:0,in:0}).in+=take;
  });
  return S.map(st=>st.finish());
}
function evaluate(rots,fleet,gates,H){return evaluateMulti([{rots,fleet,gates,H}])[0];}
/* v3.20 — the best way back the airline offers for every city pair, in each direction:
   3 nonstop · 2 one-stop (a through flight, or a connection a passenger could book) · 1 two-stop · 0 none.
   A product of quality q from O to D keeps full demand when the return D→O is at least as good,
   RET_PART when it is worse but exists, RET_NONE when there is no way back on this airline. */
function returnOffers(S,dbl){
  const L={}, up=(k,q)=>{if(!(L[k]>=q))L[k]=q;};
  S.forEach(s=>{const X=s.H.c;
    s.out.forEach(p=>up(X+p.spoke,p.legs.length===1?3:2));
    s.inn.forEach(p=>up(p.spoke+X,p.legs.length===1?3:2));
    s.pairs.forEach(p=>up(p.i+p.j,3));
    s.conn.forEach(k=>up(k,2));});
  dbl.forEach(c=>up(c.i+c.j,1));
  const f=(O,D,q)=>{const r=L[D+O]||0; return r>=q?1:r>0?RET_PART:RET_NONE;};
  f.level=L;                                           // for the Markets tab and tests
  return f;
}

/* Cross-hub flying: everything that spans hubs is built once, before any hub is evaluated —
   one set of seats per physical flight, each hub's departure pressure including visitors, each
   home hub's delays, and every hub's list of flights operated by other hubs' aircraft. */
function crossPrep(list,pre){
  const acOf=(o,r)=>o.fleet.find(a=>a.id===r.ac);
  const plans=list.map(o=>o.rots.map(r=>crossHub(r,o.H)&&acOf(o,r)?legPlan(r,acOf(o,r),o.H):null));
  list.forEach((o,h)=>{const extra=[];
    list.forEach((q,g)=>{if(g===h)return; plans[g].forEach(P=>{if(P)P.forEach(l=>{if(l.a===o.H.c)extra.push(l.dep+tzD(o.H.c,q.H));});});});
    pre[h].press=hubDepPressure(o.rots,extra);});
  list.forEach((o,h)=>list.forEach((q,g)=>{if(g!==h&&o.H.others&&o.H.others[q.H.c])o.H.others[q.H.c].press=pre[g].press;}));
  list.forEach((o,h)=>{
    pre[h].D=delayMap(o.rots,o.fleet,o.H,pre[h].press);
    pre[h].perRot=o.rots.map(newPerRot);
    pre[h].caps=o.rots.map(r=>{const ac=acOf(o,r); return shape(r,ac,o.H).legs.map(L=>({left:ac.seats,seats:ac.seats,a:L.a,b:L.b,t:L.t}));});
  });
  list.forEach((o,h)=>{const vo=[],vi=[],vf=[],vp=[]; let vs=0; const X=o.H.c;
    list.forEach((q,g)=>{if(g===h)return;
      plans[g].forEach((P,ri)=>{if(!P)return; const r=q.rots[ri], ac=acOf(q,r), del=pre[g].D[ri]||0, pr=pre[g].perRot[ri], tz=tzD(X,q.H);
        if(loopHub(r,q.H)===X){                       // v3.20: e.g. a DEN aircraft flying ATL–MCO–ATL
          const T=tripOf(r,ac,q.H), base={pr,del,rk:q.H.c+':'+ri};
          loopProducts(T,X,o.H,q.H,pre[g].caps[ri],ri,base,vo,vi,vp);
          P.forEach(l=>{if(l.owner===X)vs+=ac.seats*nm(A[l.a],A[l.b]);});
          loopFlights(T,X,q.H,r,ac,ri,null,del,pre[h].num,q.H.c+'#'+ri+'#',{visit:q.H.c,homeRi:ri}).forEach(rec=>vf.push({pr,loop:true,rec}));
          return;}
        P.forEach(l=>{const cap=pre[g].caps[ri][l.k], base={pr,del,rk:q.H.c+':'+ri};
          if(l.b===X)vi.push(tagP({ri,k:l.k,dir:'ret',spoke:l.a,legs:[cap],arrHub:mod(l.arr+tz),arrHubLoc:mod(l.arr+tz),origLocal:mod(l.dep+tzD(l.a,q.H)),block:l.t,mult:1,home:q.H.c},base));
          if(l.a===X)vo.push(tagP({ri,k:l.k,dir:'out',spoke:l.b,legs:[cap],depHub:mod(l.dep+tz),depHubLoc:mod(l.dep+tz),destLocal:mod(l.arr+tzD(l.b,q.H)),block:l.t,mult:1,home:q.H.c},base));
          if(l.owner===X){vs+=ac.seats*nm(A[l.a],A[l.b]); const dep=l.a===X;
            vf.push({pr,k:l.k,rec:{visit:q.H.c,homeRi:ri,dir:dep?'out':'ret',leg:l.k,ac:r.ac,seats:ac.seats,no:(pre[h].num&&pre[h].num.get(q.H.c+'#'+ri+'#L'+l.k))||l.no,from:l.a,to:l.b,via:null,
              hubTime:mod(dep?l.dep+tz:l.arr+tz),spokeTime:mod(dep?l.arr+tzD(l.b,q.H):l.dep+tzD(l.a,q.H)),delay:Math.round(del)}});}});});});
    pre[h].visitOut=vo; pre[h].visitIn=vi; pre[h].visitFlights=vf; pre[h].visitSeatMi=vs; if(vp.length)pre[h].visitPairs=vp;});
}

/* Double connections (v3.14): spoke → hub A → hub B → spoke, A and B two different hubs joined by a
   direct trunk flight. Strict rules: every airport appears at most once (no retracing — e.g. never
   LAX→ATL→CHS→ATL→EYW); each connection inside that hub's window (MCT, + customs from abroad, up
   to MAXCT); not too roundabout overall; offered only where nothing simpler (a through flight or a
   single connection a passenger could book) leaves within DBL_GAP minutes; and DBL_PEN makes them
   unattractive, so only a small fraction of travelers use them. */
function doubleCands(S){
  const out=[], hubIx={}; S.forEach((s,h)=>hubIx[s.H.c]=h);
  const simple={}; S.forEach(s=>Object.entries(s.simple).forEach(([k,v])=>{(simple[k]=simple[k]||[]).push(...v);}));
  const near=(k,t)=>(simple[k]||[]).some(x=>{const g=Math.abs(mod(x-t)); return Math.min(g,DAY-g)<DBL_GAP;});
  S.forEach((sa,a)=>{const HA=sa.H;
    sa.out.forEach(T=>{
      if(T.legs.length!==1||!isOwnHub(T.spoke,HA))return;
      const b=hubIx[T.spoke]; if(b==null)return; const sb=S[b];
      const T2=sb.inn.find(q=>q.legs.length===1&&q.legs[0]===T.legs[0]); if(!T2)return;   // the same seats, seen from hub B
      const need2=sb.MCT_G+(customsIn(HA.c)?CUSTOMS:0);
      sa.inn.forEach(Ap=>{const O=Ap.spoke; if(isOwnHub(O,HA)||O===sb.H.c)return;
        if(Ap.rk===T.rk&&!(Ap.k!=null&&T.k===Ap.k+1))return;
        const need1=sa.MCT_G+(customsIn(O)?CUSTOMS:0), ct1=mod(T.depHub-Ap.arrHub);
        if(ct1<need1||ct1>MAXCT)return;
        const ref1=sa.MCT_G+(A[O].intl?CUSTOMS:0);
        sb.out.forEach(Bp=>{const D=Bp.spoke; if(D===O||isOwnHub(D,HA)||D===HA.c)return;
          if(T2.rk===Bp.rk&&!(T2.k!=null&&Bp.k===T2.k+1))return;
          const ct2=mod(Bp.depHub-T2.arrHub); if(ct2<need2||ct2>MAXCT)return;
          const legs=[...Ap.legs,...T.legs,...Bp.legs], seen=new Set([legs[0].a]);
          if(legs.some(l=>{if(seen.has(l.b))return true; seen.add(l.b); return false;}))return;   // no airport twice
          const d=dPair[O+D]; if(!d)return;
          if(near(O+D,Ap.origLocal))return;                                                     // something simpler leaves within 6h
          const dl=[Ap,T,Bp].map(p=>p.legs.reduce((x,l)=>x+nm(A[l.a],A[l.b]),0));
          const r=(dl[0]+dl[1]+dl[2])/d, tol=0.18+0.00022*d, circF=1/(1+Math.pow(Math.max(0,r-1)/tol,2));
          if(circF<0.2)return;
          const P=pMake(ct1-need1-Ap.del)*pMake(ct2-need2-T.del);
          const timeF=Math.min(1,Math.pow(0.80,(ct1+ct2-ref1-sb.MCT_G)/60));
          const v=DBL_PEN*0.94*timeF*circF*P*pw(Ap.origLocal)*pw(Bp.destLocal)*Ap.mult*Bp.mult;
          if(v<0.005)return;
          out.push({h:a,A:HA.c,B:sb.H.c,Ap,T,Bp,i:O,j:D,d,dl,ct1,ct2,r,v,P,del:Ap.del,need:need1});});});});});
  return out;
}
