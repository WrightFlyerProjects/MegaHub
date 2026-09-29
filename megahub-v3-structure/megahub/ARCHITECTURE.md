# MegaHub — Architecture Map

Read this first. Then open only the files the change touches.

**Status:** v2.0 gameplay in the v3 structure. It was split from the single-file `index.html` and given tabs, and it plays identically to v2.0. It was verified against the v2.0 build by the golden masters in `tools/` (see Testing).

## How the code loads

`index.html` is markup only. It loads `css/styles.css` and then the 24 plain `<script src>` files below, **in this order**. These are classic scripts, not ES modules, and no build step exists. Deploy the folder to Netlify as-is. It also runs from `file://`.

Classic scripts share one global scope. Every top-level `let`, `const`, and `function` in any file is visible to all later files, and a `let` can be reassigned from any file. Keep that in mind:

- **Order matters only for code that runs at load time.** Data tables, `spillBase`, `setHub('DFW')` in world.js, event wiring in events.js, and the boot in main.js all execute when their file loads, so they may only use things declared in earlier files. Function bodies run later, so they can call anything.
- **Top-level names must be unique across all files.** Declaring the same `let`/`const` in two files is a load-time error.
- **When you add a file,** add its `<script>` tag in dependency order.

## File map (load order)

| File | Size | What's in it |
|---|---|---|
| `js/engine/constants.js` | 1 KB | Tuning constants: `DAY`, `MCT_BASE`, `LF`, `ALPHA`, gate cost/limits, `VIA_TURN`, `THRU_TAX`, `MIN_STAGE`, delay model (`DLY_*`, `DELAY_CAP`), `TURN_INTL`/`TURN_WIDE`, `CLIMB`, `JET_KT` |
| `js/data/airports.js` | 16 KB | `AIRPORTS` table: `{c,n,lat,lon,w,utc,ocean,intl}`. `w` = demand weight; `utc` = offset in minutes, northern summer |
| `js/data/catalog.js` | 2 KB | Aircraft `CATALOG` `{t,seats,kts,rng,cost,from,to,etops}`; `YEAR_MIN/MAX`, `DATA_MAX`, `START_BUDGET`; schedule-data `ANCHORS` + `anchorFor(y)` |
| `js/engine/world.js` | 4 KB | Geography: `A` (code→airport), `nm()`, `dPair`, `spillBase`. **Hub/era state:** `HUB`, `SPOKES`, `dHub`, `growth`, `YEAR`, `setHub()`, `setYear()`, `era()`, `availTypes()`. Also `tzD()`, `hubOD()`, `spill()`, `mctFor()`, `mod()`, `flightNo()` |
| `js/engine/demand.js` | 3 KB | Time-of-day desirability (`prefBase`, `nightHit`, `pref`), red-eyes (`isRedeye`, `endpointW`), `pw`, frequency `capture()`, `halfLocal()`, `fmt()`/`fmtHour()` |
| `js/engine/timing.js` | 1 KB | `turnMin()` (outstation ground time), `windKt()` (jet stream), `legBlock()`, `block()` |
| `js/engine/economy.js` | 1 KB | `fleetCost`, `tradeInValue`, `EMPTY_W`, `minTurnHub` (hub turn by fleet-type count), `grossPts`/`upkeepPts`/`netPts` |
| `js/engine/rotation.js` | 1 KB | `thruMult()` (one-stop circuity tax), `shape()` (rotation geometry → legs + marks), `rotDur()` |
| `js/engine/gates.js` | 2 KB | `acRots`, `gateCurve`, `groundIntervals`, `gateAssign` (stand assignment) |
| `js/engine/ops.js` | 7 KB | `validate()`, delay model (`hubDepPressure`, `legExpDelay`, `delayMap`, `otpOf`, `pMake`), `scheduleViolations`, `repairSchedule`, `freeWindows` |
| `js/engine/evaluate.js` | 9 KB | `productsOf()` + **`evaluate(rots,fleet,gates)`**: local O&D → spoke pairs → hub connections, then scoring and the per-leg `flights[]` array |
| `js/app/state.js` | 2 KB | Game-state `let`s (see below), `$()`, `X()`, `HUBS` list, `startGame()`, `pendingList()`, `spendNow()`, `seg()` |
| `js/ui/panels.js` | 16 KB | `renderHubLabels`, `renderHub`, `renderFleetPanel`, roster, replace/move aircraft (`doReplace`, `doMove`), `renderStats`, `renderAward` (+ Continue handler), `renderAxes` |
| `js/ui/board.js` | 19 KB | `renderLanes` (rotation board), `renderSchedule` (scheduled list), `gateConflicts`, **`render()`** (master re-render), `renderCity`, `renderHubCard`, `syncACLabels` |
| `js/app/persist.js` | 8 KB | `snapshot()`/`restore()` (save format v1), undo stack, `restartYear`, localStorage, import/export, `bootResume` |
| `js/ui/flightcard.js` | 2 KB | `renderFCard()`: the editor's flight preview card |
| `js/ui/coach.js` | 2 KB | Onboarding: `COACH` text, `coachStep()`, `renderCoach()` |
| `js/ui/brand.js` | 1 KB | `applyBrand()`: airline name, colors, livery |
| `js/ui/map.js` | 6 KB | `renderMap()` + zoom/pan view helpers |
| `js/ui/terminal.js` | 4 KB | `renderTerminal()`: terminal diagram + gate Gantt |
| `js/ui/editor.js` | 7 KB | Aircraft/destination selects, combo boxes, `setDest`/`setVia`, **`preview()`**, **`mkRot()`** |
| `js/ui/tabs.js` | 1 KB | `showTab()`, `#hash` persistence, jump-to-Schedule for edit links |
| `js/ui/events.js` | 13 KB | All event listeners (fleet, editor, schedule list, city clicks, map drag, save buttons, launch) |
| `js/main.js` | <1 KB | Boot sequence |

