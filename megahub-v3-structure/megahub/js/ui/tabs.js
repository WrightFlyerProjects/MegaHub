/* MegaHub · js/ui/tabs.js — tab navigation: switching, #hash persistence, jumping to Schedule when an action needs the editor */
const TABS=['network','schedule','hub','fleet','markets','airline'];
let curTab='schedule';
function showTab(t){
  if(!TABS.includes(t))t='schedule';
  curTab=t;
  document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('on',p.dataset.pane===t));
  document.querySelectorAll('#tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t?'true':'false'));
  if(location.hash.slice(1)!==t){try{history.replaceState(null,'','#'+t);}catch(e){}}
}
$('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab);});
window.addEventListener('hashchange',()=>showTab(location.hash.slice(1)));
/* Any edit link opens the editor, which lives on Schedule. Today every edit link is on that tab
   already; this keeps it true if edit links appear elsewhere (e.g. multi-hub views). Capture phase
   runs before the handlers in events.js, so the editor is visible by the time they scroll to it. */
document.addEventListener('click',e=>{
  if(e.target.closest&&e.target.closest('[data-edit],[data-editrot]'))showTab('schedule');
},true);
showTab(location.hash.slice(1)||'schedule');
