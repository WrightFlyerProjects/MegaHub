// Page golden master. Drives the real UI in headless Chromium through a scripted session (load save, edit,
// click cities, sort/filter, fleet, launch, continue, restart year, reload checkpoint, launch, new game) and
// snapshots the innerHTML/value/visibility of every element with an id after each step.
// usage: node tools/page_gm.js <build-dir> <save.json> [out.json]      (needs: npm i playwright)
// Compare two builds' out.json files element-by-element; tabs are navigated like a player would.
let chromium; try{({chromium}=require('playwright'));}catch(e){({chromium}=require('/home/claude/.npm-global/lib/node_modules/playwright'));}
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const [,,dir='.',savePath,outPath]=process.argv, label=path.basename(path.resolve(dir));
if(!savePath){console.error('usage: node tools/page_gm.js <build-dir> <save.json> [out.json]');process.exit(1);}
const save=fs.readFileSync(savePath,'utf8');
const ys=JSON.parse(save).yearStartSnap||save;
const MASK=new Set(['saveState','resume']);        // wall-clock text
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1300,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push('pageerror: '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text()))errs.push('console: '+m.text());});
  p.on('dialog',d=>d.accept());
  await p.route(/^https?:/,r=>r.abort());             // fonts + gtag offline, identically for both builds
  await p.goto('file://'+path.resolve(dir,'index.html'));
  const snaps={}, tabLog=[];
  const snap=async k=>{snaps[k]=await p.evaluate(mask=>{const o={};
    document.querySelectorAll('[id]').forEach(e=>{if(mask.includes(e.id))return;
      o[e.id]=e.innerHTML+'|val='+(e.value??'')+'|disp='+e.style.display+'|dis='+!!e.disabled;});return o;},[...MASK]);};
  const click=async sel=>{await p.locator(sel).first().click();};
  const tab=async t=>{await p.evaluate(t=>{if(typeof showTab==='function')showTab(t);},t);};   // no-op on single-page builds
  const onTab=async()=>p.evaluate(()=>typeof curTab==='undefined'?'n/a':curTab);
  await snap('01_fresh');
  await p.evaluate(t=>importSave(t),save);                                   await snap('02_loaded');
  await tab('schedule'); await p.selectOption('#ac',{index:5});              await snap('03_ac_selected');
  await p.evaluate(()=>{setDest('LHR');preview();});                         await snap('04_dest_LHR');
  await p.fill('#depT','18:30'); await p.dispatchEvent('#depT','input'); await p.dispatchEvent('#depT','change'); await snap('05_dep_changed');
  await tab('markets'); await click('#freq [data-city]');                    await snap('06_city_click');
  await tab('schedule'); await click('#lanes [data-editrot]');                await snap('06b_edit_rotation'); tabLog.push(await onTab());
  await p.click('#canceledit');                                 await snap('06c_cancel_edit');
  await tab('schedule'); await click('[data-sort="pax"]');                   await snap('07_sort_pax');
  await p.fill('#schedFind','ORD'); await p.dispatchEvent('#schedFind','input'); await snap('08_filter');
  await p.fill('#schedFind',''); await p.dispatchEvent('#schedFind','input');
  await tab('hub'); await p.fill('#tclock','1020'); await p.dispatchEvent('#tclock','input');  await snap('09_terminal_clock');
  await tab('network'); await click('#mapin');                               await snap('10_map_zoom');
  await click('#map [data-city]');                                           await snap('10b_map_city');
  await tab('fleet'); await click('[data-p]');                               await snap('11_fleet_pending');
  await click('[data-gp]');                                                  await snap('12_gate_pending');
  await tab('markets'); await click('#launch');                              await snap('13_launched');
  await click('#advance');                                                   await snap('14_advanced');
  await tab('airline'); await click('#btnRestartYear');                      await snap('15_restart_year');
  await p.evaluate(t=>importSave(t),ys);                                     await snap('16_yearstart_loaded');
  await tab('hub'); await click('#launch');                                  await snap('17_yearstart_launched');
  await tab('airline'); await click('#btnNew');                              await snap('18_new_game');
  await b.close();
  const json=JSON.stringify(snaps);
  if(outPath)fs.writeFileSync(outPath,json);
  console.log(label,'steps',Object.keys(snaps).length,'ids',Object.keys(snaps['02_loaded']).length,
    'sha256',crypto.createHash('sha256').update(json).digest('hex').slice(0,16));
  console.log('tab after edit click:',tabLog.join(','));
  console.log(errs.length?errs.join('\n'):'no page errors');
})();
