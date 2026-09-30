/* MegaHub · js/ui/map.js — network map render + zoom/pan view */
/* ---------------- network map ---------------- */
/* One colour per aircraft type, in CATALOG order — never shared. Optimised for measured colour
   difference (CIE ΔE; 10+ reads as clearly different): types that can fly in the same years differ
   by ΔE ≥ 26, any two types by ≥ 18. Muted to suit the page, white text at ≥ 4.6:1 contrast. */
const TYPE_COLORS=['#3875B2','#2B3464','#4D38B2','#6D2F22','#2A842A','#346E79','#392A84','#2A8466','#743D8F','#642B51','#B238B2','#9B6631','#51642B','#A44656'];
let mapMode='freq';                 // 'freq' | 'lf' (load factor, after launch)
const lfColor=v=>v>=0.9?'#5A7C33':v>=0.75?'#B8760F':'#B23A3A';
const typeColor=t=>{const i=CATALOG.findIndex(c=>c.t===t);return i<0?'#4A5B6E':TYPE_COLORS[i%TYPE_COLORS.length];};

/* Map zoom/pan: the SVG's natural coordinate space is 0..W, 0..H. We show a
   sub-rectangle of it — smaller rectangle = more zoom. Pan shifts that rectangle,
   clamped so you can't scroll the network entirely out of view. */
