# Fence the Farm — complete context for BOTH builds

**Purpose of this file.** A self-contained briefing on the two builds of *Fence the Farm*
that live in this repository. Written to be uploaded as context to a model that has never
seen the code. Everything here was read out of the source, not from a design brief.

**How to read it.** §1–§4 are shared by both builds. §5 is Build A (`game/`), §6 is
Build B (`lab/`), §7 compares them line by line. §8–§12 cover audio, accessibility,
tooling and deployment. §13 lists defects. §14 is the proposed future direction.

**Repo state at time of writing.** `lab/` has uncommitted modifications (a defect-fix
pass, described in §13.2). `game/` is untracked in git — it is a restored copy of an
earlier build, kept for reference. Branch `main`.

---

# 1. What the game is

A 16:9 drag-based geometry puzzle for Grades 8–10. Vanilla HTML/CSS/JS, no build step, no
framework, no bundler. It exists to land exactly one idea:

> **The same perimeter does not give you the same area.**

The player has a fixed length of fence and can reshape the rectangle it encloses. A goat
grazes inside. Making the field *longer* makes it *narrower*, and the grass shrinks. The
most area comes from the most balanced shape.

Both builds implement the same four farms, the same interaction, and the same finale. They
differ in **camera angle** and, consequently, in most of their rendering code.

| | Build A | Build B |
|---|---|---|
| Directory | `game/` | `lab/` |
| Camera | three-quarter / "top-side" | true top-down plan |
| Status | frozen reference, do not edit | active build, all work happens here |
| HTML `<title>` | *Fence the Farm — earlier build* | *Fence the Farm* |
| Served at | `/game/` | `/lab/` (and `/` redirects here) |
| JS files / lines | 8 files, 2,826 | 13 files, 4,660 |
| CSS lines | 675 | 1,287 |
| HTML lines | 279 | 372 |

---

# 2. The invariant everything hangs on

```
length + width === perimeter / 2
area           === length × width
```

One scalar drives the whole game. The player can only ever change `W`; `L` is derived as
`half - W`. Every pixel on screen — fence modules, HUD cards, the perimeter tracer, the
goat's safe area — is computed from that state, so the picture can never disagree with the
number. There is no separate model and view that could drift apart.

`setW()` is the only mutator, and it asserts the invariant every time:

```js
g.W = nw; g.L = g.half - nw;
if (2 * (g.L + g.W) !== g.perimeter) console.error('[ftf] perimeter invariant broken', ...);
```

This is also why **the goat is a fixed size in metres**. If she grew as the field became
balanced, part of the "more grass" impression would come from the goat rather than from the
geometry, and the comparison the entire lesson rests on would stop being honest.

### Legal range

```
half = P / 2
Lmax = half - 1
Wmax = min(half - 1, ceil(half / 2) + 1)
```

`W` bottoms out at 1, making shapes like 9×1 reachable. `Wmax` deliberately lets the player
overshoot *past* the square, so the area is seen to fall away on **both** sides of the
balance point rather than only one.

---

# 3. Space, layout and the round table

Everything is authored in a fixed **1280×720** design space and scaled to the window by a
single CSS transform on `#ftf-stage`: `scale(min(vw/1280, vh/720))`. Nothing else is
resolution-aware, so every coordinate in this document is a design-space pixel.

**One cell = one metre.** `cell` is pixels-per-metre for the current farm, chosen per round
so that *every legal shape* of that round fits clear of the HUD.

### The four farms (identical in both builds, except the herd, which is `lab/` only)

| # | Name | Perimeter | Start | Optimum | Mechanic | Light | Extra |
|---|------|-----------|-------|---------|----------|-------|-------|
| 1 | Discovery | 20 m | 8×2 (16 m²) | 5×5 (25 m²) | `tutorial` | morning | gated beat machine · 1 goat |
| 2 | Farm Record | 24 m | 10×2 (20 m²) | 6×6 (36 m²) | `record` | midday | record 32 m² · 2 goats |
| 3 | Visual Trap | 28 m | 10×4 (40 m²) | 7×7 (49 m²) | `misconception` | evening | forced stretch 12×2 · 3 goats |
| 4 | Master Builder | 32 m | 13×3 (39 m²) | 8×8 (64 m²) | `mastery` | golden | exact 48 m² then max · 4 goats |

Farm 1 runs at `cell = 80`.

### Layout constants (`LAY`)

| Key | Value | Meaning |
|-----|-------|---------|
| `PLANK_BOT` | 104 | Bottom of the hanging instruction board. The fence may not rise above this. |
| `BOTTOM` | 700 | Floor for the deepest pasture. |
| `LEFT` / `RIGHT` | 80 / 966 | Horizontal play box; the right edge clears the area card. |
| `CX` | 640 | Stage centre; pastures are centred on it. |
| `DONE_TOP` / `DONE_BOT` | 204 / 520 | **`lab/` only.** The clear band the completion pasture is fitted into. |

### The per-round cell fit

```js
cell = min( 0.50 * 1280 / L0,
            (RIGHT - LEFT) / Lmax,
            (BOTTOM - PLANK_BOT) / (Wmax + POST.h) )
cell = clamp(cell, 0.45 * 1280 / L0, 0.55 * 1280 / L0)
ax   = clamp(CX - L0 * cell / 2, LEFT, RIGHT - Lmax * cell)
ay   = PLANK_BOT + POST.oy * cell
```

The third term is what keeps the deepest legal pen clear of the floor, and it reads
`POST.h` — so the fit follows the art. `POST.h` differs sharply between the builds
(0.989 vs 0.594), which is why the same farm sits at a different scale in each.

### Finale constants (`FIN`, identical in both)

```js
{ cell: 40, ground: 500, ax: 140, bx: 820, soloCell: 44, soloX: 228, soloY: 168 }
```

---

# 4. The fence module system (shared architecture)

The fence is **not drawn as a shape**. It is a set of modules keyed by **edge and index** —
`tp:0`, `tr:3`, `rr:2`, `rp:2`, `br:1`, `bp:0`, `lr:0`, `lp:1` — never by absolute grid
position. When the pasture is reshaped, surviving pieces keep their identity and glide to
their new node instead of being destroyed and recreated. Only the pieces that genuinely
joined or left are animated, which is what makes a reshape read as *moving material* rather
than as rebuilding a rectangle.

Each pasture has exactly **P posts and P rails**, so the module count *is* the perimeter:
`nodes.size === 2 × P` at every shape. Build order is anchor, then clockwise: top, right,
bottom, left.

```js
penSeq(L, W) {
  post('tp:0', 0, 0);
  for (i in 0..L)  { rail('tr:i','h',i,0,'0% 50%');    post('tp:i+1', i+1, 0); }
  for (j in 0..W)  { rail('rr:j','v',L,j,'50% 0%');    post('rp:j+1', L, j+1); }
  for (i in L-1..0){ rail('br:i','h',i,W,'100% 50%');  post('bp:i', i, W); }
  for (j in W-1..0){ rail('lr:j','v',0,j,'50% 100%');  if (j>0) post('lp:j', 0, j); }
}
```

### Pens

A **pen** is one enclosure: `{ id, L, W, cell, ax, ay, nodes: Map, layer }`. Several exist
at once — `main` for the live pasture, `finA` / `finB` for the finale's side-by-side
comparison. `newPen(id, layer)` supports rendering into different DOM layers.

### The lifecycle calls

| Call | Job |
|---|---|
| `syncPen(p, opts)` | Reconcile the pen's DOM to `penSeq(L,W)`. Adds, moves and retires modules. `opts.stagger` spreads the build; `opts.instant` skips animation. |
| `dropPen(id, opts)` | Sink the whole enclosure. Returns the ms to wait before the next thing may build. |
| `dropAllPens(opts)` | Every pen at once. |
| `puff(x, y, p)` | Grass displacement where a post arrives or leaves. Never a dust cloud. |
| `buildFence(ms, then)` | Fade the grass fill in, `syncPen` with `stagger = ms / (2P)`, fire `then` at `stagger*2P + 210`. |

