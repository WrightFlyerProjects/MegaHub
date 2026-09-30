/* MegaHub · js/engine/timing.js — outstation turn minimums, jet-stream wind, leg block times */
/* minimum ground time at an outstation, for this aircraft */
const turnMin=(code,ac)=>Math.max(A[code].intl?TURN_INTL:STATION_MIN, ac.seats>=200?TURN_WIDE:STATION_MIN);

function windKt(a,b){
  const P=A[a],Q=A[b];
  let dlon=Q.lon-P.lon; if(dlon>180)dlon-=360; if(dlon<-180)dlon+=360;
  const meanLat=(P.lat+Q.lat)/2;
  const latF=Math.max(0,Math.min(1,(Math.abs(meanLat)-15)/35));  // jet stream lives in the mid-latitudes
  const ew=Math.abs(dlon)*Math.cos(rad(meanLat));                // degrees of east-west travel
  const total=nm(P,Q)/60;                                        // degrees of great circle
  const frac=total>0?Math.min(1,ew/total):0;                     // how east-west is this route?
  return JET_KT*latF*frac*Math.sign(dlon);                       // + eastbound tailwind
}
function legBlock(a,b,ac){
  const d=nm(A[a],A[b]);
  const gs=Math.max(0.55*ac.kts, ac.kts+windKt(a,b));
  return d/gs*60 + TAXI + CLIMB;
}
const block=(dst,ac,H)=>legBlock(H.c,dst,ac);
