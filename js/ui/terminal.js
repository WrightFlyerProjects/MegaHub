/* MegaHub · js/ui/terminal.js — terminal diagram + gate Gantt */
/* ---------------- terminal ---------------- */
function renderTerminal(E){
  E=E||evalView();
  const G=gatesOwned;
  if(!G){$('term').innerHTML='<div class="empty" style="padding:24px 14px">Lease a gate to see your terminal.</div>';$('gantt').innerHTML='';$('termlab').textContent='—';return;}
  const all=gateAssign(rots,vFleet(),G,gateTiers), asg=all.filter(s=>s.gate>=0), homeless=new Set(all.filter(s=>s.gate<0).map(s=>s.ac)).size;
  const TI=Math.min(G,gateTiers.I), TH=Math.min(G-TI,gateTiers.H), gtr=g=>g<TI?2:g<TI+TH?1:0;
  const TCOL=['rgba(22,40,60,.28)','#B8760F','#5B4B8A'], TLAB=['','HVY','INTL'];
  const t=+$('tclock').value;
  const inAt=(s,t)=>{const d=mod(t-s.start);return d<s.len;};
  const occ={}; asg.forEach(s=>{if(inAt(s,t))occ[s.gate]=s;});
  const half=Math.ceil(G/2), CW=760, gw=Math.min(100,(CW-96)/Math.max(1,half)), gh=54;
  const CY=110, CH=32;                       // concourse band
  const TOPY=CY-14-gh, BOTY=CY+CH+14;       // stand rows, bridges face the concourse
  const fit=(txt,base,bold)=>Math.min(base,(gw-14)/(Math.max(1,String(txt).length)*(bold?0.64:0.6))).toFixed(2);
  const stand=(g,i,y,isTop)=>{
    const x=48+i*gw, s=occ[g], mid=x+gw/2;
    const bx1=isTop?y+gh:CY+CH, bx2=isTop?CY:y;
    // next departure from this stand: aircraft pushes back at start+len, heading to s.to
    const depT=s?mod(s.start+s.len):0, dstXt=s?`${s.to} ${fmt(depT)}`:'';
    return `<g><line x1="${mid}" y1="${bx1}" x2="${mid}" y2="${bx2}" stroke="rgba(22,40,60,.28)" stroke-width="2"/>
      <rect x="${x+3}" y="${y}" width="${gw-8}" height="${gh}" rx="3" fill="${s?typeColor(s.type):'none'}"
        stroke="${s?(s.borrowed?'#B8760F':'none'):TCOL[gtr(g)]}" stroke-width="${s&&s.borrowed?2:gtr(g)?1.5:1}" ${s&&!s.borrowed?'':'stroke-dasharray="3 3"'}>
        <title>G${g+1} · ${tierName[gtr(g)]} gate${s?` · ${s.ac} ${s.type}${s.visit?' · visiting from '+s.visit:''}${s.customs?' · arrived from abroad':''}${s.borrowed?' · borrowing a bigger gate':''}${s.tow?' · towed in':''}`:''}</title></rect>
      <text x="${mid}" y="${y+15}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="${fit(s?s.ac:'—',10,1)}" font-weight="600" fill="${s?'#fff':'#7C8A99'}">${s?s.ac:'—'}</text>
      <text x="${mid}" y="${y+27}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="${fit(s?(s.visit?s.visit+' '+s.type:s.type):(gtr(g)?tierName[gtr(g)]:'open'),8)}" fill="${s?'rgba(255,255,255,.78)':'#B0B7BE'}">${s?(s.visit?s.visit+' '+s.type:s.type):(gtr(g)?tierName[gtr(g)]:'open')}</text>
      ${s?`<line x1="${x+7}" y1="${y+33}" x2="${x+gw-9}" y2="${y+33}" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
      <text x="${mid}" y="${y+46}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="${fit('→ '+dstXt,9,1)}" font-weight="600" fill="#fff">→ ${dstXt}</text>`:''}
      <text x="${mid}" y="${isTop?y-6:y+gh+13}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="${Math.min(9,(gw-2)/((`G${g+1}`+(gtr(g)?' '+TLAB[gtr(g)]:'')).length*0.6)).toFixed(2)}" fill="${gtr(g)?TCOL[gtr(g)]:'#7C8A99'}"${gtr(g)?' font-weight="600"':''}>G${g+1}${gtr(g)?' '+TLAB[gtr(g)]:''}</text></g>`;
  };
  const tops=[...Array(G).keys()].slice(0,half), bots=[...Array(G).keys()].slice(half);
  const H=BOTY+gh+24;
  $('term').innerHTML=`<svg viewBox="0 0 ${CW} ${H}" role="img" aria-label="Terminal gate occupancy">
    <rect x="40" y="${CY}" width="${CW-80}" height="${CH}" rx="4" fill="rgba(22,40,60,.07)" stroke="rgba(22,40,60,.18)"/>
    <text x="${CW/2}" y="${CY+21}" text-anchor="middle" font-family="Archivo Narrow,sans-serif" font-size="12" letter-spacing="2" fill="${airline.c1}">${(airline.name||'').toUpperCase()} · ${HUB.c}</text>
    ${tops.map((g,i)=>stand(g,i,TOPY,true)).join('')}
    ${bots.map((g,i)=>stand(g,i,BOTY,false)).join('')}</svg>
    <div class="typelegend">${CATALOG.filter(c=>owned.some(a=>a.t===c.t)).map(c=>`<span><i style="background:${typeColor(c.t)}"></i>${c.t}</span>`).join('')}</div>`;
  $('termlab').innerHTML=`${Object.keys(occ).length} of ${G} stands occupied at ${fmt(t)} · peak ${E.peak}${TI||TH?` · ${TI} intl · ${TH} heavy`:''}`
    +(homeless?` · <span style="color:var(--red)">${homeless} aircraft with no stand</span>`:'');

  const lanes=[...Array(G).keys()].map(g=>{
    const blocks=asg.filter(s=>s.gate===g).map(s=>{
      const wrap=s.start+s.len>DAY;
      const a=`<div class="gblk" style="left:${X_(s.start)}%;width:${X_(Math.min(s.len,DAY-s.start))}%;background:${typeColor(s.type)}" title="${s.ac} ${s.type} · ${fmt(s.start)}–${fmt(s.start+s.len)} · in from ${s.last||s.from}, out to ${s.to}${s.customs?' · customs arrival':''}${s.borrowed?' · borrowing a bigger gate':''}${s.tow?' · towed in':''}"${s.borrowed||s.tow?` data-flag="1"`:''}>${s.ac}</div>`;
      const b=wrap?`<div class="gblk" style="left:0;width:${X_(s.start+s.len-DAY)}%;background:${typeColor(s.type)}" title="${s.ac} (continues)">${s.ac}</div>`:'';
      return a+b;}).join('');
    return `<div class="glane"><div class="gt"${gtr(g)?` style="color:${TCOL[gtr(g)]};font-weight:600"`:''}>G${g+1}${gtr(g)?' '+'·HI'[gtr(g)]:''}</div><div class="gtrack">${blocks}</div></div>`;}).join('');
  $('gantt').innerHTML=`<div style="position:relative">${lanes}
    <div class="tcur" style="left:calc(44px + (100% - 44px) * ${(t/DAY).toFixed(4)})"></div></div>`;
}
const X_=t=>(t/DAY)*100;