### Input

Pointer movement is folded into one legal ratio, so the pen always satisfies the invariant
whatever path the hand takes:

```js
intent = ((py - g.ay) / g.cell + (g.half - (px - g.ax) / g.cell)) / 2
if (|intent - g.W| > 0.62) setW(...)      // hysteresis: a hand near a boundary cannot chatter
if (|intent - g.W| > 0.22) wood(...)      // one wood creak per drag, past an intent threshold
```

Keyboard: `ArrowRight`/`ArrowUp` = +1, `ArrowLeft`/`ArrowDown` = −1, one legal state per
press. The handle is a focusable `<button>` carrying `aria-valuenow` and `aria-valuetext`.

### Phase gates

```js
ownsMain()    // phases where the main pen is the live pasture
dragAllowed() // phases where the handle works
```

`ownsMain` covers `intro, play, peak, formula, explore, complete` (+ `explain` in `lab/`).
`dragAllowed` covers `play, peak, explore` (+ `explain` in `lab/`).

### Progress tiers (shared)

```js
tierFor(area) {
  best = half² / 4
  f    = area / best
  f >= 0.995 -> 4 ;  f >= 0.94 -> 3 ;  f >= 0.8 -> 2
  f > startArea/best -> 1 ; else 0
}
```

### Level lighting (shared, four presets)

`setLight(name)` writes `#ftf-stage[data-light]`. Each preset drives a grass `filter`, a
`#ftf-light` gradient overlay, and four CSS variables the module drop-shadows read:

| Preset | `--sh-x` | `--sh-y` | `--sh-blur` | `--sh-ink` |
|---|---|---|---|---|
| morning | −3px | 3px | 3px | `rgba(24,52,12,.26)` |
| midday | 0px | 3px | 3px | `rgba(24,52,12,.30)` |
| evening | 7px | 5px | 5px | `rgba(52,38,12,.36)` |
| golden | 11px | 6px | 7px | `rgba(58,34,8,.40)` |

Shadows lengthen and lean as the day advances. `baseFilter(t, tight)` multiplies the offset
by 0.35 while the handle is held, so the whole fence appears to press down.

---

# 5. BUILD A — `game/`, the three-quarter camera

## 5.1 Files

```
game/
  index.html            279 lines
  css/style.css         675 lines
  js/game.js           1016   core engine, geometry, modules, input, rounds
  js/audio.js           359   synthesised SFX + 4-layer music, goat samples
  js/goat.js            210   state machine, per-file frames
  js/levels.js          470   four mechanics + the tutorial beat machine
  js/finale.js          542   compare, tracer, peak, formula, algebra, complete, explore
  js/i18n.js             22   string harvesting, runtime locale swap
  js/debug.js           195   21-state navigator
  js/main.js             12   boot
  assets/art/            34 files
  assets/audio/           4 mp3
  assets/fonts/           Osmose-Regular.otf, Osmose-Bold.otf
```

Load order in `index.html`: `game → audio → goat → levels → finale → i18n → debug → main`.
Every module after `game.js` extends the class via
`Object.assign(FenceTheFarm.prototype, {…})`.

## 5.2 Art metrics (`MOD`)

The farm is seen from a raised three-quarter angle. Posts **stand up** and meet the ground
partway down their own art; rails hang above the node line.

```js
MOD = {
  LOG:   144 / 360,                                    // 0.400 — rails hang this far above the node
  POST:  { w: 212/360, h: 356/360, ox: 106/360, oy: 300/360 },
  //       0.589       0.989       0.294        0.833   post.png is 212 × 356, meets ground at y = 300/356
  RAIL:  { h: 166/400, tile: 0.5 },                    // 0.415 — rail-h.png, seamless tile, two per metre
  VRAIL: { w: 0.21,    tile: 0.63 }                    // rail-v.png, cut from the depth-fence art, mirrored
}
```

Rails are **tiled** (`repeat-x` / `repeat-y` at `tile * cell`), not stretched.

## 5.3 Depth sorting

Because there is real depth, modules are y-sorted:

```js
post   z = 200 + round(y / 4) * 2 + 1
h-rail z = 200 + round(y / 4) * 2
v-rail z = 200 + round((y + cell/2) / 4) * 2
goat   z = 200 + round(G.y / 4) * 2 + 1
```

The `+1` puts a post in front of the rail meeting it at the same row. The goat sorts into
the same stack, so she can walk behind the far fence and in front of the near one. The
draggable corner is lifted to `z = 880` while it is live.

## 5.4 The goat

A single `<img id="ftf-goat">` whose `src` is swapped per frame — one PNG per frame, no
sprite sheet.

```js
CLIP = {
  idle:    ['idle-0'],
  enter:   ['walk-0' … 'walk-7'],
  walk:    ['walk-0' … 'walk-7'],
  eat:     ['graze-0','graze-1','graze-1','graze-2','graze-3','graze-2'],
  talk:    ['bleat-0','bleat-1','bleat-2','bleat-1'],
  happy:   ['bleat-1','bleat-2','idle-2','bleat-1'],
  curious: ['idle-2']
}
RATE = { enter: 0.10, walk: 0.115, eat: 0.30, talk: 0.16, happy: 0.17 }   // seconds per frame
```

- **Direction is a mirror.** The source art faces left, so `scaleX(-face)` flips her.
- **`GOAT_METRES = 1.35`**, but `goatHeight()` clamps to `max(58, min(140, cell * 1.35))`
  — the clamp is the source of defect §13.1.4.
- Title height is a hard-coded 200 px. Idle blink runs on an irregular 1.2–3.6 s beat,
  with an ear-twitch variant.
- Breathing: `scaleY` ±1.4 % on a 2.1 rad/s sine while idle, eating or curious.
- Success: `jump = 0.55` s arc up to 30 px, plus a `wig` rotation decaying at 1.4/s.
- Walk speed 64 px/s; her scripted walk-on ("enter") is 215 px/s.

### Safe area

```js
penBounds(p, L, W) {
  sprW = 1.35 * 0.767            // idle-0.png is 230 × 300
  post = 212/360;  air = 0.16
  padL = sprW * 0.42 + post/2 + air
  padR = sprW * 0.58 + post/2 + air
  padT = 0.55;  padB = 1.0       // the near posts rise a post-height above the bottom edge
}
```

Asymmetric left/right padding, because her art is drawn from 0.42 of its width left of her
feet. A pen one metre deep cannot hold her cleanly, so she is stood at the **back** and the
near fence simply passes in front of her.

Idle fallback bounds (title, or no pen): `[566, 716, 512, 526]`.

Autonomous wandering runs only in `WANDER = { play, finale, complete, explore }`; the game
scripts her everywhere else. Idle → 55 % chance of walking to a random point in bounds,
otherwise eat.

## 5.5 Screen flow

**Boot** → preload 9 art files + 8 walk frames + 10 pose frames → hide `#ftf-loader` → title.

**Title.** Logo board drops on ropes (1150 ms). Goat centre-stage at (640, 520) at 200 px,
side-on. Eight-beat loop: look right 950 → look left 850 → walk 1700 → eat 3200 → look up
800 → bleat 1600 → walk back 1800 → idle 1500. One `Play` button, no instruction.

**Title → farm.** Board hauled back up its ropes (860 ms), button drops away (380 ms), the
grass settles from `scale(1.055)` to `1` over 1500 ms, and she sets off at 340 ms so the two
overlap and the eye never sees an empty stage.

**Farm 1 · Discovery** — a gated beat machine. Beats do not advance on timers where an
interaction is the point.

