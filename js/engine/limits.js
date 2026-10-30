/* MegaHub · js/engine/limits.js — airport limits (v3.17): runway length + elevation, and airport rules
   (perimeters, curfews, the Wright Amendment, Haneda, DCA's widebody ban). Pure: reads A, YEAR, catalog. */

/* ---- runways ----
   Each type carries rwy:[short-hop takeoff, full-range takeoff, landing] in feet at sea level (catalog.js).
   Takeoff need grows with trip length (fuel = weight), steeply only near full range, and with elevation
   (~6% per 1,000 ft); landing need grows ~4% per 1,000 ft. Calibrated so real operations pass:
   757 JAC–DFW, MD-82 / 737 SNA–ORD, 767 LGA–MIA, 747 DEN–NRT; and real impossibilities fail: any 747 or
   777 at LGA, widebodies at SNA/HVN, a 747 MEX–NRT nonstop (JAL had to stop en route). */
const RW_EXP=3, ELEV_TO=0.06, ELEV_LD=0.04;
const toNeed=(ac,a,d)=>{const [S,F]=ac.rwy; return Math.round((S+(F-S)*Math.pow(Math.min(1,d/ac.rng),RW_EXP))*(1+ELEV_TO*A[a].el/1000));};
const ldNeed=(ac,b)=>Math.round(ac.rwy[2]*(1+ELEV_LD*A[b].el/1000));
const ft=n=>n.toLocaleString('en-US')+' ft';
/* every leg in the game is flown both ways (rotations return the way they came), so check both ends both ways */
function runwayErr(ac,a,b){
  if(!ac.rwy||!A[a].rw||!A[b].rw)return null;
  const d=nm(A[a],A[b]), at=c=>`${c}'s longest runway is ${ft(A[c].rw)}${A[c].el>=3000?` at ${ft(A[c].el)} elevation`:''}`;
  for(const [x,y] of [[a,b],[b,a]]){
    const t=toNeed(ac,x,d); if(t>A[x].rw)return `${at(x)} — a ${ac.t} needs about ${ft(t)} to take off for ${y} (${Math.round(d)} nm)`;
    const l=ldNeed(ac,y); if(l>A[y].rw)return `${at(y)} — a ${ac.t} needs about ${ft(l)} to land there`;}
  return null;
}
/* ---- airport rules ----
   kind: perimeter (statute miles, exempt cities, optional later exemptions) · maxSeats · curfew (local
   [from,to) windows for departures and arrivals) · onlyTo (nonstops limited to a list of cities, small
   aircraft exempt) · domesticOnly. from/to are the game years the rule applies. */
const WRIGHT_1979=['ABI','AMA','AUS','BPT','BRO','CLL','CRP','DFW','ELP','GGG','HOU','IAH','LBB','LRD','MAF','MFE','SAT','SJT','TYR','VCT',
  'AEX','BTR','LCH','LFT','MLU','MSY','SHV','FSM','LIT','OKC','TUL','ABQ','FMN','ROW','SAF'];
const WRIGHT_1997=['BHM','DHN','HSV','MGM','MOB','GPT','JAN','ICT'], WRIGHT_2006=['COU','MCI','SGF','STL'];
const AIRPORT_RULES=[
  {c:'LGA',kind:'perimeter',mi:1500,exempt:['DEN'],
    why:"LaGuardia's perimeter rule: no nonstops beyond 1,500 statute miles (Denver excepted)"},
  {c:'DCA',kind:'perimeter',mi:1250,later:{from:2000,perHub:1},
    why:"National's perimeter rule: no nonstops beyond 1,250 statute miles",
    laterWhy:'from 2000 a few beyond-perimeter exemptions exist — one daily round trip per hub'},
  {c:'DCA',kind:'maxSeats',max:HEAVY_SEATS-1,why:'National takes no widebodies'},
  {c:'DCA',kind:'curfew',dep:[1320,420],arr:[0,420],why:"National's nighttime noise rule: no departures 10pm–7am, no arrivals midnight–7am"},
  {c:'SNA',kind:'curfew',dep:[1320,420],arr:[1380,420],why:"John Wayne's curfew: no departures 10pm–7am, no arrivals 11pm–7am"},
  {c:'NRT',kind:'curfew',dep:[1380,360],arr:[1380,360],why:"Narita's curfew: no flights 11pm–6am"},
  {c:'SYD',kind:'curfew',dep:[1380,360],arr:[1380,360],why:"Sydney's curfew: no flights 11pm–6am"},
  {c:'DAL',kind:'onlyTo',to:2014,smallSeats:56,
    list:y=>WRIGHT_1979.concat(y>=1997?WRIGHT_1997:[],y>=2006?WRIGHT_2006:[]),
    why:y=>`the Wright Amendment: Love Field nonstops only to Texas and neighbouring states${y>=1997?' (plus AL, MS, KS from 1997'+(y>=2006?', MO from 2006':'')+')':''}, unless the aircraft has 56 seats or fewer`},
  {c:'HND',kind:'domesticOnly',to:2010,ok:['KIX','NGO','NRT'],
    why:"Haneda is Tokyo's domestic airport — international flights only return in October 2010"}
];
const MI=nmv=>nmv/0.868976;
const inWin=(t,[s,e])=>{t=mod(t); return s<e?(t>=s&&t<e):(t>=s||t<e);};
const ruleOn=r=>(!r.from||YEAR>=r.from)&&(!r.to||YEAR<=r.to);
const beyondDCA=(a,b)=>(a==='DCA'||b==='DCA')&&MI(nm(A[a],A[b]))>1250;

