/* MegaHub · js/ui/history.js — airline history: yearly chart (Network tab), season-by-season table (Airline tab), year-over-year deltas for the stat tiles */

/* the season before `y`, if it was flown */
const prevResult=y=>results.filter(r=>r.y<y).sort((a,b)=>b.y-a.y)[0]||null;
function yoy(now,before,pts){          // pts: show a percentage-point change instead of a percent change
  if(now==null||before==null||(!pts&&!before))return '';
  const d=pts?(now-before)*100:(now-before)/Math.abs(before)*100;
  if(Math.abs(d)<0.05)return `<span style="color:var(--ink3)">flat</span>`;
  return `<span style="color:${d>0?'var(--green)':'var(--red)'}">${d>0?'▲':'▼'} ${Math.abs(d).toFixed(1)}${pts?' pts':'%'}</span>`;
}

function renderHistory(){
  const host=$('histchart'); if(!host)return;
  const rs=results.slice().sort((a,b)=>a.y-b.y);
  if(!rs.length){host.innerHTML='<div class="empty" style="padding:18px 14px">Launch your first year and your airline\'s history starts here.</div>';$('histlab').textContent='';return;}
  const W=760,H=230,PL=62,PR=46,PT=16,PB=26, n=rs.length, bw=Math.min(46,(W-PL-PR)/n);
  const maxPm=Math.max(...rs.map(r=>r.pm),1), x=i=>PL+(W-PL-PR)*(i+0.5)/n;
  const y=v=>PT+(H-PT-PB)*(1-v/maxPm), yp=v=>PT+(H-PT-PB)*(1-v);    // v in 0..1 for % lines
  let g='';
  for(let k=0;k<=4;k++){const v=maxPm*k/4, yy=y(v);
    g+=`<line x1="${PL}" y1="${yy.toFixed(1)}" x2="${W-PR}" y2="${yy.toFixed(1)}" stroke="rgba(22,40,60,.08)"/>
      <text x="${PL-6}" y="${(yy+3).toFixed(1)}" text-anchor="end" font-size="8.5" font-family="IBM Plex Mono,monospace" fill="#7C8A99">${v>=1e6?(v/1e6).toFixed(1)+'M':Math.round(v/1e3)+'k'}</text>
      <text x="${W-PR+6}" y="${(yp(k/4)+3).toFixed(1)}" font-size="8.5" font-family="IBM Plex Mono,monospace" fill="#7C8A99">${k*25}%</text>`;}
  const bars=rs.map((r,i)=>`<rect x="${(x(i)-bw/2+1).toFixed(1)}" y="${y(r.pm).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${(H-PB-y(r.pm)).toFixed(1)}" fill="${airline.c1}" opacity=".8">
      <title>${r.y}: ${Math.round(r.pm).toLocaleString()} net pax-mi${r.lf!=null?` · LF ${Math.round(r.lf*100)}% · on-time ${Math.round(r.otp*100)}%`:''}</title></rect>
    ${n<=16||i%2===0?`<text x="${x(i).toFixed(1)}" y="${H-PB+13}" text-anchor="middle" font-size="8.5" font-family="IBM Plex Mono,monospace" fill="#4A5B6E">${n>12?"'"+String(r.y).slice(2):r.y}</text>`:''}`).join('');
  const lineOf=(key,col,dash)=>{const pts=rs.map((r,i)=>r[key]!=null?[x(i),yp(r[key])]:null);
    let d='',on=false; pts.forEach(p=>{if(!p){on=false;return;} d+=(on?' L':' M')+p[0].toFixed(1)+' '+p[1].toFixed(1); on=true;});
    return d?`<path d="${d}" fill="none" stroke="${col}" stroke-width="1.8"${dash?' stroke-dasharray="4 3"':''}/>`
      +pts.map(p=>p?`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" fill="${col}"/>`:'').join(''):'';};
  const has=rs.some(r=>r.lf!=null), firstNew=rs.find(r=>r.dm>=2);
  const dmNote=firstNew&&rs.some(r=>!r.dm)?` · seasons before ${firstNew.y} were scored under the harsher pre-v3.5 delay model (about 2% lower)`:'';
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net pax-miles by year">${g}${bars}${lineOf('lf','#5A7C33')}${lineOf('otp','#B8760F',true)}</svg>
    <div class="maplegend">bars = net pax-miles (left axis)${has?' · green = load factor · dashed amber = on-time (right axis)':' · load factor and on-time are recorded from your next launch onward'}${dmNote}</div>`;
  const best=rs.reduce((a,r)=>r.pm>a.pm?r:a,rs[0]);
  $('histlab').textContent=`${n} season${n>1?'s':''} · best ${best.y}: ${Math.round(best.pm).toLocaleString()}`;
}

function renderSeasons(){
  const host=$('seasons'); if(!host)return;
  const rs=results.slice().sort((a,b)=>b.y-a.y);
  $('seasonlab').textContent=rs.length?`${rs.length} flown`:'';
  if(!rs.length){host.innerHTML='<div class="empty">No seasons flown yet.</div>';return;}
  const v=(x,f)=>x==null?'<span style="color:var(--ink3)">—</span>':f(x);
  host.innerHTML=`<div class="tscroll"><table class="fptab"><tr><th>Year</th><th>Net pax-mi</th><th>vs prior</th><th>Pax/day</th><th>LF</th><th>On-time</th><th>Aircraft</th><th>Gates</th><th>Rotations</th></tr>`
    +rs.map(r=>{const p=prevResult(r.y);
      return `<tr><td><b>${r.y}</b></td><td>${Math.round(r.pm).toLocaleString()}</td><td>${p?yoy(r.pm,p.pm):''}</td>
        <td>${v(r.pax,x=>Math.round(x).toLocaleString())}${r.hubs?`<div style="color:var(--ink3);font-size:10px">${r.hubs.map(h=>h.c+' '+(h.pm/1e6).toFixed(1)+'M').join(' · ')}</div>`:''}</td><td>${v(r.lf,x=>Math.round(x*100)+'%')}</td><td>${v(r.otp,x=>Math.round(x*100)+'%')}</td>
        <td>${v(r.fleet,x=>x)}</td><td>${v(r.gates,x=>x)}</td><td>${v(r.rots,x=>x)}</td></tr>`;}).join('')
    +`</table></div><div class="note">Seasons flown before this update recorded only net pax-miles; the other columns fill in from your next launch.</div>`;
}
