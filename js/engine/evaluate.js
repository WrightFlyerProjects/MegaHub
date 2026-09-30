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
        if(l.b===H.c)inn.push({ri,k:l.k,dir:'ret',spoke:l.a,legs:[caps[l.k]],arrHub:mod(l.arr),arrHubLoc:mod(l.arr+hubTz),origLocal:mod(l.dep+tzD(l.a,H)),block:l.t,mult:1});});
      return;}
    if(!r.via){
      const bl=sh.legs[0].t;
      out.push({ri,dir:'out',spoke:r.dst,legs:[caps[0]],depHub:m.depHub,depHubLoc:mod(m.depHub+hubTz),destLocal:mod(m.arrDst+tzD(r.dst,H)),block:bl,mult:1});
      inn.push({ri,dir:'ret',spoke:r.dst,legs:[caps[1]],arrHub:m.arrHub,arrHubLoc:mod(m.arrHub+hubTz),origLocal:mod(m.depDst+tzD(r.dst,H)),block:sh.legs[1].t,mult:1});
    }else{
      const tm=thruMult(r.via,r.dst,H);
      const b1=sh.legs[0].t,b2=sh.legs[1].t,b3=sh.legs[2].t,b4=sh.legs[3].t;
      out.push({ri,dir:'out',spoke:r.via,legs:[caps[0]],depHub:m.depHub,depHubLoc:mod(m.depHub+hubTz),destLocal:mod(m.arrVia+tzD(r.via,H)),block:b1,mult:1});
      out.push({ri,dir:'out',spoke:r.dst,legs:[caps[0],caps[1]],depHub:m.depHub,depHubLoc:mod(m.depHub+hubTz),destLocal:mod(m.arrDst+tzD(r.dst,H)),block:b1+b2,mult:tm});
      inn.push({ri,dir:'ret',spoke:r.via,legs:[caps[3]],arrHub:m.arrHub,arrHubLoc:mod(m.arrHub+hubTz),origLocal:mod(m.depVia2+tzD(r.via,H)),block:b4,mult:1});
      inn.push({ri,dir:'ret',spoke:r.dst,legs:[caps[2],caps[3]],arrHub:m.arrHub,arrHubLoc:mod(m.arrHub+hubTz),origLocal:mod(m.depDst+tzD(r.dst,H)),block:b3+b4,mult:tm});
      pairs.push({ri,i:r.via,j:r.dst,legs:[caps[1]],depLocal:mod(m.depVia+tzD(r.via,H)),arrLocal:mod(m.arrDst+tzD(r.dst,H))});
      pairs.push({ri,i:r.dst,j:r.via,legs:[caps[2]],depLocal:mod(m.depDst+tzD(r.dst,H)),arrLocal:mod(m.arrVia2+tzD(r.via,H))});
    }
  });
  return {out,inn,pairs,rotCaps};
}
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
const legAdd=(p,key,take)=>{if(p.k==null||!p.pr)return; const L=p.pr.legs||(p.pr.legs=[]); (L[p.k]=L[p.k]||{local:0,connect:0})[key]+=take;};
function evalPrep(rots,fleet,gates,H,pre){
  pre=pre||{};
  const MCT_G=mctFor(gates);
  const D=pre.D||delayMap(rots,fleet,H);
  const {out,inn,pairs,rotCaps}=productsOf(rots,fleet,H,pre.caps);
  let pm=0,pax=0;
  const perRot=pre.perRot||rots.map(newPerRot);
  [...out,...inn].forEach(p=>tagP(p,{pr:perRot[p.ri],del:D[p.ri]||0,rk:H.c+':'+p.ri}));
  if(pre.visitOut){pre.visitOut.forEach(p=>out.push(p)); pre.visitIn.forEach(p=>inn.push(p));}   // other hubs' aircraft, this hub's flights
  const freq={}; [...out].forEach(p=>freq[p.spoke]=(freq[p.spoke]||0)+1);

  /* hub local O&D, both directions */
  const local=[];
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
      ps.forEach((p,i)=>{const take=Math.min(roomOf(p),pool*(wts[i]/tot)*otpOf(p.del));
        if(take<=0)return; takeFrom(p,take); pm+=take*H.dHub[c]; pax+=take; got+=take;
        const q=p.pr; if(q){q.local+=take; q.pm+=take*H.dHub[c];
          if(dir==='out')q.outLocal+=take; else q.retLocal+=take; legAdd(p,'local',take);}});
    });
    local.push({c,f,half,cap,market,pax:got,left:Math.max(0,market-got)});
  });

  /* spoke-to-spoke nonstops created by a via stop */
  const pfreq={}; pairs.forEach(p=>pfreq[p.i+p.j]=(pfreq[p.i+p.j]||0)+1);
  const pairRows=[];
  pairs.forEach(p=>{
    const av=spill(p.i,p.j)*capture(pfreq[p.i+p.j],HALF_PAIR)*pw(p.depLocal)*pw(p.arrLocal);
    const take=Math.min(roomOf(p),av);
    if(take<=0.5)return;
    takeFrom(p,take); pm+=take*dPair[p.i+p.j]; pax+=take;
    if(perRot[p.ri]){perRot[p.ri].pair+=take; perRot[p.ri].pm+=take*dPair[p.i+p.j];
      perRot[p.ri].outPair+=take;}
    pairRows.push({i:p.i,j:p.j,pax:take});
  });

  /* connections over the hub */
  const cands=[];
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
    const v=0.94*timeF*circF*P*pw(Ap.origLocal)*pw(Bp.destLocal)*Ap.mult*Bp.mult;
    if(v<0.02)return;
    cands.push({Ap,Bp,i,j,d,ct,r,v,P,del,need});
  }));
  const mk={},flows={};
  return {cands,H,perRot,mk,flows,addPm:(a,b)=>{pm+=a;pax+=b;},finish:()=>{
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
        flights.push({ri:i,dir:dep?'out':'ret',leg:l.k,ac:r.ac,seats:ac.seats,no:l.no,from:l.a,to:l.b,via:null,
          hubTime:mod(dep?l.dep:l.arr),spokeTime:mod(dep?l.arr+tzD(l.b,H):l.dep+tzD(l.a,H)),
          local:L.local||0,connect:L.connect||0,pair:0,delay:del});});
      return;}
    const m=shape(r,ac,H).marks, pr=perRot[i]||{};
    const tzd=tzD(r.dst,H), hubC=H.c, seats=ac.seats, del=Math.round(delays[i]||0);
    const outSpoke=r.via||r.dst, retSpoke=r.via||r.dst;
    // outbound: hub -> (via ->) dst
    flights.push({ri:i, dir:'out', ac:r.ac, seats,
      no:flightNo(hubC,r.dst,r.dep,r.via||null,'out',H.band),
      from:hubC, to:r.dst, via:r.via||null,
      depHub:mod(m.depHub), depHubLoc:mod(m.depHub),        // hub local = depHub (hub tz baseline)
      arrSpokeLoc:mod(m.arrDst+tzd),
      hubTime:mod(m.depHub), spokeTime:mod(m.arrDst+tzd),
      local:pr.outLocal||0, connect:pr.outConnect||0, pair:pr.outPair||0, delay:del});
    // return: dst -> (via ->) hub
    flights.push({ri:i, dir:'ret', ac:r.ac, seats,
      no:flightNo(hubC,r.dst,r.dep,r.via||null,'ret',H.band),
      from:r.dst, to:hubC, via:r.via||null,
      depSpokeLoc:mod(m.depDst+tzd), arrHub:mod(m.arrHub),
      hubTime:mod(m.arrHub), spokeTime:mod(m.depDst+tzd),
      local:pr.retLocal||0, connect:pr.retConnect||0, pair:pr.retPair||0, delay:del});
  });
  (pre.visitFlights||[]).forEach(v=>{const L=(v.pr.legs||[])[v.k]||{}; flights.push({...v.rec,local:L.local||0,connect:L.connect||0,pair:0});});
  /* per-LEG loads: seats and passengers on every leg actually flown (read-only view) */
  const legs=[];
  rotCaps.forEach((caps,ri)=>caps.forEach((c,k)=>legs.push({ri,k,a:c.a,b:c.b,t:c.t,seats:c.seats,
    pax:c.seats-c.left,nm:nm(A[c.a],A[c.b])})));
  return {pm,netPm,lf,emptyMi,pax,peak,seatMi,cur,flows,pairRows,perRot,flights,delays,otp,legs,
    rons:rots.filter(r=>r.turn>240).length,
    vias:rots.filter(r=>r.via).length,
    markets:Object.values(mk).sort((a,b)=>b.pax-a.pax),
    local:local.sort((a,b)=>b.pax-a.pax)};
  }};
}
/* list: [{rots,fleet,gates,H}] → one result per hub. Connecting demand between two cities is
   counted once airline-wide: every hub's candidate connections compete in one ranking, and a
   market's capacity grows with the total number of itineraries offered across hubs. */