/* rules that depend only on aircraft + endpoints (used by pickers as well as validation) */
function staticRuleErr(ac,a,b){
  for(const r of AIRPORT_RULES){ if(!ruleOn(r)||(a!==r.c&&b!==r.c))continue;
    const x=a===r.c?b:a, mi=Math.round(MI(nm(A[a],A[b])));
    if(r.kind==='perimeter'&&mi>r.mi&&!(r.exempt||[]).includes(x)&&!(r.later&&YEAR>=r.later.from))
      return `${r.why} — ${a}–${b} is ${mi.toLocaleString('en-US')} miles`;
    if(r.kind==='maxSeats'&&ac.seats>r.max)return `${r.why} — a ${ac.t} is too big`;
    if(r.kind==='onlyTo'&&ac.seats>r.smallSeats&&!r.list(YEAR).includes(x))return `${a}–${b} breaks ${r.why(YEAR)}`;
    if(r.kind==='domesticOnly'&&!r.ok.includes(x))return `${r.why} — no ${a}–${b} yet`;
  }
  return null;
}
/* can this aircraft ever fly a–b this year? (range/ETOPS are checked elsewhere) */
const legBlocked=(ac,a,b)=>runwayErr(ac,a,b)||staticRuleErr(ac,a,b);

/* every limit on one rotation's legs: runways, static rules, curfews (local clock). The DCA
   allowance depends on the rest of the schedule, so it's checked separately (dcaOverflow). */
function limitErr(r,ac,H){
  const legs=legPlan(r,ac,H);
  for(const l of legs){
    const e=legBlocked(ac,l.a,l.b); if(e)return e;
    const depL=l.dep+tzD(l.a,H), arrL=l.arr+tzD(l.b,H);
    for(const q of AIRPORT_RULES){ if(q.kind!=='curfew'||!ruleOn(q))continue;
      if(l.a===q.c&&inWin(depL,q.dep))return `${q.why} — ${l.a}–${l.b} departs ${fmt(depL)}`;
      if(l.b===q.c&&inWin(arrL,q.arr))return `${q.why} — ${l.a}–${l.b} arrives ${fmt(arrL)}`;}
  }
  return null;
}
/* DCA's post-2000 allowance: one beyond-perimeter rotation per hub. Indexes of the ones past it. */
const DCA_RULE=AIRPORT_RULES.find(q=>q.c==='DCA'&&q.kind==='perimeter');
const dcaBeyond=(r,ac,H)=>DCA_RULE.later&&YEAR>=DCA_RULE.later.from&&legPlan(r,ac,H).some(l=>beyondDCA(l.a,l.b));
function dcaOverflow(rots,fleet,H){
  const hit=[]; rots.forEach((r,i)=>{const ac=fleet.find(a=>a.id===r.ac); if(ac&&dcaBeyond(r,ac,H))hit.push(i);});
  return hit.slice(DCA_RULE.later.perHub);
}
const dcaAllowanceMsg=()=>`${DCA_RULE.why}; ${DCA_RULE.laterWhy}`;
