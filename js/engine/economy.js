/* MegaHub · js/engine/economy.js — fleet cost, trade-in value, points economy (gross, upkeep, net), hub turn by fleet mix */
const fleetCost=f=>f.reduce((a,x)=>a+CATALOG.find(c=>c.t===x.t).cost,0);
/* trade-in value: aircraft are sold back at a haircut. Older-generation types that
   have left production (c.to passed) fetch less. */
const TRADEIN=0.6;
const EMPTY_W=0.15;   // empty-seat penalty weight (0.15 = gentle: punishes oversized/bad-hour flying, spares thin-market feed)
function tradeInValue(type){
  const c=CATALOG.find(x=>x.t===type); if(!c)return 0;
  const retired=c.to && YEAR>c.to;
  return Math.max(1, Math.round(c.cost*TRADEIN*(retired?0.6:1)));
}
const totalCost=(f,gates)=>fleetCost(f)+gates*GATE_COST;
const typeCount=f=>new Set(f.map(x=>x.t)).size;
const minTurnHub=f=>{const n=typeCount(f.filter(x=>!x.visit));return n<=1?25:n===2?32:40;};   // visiting aircraft don't count
/* points economy. Gross rewards traffic; upkeep is the counterweight that keeps
   the fleet from growing without limit. This is operating cost in points, not dollars. */
/* traffic points from net pax-miles: 1 per 60,000 up to 12 million (200 pts), then 1 per 120,000 beyond.
   (Until v3.11 earnings stopped dead at 200 — big airlines earned nothing for growing.) */
const PTS_KNEE=12e6;
const grossPts=pm=>{pm=Math.max(0,pm); return Math.round(pm<=PTS_KNEE?pm/60000:200+(pm-PTS_KNEE)/120000);};
const upkeepPts=(fleet,gates,tiers)=>Math.round(0.12*fleetCost(fleet))+gates+(tiers?tiers.H+2*tiers.I:0);   // heavy gate 2/yr, international 3/yr
/* upfit cost from one tier mix to another (upgrades only): every gate that becomes heavy-capable
   pays GATE_UP_H, every gate that becomes international pays GATE_UP_I on top */
const upfitCost=(from,to)=>Math.max(0,(to.H+to.I)-(from.H+from.I))*GATE_UP_H+Math.max(0,to.I-from.I)*GATE_UP_I;
const netPts=(pm,fleet,gates)=>grossPts(pm)-upkeepPts(fleet,gates);
