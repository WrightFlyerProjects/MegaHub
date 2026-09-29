/* MegaHub · js/data/catalog.js — aircraft CATALOG, year range + START_BUDGET, schedule-data ANCHORS */
const CATALOG=[
 {t:'ATR-42', seats:46, kts:265,rng:700, cost:6, from:1988},
 {t:'CRJ-200',seats:50, kts:424,rng:1000,cost:7, from:1993},
 {t:'CRJ-700',seats:70, kts:447,rng:1370,cost:9, from:2001},
 {t:'DC-9-30',seats:100,kts:420,rng:1200,cost:10,from:1988,to:1997},
 {t:'737-300',seats:128,kts:420,rng:1600,cost:13,from:1988,to:2001},
 {t:'MD-82',  seats:142,kts:438,rng:2200,cost:15,from:1988,to:2001},
 {t:'727-200',seats:148,kts:430,rng:1900,cost:16,from:1988,to:1997},
 {t:'MD-90',  seats:153,kts:440,rng:2400,cost:17,from:1997},
 {t:'737-700',etops:true,seats:126,kts:450,rng:3000,cost:16,from:2001},
 {t:'757-200',etops:true,seats:186,kts:458,rng:3200,cost:20,from:1988},
 {t:'767-300ER',etops:true,seats:218,kts:470,rng:5500,cost:27,from:1988},
 {t:'DC-10-30',etops:true,seats:285,kts:490,rng:5300,cost:30,from:1988,to:2001},
 {t:'747-400',etops:true,seats:416,kts:500,rng:7200,cost:45,from:1990},
 {t:'777-200',etops:true,seats:305,kts:490,rng:5200,cost:34,from:2001}
];

const YEAR_MIN=1988, YEAR_MAX=2015, DATA_MAX=2005, START_BUDGET=160;
/* real schedule snapshots. Years between anchors reuse the previous snapshot's demand. */
const ANCHORS=[{y:1988,g:1.00,name:'Summer 1988'},{y:1993,g:1.16,name:'Fall 1993'},
               {y:1997,g:1.30,name:'Spring 1997'},{y:2001,g:1.52,name:'Summer 2001'},
               {y:2005,g:1.58,name:'Spring 2005'}];
const anchorFor=y=>ANCHORS.filter(a=>a.y<=y).slice(-1)[0]||ANCHORS[0];