## Global state (who owns what)

- **world.js (engine):** `HUB` (airport object), `SPOKES`, `dHub` (spoke→nm from hub), `growth`, `YEAR`, `startYear`. Change these only through `setHub()`, `setYear()`, and `setStartYear()`.
- **state.js (app):** `owned` (fleet `[{id,...catalog}]`), `rots` (`[{ac,dst,via,dep,turn,b,dur,arr}]`), `gatesOwned`, `pending`, `gatesPending`, `points`, `cumPm`, `results`, `committed`, `launched`, `lastE`, `lastAward`, `editIdx`, `selCity`, `acSeq`, `airline`, plus editor and view state (`destSel`, `viaSel`, `schedSort`, `mapZoom`…).
- **tabs.js:** `curTab`.

The engine is pure: it reads world state and takes the rest as arguments. `evaluate()`, `validate()`, `delayMap()` and similar all receive `(rots, fleet, gates)`. It never touches the DOM, which is why `tools/engine_gm.js` can run it in Node.

## UI layout (index.html)

- **Header** (always visible): airline name, year/round (`#erabar`), points (`#hdrPts`), cumulative (`#cumbar`).
- **Control row:** tab bar (`#tabs`) and the Launch button (`#pLaunch`).
- **Shared strip** (visible on every tab): `#resume`, `#coach`, `#viol` (schedule-illegal warning + auto-fix), `#award` (year results + Continue), `#city` (city/hub card, which opens from schedule rows, the frequency list, or the map).
- **Tabs** (`<section class="tabpane" data-pane="…">`):
  - **Network:** `#stats`, map.
  - **Schedule:** rotation board + gate strip + gate conflicts | Add-a-rotation editor (`#pRot`) + Scheduled list.
  - **Hub:** terminal diagram, clock, gate Gantt.
  - **Fleet:** `#pFleet` (hub/start year pickers, catalog, gates, purchase, roster).
  - **Markets:** connecting markets, frequency & capture.
  - **Airline:** livery, game management, "How MegaHub works" rules text.

All panels render on every `render()` whether or not their tab is visible. That's cheap at this size, and it means switching tabs never shows stale content.

## Where to edit…

- **Demand, scoring, connections:** `engine/evaluate.js` (plus `demand.js` for time-of-day and `world.js` for `hubOD`/`spill`)
- **What makes a rotation legal:** `engine/ops.js` → `validate()`
- **Block times and wind:** `engine/timing.js`. Turn minimums: `constants.js` + `timing.js`
- **Delays and OTP:** `engine/ops.js`
- **Points economy:** `engine/economy.js`
- **Aircraft types and years:** `data/catalog.js`. Airports: `data/airports.js`
- **Save format:** `app/persist.js` (bump `SAVE_VERSION` and migrate old saves)
- **A panel's look:** its `render*` function in `ui/` + `css/styles.css`
- **Which tab a panel lives on:** `index.html` (move the block), then check `tabs.js`

## Rules that have bitten before

- **Recompute timing whenever a route changes aircraft.** Block time, duration and arrival depend on aircraft speed. Rebuild the rotation with `mkRot()`; never just swap the tail. This bug hit move-route and replace-aircraft, and only timing tests caught it.
- **After any change:** GA tag `G-05N353N0ZZ` appears twice in `index.html`; `<!DOCTYPE html>…</html>` is intact; `node --check` passes on every edited `.js` file.
- **Engine edits:** run `tools/engine_gm.js`. For a refactor, the sha256 must not change. For an intended gameplay change, confirm the numbers moved the way you meant.

## Testing (golden masters)

```
node tools/engine_gm.js <build-dir> <save.json> [out.json]   # engine only, Node, no browser
node tools/page_gm.js   <build-dir> <save.json> [out.json]   # full UI in headless Chromium (npm i playwright)
```

- **engine_gm** restores every state in the save (the save + its start-of-year checkpoint) and dumps `evaluate()`, violations, repair, delays, gate assignment, free windows, points and era.
- **page_gm** plays a 21-step session and snapshots every element with an id after each step. Diff two builds' JSON outputs element by element.

**Baseline** (save `atlantic-northern-2003_megahub.json`: RDU, 54 aircraft, 184 rotations, 24 gates):

- engine sha256 `1a76d42b0690353c9adbfa3fb0f5ac2d31157638fe8634692f99a21abd9e75ec`
- 2003 state: net pax-mi 31,044,425 · pax 29,021 · LF 0.8847 · OTP 0.7528
- 2003 checkpoint state: net pax-mi 30,312,129 · pax 28,062 · LF 0.8815
- The v2.0 single file, the split build, and this tabbed build all reproduce this. The tabbed build's page snapshots match v2.0 on every element and step except the coach wording (intended).

## Known issues (pre-existing in v2.0, not fixed yet)

- Loading a save updates the title and livery but not the airline-name input (and probably the color pickers). Typing in the name field afterwards renames the airline from "MegaHub Airways…". Fix: refill `#alName`, `#c1`, `#c2` in `afterLoad()`.
- `mctFor()`'s comment says MCT caps at 60 min; the code caps it at 40.

## Next planned work

The multi-hub prep refactor (design note §2): replace the `HUB`/`SPOKES`/`dHub`/`gatesOwned` globals with a hub-context object passed into the engine. Scope `minTurnHub` and `hubDepPressure` per hub (a design call). Verify with `engine_gm` (sha must not change).
