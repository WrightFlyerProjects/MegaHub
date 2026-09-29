/* MegaHub · js/ui/brand.js — airline name/colors and livery */
/* ---------------- airline identity ---------------- */
/* relative luminance -> readable foreground */
function lum(hex){
  const n=parseInt(hex.slice(1),16), c=[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]
    .map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4));
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
const fgFor=hex=>lum(hex)>0.42?'#16283C':'#FFFFFF';

function applyBrand(){
  const root=document.documentElement;
  if(root&&root.style){
    root.style.setProperty('--brand',airline.c1);
    root.style.setProperty('--brand2',airline.c2);
    root.style.setProperty('--brand-fg',fgFor(airline.c1));
    root.style.setProperty('--brand2-fg',fgFor(airline.c2));
  }
  $('alTitle').textContent=airline.name||'Unnamed Airways';
  const nm=(airline.name||'').toUpperCase().slice(0,22);
  $('livery').innerHTML=`<svg viewBox="0 0 260 52" width="100%" role="img" aria-label="Livery">
    <rect x="0" y="0" width="260" height="52" rx="3" fill="${airline.c2}"/>
    <rect x="0" y="33" width="260" height="9" fill="${airline.c1}"/>
    <rect x="0" y="42" width="260" height="4" fill="${airline.c1}" opacity="0.45"/>
    <text x="14" y="26" font-family="Archivo Narrow,sans-serif" font-weight="700" font-size="16"
      letter-spacing="1.5" fill="${fgFor(airline.c2)}">${nm}</text></svg>`;
}