function evaluateMulti(list){
  const pre=list.map(()=>({}));
  if(list.some(o=>o.rots.some(r=>crossHub(r,o.H))))crossPrep(list,pre);
  const S=list.map((o,h)=>evalPrep(o.rots,o.fleet,o.gates,o.H,pre[h]));
  const all=[]; S.forEach((st,h)=>st.cands.forEach(c=>all.push({c,h})));
  const nItin={}; all.forEach(({c})=>nItin[c.i+c.j]=(nItin[c.i+c.j]||0)+1);
  all.sort((x,y)=>y.c.v-x.c.v);
  const used={};
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
      if(c.Ap.dir==='out')qa.outConnect+=take; else qa.retConnect+=take; legAdd(c.Ap,'connect',take);}
    if(qb){qb.connect+=take;
      if(c.Bp.dir==='out')qb.outConnect+=take; else qb.retConnect+=take; legAdd(c.Bp,'connect',take);}
    if(!mk[k])mk[k]={...c,pax:0,n:nItin[k]};
    mk[k].pax+=take;
    (flows[c.i]=flows[c.i]||{out:0,in:0}).out+=take;
    (flows[c.j]=flows[c.j]||{out:0,in:0}).in+=take;
  });
  return S.map(st=>st.finish());
}
function evaluate(rots,fleet,gates,H){return evaluateMulti([{rots,fleet,gates,H}])[0];}

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
  list.forEach((o,h)=>{const vo=[],vi=[],vf=[]; let vs=0; const X=o.H.c;
    list.forEach((q,g)=>{if(g===h)return;
      plans[g].forEach((P,ri)=>{if(!P)return; const r=q.rots[ri], ac=acOf(q,r), del=pre[g].D[ri]||0, pr=pre[g].perRot[ri], tz=tzD(X,q.H);
        P.forEach(l=>{const cap=pre[g].caps[ri][l.k], base={pr,del,rk:q.H.c+':'+ri};
          if(l.b===X)vi.push(tagP({ri,k:l.k,dir:'ret',spoke:l.a,legs:[cap],arrHub:mod(l.arr+tz),arrHubLoc:mod(l.arr+tz),origLocal:mod(l.dep+tzD(l.a,q.H)),block:l.t,mult:1,home:q.H.c},base));
          if(l.a===X)vo.push(tagP({ri,k:l.k,dir:'out',spoke:l.b,legs:[cap],depHub:mod(l.dep+tz),depHubLoc:mod(l.dep+tz),destLocal:mod(l.arr+tzD(l.b,q.H)),block:l.t,mult:1,home:q.H.c},base));
          if(l.owner===X){vs+=ac.seats*nm(A[l.a],A[l.b]); const dep=l.a===X;
            vf.push({pr,k:l.k,rec:{visit:q.H.c,homeRi:ri,dir:dep?'out':'ret',leg:l.k,ac:r.ac,seats:ac.seats,no:l.no,from:l.a,to:l.b,via:null,
              hubTime:mod(dep?l.dep+tz:l.arr+tz),spokeTime:mod(dep?l.arr+tzD(l.b,q.H):l.dep+tzD(l.a,q.H)),delay:Math.round(del)}});}});});});
    pre[h].visitOut=vo; pre[h].visitIn=vi; pre[h].visitFlights=vf; pre[h].visitSeatMi=vs;});
}