function mapViewBox(W,H){
  const z=Math.max(1,mapZoom);
  const vw=W/z, vh=H/z;
  const maxX=W-vw, maxY=H-vh;
  mapPanX=Math.min(maxX,Math.max(0,mapPanX));
  mapPanY=Math.min(maxY,Math.max(0,mapPanY));
  return `${mapPanX.toFixed(1)} ${mapPanY.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
}
function applyMapView(){
  if(!mapView)return;
  const svg=$('mapsvg'); if(!svg)return;
  svg.setAttribute('viewBox',mapViewBox(mapView.W,mapView.H));
  const rb=$('mapreset'); if(rb)rb.disabled=(mapZoom===1&&!mapPanX&&!mapPanY);
  scheduleMapLayer();
}
let mapLayerRaf=0;
function scheduleMapLayer(){
  if(mapLayerRaf)return;
  const run=()=>{mapLayerRaf=0;drawMapLayer();};
  mapLayerRaf=(typeof requestAnimationFrame==='function')?requestAnimationFrame(run):(run(),0);
}
/* zoom toward a focal point (fx,fy) given in natural viewBox units, keeping that
   point fixed on screen. Called from buttons (centre) and wheel (cursor). */
function mapZoomBy(factor,fx,fy){
  if(!mapView)return;
  const {W,H}=mapView;
  const z0=Math.max(1,mapZoom), z1=Math.min(8,Math.max(1,z0*factor));
  if(z1===z0)return;
  if(fx==null){fx=mapPanX+W/z0/2; fy=mapPanY+H/z0/2;}
  // keep focal point stationary: new pan so that (fx,fy) sits at same fractional spot
  const relX=(fx-mapPanX)/(W/z0), relY=(fy-mapPanY)/(H/z0);
  mapZoom=z1;
  mapPanX=fx-relX*(W/z1);
  mapPanY=fy-relY*(H/z1);
  applyMapView();
}
function mapReset(){ mapZoom=1; mapPanX=0; mapPanY=0; applyMapView(); }

function renderMap(E){
  if(!rots.length){$('map').innerHTML='<div class="empty" style="padding:24px 14px">Schedule a rotation and your route map appears here.</div>';
    $('netlab').textContent='—';return;}
  const codes=new Set([HUB.c]); rots.forEach(r=>{codes.add(r.dst); if(r.via)codes.add(r.via);});
  /* other hubs' networks, drawn underneath (multi-hub only) */
  const others=hubOrder.filter(c=>c!==HC.c&&hubStore[c]).map(c=>({c,rots:hubStore[c].rots,fleet:hubStore[c].fleet}));
  const extra=new Set(); others.forEach(o=>{extra.add(o.c); o.rots.forEach(r=>{extra.add(r.dst); if(r.via)extra.add(r.via);});});
  const pts=[...codes,...[...extra].filter(c=>!codes.has(c))].map(c=>A[c]);
  const lat0=pts.reduce((a,p)=>a+p.lat,0)/pts.length;
  const k=Math.cos(lat0*Math.PI/180);
  const px=p=>p.lon*k, py=p=>-p.lat;
  const xs=pts.map(px), ys=pts.map(py);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const W=760,H=Math.max(300,Math.min(520,W*((y1-y0)||1)/((x1-x0)||1)+70)),P=42;
  const sx=v=>P+((v-x0)/((x1-x0)||1))*(W-2*P), sy=v=>P+((v-y0)/((y1-y0)||1))*(H-2*P);
  const X=c=>sx(px(A[c])), Y=c=>sy(py(A[c]));

  // aggregate segments
  const seg={}; const spokePax={};
  E.local.forEach(l=>spokePax[l.c]=l.pax);
  rots.forEach(r=>{
    const ac=owned.find(a=>a.id===r.ac);
    const legs=r.via?[[HUB.c,r.via],[r.via,r.dst]]:[[HUB.c,r.dst]];
    legs.forEach(([a,b])=>{const key=[a,b].sort().join('-');
      seg[key]=seg[key]||{a,b,f:0,seats:0};seg[key].f++;seg[key].seats+=ac.seats*2;});
  });
  // geometry only; symbols are drawn by drawMapLayer() at the current zoom
  const freq={}; rots.forEach(r=>{freq[r.dst]=(freq[r.dst]||0)+1; if(r.via)freq[r.via]=(freq[r.via]||0)+1;});
  const segLF={}; if(launched)(E.legs||[]).forEach(l=>{const k=[l.a,l.b].sort().join('-');(segLF[k]=segLF[k]||{p:0,s:0});segLF[k].p+=l.pax;segLF[k].s+=l.seats;});
  const segs=Object.values(seg).map(s=>{
    const x1v=X(s.a),y1v=Y(s.a),x2=X(s.b),y2=Y(s.b);
    const mx=(x1v+x2)/2,my=(y1v+y2)/2, dx=x2-x1v,dy=y2-y1v, L=Math.hypot(dx,dy)||1;
    const kk=[s.a,s.b].sort().join('-'), lf=segLF[kk]&&segLF[kk].s?segLF[kk].p/segLF[kk].s:null;
    return {...s,lf,x1:x1v,y1:y1v,x2,y2,cx:mx-dy/L*L*0.10,cy:my+dx/L*L*0.10,
      col:s.f>=4?airline.c1:s.f>=2?airline.c2:'#7C8A99', w:Math.max(1,Math.min(6,0.7+s.seats/260))};
  });
  const nodes=[...codes].filter(c=>c!==HUB.c).map(c=>{const p=spokePax[c]||0;
    return {c,x:X(c),y:Y(c),pax:p,f:freq[c]||0,r:Math.max(5,2.4+Math.min(7,Math.sqrt(p)/3.2))};})
    .sort((a,b)=>b.pax-a.pax);
  const grat=[];
  for(let lon=-180;lon<=-50;lon+=10){const x=sx(lon*k);if(x>P-20&&x<W-P+20)grat.push([x,P-14,x,H-P+14]);}
  for(let lat=10;lat<=70;lat+=5){const y=sy(-lat);if(y>P-20&&y<H-P+20)grat.push([P-14,y,W-P+14,y]);}

  const oseg={}; others.forEach(o=>o.rots.forEach(r=>{const ac=o.fleet.find(a=>a.id===r.ac); if(!ac)return;
    (r.via?[[o.c,r.via],[r.via,r.dst]]:[[o.c,r.dst]]).forEach(([a,b])=>{const key=[a,b].sort().join('-');
      oseg[key]=oseg[key]||{a,b,seats:0,f:0,hub:o.c}; oseg[key].f++; oseg[key].seats+=ac.seats*2;});}));
  const otherSegs=Object.values(oseg).map(s=>{const x1=X(s.a),y1=Y(s.a),x2=X(s.b),y2=Y(s.b), mx=(x1+x2)/2,my=(y1+y2)/2, dx=x2-x1,dy=y2-y1, L=Math.hypot(dx,dy)||1;
    return {...s,x1,y1,x2,y2,cx:mx-dy/L*L*0.10,cy:my+dx/L*L*0.10,w:Math.max(1,Math.min(6,0.7+s.seats/260))};});
  const otherHubs=others.map(o=>({c:o.c,x:X(o.c),y:Y(o.c)}));
  mapView={W,H,segs,nodes,grat,hub:{c:HUB.c,x:X(HUB.c),y:Y(HUB.c)},otherSegs,otherHubs};
  const vb=mapViewBox(W,H);
  $('map').innerHTML=`<div class="mapwrap">
    <svg id="mapsvg" viewBox="${vb}" role="img" aria-label="Route network map" style="touch-action:none"><g id="maplayer"></g></svg>
    <div class="mapzoom">
      <button id="mapin" title="Zoom in">+</button>
      <button id="mapout" title="Zoom out">−</button>
      <button id="mapreset" title="Fit whole network" ${mapZoom===1&&!mapPanX&&!mapPanY?'disabled':''}>⤢</button>
    </div></div>
    <div class="maplegend"><span class="mapmode">colour by <span class="x${mapMode==='freq'?' on':''}" data-mapmode="freq">frequency</span> · <span class="x${mapMode==='lf'?' on':''}" data-mapmode="lf">load factor</span></span>
      line weight = seats/day · ${mapMode==='lf'?(launched?'colour = seats filled (green 90%+ · amber 75–90% · red under 75%)':'load factors appear after you launch — showing frequency'):'colour = daily frequency (grey 1× · blue 2–3× · magenta 4×+)'} · zoom in to separate clusters and label more cities</div>`;
  drawMapLayer();
  const cities=codes.size-1, dailySeats=segs.reduce((a,s)=>a+s.seats,0);
  $('netlab').textContent=`${cities} cities · ${Object.keys(seg).length} segments · ${dailySeats.toLocaleString()} seats/day`;
}

/* Semantic zoom. Geography scales with the zoom; symbols don't. Every size below is a
   screen size at 1×, multiplied by s=1/zoom, so dots, lines and text stay the same size
   on screen while the map spreads apart underneath them. Labels are placed greedily
   (busiest city first) wherever they fit without overlapping another label or a dot,
   so zooming into a cluster labels more of it. */
function drawMapLayer(){
  const g=$('maplayer'); if(!g||!mapView||!mapView.nodes)return;
  const {W,H,segs,nodes,grat,hub}=mapView, oS=mapView.otherSegs||[], oH=mapView.otherHubs||[];
  const z=Math.max(1,mapZoom), s=1/z, f1=v=>v.toFixed(1), f2=v=>v.toFixed(2);
  const vx0=mapPanX, vy0=mapPanY, vx1=vx0+W/z, vy1=vy0+H/z;
  const inView=(x,y,m)=>x>vx0-m&&x<vx1+m&&y>vy0-m&&y<vy1+m;

  const gr=grat.map(([x1,y1,x2,y2])=>`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="rgba(22,40,60,.07)" stroke-width="${f2(s)}"/>`).join('');
  const arcs=segs.map(q=>`<path d="M${f1(q.x1)} ${f1(q.y1)} Q${f1(q.cx)} ${f1(q.cy)} ${f1(q.x2)} ${f1(q.y2)}"
      fill="none" stroke="${mapMode==='lf'&&q.lf!=null?lfColor(q.lf):(isOwnHub(q.a,HC)||isOwnHub(q.b,HC))&&(q.a===hub.c||q.b===hub.c)?airline.c1:q.col}" stroke-width="${f2((isOwnHub(q.a,HC)||isOwnHub(q.b,HC))&&(q.a===hub.c||q.b===hub.c)?q.w*s+1.5*s:q.w*s)}" stroke-linecap="round" opacity="0.75">
      <title>${q.a}–${q.b} · ${q.f}× daily · ${q.seats} seats/day${q.lf!=null?` · ${Math.round(q.lf*100)}% full`:''}</title></path>`).join('');
  const dots=nodes.map(n=>`<circle class="mapnode" data-city="${n.c}" cx="${f1(n.x)}" cy="${f1(n.y)}" r="${f2(n.r*s)}" fill="#16283C" opacity="0.82" style="cursor:pointer">
      <title>${n.c} — ${A[n.c].n}${n.pax?' · '+Math.round(n.pax)+' pax':''} · ${n.f}× daily · click for details</title></circle>`).join('');
  const hs=12*s;
  const hubSym=`<rect class="mapnode" data-city="${hub.c}" x="${f1(hub.x-hs/2)}" y="${f1(hub.y-hs/2)}" width="${f2(hs)}" height="${f2(hs)}" fill="${airline.c1}" style="cursor:pointer"><title>${hub.c} — ${A[hub.c].n} · your hub · click for details</title></rect>`;

  // label placement, in map units at this zoom
  const placed=[];                                   // boxes: [x0,y0,x1,y1]
  const hit=b=>placed.some(p=>b[0]<p[2]&&b[2]>p[0]&&b[1]<p[3]&&b[3]>p[1]);
  const hubLab={x:hub.x+8*s,y:hub.y+4*s,w:hub.c.length*7.2*s};
  placed.push([hub.x-hs/2,hub.y-hs/2,hub.x+hs/2,hub.y+hs/2],[hubLab.x,hubLab.y-11*s,hubLab.x+hubLab.w,hubLab.y+2*s]);
  const vis=nodes.filter(n=>inView(n.x,n.y,20*s));
  vis.forEach(n=>{const r=n.r*s; placed.push([n.x-r,n.y-r,n.x+r,n.y+r]);});   // dots are obstacles too
  const cap=Math.round(14*z*z), showF=z>=3;
  const labs=[];
  const isDot=(b,n)=>{const r=n.r*s;return b[0]===n.x-r&&b[1]===n.y-r;};
  for(const n of vis){
    if(labs.length>=cap)break;
    const txt=showF&&n.f?`${n.c} ${n.f}×`:n.c, w=txt.length*5.4*s, h=9*s, r=n.r*s, gap=2.5*s;
    const cands=[[n.x+r+gap,n.y+h*0.35],[n.x-r-gap-w,n.y+h*0.35],[n.x-w/2,n.y-r-gap],[n.x-w/2,n.y+r+gap+h*0.8]];
    for(const [tx,ty] of cands){
      const box=[tx,ty-h*0.85,tx+w,ty+h*0.15];
      // ignore this label's own dot when testing
      const own=placed.findIndex(p=>isDot(p,n)); const saved=own>=0?placed.splice(own,1)[0]:null;
      const clash=hit(box); if(saved)placed.splice(own,0,saved);
      if(!clash){placed.push(box);labs.push(`<text x="${f1(tx)}" y="${f1(ty)}" font-family="IBM Plex Mono,monospace" font-size="${f2(9*s)}" fill="#4A5B6E" style="pointer-events:none">${txt}</text>`);break;}
    }
  }
  const hubText=`<text x="${f1(hubLab.x)}" y="${f1(hubLab.y)}" font-family="Archivo Narrow,sans-serif" font-weight="700" font-size="${f2(13*s)}" fill="${airline.c1}" style="pointer-events:none">${hub.c}</text>`;
  const oArcs=oS.map(q=>`<path d="M${f1(q.x1)} ${f1(q.y1)} Q${f1(q.cx)} ${f1(q.cy)} ${f1(q.x2)} ${f1(q.y2)}" fill="none" stroke="#9AA5B1" stroke-width="${f2(q.w*s)}" stroke-linecap="round" opacity="0.4"><title>${q.hub} network · ${q.a}–${q.b} · ${q.f}× daily</title></path>`).join('');
  const oHubs=oH.map(o=>{const z=11*s; return `<rect class="mapnode" data-viewhub="${o.c}" x="${f1(o.x-z/2)}" y="${f1(o.y-z/2)}" width="${f2(z)}" height="${f2(z)}" fill="#F4F1EA" stroke="${airline.c1}" stroke-width="${f2(2*s)}" style="cursor:pointer"><title>${o.c} — ${A[o.c].n} · your hub · click to view</title></rect>
    <text x="${f1(o.x+8*s)}" y="${f1(o.y+4*s)}" font-family="Archivo Narrow,sans-serif" font-weight="700" font-size="${f2(12*s)}" fill="${airline.c1}" opacity=".7" style="pointer-events:none">${o.c}</text>`;}).join('');
  g.innerHTML=gr+oArcs+arcs+dots+oHubs+hubSym+labs.join('')+hubText;
}

document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('[data-mapmode]'); if(!b)return;
  mapMode=b.getAttribute('data-mapmode'); renderMap(evalView());
});