| Gate | Beat |
|---|---|
| SEE | **1** *Give her more grass*. Goat bleats, then grazes. 2.1 s hold. |
| SEE | **2** Fence builds over 1150 ms; numbers appear; the fence value pulses once. |
| TOUCH | **3** *Drag this corner*. Handle glows/breathes, hand cursor points, `demoHandle()` nudges the corner every 1.25 s. Waits indefinitely. |
| TOUCH | **4** Grab registered. Hint retires permanently. |
| NOTICE | **5** First change that gains area → *More grass — still 20 m*. She bleats. 2.2 s. **This is the lesson.** |
| TRY | **6** *Can you give her even more?* Opens after 3 moves or 1 reversal. |
| TRY | **7** *Find the biggest area*. Free play. |
| DISCOVER | **8** 5×5 → *Biggest grass area!* Burst, puffs, side lengths revealed. 2.1 s. |
| DISCOVER | **9–10** Start-vs-best recap, then *You've got it!* and *Next farm*. |

*Skip tutorial* jumps to beat 7 and is offered only to returning players
(`localStorage['ftf.tutorial']`).

**Farm 2 · Farm Record.** Record line at 32 m². Beating it fires *New record — N m²* with
the real area substituted, on a genuine beat only, never on re-crossing. Copy runs
*Beat the record — 32 m²* → *Push it further.* → *Record smashed!*

**Farm 3 · Visual Trap.** The game asks the student to perform the misconception. Phase 1:
*Stretch it longer* — the target is 12×2, which is longer and **worse** (24 m²). On reaching
it the music thins (`musicTier(0, true)`), she takes two steps and looks around, then the
board physically flips to *Now find the most grass*. Phase 2 is free play to 7×7. The recap
compares **their own longest shape**, not the level's start.

**Farm 4 · Master Builder.** No instruction, no record, no target. Feedback is sound and the
goat only. After a 13 s stall with no progress the area value pulses once and she glances at
it. On success, an **optional bonus** opens: *Make exactly 48 m²* — `stats.completed` is set
back to `false` so the handle stays live, and a `levelStep` wrapper watches for the exact
area.

**Finale.** Five phases on the same grass:

1. `compareBuilds` — `GAP 150, SPAN 1180, GROUND 470, DEPTH 262`; one cell for both pens,
   one shared ground line; labels centred under each pen at `±133`.
2. Tracer — one SVG `rect` per run, `pathLength = P`, `stroke-dashoffset` P→0 over 1900 ms
   linear. Both runs are the same normalised length so they finish together, which *is* the
   proof. A measuring tick every 2 m.
3. Grass reveal — both interiors filled and counted up (900 ms / 1500 ms).
4. `finalePeak` — the fence returns at `soloCell 44` at (228, 168); the player drags again
   with a performance meter behind the number. `peakCurve` plots `A(W) = (half−W)·W` over
   the whole hill in viewBox `{x0:30, x1:228, y0:14, y1:110}`. Reaching the square assembles
   the emblem: *Strategy discovered — Balanced sides → most area*, qualified *with the same
   rectangular perimeter*.
5. `formulaScreen` — *Fence around the outside* `P = 2(L+W)` versus *Grass inside*
   `A = L × W`, resolving on a staged timeline (240/700/1700/2200/2600/3500/4300/5000 ms),
   then *Fixed perimeter — does not mean — Fixed area*. The tracer is re-used for a single
   pasture at 1300 ms.

**See why** (optional algebra) — `advancedScreen` turns the meter into a real graph with
axes: `L + W = 16` *half of the 32 m fence*, `W = 16 − L`, `A = L(16 − L)`, and
*The path you dragged was this curve.* Timeline 220/900/1600/2300/2900 ms.

**Completion** — badge board *Master builder* / *Same fence. Smarter shape.*, footer
*4 farms completed*, `Play again` and `Explore`. The winning 8×8 is rebuilt centre stage at a
hard-coded `cell = 40, ay = 196` (defect §13.1.5).

**Explore** — sandbox. Perimeters 16/20/24/28/32/40, default 24. Each starts deliberately
unbalanced: `W0 = max(1, round(half * 0.25))`. Side lengths are shown here, unlike during
taught play.

## 5.6 Debug

21 states: *Start, Fence Intro, L1 Idle/Drag/Wrong A/Wrong B/Success, L2 Record/New rec/
Success, L3 Stretch/Flip/Success, L4 Mastery/Bonus, Final Compare, Final Peak, Formula,
Advanced, Completion, Explore.* Built only when `debugMode` is set (`?debug=1`); toggled
with **D**. Never constructed in production, not merely hidden.

---

# 6. BUILD B — `lab/`, the top-down camera

## 6.1 Files

```
lab/
  index.html            372 lines
  css/style.css        1287 lines
  js/game.js           1398   core engine, geometry, modules, input, rounds, travel
  js/audio.js           431   synthesised SFX, 4-layer music, ducking BGM bed
  js/goat.js            835   GoatController class + prototype adapters
  js/instruct.js        241   InstructionController: paced sign, idle-help ladder
  js/levels.js          576   four mechanics and the tutorial beat machine
  js/finale.js          501   compare, tracer, peak, completion, explore
  js/mascot.js          393   GoatMascotController: the 8 s level-complete performance
  js/cheer.js            96   staging for it — defocus, hand-off, input lock
  js/explain.js         178   the live explanation screen
  js/herd.js            261   the extra goats: 1 per farm, ambient only
  js/i18n.js             22
  js/debug.js           194   20-state navigator
  js/main.js             12
  assets/art/            41 files (both fence kits present)
  assets/goat/           3 sheets + 11 cheer poses (+ .raw originals, not shipped)
  assets/audio/           4 mp3 + Neon Horizon.mp3
  assets/fonts/           Osmose
```

Load order is **significant** and fixed:

```
game → audio → goat → instruct → levels → finale → mascot → cheer → explain → i18n → debug → main
```

`cheer.js` wraps `levelSucceed` and `levelReset`, so those must exist first. `explain.js`
wraps `ownsMain`, `dragAllowed`, `levelStep`, `evaluateRelease` and `levelRelease`, so it
must come after both.

## 6.2 Art metrics (`MOD`)

Seen from directly overhead: a post is the sawn end of a log, a rail is a plank lying on the
grass.

```js
MOD = {
  LOG:   0,                                              // nothing hangs above anything from overhead
  POST:  { w: .594, h: .594, ox: .297, oy: .297, wood: .766 },
  //     td-post.png 265×265, a 203px wood disc concentric in the box; the rest is grass collar
  RAIL:  { h: .30, tile: 1 },                            // td-rail-h.png 900×134, even thickness end to end
  VRAIL: { w: .30, tile: 1 }
}
```

Rails are **stretched** one plank per metre (`100% 100% no-repeat`), not tiled. That
guarantees no seams and no half-planks at corners; the grain is far too fine at these sizes
for the horizontal squash to read.

Because the box is square and the disc concentric, `ox = oy = w/2` — a post simply centres
on its node, and turns about its own centre.

### `fenceOver()` and `fitPen()` — the key abstraction

```js
fenceOver() { return { up: POST.oy, down: POST.h - POST.oy, side: POST.w / 2 }; }

fitPen(L, W, top, bot, maxCell) {
  o     = fenceOver();  span = W + o.up + o.down;
  cell  = min(maxCell, (bot - top) / span);
  slack = (bot - top) - cell * span;
  return { cell, ax: CX - L*cell/2, ay: top + slack/2 + o.up*cell };
}
```

Every screen that must fit a pasture into a gap reads the overhang from the art rather than
from a constant, so re-cutting the modules moves those layouts with them. This is the single
most important structural difference from `game/`, and it is what makes the dual-camera
proposal in §14 tractable.

## 6.3 Z-order

Flat, because there is no depth to sort from overhead:

```
rails 210   ·   posts 240   ·   goat 300   ·   live corner 880
```

## 6.4 The goat — `GoatController`

A real controller class owning the animation clock, the walk, the heading and a behaviour
scheduler. It reads and writes `game.goat` so the rest of the game keeps seeing the same
state bag it always had.

### Art

Three supplied sheets, each **4 columns × 2 rows = 8 frames**, 1254×1254 (frame 313.5×627):

