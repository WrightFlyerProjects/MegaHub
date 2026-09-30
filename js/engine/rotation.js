/* MegaHub · js/engine/rotation.js — one-stop circuity tax, rotation geometry (shape) */
/* one-stop tax: circuity of hub->via->dst against the nonstop */
function thruMult(via,dst,H){
  const direct=H.dHub[dst], circ=(H.dHub[via]+dPair[via+dst])/direct;
  const tol=0.18+0.00022*direct;
  return THRU_TAX/(1+Math.pow(Math.max(0,circ-1)/tol,2));
}

/* geometry of a rotation, with or without a via stop */
function shape(r,ac,H){
  const pad=r.pad||0;                          // schedule padding on each hub leg (minutes)
  if(!r.via){
    const bo=legBlock(H.c,r.dst,ac)+pad, bi=legBlock(r.dst,H.c,ac)+pad;
    const arrDst=r.dep+bo, depDst=arrDst+r.turn, arrHub=depDst+bi;
    return {legs:[{a:H.c,b:r.dst,t:bo},{a:r.dst,b:H.c,t:bi}],dur:bo+bi+r.turn,
      marks:{depHub:r.dep,arrDst,depDst,arrHub}};}
  const b1=legBlock(H.c,r.via,ac)+pad, b2=legBlock(r.via,r.dst,ac),
        b3=legBlock(r.dst,r.via,ac), b4=legBlock(r.via,H.c,ac)+pad,
        tv=Math.max(VIA_TURN,turnAt(r.via,ac,H));        // a stop at another of your hubs takes that hub's turn
  const arrVia=r.dep+b1, depVia=arrVia+tv, arrDst=depVia+b2,
        depDst=arrDst+r.turn, arrVia2=depDst+b3, depVia2=arrVia2+tv, arrHub=depVia2+b4;
  return {legs:[{a:H.c,b:r.via,t:b1},{a:r.via,b:r.dst,t:b2},{a:r.dst,b:r.via,t:b3},{a:r.via,b:H.c,t:b4}],
    dur:arrHub-r.dep,
    marks:{depHub:r.dep,arrVia,depVia,arrDst,depDst,arrVia2,depVia2,arrHub}};
}
const rotDur=(r,ac,H)=>shape(r,ac,H).dur;
