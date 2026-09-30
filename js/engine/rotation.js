/* MegaHub · js/engine/rotation.js — one-stop circuity tax, rotation geometry (shape) */
/* one-stop tax: circuity of hub->via->dst against the nonstop */
function thruMult(via,dst){
  const direct=dHub[dst], circ=(dHub[via]+dPair[via+dst])/direct;
  const tol=0.18+0.00022*direct;
  return THRU_TAX/(1+Math.pow(Math.max(0,circ-1)/tol,2));
}

/* geometry of a rotation, with or without a via stop */
function shape(r,ac){
  const pad=r.pad||0;                          // schedule padding on each hub leg (minutes)
  if(!r.via){
    const bo=legBlock(HUB.c,r.dst,ac)+pad, bi=legBlock(r.dst,HUB.c,ac)+pad;
    const arrDst=r.dep+bo, depDst=arrDst+r.turn, arrHub=depDst+bi;
    return {legs:[{a:HUB.c,b:r.dst,t:bo},{a:r.dst,b:HUB.c,t:bi}],dur:bo+bi+r.turn,
      marks:{depHub:r.dep,arrDst,depDst,arrHub}};}
  const b1=legBlock(HUB.c,r.via,ac)+pad, b2=legBlock(r.via,r.dst,ac),
        b3=legBlock(r.dst,r.via,ac), b4=legBlock(r.via,HUB.c,ac)+pad,
        tv=Math.max(VIA_TURN,turnMin(r.via,ac));
  const arrVia=r.dep+b1, depVia=arrVia+tv, arrDst=depVia+b2,
        depDst=arrDst+r.turn, arrVia2=depDst+b3, depVia2=arrVia2+tv, arrHub=depVia2+b4;
  return {legs:[{a:HUB.c,b:r.via,t:b1},{a:r.via,b:r.dst,t:b2},{a:r.dst,b:r.via,t:b3},{a:r.via,b:HUB.c,t:b4}],
    dur:arrHub-r.dep,
    marks:{depHub:r.dep,arrVia,depVia,arrDst,depDst,arrVia2,depVia2,arrHub}};
}
const rotDur=(r,ac)=>shape(r,ac).dur;