| Sheet | States | FPS | Loop | Notes |
|---|---|---|---|---|
| `goat-walk.png` | walk, enter, idle, curious | 8 | yes | idle/curious hold frame 0 — there is no idle sheet, so the calmest walk frame stands in |
| `goat-eat.png` | eat | 6 | yes | grass crumbs on frames 2 and 6 |
| `goat-bleat.png` | talk, happy | 7 | no | sound fires on frame 2, the widest mouth |

Frame size is derived from the loaded image (`background-size: 400% 200%` plus a percentage
position), never hard-coded — drop in a higher-resolution sheet of the same 4×2 layout and
nothing needs to change.

```js
SHEET = { content: 0.877, aspect: 0.5, faceDeg: 90 }
GOAT_METRES = 2.00                   // exaggerated for readability; constant, so still honest
SIDE  = { aspect: 0.767, titleH: 190, clips: {…the original per-file frames…} }
TILT  = 1.05     // seconds for the camera to come overhead
BLEAT_PEAK = 2
```

**Direction is a rotation, never a mirror.** All three sheets draw her nose south, so a
heading is achieved by rotating the whole sprite by `heading − faceDeg`. Mirroring would
break the plan view.

### The two views and the camera

`GoatController.view` is a 0→1 scalar: **0 = seen from the side (title), 1 = seen from
overhead (farm)**. Nothing calls for the change — it follows the phase, so pressing *Play*
tilts the camera and returning to the title tilts it back. Across the tilt:

- the side sprite is foreshortened away (`scaleY` 1 → 0.5) and slides from standing on the
  ground point to sitting over it;
- the plan sprite opens out of the same squash (`scaleY` 0.42 → 1);
- **both are drawn at one blended height** `hNow = titleH + (box.h − titleH) · ease`, so the
  phase changing underneath — which happens while the camera is still moving — cannot make
  her jump.
- Her *collision* size is never blended: `bounds()` always uses the real one.

### Sizing — one source of truth

```js
goatBox()  { h = p.cell * GOAT_METRES / SHEET.content; return { h, w: h * SHEET.aspect, cell }; }
goatSpan() { return GOAT_METRES * p.cell; }   // stated from the constant, never measured off a sheet
```

Everything — the safe area, the exclusion radius, the debug overlay — derives from
`goatBox()`, so the size she is *drawn* at and the room she is *given* can never disagree.
That split is exactly what let `game/` stand her on a rail.

### Safe ground — a radius, not margins

She turns to face her heading, so what must fit inside the fence is the **circle she
sweeps**:

```js
goatAir(cell)   = max(0.05 * cell, 5)                        // px floor guarantees visible daylight
goatTurnPad(p)  = goatSpan()/2 + POST.w * POST.wood / 2 * cell + goatAir(cell)
flatPad         = goatSpan()/2 * SHEET.aspect + RAIL.h/2 * cell + goatAir(cell)
```

A post is stouter than its rails and would otherwise catch her shoulder, so the post *wood*
radius is charged on any side she may turn on. A 9×1 pasture is legal and cannot contain a
turning 1.3 m goat — there `axisLock()` pins her heading to the long axis and only her half
*width* is charged across the tight axis, measured against the thinner rail.

`keepInside(dt)` runs **every frame in every state**, not only while walking. The pasture can
close over a goat who is grazing, bleating or celebrating; she gives ground at 1.5× walking
pace so it reads as stepping out of the way rather than being snapped. Her scripted walk-on
is the one exception, since the point of the entrance is that she starts outside.

### Behaviour (`GOAT_CONFIG`)

| Key | Value | Key | Value |
|---|---|---|---|
| walk / eat / bleat FPS | 8 / 6 / 7 | idle wait | 2.0–4.5 s |
| walk speed | 35–55 px/s at a 72 px metre | bleat cooldown | 7–12 s |
| enter speed | 210 px/s | eat duration | 1.6–2.5 s |
| accel | 0.19 s | settle after eating | 0.5–1.2 s |
| turn rate | 620 °/s | min travel | 0.9 m |
| handle exclusion | 1.25 × her width | weights | walk .45 / eat .30 / bleat .15 / idle .10 |

Speeds are given at a 72 px metre and scaled with `cell`, so she covers ground at the same
rate *in metres* whatever the farm. Destinations are rejected if too close or inside an
exclusion radius around the drag handle — that corner is the one thing the student must
always be able to see and grab.

**While the fence is being dragged**, the controller watches `stats.dragging` rather than
patching the drag handlers, so it cannot get out of step. On grab she stops choosing for
herself, holds position, and turns her head toward the moving corner. On release she waits
0.5–1.2 s, then resumes — walking back in if the pasture shrank around her.

Autonomous wandering additionally requires `this.ready` (all three sheets loaded) and
`!noMotion()`.

### Reactions

- *Bleat* — two small arcs beside her mouth, 620 ms. Not a speech bubble; she is an animal.
- *Eat* — 2–4 grass blades kicked up, 480 ms. Never a hole in the field.
- *Correct* — a hop, a 5 % scale pulse, one happy bleat, three sparkles around **her only**,
  because the fence is what the player should be looking at.

### Sprite-sheet cleanup that was required

The supplied sheets carried a keyed-matte halo of near-pure red and yellow hugging the
silhouette, plus loose blobs in open space. Colour keying could not separate that matte from
her **red collar and gold bell** and destroyed both. The working fix is purely topological:
label connected components of solid pixels (alpha > 110), keep the largest per frame, drop
stranded faint pixels with no solid neighbour, erode one pixel. 7,500–21,500 px of matte
removed per frame; collar and bell intact in all 24 frames.

## 6.5 Systems `game/` does not have

### `instruct.js` — the instruction controller

Everything the sign says goes through one place, so pacing is one decision rather than a
habit each level must remember.

1. **Word by word**, ~210 ms apart, with a longer pause after punctuation. Letter-by-letter
   was rejected: it reads as a computer terminal and is slower to actually read.
2. **A stable board.** Every word is laid out and the board sized to the finished line
   *before* the first word appears; only opacity changes. One soft settle plays after the
   last word, and that is the signal the instruction is complete.
3. **Idle help, and only then.** The idle clock starts when the line has finished revealing
   *and* settled — otherwise a learner who is simply reading gets treated as stuck. Help
   escalates 5 s (small hand) → 10 s (she glances at the corner) → 15 s (tracked nudge).

```js
INSTRUCT = { wordMs: 210, settleWait: 210, settleMs: 620,
             idleMs: 5000, goatMs: 10000, nudgeMs: 15000, handFade: 150,
             pause: { ',':100, ';':100, ':':120, '.':180, '!':180, '?':220 } }
```

`idleAllowed()` requires `phase === 'play' && !completed`, so the finger never taps the
corner on the live explanation screen or after a farm is already won.

**Informational lines never start the idle clock.** `lineType(line)` compares the line
against a list of *requests* with digits blanked (`/\d+/g → '#'`), so *"Beat the record —
32 m²"* and *"— 48 m²"* count as the same request. Prompting someone to act on *"More area.
Same 20 m fence."* would be prompting them to act on nothing.

### `mascot.js` + `cheer.js` — the level celebration

Eleven separate poses of the same character animated into one 8-second performance. The
artwork is never modified; everything that makes it feel like a single animated animal comes
from timing, easing, squash and stretch, crossfades and particles landing on the beat.

- **Poses crossfade.** Two image layers swap roles, so a pose change is a short dissolve
  rather than a hard cut — which is what hides the differing transparent padding between the
  supplied PNGs.
- **One ground line.** Each pose fills its frame differently (the lying pose ends at 87 %,
  the standing one at 99 %), so each carries a measured `ground` fraction and is nudged onto
  a common line at `POSE_GROUND = 0.994`. Without it she visibly hops up and down the screen
  as poses change, which reads as a bug rather than as animation.
