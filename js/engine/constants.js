/* MegaHub · js/engine/constants.js — tuning constants: day length, MCT, load factor, delay model, turn minimums, block-time allowances */
/* MegaHub engine v2.0 — retuned demand, flight numbers, start year, extended timeline, sell aircraft, more intl. No DOM. */
const DAY=1440, MCT_BASE=30, MAXCT=300, LF=0.72, TAXI=18, ALPHA=1.5, HALF_CONN=1.6, HALF_PAIR=2.0;
const GATE_COST=8, MIN_GATES=1, MAX_GATES=30, VIA_TURN=40, THRU_TAX=0.85, MIN_STAGE=75;
/* delay model */
const STATION_MIN=25, DELAY_CAP=120, OCEAN_LEG=500, CUSTOMS=30;
/* Expected delay per leg, in minutes. Not a flat constant and not a coin flip:
   a deterministic function of things a scheduler can see and plan around —
   base unreliability, distance exposure, and how congested the hub is when
   this flight tries to push back. Long flights and busy banks run later. */
const DLY_FREE_NM=900, DLY_PER_NM=0.0042, DLY_CONGEST=2.6, DLY_CONGEST_FREE=6;   // a hub pushes 6 departures per 30 min before its own bank congests (was 3)
/* Ground time abroad: customs, security sweep, deep clean, catering uplift.
   Real carriers blocked 90 minutes minimum at foreign stations, often far more.
   A widebody cannot be turned in 25 minutes anywhere. */
const TURN_INTL=90, TURN_WIDE=45;
/* block time = taxi + climb/descent allowance + still-air cruise, adjusted for the
   prevailing westerlies. Eastbound rides the jet stream; westbound fights it. */
const CLIMB=12, JET_KT=55;
/* Gate tiers, nested: 0 standard · 1 heavy (widebody-capable) · 2 international (customs, also
   widebody-capable). A gate takes its own tier and everything below it. */
const GATE_UP_H=4, GATE_UP_I=6;          // upfit costs in points: standard→heavy, heavy→international
const HEAVY_SEATS=200;                   // the widebody line (same one TURN_WIDE uses)
const TOW_AFTER=45, TOW_MIN_GROUND=90;   // on the ground 90m+: customs gate needed only for the first 45m
/* US preclearance, era-accurate for 1988–2005: these flights clear US customs before departure,
   so they arrive as domestic — no customs gate, no customs time on connections. */
const PRECLEAR=new Set(['YYZ','YVR','YUL','YYC','BDA','NAS','AUA']);
