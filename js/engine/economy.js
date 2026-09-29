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
const minTurnHub=f=>{const n=typeCount(f);return n<=1?25:n===2?32:40;};
/* points economy. Gross rewards traffic; upkeep is the counterweight that keeps
   the fleet from growing without limit. This is operating cost in points, not dollars. */
const grossPts=pm=>Math.max(0,Math.min(200,Math.round(pm/60000)));  // takes netPm now
const upkeepPts=(fleet,gates)=>Math.round(0.12*fleetCost(fleet))+gates;
const netPts=(pm,fleet,gates)=>grossPts(pm)-upkeepPts(fleet,gates);
