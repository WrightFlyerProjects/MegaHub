/* MegaHub · js/ui/coach.js — onboarding coach steps */
/* ---------------- onboarding ---------------- */
function coachStep(){
  if(!owned.length||gatesOwned<1)return 1;
  if(!rots.length)return 2;
  if(!launched)return 3;
  return 0;
}
const COACH={
  1:['Start here.','Buy at least one aircraft and lease a gate on the <b>Fleet</b> tab. You have points to spend.'],
  2:['Now build a schedule.','On the <b>Schedule</b> tab, use <b>Add a rotation</b>: pick an aircraft, a city, and a departure time. Aircraft fly out and back.'],
  3:['Ready when you are.','Your score is hidden until you <b>launch</b> — and launching locks the year in and advances the calendar. Build the whole schedule before you commit.']
};
function renderCoach(){
  const s=coachOff?0:coachStep();
  ['pFleet','pRot'].forEach(id=>{const el=$(id);if(el){el.className='panel step';}});
  $('launchBadge').className='step-badge';
  $('launchBadge').style.display='none';
  $('launch').style.boxShadow='';
  if(!s){$('coach').style.display='none';return;}
  if(s===1){$('pFleet').className='panel step on';$('pRot').className='panel step off';}
  if(s===2){$('pRot').className='panel step on';}
  if(s===3){$('launchBadge').style.display='grid';$('launchBadge').className='step-badge on';
    $('launch').style.boxShadow='0 0 0 3px rgba(42,108,153,.35)';}
  $('coach').style.display='flex';
  $('coach').innerHTML=`<div><b>${COACH[s][0]}</b> ${COACH[s][1]}</div><span class="x" id="coachX">✕</span>`;
  const x=$('coachX'); if(x)x.onclick=()=>{coachOff=true;renderCoach();};
}