- **She is always doing something.** A pose lands roughly every 600 ms and the wrapper is
  moving between them. The peak of the jump is a slow float, not a held frame — a wrapper
  that stops moving for 300 ms is the single thing that makes a recording look stuttery.
- **Two jumps, not one**: a big leap with the confetti, then a smaller, happier second hop,
  which is what stops the back half feeling like padding.
- **A 1-in-7 flourish**: usually a wave; sometimes she tips over laughing.
- Particles: a 22-piece burst whose cone *skips the section that would cross her face*, 7
  sparkles placed **outside** her silhouette (r ≈ 290–360 px, because a pale dot on white
  fur is invisible while the same dot on grass glows), a 72-piece shower spawned in 8 waves
  over 4.2 s — a third of it green grass blades, so the celebration is made of the field she
  won — plus a shockwave ring and landing dust. Counts drop to 72 % / 50 % on small stages.

`cheer.js` stages it: `field` gets `ftf-defocus`, the root gets `ftf-cheering` so everything
but the goat leaves, her field self is hidden with `display` (not opacity, which is
transitioned and written inline from several places), and input is locked by putting the
handle beyond reach rather than disabling it. The hand-off to the level's explanation runs
on an `afterKeep` timer `clearTimers()` cannot cancel — otherwise a level beat firing
mid-celebration would leave the farm blurred and unplayable — and carries a **generation
stamp** so a restart cannot push the old farm's success into the new one.

### `explain.js` — the live explanation

This screen replaced three static panels (formula board, algebra wall, strategy card). All
three *told* the student something; this one lets them do it.

```js
LIVE = { px0: 70, px1: 610, py0: 150, py1: 560 }
cell = min((px1-px0) / (Lmax + 2*o.side), (py1-py0) / (Wmax + o.up + o.down))
```

The pasture takes the left, the area-against-length curve the right, and the cell is chosen
so **every** shape the student can drag to still fits. The perimeter is pinned and the badge
says so; the handle is live. As they drag, **one** pill — `8 × 8 = 64 m²` — is recomputed
from the one state and a token rides the curve at their hand.

The screen used to carry six pieces of text: a two-clause hint, `L + W = 8 + 8 = 16`,
`A = 8 × 8 = 64 m²`, a peak label repeating the same sum, a *See why* button opening a
three-step derivation, and a two-line strategy caption. All of it sat around one moving
picture, which made the picture the least of it. What is left is *"Drag the corner."*, the
pill, a *Most area* marker on the peak, and one strategy line on discovery. **A screen meant
to be played with must not also be a screen meant to be read.**

- They start on the **lopsided** shape that farm began with, never the balanced one.
- The strategy line is **never printed**. It appears only if and when they land on the
  balanced shape themselves, and only after a move of their own — `_liveMoves > 0` stops the
  screen's own opening draw counting as a discovery.
- Landing on the square here is a discovery, **not a win**: `evaluateRelease`, `levelStep`
  and `levelRelease` are all short-circuited in this phase, so the farm's success path
  cannot run over the top of the explanation.

### The journey between farms (`travelTo`)

Two sheets of ground (`#ftf-grass`, `#ftf-grass-2`) slide left together over 1150 ms under a
trotting goat whose legs move but whose feet stay — the ground is what travels. The day
advances *while they walk*, a signpost swings down naming the farm and marking it off
against the four, and seven alternating hoofbeats sell the walk. The pen is emptied outright
first, because a leftover post retiring on its own timer would hang motionless in the air
while the ground scrolled away beneath it. Skipped entirely under reduced motion.

### The question panel — built, briefly wired, then deleted

Worth recording because the code carried it for a long time. `askChoice()` presented one
short prompt with two or three answers under the sign: a tutorial check (*What stayed the
same?* → **Fence length** / Area) and a Level 3 prediction (*What will happen to the area?*,
ungraded, because a hypothesis is never marked).

It shipped **inert for its whole life** — fully implemented and never called once — was
wired up at the two beats it was written for, and was then **removed entirely**, along with
`answerChoice`, `closeChoice`, `dismissChoice`, `showBanner`, `predictVerdict`,
`lv.prediction`, the `#ftf-ask` panel, its CSS and its ten strings.

The reason is the design one, not a technical one: in a game whose entire method is
*drag it and watch what happens*, a multiple-choice question reads as a worksheet dropped
on top of the farm — an interruption asking the student to stop playing and be tested. The
shape moving under their hand already is the check.

### The spotlight (`spotlight(ids)`)

Dims the stage with `#ftf-veil` and lifts named elements above it. **One subject at a time**
— calling it again lowers whatever was lit before, because two spotlit things defeat the
pointing. Used in the farm-1 intro: perimeter first (field + tracer + fence card lit, the
measuring light walking the fence), then area (field + area card lit, the fence stepped back
into the dim, the fill held bright for the whole beat).

### Measurement lines

When side lengths are revealed, a dotted golden line runs the **full length** of each
measured side with its number card sitting beside it — so *"8 m"* is visibly THE BOTTOM
EDGE, not a number floating near the fence. The card sits beside the line rather than on it,
because centred it covers the end dots and reads as a collision. Positions are clamped so a
deep Explore shape cannot push a card off stage.

## 6.6 Level mechanics that differ

- **Farm 2** acknowledges *matching* the record (`record.match`, one chime, goal stays open).
  In `game/` matching passed in silence, which read as failure at the exact moment the player
  had hit the number they were given.
- **Farm 3** is framed as an experiment, never as advice: *"Test an idea: make the field
  longer"*. *"Stretch it longer"* reads as a recommendation and would reinforce the very
  misconception the level exists to dislodge.
- **Farm 4 is two contracts, not one maximise plus an optional extra.** First build
  *exactly* 48 m² — a different skill from maximising, which is why the target is
  deliberately not the maximum — and only then find the largest area. `evaluateRelease` is
  gated on `lv.precise`, so reaching the square early does not skip the precision stage; it
  simply waits its turn. Distance feedback says how far off and which way, never which shape
  to build.
- **`farmIntro()`** gives every farm arrival one rhythm: the new light settles over empty
  grass → the fence builds → the numbers arrive → play begins and the sign speaks. Each beat
  gets its own moment, which is what makes a farm change read as arriving somewhere new
  rather than as the screen being swapped.

## 6.7 Robustness work

| Mechanism | Why |
|---|---|
| `retire(el, ms)` | `animationend` + `animationcancel` + an `afterKeep` backstop. A timer alone loses to `clearTimers()` on a phase change. |
| `afterKeep(ms, fn)` | A timer list `clearTimers()` cannot touch, for housekeeping that must outlive the screen it belonged to. |
| `showHandle(on)` | Visibility and hit-testing are the same fact, so they are set together; the stylesheet owns the cursor, so no inline value can be left behind on a screen that has none. |
| `closeLive()` | Every screen entry calls it, so no new route can forget to close the live explanation. |
| `viewSize()` | Fits to `visualViewport` where offered. `window.innerHeight` includes the strip under a collapsing mobile address bar, so fitting to it puts the stage behind the toolbar and then jumps when the bar slides away. Re-fits on `resize`, `orientationchange`, and visualViewport `resize`/`scroll`, plus one extra fit on the next frame. |

## 6.8 Debug

20 states: as `game/` but with *Formula* and *Advanced* replaced by a single *Explain*.
`GOAT_DEBUG` is a separate compile-time constant overlaying her state, frame, heading, speed
and safe box — dead code unless deliberately switched on.

---

# 7. Side-by-side reference

