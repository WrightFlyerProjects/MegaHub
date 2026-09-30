/* MegaHub · js/engine/world.js — geography (A, nm, dPair, spillBase), makeHub (hub context), era state (setYear, era), tzD, hubOD, spill, mctFor, flightNo */
const A={}; AIRPORTS.forEach(a=>A[a.c]=a);
const rad=x=>x*Math.PI/180;
function nm(a,b){const dl=rad(b.lat-a.lat),dn=rad(b.lon-a.lon);
  const x=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;
  return 3440.065*2*Math.asin(Math.sqrt(x));}
/* pair distances are hub-independent */
const dPair={};
AIRPORTS.forEach(a=>AIRPORTS.forEach(b=>{if(a.c!==b.c)dPair[a.c+b.c]=nm(a,b);}));
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%1000)/1000;}
/* base spill is also hub-independent: it's the market's own demand vs its own nonstops */
const spillBase={};
AIRPORTS.forEach(a=>AIRPORTS.forEach(b=>{
  if(a.c===b.c)return;
  const k=a.c+b.c,d=dPair[k];
  if(d<MIN_STAGE){spillBase[k]=0;return;}          // people drive it
  const dem=Math.round(30*a.w*b.w/Math.pow(d,0.35));
  const key=[a.c,b.c].sort().join(''),lo=Math.min(a.w,b.w),hi=Math.max(a.w,b.w);
  let ns=0;
  if(lo>=5.2&&d>180) ns=Math.round(26*(lo+hi)*(0.6+0.8*hash(key)));
  else if(lo>=3.2&&d>180) ns=Math.round(9*(lo+hi)*hash(key+'x'));
  spillBase[k]=Math.max(0,Math.round(dem-ns*LF));
}));

/* ---- hub context ----
   The engine never assumes a single hub: every hub-dependent function takes a hub context
   H = {c, ap, spokes, dHub} built here. (The UI keeps its own "current hub" for display.) */
function makeHub(code,band){
  const ap=A[code], spokes=AIRPORTS.filter(s=>s.c!==code&&nm(ap,s)>=MIN_STAGE);   // co-terminals aren't spokes
  const dHub={}; spokes.forEach(s=>dHub[s.c]=nm(ap,s));
  return {c:code,ap,spokes,dHub,band:band||0};   // band: this hub's flight-number range (0 → 100–999, 1 → 1100–1999…)
}
/* ---- mutable world state: era (airline-wide) ---- */
let growth=1, YEAR=YEAR_MIN;
function setYear(y){YEAR=Math.max(YEAR_MIN,Math.min(YEAR_MAX,y));growth=anchorFor(YEAR).g;}
const year=()=>YEAR;
const isLeap=y=>ANCHORS.some(a=>a.y===y);
let startYear=YEAR_MIN;
const setStartYear=y=>{startYear=Math.max(YEAR_MIN,Math.min(DATA_MAX,y));};
const era=()=>({year:YEAR,round:YEAR-startYear+1,rounds:YEAR_MAX-startYear+1,
  data:anchorFor(YEAR).name,dataYear:anchorFor(YEAR).y,growth,leap:isLeap(YEAR),
  frozen:YEAR>DATA_MAX,start:startYear});
const availTypes=()=>{const y=Math.min(YEAR,DATA_MAX);return CATALOG.filter(c=>y>=c.from&&(!c.to||y<=c.to));};
setYear(YEAR_MIN);

const tzD=(c,H)=>A[c].utc-H.ap.utc;               // local time at c minus local time at hub H
const hubOD=c=>Math.round(52*A[c].w*growth);      // per direction
const spill=(i,j)=>Math.round(spillBase[i+j]*growth);

/* A bigger terminal is a slower terminal: longer walks, more remote stands.
   1-5 gates: 30m · 6-10: 35m · 11-15: 40m, and it stays there: capped at 40m (16+ gates). */
const mctFor=g=>Math.max(MCT_BASE,Math.min(40,MCT_BASE+5*Math.floor((Math.max(1,g)-1)/5)));
const mod=t=>((t%DAY)+DAY)%DAY;
/* Deterministic flight number for a rotation. Same carrier, same O&D pair and rough
   time-of-day always yields the same number, so the schedule reads stably.
   Outbound gets an odd number, the return the next even one (industry convention). */
/* Discrete flight numbers per LEG. A rotation's outbound leg gets an odd number;
   its return gets the next even number (the real-world parent/return convention).
   dir 'out' -> odd, dir 'ret' -> odd+1. The hub argument is per-leg, so this stays
   correct once aircraft fly between multiple hubs. */
function flightNo(hubC,dst,dep,via,dir,band){
  let h=7;
  const key=hubC+'>'+(via?via+'>':'')+dst;
  for(let i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))>>>0;
  h+=Math.floor(mod(dep)/30);                 // half-hour slot nudges the number
  const base=100+(h%899);                     // 100..998
  let odd=base%2?base:base+1;                 // outbound odd
  if(odd>998)odd-=2;
  return (dir==='ret' ? odd+1 : odd)+1000*(band||0);   // return = next even number; each extra hub gets its own thousand
}
const gauss=(t,mu,sd)=>Math.exp(-((t-mu)**2)/(2*sd*sd));
