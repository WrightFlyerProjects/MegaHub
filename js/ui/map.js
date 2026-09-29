/* MegaHub · js/ui/map.js — network map render + zoom/pan view */
/* ---------------- network map ---------------- */
const TYPE_COLORS=['#2A6C99','#B02A6B','#5A7C33','#B8760F','#5B4B8A','#1F6F6B','#8A4B2A','#4A5B6E'];
const typeColor=t=>TYPE_COLORS[CATALOG.findIndex(c=>c.t===t)%TYPE_COLORS.length];

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
  const pts=[...codes].map(c=>A[c]);
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
  const arcs=Object.values(seg).map(s=>{
    const x1v=X(s.a),y1v=Y(s.a),x2=X(s.b),y2=Y(s.b);
    const mx=(x1v+x2)/2,my=(y1v+y2)/2, dx=x2-x1v,dy=y2-y1v, L=Math.hypot(dx,dy)||1;
    const cx=mx-dy/L*L*0.10, cy=my+dx/L*L*0.10;
    const col=s.f>=4?airline.c1:s.f>=2?airline.c2:'#7C8A99';
    const w=Math.max(1,Math.min(6,0.7+s.seats/260));
    return `<path d="M${x1v.toFixed(1)} ${y1v.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}"
      fill="none" stroke="${col}" stroke-width="${w.toFixed(1)}" stroke-linecap="round" opacity="0.75">
      <title>${s.a}–${s.b} · ${s.f}× daily · ${s.seats} seats/day</title></path>`;
  }).join('');

  const nodes=[...codes].filter(c=>c!==HUB.c).map(c=>{
    const p=spokePax[c]||0, r=2.4+Math.min(7,Math.sqrt(p)/3.2);
    return `<circle class="mapnode" data-city="${c}" cx="${X(c).toFixed(1)}" cy="${Y(c).toFixed(1)}" r="${Math.max(r,5).toFixed(1)}" fill="#16283C" opacity="0.82" style="cursor:pointer">
      <title>${c} — ${A[c].n}${p?' · '+Math.round(p)+' pax':''} · click for details</title></circle>`;}).join('');
  const top=[...codes].filter(c=>c!==HUB.c).sort((a,b)=>(spokePax[b]||0)-(spokePax[a]||0)).slice(0,14);
  const labels=top.map(c=>`<text x="${(X(c)+6).toFixed(1)}" y="${(Y(c)+3).toFixed(1)}" font-family="IBM Plex Mono,monospace" font-size="9" fill="#4A5B6E">${c}</text>`).join('');
  const hub=`<rect class="mapnode" data-city="${HUB.c}" x="${(X(HUB.c)-6).toFixed(1)}" y="${(Y(HUB.c)-6).toFixed(1)}" width="12" height="12" fill="${airline.c1}" style="cursor:pointer"><title>${HUB.c} — ${A[HUB.c].n} · your hub · click for details</title></rect>
    <text x="${(X(HUB.c)+8).toFixed(1)}" y="${(Y(HUB.c)+4).toFixed(1)}" font-family="Archivo Narrow,sans-serif" font-weight="700" font-size="13" fill="${airline.c1}" style="pointer-events:none">${HUB.c}</text>`;

  let grat='';
  for(let lon=-180;lon<=-50;lon+=10){const x=sx(lon*k);if(x>P-20&&x<W-P+20)grat+=`<line x1="${x.toFixed(1)}" y1="${P-14}" x2="${x.toFixed(1)}" y2="${H-P+14}" stroke="rgba(22,40,60,.07)"/>`;}
  for(let lat=10;lat<=70;lat+=5){const y=sy(-lat);if(y>P-20&&y<H-P+20)grat+=`<line x1="${P-14}" y1="${y.toFixed(1)}" x2="${W-P+14}" y2="${y.toFixed(1)}" stroke="rgba(22,40,60,.07)"/>`;}

  mapView={W,H};
  const vb=mapViewBox(W,H);
  $('map').innerHTML=`<div class="mapwrap">
    <svg id="mapsvg" viewBox="${vb}" role="img" aria-label="Route network map" style="touch-action:none">${grat}${arcs}${nodes}${hub}${labels}
    <text x="${P}" y="${H-14}" font-family="IBM Plex Mono,monospace" font-size="9" fill="#7C8A99">line weight = seats/day · colour = daily frequency (grey 1× · blue 2–3× · magenta 4×+)</text></svg>
    <div class="mapzoom">
      <button id="mapin" title="Zoom in">+</button>
      <button id="mapout" title="Zoom out">−</button>
      <button id="mapreset" title="Fit whole network" ${mapZoom===1&&!mapPanX&&!mapPanY?'disabled':''}>⤢</button>
    </div></div>`;
  const cities=codes.size-1, dailySeats=Object.values(seg).reduce((a,s)=>a+s.seats,0);
  $('netlab').textContent=`${cities} cities · ${Object.keys(seg).length} segments · ${dailySeats.toLocaleString()} seats/day`;
}