| Concern | `game/` (three-quarter) | `lab/` (top-down) |
|---|---|---|
| `MOD.LOG` | `144/360` = 0.400 | `0` |
| `MOD.POST` | w .589, h .989, ox .294, oy .833 | w .594, h .594, ox .297, oy .297, wood .766 |
| `MOD.RAIL` | h .415, tiled 2/metre | h .30, stretched 1/metre |
| `MOD.VRAIL` | w .21, tiled | w .30, stretched |
| Post art | `post.png` 212×356, stands up | `td-post.png` 265×265, sawn disc |
| Z-order | y-sorted, `200 + round(y/4)*2` | flat: rails 210, posts 240, goat 300 |
| Layout fitting | constants inline per screen | `fenceOver()` → `fitPen()`, derived from art |
| Goat art | per-file frames, one `<img>` | 3 sheets 4×2 + the side frames |
| Goat direction | `scaleX(-face)` mirror | rotate by `heading − 90°` |
| `GOAT_METRES` | 1.35 (drawn size clamped 58–140 px) | 2.00 (drawn size derived, never clamped) |
| Goat clearance | asymmetric L/R/T/B margins | one turn radius, plus `axisLock` for tight pens |
| Goat controller | ~210 lines in the prototype | `GoatController` class, 817 lines |
| Camera | fixed | `view` 0→1 scalar over `TILT` 1.05 s |
| Tracer | 1 rect/run, node line | 3 layers/run (bloom + casing + core), rail line |
| Between farms | fence sinks, ~1 s of empty grass, fence rises | 1150 ms travelling journey + signpost |
| Level complete | side-length reveal only | 8 s wordless mascot celebration |
| Sign | one line, set instantly | word-by-word paced with an idle-help ladder |
| Explanation | formula board + optional algebra wall | one live, draggable screen |
| Farm 4 bonus | optional, after success | required precision contract, before success |
| Questions | none | none — a quiz panel was built, briefly wired, then deleted |
| Goats | always 1 | 1, 2, 3, 4 by farm — extras are ambient, and only during play |
| Tutorial order | riddle → vocabulary → goal at beat 7 | picture → goal → vocabulary, 11.6 s |
| Music | 4 synthesised layers | + a ducking `Neon Horizon.mp3` bed |
| Module cleanup | `after()` timers (leaks) | `retire()` + `afterKeep()` |
| Mobile fit | `window.innerWidth/Height` | `visualViewport` + orientation handling |

---

# 8. Audio

Both builds synthesise almost everything through a single `AudioContext` — no audio library
and no per-sound files, except four real goat/hoof samples in `assets/audio/`.

### Primitives

| Function | Sound |
|---|---|
| `wood(freq, dur, gain, q)` | filtered noise burst — posts, snaps, knocks, hoofbeats |
| `pluck(freq, gain, dur, type)` | short tonal note — area changes, chimes, chords |
| `rasp(from, to, dur, gain, q)` | swept noise — rails extending/retracting, ticks, rope |
| `noiseBuf(dur, decay)` | the noise source both of the above filter |

### Groups

| Group | Examples |
|---|---|
| fence | `fence_post_rise` (150 Hz wood), `fence_post_sink`, `fence_rail_extend`, `fence_rail_retract`, `fence_snap` (320 Hz), `fence_snap_big` |
| handle | `handle_grab` (520 Hz), `handle_release`, plus one wood creak per drag past a 0.22 m intent threshold |
| value | `area_up` (523 Hz pluck), `area_down` (311 Hz), `measure_tick` (2400→1700 Hz sweep) |
| success | `success_chord` (523/659/784 staggered 100 ms), `record_break`, `record_success` (659/880/1175), `chime`, `challenge_flip` |
| goat | `bleat` / `bleat_happy` — real samples with synth fallback; grazing and hooves loop by state |
| ambience | occasional randomised birdsong |

### Music

Four synthesised layers — `pad`, `pluck`, `perc`, `bell` — each with its own gain.
`musicTier(tier, hard)` opens and closes them over a 2.2 s ramp (0.35 s when `hard`), so the
score **grows across the four farms** rather than switching tracks. Tier 4 adds a
523/659/784/1046 bell flourish.

```
tier 0: pad .18                     tier 2: + perc
tier 1: pad .9 + pluck              tier 3: + bell            tier 4: + flourish
```

### `lab/` only — the ducking bed

```js
BGM = { vol: .13, duck: .40, duckMs: 480, voDuck: .24, voMs: 1700, fadeIn: 2200 }
```

One looping track (`Neon Horizon.mp3`) mixed deliberately quiet under everything, which
**ducks** whenever the game says something. `BGM_DUCK` lists the sounds important enough to
step aside for — fence construction patter and tiny UI ticks are deliberately absent, since
ducking on those would make the bed pump continuously while a fence is built. Voice-over
outranks everything: it ducks deeper (0.24) and longer (1700 ms). Re-ducking while already
ducked extends the dip rather than stacking, so a run of measuring ticks reads as one
continuous step-aside instead of a stutter.

Additional `lab/` cues: `farm_turn`, `plank_tick`, `cheer_jump`, `cheer_spark`, `bell_ding`,
`cheer_land`, `hoof`, `hoof_soft`, `sign_swing`.

### Voice-over

A hook only, in both builds. Recordings were not supplied, so `vo(key)` fires at the right
beat and is logged; it speaks only with `?vo=1`, using browser TTS. Synthetic speech is off
by default, on purpose. Ten lines are written (`VO` map in `game.js`).

---

# 9. Accessibility

- **Keyboard** — the handle is a focusable `<button>` and steps `W` with arrow keys; every
  button carries a visible focus ring (`.ftf-focus`).
- **Screen reader** — the handle carries `aria-valuenow`, `aria-valuetext` and a composed
  `aria-label`; `#ftf-a11y` is an `aria-live="polite"` region announcing each shape and area.
  In `lab/`, the instruction controller announces the **finished sentence once**, never one
  update per word.
- **Reduced motion** — respected via `prefers-reduced-motion` and forceable through
  `forceReduce`. Autonomous wandering stops, the camera tilt snaps, hops and particles are
  suppressed, module glides are disabled, the between-farm journey is skipped, the mascot
  plays a short static variant, and holds are lengthened so nothing is missed. A full round
  completes.
- **Pointer** — the goat is `pointer-events: none` in the field and can never intercept a
  drag. On the `lab/` title only she is tappable, with a 1.1 s cooldown so mashing cannot
  spam her.
- **Localisation** — every visible string is keyed with `data-i18n`. `initStrings()` harvests
  the English source out of the markup into a dictionary; `window.ftfSetLocale(dict)` swaps a
  translation in at runtime. `t(key)` falls back to the key itself.

---

# 10. Analytics

Every meaningful beat pushes an event to `window.__ftfAnalytics`:

```js
{ e: 'round_completed', t: 48213, round: 2, area: 36 }
```

Events include `round_started`, `first_handle_grab`, `time_to_first_drag`,
`first_drag_direction`, `first_area_change`, `new_best_area`, `area_decrease`,
`suboptimal_release`, `tutorial_beat`, `tutorial_skipped`, `record_matched`,
`record_broken`, `stretch_reached`, `misconception_result_seen`, `exact_area_completed`,
`optimal_area_reached`, `round_completed`, `recap_started`, `peak_started`, `peak_found`,
`level_celebrated`, `explain_started`, `explain_peak_found`, `explore_set`,
`game_completed`, plus `question_shown` / `question_answered` / `question_dismissed` and the
`hint_shown` / `hint_tier_shown` ladder in `lab/`.

---

# 11. Options and URL parameters

```js
{ snapGuide: 'On drag' | 'Always' | 'Never',
  audio: true, music: true, vo: false,
  debugMode: false, startRound: 1 }
```

`?debug=1` opens the navigator, `?round=3` starts on a given farm, `?vo=1` speaks the VO
lines through the browser's own voice.

---

# 12. Deployment

```
/
  game/                 frozen reference build
  lab/                  active build
  assets/               loose source art at the repo root (never deployed)
  scripts/
  vercel.json
  .vercelignore
  GAME-CONTEXT.md       full context for lab/
  DEPLOY.md
```

