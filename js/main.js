/* MegaHub · js/main.js — boot sequence */
startGame();applyBrand();syncAC();syncDest();renderHub();renderFleetPanel();render();preview();
markYearStart();
bootResume();
$('tclockOut').textContent=fmt(+$('tclock').value);
