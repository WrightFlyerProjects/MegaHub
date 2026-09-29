/* MegaHub · js/ui/flightcard.js — flight preview card in the rotation editor */
/* ---------------- flight card ---------------- */
const dcls=v=>v>=.72?'d-hi':v>=.45?'d-md':'d-lo';
function renderFCard(ac,dst,via,dep,turn,sh,al,dl,arr){
  const rows=[], chips=[];
  const pa=pref(al), pd=pref(dl);
  const nextDay=dep+sh.dur>=DAY;

  if(via){
    rows.push(['Routing',`${HUB.c} – ${via} – ${dst}`]);
    rows.push(['O&amp;D distance',`${Math.round(dHub[dst]).toLocaleString()} nm`]);
    rows.push(['Rotation',hm(sh.dur)]);
    chips.push(['chip',`one-stop keeps ${Math.round(thruMult(via,dst)*100)}%`]);
  }else{
    rows.push(['Distance',`${Math.round(dHub[dst]).toLocaleString()} nm`]);
    rows.push(['Block out',hm(sh.legs[0].t)]);
    rows.push(['Block back',hm(sh.legs[1].t)]);
  }
  rows.push(['sep']);
  const dot=(p)=>`<i class="dot ${dcls(p)}" title="demand at this hour of the local day"></i><em>${Math.round(p*100)}%</em>`;
  rows.push([`Arrives ${dst} <em style="color:var(--ink3)">local</em>`,`${fmt(al)}${dot(pa)}`]);
  rows.push([`Departs ${dst} <em style="color:var(--ink3)">local</em>`,`${fmt(dl)}${dot(pd)}`]);
  rows.push([`Back at ${HUB.c}`,`${fmt(arr)}${nextDay?'<em>next day</em>':''}`]);

  const need=turnMin(dst,ac);
  if(need>25)chips.push(['chip',`${need}m ground · ${A[dst].intl?'foreign station':'widebody'}`]);
  if(A[dst].intl)chips.push(['chip warn',`customs +${CUSTOMS}m inbound`]);
  if(turn>240)chips.push(['chip ron','overnights away · frees a gate']);
  if(A[dst].ocean)chips.push(['chip','extended overwater']);

  $('fcard').innerHTML=rows.map(r=>r[0]==='sep'?'<div class="frow sep"></div>'
    :`<div class="frow"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')
    +(chips.length?`<div class="chips">${chips.map(c=>`<span class="${c[0]}">${c[1]}</span>`).join('')}</div>`:'');
}