There is **no root `index.html`**. An earlier build had a Play / Lab chooser there;
`vercel.json` now redirects `/` straight to `/lab/`, with `cleanUrls` and `trailingSlash`.
Cache headers: assets immutable for a year, JS/CSS/HTML `max-age=0, must-revalidate`, plus
`X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.

**Deployment trap.** The goat sprite frames and everything in `assets/audio/` are referenced
by name at runtime (`'assets/art/' + name + '.png'`), so a text search of the source reports
them as unused. They must never be added to `.vercelignore`. What *is* dropped: the original
source art the derived assets were cut from, the `.raw.png` sheets before matte cleanup, the
superseded single-sheet celebration goat, the loose `/assets/` pile at the repo root, and
anything matching `**/__*` — the double-underscore prefix is a test-harness convention.

---

# 13. Defects

## 13.1 Present in `game/`, all fixed in `lab/`

1. **The goat stands on the fence.** `penBounds` budgets padding from `GOAT_METRES × cell`
   but `goatHeight()` clamps the drawn size to `max(58, min(140, …))`, so at small cells she
   is drawn bigger than the room reserved for her. Worst clearance across all 30 legal shapes
   was **−30.2 px**. `lab/` derives both from one `goatBox()` call; worst case **+1.2 px**.
2. **DOM leak.** Retired modules are removed by `after(210, …)`, and `clearTimers()` runs on
   every phase change cancelling exactly those timers. A fast reshape strands nodes
   permanently — **33 of them** in one measured climb, some still visible. `puff()` has the
   same bug. `lab/` uses `retire()` + `afterKeep()`; 33 → 0.
3. **The perimeter tracer is invisible and mispositioned.** A single 5 px gold stroke with a
   same-hue glow, pinned to the node rectangle while the rails hang `LOG × cell` higher — so
   it runs *through* the fence rather than along it, and white-on-gold is the only pairing
   that holds contrast against both brown wood and green grass.
4. **`finaleTraceOne` latent bug.** It unconditionally parks `trace-b`, so calling it *for*
   `trace-b` would zero its own width. Only `trace-a` is ever passed, so it never fires in
   play.
5. **The completion badge board covers the fence.** `cell = 40, ay = 196` is hard-coded; post
   tops land at y ≈ 162.7 while the board ends at y = 190 — **27.3 px of fence hidden**,
   including the whole top rail. `lab/` derives the cell with `fitPen()`; 14 px / 12 px clear.
6. **Side-length cards leak onto the title.** `titleScreen()` never hides them, so
   Explore → *Done* leaves an `8 m` card and a clipped `m` hanging over the logo.
7. **Module glides ignore reduced motion.** The `left`/`top` transition is set
   unconditionally.

## 13.2 Fixed in `lab/` in the most recent (uncommitted) pass

1. **The mascot's sparkles never animated.** `sparkles()` asks for `animation: ftf-spark`,
   and no `@keyframes ftf-spark` existed — only `ftf-goat-spark`, which belongs to the field
   goat. With `fill: both` and no keyframes the stars appeared at full opacity 290–360 px out
   and sat there until the layer was cleared. Four times per celebration, four celebrations
   per playthrough. `ftf-dust` had the neighbouring bug: its keyframes dropped the
   `translate(-50%,-50%)` its base rule sets, so every landing puff jumped half its own size
   on frame one. Both keyframes now carry the translate, because a keyframe transform
   replaces the whole property.
2. **The success beats played behind the celebration.** `succeed()` scheduled the fence
   settle, her hop, the grass puffs and the side-length reveal at +90/+190/+300/+560 ms, then
   called `levelSucceed()` — which `cheer.js` wraps and which blurs the farm for eight
   seconds. Every one of those beats played to a screen nobody could see. They are now
   `succeedField()`, handed to the celebration and run as the farm comes back. Verified
   ordering: `celebrate-start > celebrate-end > succeedField`.
3. **The whole question system was dead code.** `askChoice()` was fully built and never
   called; nothing set `lv.prediction`, so `predictVerdict()` always returned null and
   `showBanner()` was unreachable with it. The panel, its CSS and ten strings all shipped
   inert. Briefly wired up at the two beats they were written for — then deleted outright
   in the pass below (§13.2b).
4. **Two screens were unreachable in play.** Every route to `formulaScreen()` and
   `advancedScreen()` had been redirected to the live explanation; only the debug navigator
   still called them. Removed: both methods, `#ftf-fm` and `#ftf-adv`, ~50 lines of CSS, four
   dead button listeners and nine orphaned i18n keys. `advCurve()` and `finaleTraceOne()`
   stayed — the live screen and the tutorial intro use them.
5. **The mascot preloaded eleven poses mid-performance.** Its controller is what loads and
   decodes them, and it was only constructed inside `playGoatCelebration` — so the first
   celebration paid for 11 × 620 px of PNG on its own beats. Built in `init()` now.
6. **`explainScreen()` drew its readouts twice**, leaving the `_liveMoves > 0` guard — the
   only thing stopping the opening shape being reported as the student's own discovery — one
   line from never being false.

## 13.2b The decluttering pass

Driven by screenshots of the running game. The complaints were: too much text, a quiz that
read as an interruption, panels sitting on top of the pasture, and a goat too small to be
the reason for any of it.

1. **Both multiple-choice questions removed**, and all the machinery behind them — see
   *"The question panel"* in §6.5.
2. **The live explanation lost four of its six pieces of text** — see `explain.js` in §6.5.
3. **The emblem became a bar along the bottom of the stage.** At `top: 452` with three lines
   it sat on the fence, and the peak screen's pasture can be dragged nine metres deep, so
   there is no middle that is reliably empty. The way-on button moved beside the card rather
   than under it, keeping the bar ~100 px tall. The third line — the rule spelled out — was
   dropped: a textbook sentence long enough to widen the card into the pasture, saying
   nothing the two numbers above it did not already show. Measured: **emblem top 598,
   pasture bottom 533.**
4. **`GOAT_METRES` 1.30 → 2.00.** She was drawing at ~50 px on the screens that share their
   width with a graph, and read as a speck. Swept against every legal shape of every farm
   first: at 2.00 the worst clearance on any pasture two metres or deeper is **+16.8 px**
   (farm 4 at 13×3); above 2.20 real shapes start to fail. One-metre pens cannot hold her at
   any size — they could not at 1.30 either — and there `axisLock()` lays her along the long
   axis and she brushes the rails. She is still a **constant** size, so the area comparison
   is untouched.
5. **The live corner never gave its badge back properly.** `render()` set `zIndex = 880` on
   the draggable post but reset only `filter` and `scale`, so every post that had *once* been
   the corner went on floating above the whole fence for the rest of the round — visible as
   a diagonal trail of stray posts along the path the corner had taken. It also set the
   glide transition unconditionally, overriding the deliberate `transition: none` that
   `makeModule` gives a module under reduced motion, and once a post had been the corner it
   kept the glide for good. Both now reset.

## 13.2c The axis-lock hang

Raising `GOAT_METRES` to 2.00 raised `goatTurnPad` with it, which changed which pastures
`axisLock()` treats as too narrow to turn around in — at 1.30 only one-metre pens, at 2.00
two-metre pens as well. That is *correct* (she needs 206 px to turn and a 2 m pen gives
160), but farm 1 starts at 8×2.

**The hang.** Her walk-on targets a point inside the pasture and she starts outside it.
With the pasture locked, `updateHeading` pinned her heading to due east/west, so she could
never close the vertical gap — `arrive()` never ran, `_enterDone` never fired, and
`levelIntro()` was never called. The farm never started: grass and a goat, and nothing
else on the stage. Reproduced at (566, 677) walking away from a target at y = 212.

**The pre-existing trap it exposed.** The same failure was reachable in ordinary play
long before the size change: any off-axis target in any locked pen left her walking toward
a point she could not reach, and scripted beats set targets directly, so it was never
confined to her own wandering.

Fixes, both in `js/goat.js`: the lock is not applied while she is `enter`ing or
travelling (she is outside the pasture in both, so a lock derived from it is meaningless),
and `updateMovement` measures arrival along the axis she can actually travel — `|dx|`,
`|dy|`, or the true distance — which covers every caller rather than making each scripted
beat aware of the lock.

