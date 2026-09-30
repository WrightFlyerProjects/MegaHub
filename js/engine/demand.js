/* MegaHub · js/engine/demand.js — time-of-day desirability, red-eye forgiveness, frequency capture, time formatting */
/* Demand by local clock time. Two commute peaks (~8am, ~6pm) riding on a daytime
   plateau, with a real red-eye penalty overnight.
   - midday no longer craters: the daytime floor sits ~0.65
   - 1-5am is genuinely undesirable: an explicit night trough pulls it toward ~0.15 */
function prefBase(t){                                              // desirability by clock time, no night penalty
  t=mod(t);
  const peaks=Math.max(gauss(t,480,150), 0.95*gauss(t,1080,170));
  return Math.max(0.12,Math.min(1,0.62+0.36*peaks));               // plateau ~0.62, peaks -> ~0.98
}
function nightHit(t){                                              // 1 at 3am, ~0 by 6am / before 11pm
  t=mod(t);
  const dist=Math.min(Math.abs(t-180),Math.abs(t-180+DAY),Math.abs(t-180-DAY));
  return gauss(dist,0,150);
}
/* Standard demand-by-time: full night penalty. Used for ordinary flights and as the
   default endpoint weight. A 3am departure or arrival is punished hard. */
function pref(t){ return Math.max(0.12, prefBase(t)*(1-0.80*nightHit(t))); }

/* A genuine red-eye: a long flight that pushes back in the evening and lands after dawn,
   carrying the passenger THROUGH the night rather than stranding them in it.
   For these, the overnight penalty at the endpoints is largely forgiven — that late
   departure and early arrival are the whole point, not a demerit. */
function isRedeye(depLocal,arrLocal,blockMin){
  if(blockMin<180) return false;                       // must actually be a long haul (>=3h)
  const dep=mod(depLocal), arr=mod(arrLocal);
  const eveningPush = dep>=1230 || dep<=120;           // boards ~20:30 .. 02:00
  const morningLand = arr>=270 && arr<=720;            // lands ~04:30 .. 12:00
  const overnight   = mod(arr-dep) >= 180;             // crosses a real span
  return eveningPush && morningLand && overnight;
}
/* endpoint weight for a leg, given the OTHER endpoint and the block time so we can tell
   whether this timestamp belongs to a red-eye. */
function endpointW(thisLocal, otherLocal, blockMin, isDeparture){
  const dep = isDeparture ? thisLocal : otherLocal;
  const arr = isDeparture ? otherLocal : thisLocal;
  if(isRedeye(dep,arr,blockMin)){
    // forgive most of the night penalty; a red-eye endpoint is judged mostly on base desirability
    return 0.5+0.5*Math.max(prefBase(thisLocal)*0.92, pref(thisLocal));
  }
  return 0.5+0.5*pref(thisLocal);
}
const pw=t=>0.5+0.5*pref(t);
const capture=(f,half)=>f<=0?0:Math.pow(f,ALPHA)/(Math.pow(f,ALPHA)+Math.pow(half,ALPHA));
const halfLocal=(c,H)=>Math.max(1.0,Math.min(3.0,3.0-H.dHub[c]/1500));
const fmt=m=>{m=mod(Math.round(m));let h=Math.floor(m/60),mn=m%60;const ap=h<12?'a':'p';
  let h12=h%12; if(h12===0)h12=12;
  return h12+':'+String(mn).padStart(2,'0')+ap;};                 // 12-hour, e.g. 7:05a / 11:30p
const fmtHour=h=>{const ap=h<12?'a':'p';let h12=h%12;if(h12===0)h12=12;return h12+ap;};  // compact axis label
