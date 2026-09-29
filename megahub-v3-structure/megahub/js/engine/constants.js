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
const DLY_FREE_NM=900, DLY_PER_NM=0.0042, DLY_CONGEST=2.6, DLY_CONGEST_FREE=3;
/* Ground time abroad: customs, security sweep, deep clean, catering uplift.
   Real carriers blocked 90 minutes minimum at foreign stations, often far more.
   A widebody cannot be turned in 25 minutes anywhere. */
const TURN_INTL=90, TURN_WIDE=45;
/* block time = taxi + climb/descent allowance + still-air cruise, adjusted for the
   prevailing westerlies. Eastbound rides the jet stream; westbound fights it. */
const CLIMB=12, JET_KT=55;