**Lesson for anyone changing `GOAT_METRES`:** it is not only a drawing size. It feeds
`goatTurnPad` → `penBounds` *and* `axisLock`, so changing it changes which pastures pin
her heading, and therefore which destinations are reachable at all.

## 13.2d The polish pass

From played screenshots: the tagline moved off the title screen onto the instruction
board (all copy has one home); `fitSign` treated its 22px `min` as a hard stop so six
lines hung off a ~340px board, now bounded by a real `floor: 15` plus shorter copy (26 of
26 fit, smallest 23px); `#ftf-next` overrode `.ftf-btn` sizing and kept keyboard focus
while hidden with opacity, so it alone was the wrong shape and wore a focus ring — sized
by label now and blurred on leaving; the tutorial no longer arms the idle hand while its
own larger hand is pointing; the celebration is 5000ms with 21 motion beats and zero dead
air (was 8s); and the herd got the leash, target-carrying separation and axis-lock arrival
that the scripted goat already had.

## 13.3 Still open in `lab/`

| Gap | Status | Detail |
|---|---|---|
| Voice-over | hook only | No recordings supplied. Ten lines fire at the right beats. |
| Goat idle richness | partial | The plan sheets have no blink or tail-flick frames, so plan-view idle is a held frame plus a 1–2 px breath. The side view does blink. |
| Bleat arc shape | partial | The supplied sheet is not a clean neutral→open→neutral arc; frames 2 and 6 are both wide open. Sound fires on 2. |
| Post decoration repeats | cosmetic | Every post disc carries the same pebble and flower at the same rotation. A per-node rotation would break the pattern; not done because the rise animation owns the transform. |
| Osmose font | licensing | Trial font. Needs replacing or licensing before release. |
| Lost source art | unrecoverable | `hand.png` and `touch.svg` are no longer in the repo, so the drag-hint cursor cannot be re-cut from source. |
| Frame-exact timing | unverifiable | Headless Chrome does not advance rAF under virtual time, so the tilt and the timed holds are verified numerically, not by frame capture. |
| Generalisation is under-stated | design | `game/`'s emblem stated the rule outright; `lab/`'s is personal (`13 × 3 → 8 × 8`) but the general statement now appears only on the live screen, and only if the student re-finds the peak there. |

## 13.4 Verification status

`lab/` passes 22 scripted checks (invariant across 30 shapes, module count = 2P, area
readout, fence on stage, goat never touching the fence, no HUD collision, every screen
rendering, all six explore perimeters, completion fit, card leakage, the tilt in both
directions, all three sheets loading, a reduced-motion round, zero orphaned DOM nodes, zero
JS errors), plus a 27-assertion headless play-through run twice — full motion and reduced —
with **zero JS errors on both**, including a measured check that the emblem clears the
pasture and that neither the peak marker nor the live pill contains algebra. Module
accounting was checked separately across farm 4 → drag → peak → solve: DOM count equals
tracked count (64 = 2P) at every step.

**Headless limits, both confirmed by experiment rather than assumed.** Under
`--virtual-time-budget`, `requestAnimationFrame` fires **once** in three seconds of
timer-time, so anything reached from the rAF loop never happens — notably her scripted
walk-on at farm 1, whose `arrive()` fires `_enterDone` → `levelIntro()`. Drive the tutorial
with `_fresh = false` to step around it. CSS **transitions** do not advance either, so a
capture taken without `* { transition: none !important }` shows half-faded HUD and the
curve still parked at its meter position — geometry included, because `#ftf-curve`
transitions `right/top/width/height` as well as opacity.

---

# 14. Proposed direction: merge the two cameras

The open design question is whether both views can coexist in one build.

### The governing constraint

Tilting the camera is an orthographic squash — it scales the vertical axis by `cos θ` and
leaves the horizontal alone. That does two different things to the two quantities:

- **Area survives it.** Every region shrinks by the same `cos θ`, so *ratios* are preserved.
  Comparing areas in three-quarter is fair.
- **Perimeter does not.** Horizontal runs keep their length, vertical runs lose 30–40 %. At
  30° tilt a 28 m fence measures 26.4 screen-metres as 12×2 but only 22.4 as 7×7, so the
  tracer's proof — *both runs are the same length, so they finish together* — becomes
  visibly false.

**Therefore: the three-quarter camera may never be the view a measurement is made in.**

### The design

One scalar `cam` (0 = three-quarter, 1 = plan) bound to the phase, never to a button —
exactly how `GoatController.view` already works. Three-quarter for the title, the journey,
the celebration and completion; plan for everything the student measures in. The
load-bearing rule is **`cam = 1` whenever `dragAllowed()`**, which is both pedagogically
correct and sidesteps the fact that the drag maths assumes an untilted field.

### Why it is largely already built

- `traceRect()` already offsets by `MOD.LOG * cell` — written for the three-quarter era,
  currently a no-op because `LOG = 0`.
- `fenceOver()` / `fitPen()` already derive every layout from the art, so making `MOD`
  camera-dependent moves the layouts automatically.
- The goat already crossfades between two view sets on an eased scalar.
- **Both art kits already ship in `lab/assets/art/`**: `td-*` and the original
  `post/rail-h/rail-v`.
- The tilt is a CSS transform on `#ftf-field`, so every coordinate the game computes stays in
  the flat design space beneath it. Only four things need to know the camera exists: the art
  kit, z-order, `fenceOver()`-derived fitting, and drag input.

### The cheap path

Every camera change in the plan coincides with the pen being empty or blurred (farm arrival
builds the fence *after* the tilt; the celebration blurs the field; every finale transition
begins with a `dropPen`). So the art kit can be **swapped outright while no fence is
visible** — no crossfade needed for phase one.

The one exception is the highest-value idea: **Farm 3's trap**. Show the 12×2 in
three-quarter, where it looks substantial because the depth is squashed away; take the
prediction; then lift the camera and it is a sliver. The student watches their own eyes be
wrong, which is what *"the misconception has to be felt to be dislodged"* was reaching for.
That beat needs a real two-layer crossfade, because the fence must stay on screen across the
tilt.

### Watch items

- Keep the tilt gentle (`rotateX(25–30°)`, `cos 30° = 0.87`). At 45° the geometry starts
  lying about areas too.
- Tilt `#ftf-field`, not `#ftf-stage` — the HUD must stay flat.
- Fit layouts at the camera the screen will **settle at**, not the instantaneous one.
- `POST.h` nearly doubles at `cam = 0` (0.594 → 0.989), so anything fitted through
  `fenceOver()` gets meaningfully tighter — the completion fit is the likeliest silent
  breakage.
- Z-order cannot be blended; threshold it at `cam = 0.5`, where the pen is nearly flat and
  overlaps are minimal.

---

# 15. Identifier glossary

| Name | Meaning |
|---|---|
| `g` | current geometry state: `{ round, perimeter, half, L, W, cell, ax, ay, Wmax, Lmax, startArea }` |
| `stats` | run state: `{ phase, bestArea, dragging, completed, grabbed, firstChange, reversals, lastDir, retries, t0, tier }` |
| `lv` | per-level state, rebuilt by `levelReset()` |
| `pens` | map of enclosures; `main`, `finA`, `finB` |
| `el` | every `#ftf-*` element, keyed without the prefix (`#ftf-area-val` → `el['area-val']`) |
| `cell` | pixels per metre for the current pasture |
| `ax` / `ay` | design-space origin of the pasture's node rectangle |
| `phase` | `title, intro, play, travel, finale, peak, formula, advanced, explain, complete, explore` |
| `noMotion()` | `prefers-reduced-motion` OR the forceable `forceReduce` |
| `after` / `afterKeep` | scripted timer (cancelled by `clearTimers()`) / housekeeping timer (not) |
| `sfx(kind)` | the single synthesised sound-effect entry point |
| `t(key)` | i18n lookup, falling back to the key |
| `track(name, data)` | analytics push |
