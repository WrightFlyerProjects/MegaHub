/* MegaHub · js/engine/evaluate.js — sellable products + evaluate(): local O&D, spoke pairs, hub connections, scoring, per-leg flights */
/* products = sellable itineraries on a rotation, each consuming one or more legs */
function productsOf(rots,fleet,H){
  const out=[],inn=[],pairs=[],rotCaps=[];
  rots.forEach((r,ri)=>{
    const ac=fleet.find(a=>a.id===r.ac);
    const sh=shape(r,ac,H), m=sh.marks;
    const caps=sh.legs.map(L=>({left:ac.seats,seats:ac.seats,a:L.a,b:L.b,t:L.t}));
    rotCaps[ri]=caps;
    const hubTz=tzD(H.c,H);
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

function evaluate(rots,fleet,gates,H){
  const MCT_G=mctFor(gates);
  const D=delayMap(rots,fleet,H);
  const {out,inn,pairs,rotCaps}=productsOf(rots,fleet,H);
  let pm=0,pax=0;
  // per-rotation passenger attribution: local (hub O&D) vs connecting vs spoke-to-spoke
  const perRot=rots.map(()=>({local:0,connect:0,pair:0,pm:0,
    outLocal:0,outConnect:0,outPair:0,   // hub->spoke leg (the flight's listed departure)
    retLocal:0,retConnect:0,retPair:0})); // spoke->hub leg (the return)
  const freq={}; [...out].forEach(p=>freq[p.spoke]=(freq[p.spoke]||0)+1);

  /* hub local O&D, both directions */
  const local=[];
  const spokesServed=[...new Set([...out,...inn].map(p=>p.spoke))];
  spokesServed.forEach(c=>{
    const f=freq[c]||0, half=halfLocal(c,H), cap=capture(f,half);
    const market=2*hubOD(c), pool=hubOD(c)*cap;
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
      ps.forEach((p,i)=>{const take=Math.min(roomOf(p),pool*(wts[i]/tot)*otpOf(D[p.ri]||0));
        if(take<=0)return; takeFrom(p,take); pm+=take*H.dHub[c]; pax+=take; got+=take;
        if(perRot[p.ri]){perRot[p.ri].local+=take; perRot[p.ri].pm+=take*H.dHub[c];
          if(dir==='out')perRot[p.ri].outLocal+=take; else perRot[p.ri].retLocal+=take;}});
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
    if(Ap.ri===Bp.ri||Ap.spoke===Bp.spoke)return;
    const i=Ap.spoke,j=Bp.spoke;
    const need=MCT_G+(customsIn(i)?CUSTOMS:0);
    /* attractiveness is judged against the customs-inclusive minimum for every arrival from abroad,
       so preclearance only ever helps: it makes 40–69m connections possible and adds buffer,
       without making an existing 70m+ connection look slower. (Identical to before elsewhere.) */
    const refMin=MCT_G+(A[i].intl?CUSTOMS:0);        // clearing customs takes time
    const ct=mod(Bp.depHub-Ap.arrHub); if(ct<need||ct>MAXCT)return;
    const d=dPair[i+j];
    const r=(H.dHub[i]+H.dHub[j])/d, tol=0.18+0.00022*d;
    const del=D[Ap.ri]||0;
    const P=pMake(ct-need-del);                    // late inbound eats the buffer
    const timeF=Math.min(1,Math.pow(0.80,(ct-refMin)/60));
    const circF=1/(1+Math.pow(Math.max(0,r-1)/tol,2));
    const v=0.94*timeF*circF*P*pw(Ap.origLocal)*pw(Bp.destLocal)*Ap.mult*Bp.mult;
    if(v<0.02)return;
    cands.push({Ap,Bp,i,j,d,ct,r,v,P,del,need});
  }));
  const nItin={}; cands.forEach(c=>nItin[c.i+c.j]=(nItin[c.i+c.j]||0)+1);
  cands.sort((x,y)=>y.v-x.v);
  const used={},mk={},flows={};
  cands.forEach(c=>{
    const k=c.i+c.j, av=spill(c.i,c.j);
    const capK=av*capture(nItin[k],HALF_CONN), room=capK-(used[k]||0);
    if(room<=0)return;
    const take=Math.min(room,roomOf(c.Ap),roomOf(c.Bp),av*c.v);
    if(take<=0.5)return;
    used[k]=(used[k]||0)+take; takeFrom(c.Ap,take); takeFrom(c.Bp,take);
    pm+=take*c.d; pax+=take;
    const shA=H.dHub[c.i]/(H.dHub[c.i]+H.dHub[c.j]);          // attribution only: score is unchanged
    if(perRot[c.Ap.ri])perRot[c.Ap.ri].pm+=take*c.d*shA;
    if(perRot[c.Bp.ri])perRot[c.Bp.ri].pm+=take*c.d*(1-shA);
    if(perRot[c.Ap.ri]){perRot[c.Ap.ri].connect+=take;
      if(c.Ap.dir==='out')perRot[c.Ap.ri].outConnect+=take; else perRot[c.Ap.ri].retConnect+=take;}
    if(perRot[c.Bp.ri]){perRot[c.Bp.ri].connect+=take;
      if(c.Bp.dir==='out')perRot[c.Bp.ri].outConnect+=take; else perRot[c.Bp.ri].retConnect+=take;}
    if(!mk[k])mk[k]={...c,pax:0,n:nItin[k]};
    mk[k].pax+=take;
    (flows[c.i]=flows[c.i]||{out:0,in:0}).out+=take;
    (flows[c.j]=flows[c.j]||{out:0,in:0}).in+=take;
  });

  const cur=gateCurve(rots,fleet), peak=rots.length?Math.max(...cur):0;
  const seatMi=rots.reduce((a,r)=>{const ac=fleet.find(x=>x.id===r.ac);
    return a+shape(r,ac,H).legs.reduce((s,L)=>s+ac.seats*nm(A[L.a],A[L.b]),0);},0);
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
    const m=shape(r,ac,H).marks, pr=perRot[i]||{};
    const tzd=tzD(r.dst,H), hubC=H.c, seats=ac.seats, del=Math.round(delays[i]||0);
    const outSpoke=r.via||r.dst, retSpoke=r.via||r.dst;
    // outbound: hub -> (via ->) dst
    flights.push({ri:i, dir:'out', ac:r.ac, seats,
      no:flightNo(hubC,r.dst,r.dep,r.via||null,'out'),
      from:hubC, to:r.dst, via:r.via||null,
      depHub:mod(m.depHub), depHubLoc:mod(m.depHub),        // hub local = depHub (hub tz baseline)
      arrSpokeLoc:mod(m.arrDst+tzd),
      hubTime:mod(m.depHub), spokeTime:mod(m.arrDst+tzd),
      local:pr.outLocal||0, connect:pr.outConnect||0, pair:pr.outPair||0, delay:del});
    // return: dst -> (via ->) hub
    flights.push({ri:i, dir:'ret', ac:r.ac, seats,
      no:flightNo(hubC,r.dst,r.dep,r.via||null,'ret'),
      from:r.dst, to:hubC, via:r.via||null,
      depSpokeLoc:mod(m.depDst+tzd), arrHub:mod(m.arrHub),
      hubTime:mod(m.arrHub), spokeTime:mod(m.depDst+tzd),
      local:pr.retLocal||0, connect:pr.retConnect||0, pair:pr.retPair||0, delay:del});
  });
  /* per-LEG loads: seats and passengers on every leg actually flown (read-only view) */
  const legs=[];
  rotCaps.forEach((caps,ri)=>caps.forEach((c,k)=>legs.push({ri,k,a:c.a,b:c.b,t:c.t,seats:c.seats,
    pax:c.seats-c.left,nm:nm(A[c.a],A[c.b])})));
  return {pm,netPm,lf,emptyMi,pax,peak,seatMi,cur,flows,pairRows,perRot,flights,delays,otp,legs,
    rons:rots.filter(r=>r.turn>240).length,
    vias:rots.filter(r=>r.via).length,
    markets:Object.values(mk).sort((a,b)=>b.pax-a.pax),
    local:local.sort((a,b)=>b.pax-a.pax)};
}
