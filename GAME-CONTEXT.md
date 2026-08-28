# Fence the Farm — complete implementation context

A 16:9 drag-based geometry puzzle for Grades 8–10, built to land one idea: **the same
perimeter does not give you the same area.** Vanilla HTML/CSS/JS, no build step,
authored at 1280×720 and CSS-scaled to any 16:9 window.

This document describes every screen, number and behaviour in the current `lab/` build.
Every value here was read out of the running game, not from the design brief.

---

## A. The invariant everything hangs on

```
length + width === perimeter / 2
area           === length × width
```

One scalar drives the whole game. The player can only ever change `W`; `L` is derived.
Every pixel on screen — fence, cards, tracer, goat bounds — is computed from that state,
so the picture can never disagree with the number.

There is no separate "model" of the fence and "view" of the fence that could drift apart.
`setW()` asserts the invariant and the fence is rebuilt from it every time.

It is also why the goat is a fixed size in metres. If she grew as the field became
balanced, part of the "more grass" impression would come from the goat rather than from
the geometry, and the comparison the entire lesson rests on would stop being honest.

---

## B. Space and layout

Everything is authored in a fixed 1280×720 space and scaled to the window by a single CSS
transform on `#ftf-stage`: `scale(min(vw/1280, vh/720))`. Nothing else is
resolution-aware, so all coordinates below are design-space pixels.

**One cell = one metre.** `cell` is the pixels-per-metre for the current farm, chosen per
round so that *every legal shape* of that round fits clear of the HUD.

### Farm table

| # | Name | Perimeter | Start | Optimum | Mechanic | Light | Extra |
|---|------|-----------|-------|---------|----------|-------|-------|
| 1 | Discovery | 20 m | 8×2 (16 m²) | 5×5 (25 m²) | tutorial | morning | 9 gated beats |
| 2 | Farm Record | 24 m | 10×2 (20 m²) | 6×6 (36 m²) | record | midday | record 32 m² |
| 3 | Visual Trap | 28 m | 10×4 (40 m²) | 7×7 (49 m²) | misconception | evening | forced stretch 12×2 |
| 4 | Master Builder | 32 m | 13×3 (39 m²) | 8×8 (64 m²) | mastery | golden | optional target 48 m² |

Farm 1 runs at `cell = 80`.

### Legal range

```
half = P / 2
Lmax = half - 1
Wmax = min(half - 1, ceil(half / 2) + 1)
```

`W` can go down to 1, which makes shapes like 9×1 reachable — a case the goat system has
to handle explicitly (see D).

### Layout constants (`LAY`)

| Key | Value | Meaning |
|-----|-------|---------|
| `PLANK_BOT` | 104 | Bottom of the hanging instruction board. The fence may not go above this. |
| `BOTTOM` | 700 | Floor for the deepest pasture. |
| `LEFT` / `RIGHT` | 80 / 966 | Horizontal play box; the right edge clears the area card. |
| `CX` | 640 | Stage centre; pastures are centred on it. |
| `DONE_TOP` / `DONE_BOT` | 204 / 520 | The clear band the completion pasture is fitted into. |

---

## C. The fence module system

The fence is not drawn as a shape. It is a set of **modules keyed by edge and index** —
`tp:0`, `tr:3`, `rp:2`, `br:1`, `lr:0` — rather than by absolute grid position. When the
pasture is reshaped, surviving pieces keep their identity and glide to their new node
instead of being destroyed and recreated.

Each pasture has exactly **P posts and P rails**, so the module count *is* the perimeter:
`nodes.size === 2 × P`. That is a hard assertion at every shape.

### Top-down art and metrics (`MOD`)

Posts are the sawn ends of logs seen from above; rails are planks lying on the grass.
Both were cut from the supplied top-view kit and measured off it.

| Key | Value | Source / meaning |
|-----|-------|------------------|
| `LOG` | 0 | Nothing hangs above anything from directly overhead, so rails lie on the node lines. Was `144/360` in the old three-quarter view. |
| `POST.w` / `.h` | 0.594 | `td-post.png`, 265×265, square. |
| `POST.ox` / `.oy` | 0.297 | Half the box — the disc is concentric, so a post simply centres on its node. |
| `POST.wood` | 0.766 | The wood disc is 203 px inside the 265 px box; the rest is the grass collar. |
| `RAIL.h` / `VRAIL.w` | 0.30 | `td-rail-h.png`, 900×134, even thickness end to end. |

Rails are stretched one-plank-per-metre rather than tiled. That guarantees no seams and no
half-planks at corners; the grain is far too fine at these sizes for the horizontal squash
to read.

`fenceOver()` reports how far the art reaches past the node rectangle (`up`, `down`,
`side`, in cells). Every screen that has to fit a pasture into a gap reads it from there,
which is why re-cutting the art moves those layouts with it.

**Z-order** is flat: rails `210`, posts `240`, goat `300`. The old y-based depth sorting
was removed — there is no depth to sort from overhead.

---

## D. The goat

She exists in two views, and which one you see is decided by the phase, not by a call.

| View | Art | Anchor | Direction | Where |
|------|-----|--------|-----------|-------|
| plan | 3 sheets, 4×2, 1254×1254 (frame 313.5×627) | her centre | the character is **turned**, never mirrored | every farm screen |
| side | original per-file frames, 230×300 | her hooves | mirrored on X | title only, and the tilt |

The title is a portrait, not a plan. There is no fence there to establish the camera, and
a flat overhead goat alone on the grass reads as a diagram rather than as an animal worth
caring about — so she is seen from the side while the sign is up, and crosses over as the
camera comes overhead.

### Sheets

All three are 4×2, eight frames, read `0 1 2 3 / 4 5 6 7`.

| File | State | FPS | Loop | Notes |
|------|-------|-----|------|-------|
| `goat-walk.png` | walk, enter, idle, curious | 8 | yes | Idle and curious hold frame 0 — there is no idle sheet, so the calmest walk frame stands in. |
| `goat-eat.png` | eat | 6 | yes | Grass particles on frames 2 and 6. |
| `goat-bleat.png` | talk, happy | 7 | no | Sound fires on frame 2, the widest mouth. |

Frame size is always derived from the loaded image (`background-size: 400% 200%` plus a
percentage position), never hard-coded — drop in a higher-resolution sheet of the same 4×2
layout and nothing needs to change.

All three draw her facing south, so a heading is achieved by rotating the whole sprite by
`heading − 90°`. `goatSpan()` returns `GOAT_METRES × cell` directly rather than measuring
the active sheet, so which sheet is showing can never move the fence she may walk up to.

An 8-direction pose set (`goat-turning.png`) was trialled to make turns read as her body
coming round rather than the sprite spinning. It was removed: at the size she is drawn in
the field the pose changes were not legible enough to be worth the extra sheet.

### Sprite-sheet cleanup that was required

The supplied sheets carried a keyed-matte halo of near-pure red and yellow hugging the
silhouette, plus loose blobs in open space. Colour keying could not separate that matte
from her **red collar and gold bell** and destroyed both. The working fix is purely
topological: label connected components of solid pixels (alpha > 110), keep the largest
per frame, drop stranded faint pixels with no solid neighbour, erode one pixel.
7,500–21,500 px of matte removed per frame; collar and bell intact in all 24 frames.

### Geometry

| Key | Value | Meaning |
|-----|-------|---------|
| `GOAT_METRES` | 1.30 | Nose to rump. Constant — never scales with the pasture. |
| `SHEET.content` | 0.877 | How much of a frame she fills lengthwise. |
| `SHEET.aspect` | 0.5 | Frame width / height, so she is half as wide as long. |
| `SHEET.faceDeg` | 90 | The sheets draw her nose south, so the sprite is turned back 90° to sit on her heading. |
| `TILT` | 0.62 s | Time for the camera to come overhead. |

At `cell = 80` her drawn box is 59×119 px and her visible length is 104 px. She is
deliberately secondary to the geometry.

### Why she cannot leave the fence

Because she turns to face her heading, what has to fit inside the pasture is the **circle
she sweeps**, not a rectangle — so one radius does all four sides: half her length, plus
the post wood radius (a post is stouter than its rails and would otherwise catch her
shoulder), plus a little air.

A 9×1 pasture is legal and cannot contain a 1.3 m goat turning. There, `axisLock()` pins
her heading to the long axis and `penBounds()` only charges her half *width* across the
tight axis, measured against the thinner rail rather than the post.

### Behaviour

The game scripts her at most beats. Autonomous wandering only runs in the phases listed in
`WANDER` (`play`, `finale`, `complete`, `explore`), where nothing else is driving her, and
only once all three sheets have loaded.

| Config | Value | Config | Value |
|--------|-------|--------|-------|
| walk / eat / bleat FPS | 8 / 6 / 7 | idle wait | 2.0–4.5 s |
| walk speed | 35–55 px/s at a 72 px metre | bleat cooldown | 7–12 s |
| accel / decel | 0.19 s | turn rate | 620 °/s |
| min travel | 0.9 m | handle exclusion | 1.25 × her width |
| weights | walk .45 / eat .30 / bleat .15 / idle .10 | eat duration | 1.6–2.5 s |

Speeds are given at a 72 px metre and scaled with `cell`, so she covers ground at the same
rate *in metres* whatever the farm. Destinations are rejected if they are too close, or
inside an exclusion radius around the drag handle — that corner is the one thing the
student must always be able to see and grab.

**While the fence is being dragged**, the controller watches `stats.dragging` rather than
patching the drag handlers, so it cannot get out of step. On grab she stops choosing for
herself, holds position, and turns her head toward the moving corner. On release she waits
0.5–1.2 s, then resumes — walking back in if the pasture shrank around her, never
teleporting.

**Reactions:**
- *Bleat* — two small arcs beside her mouth, 620 ms. Not a speech bubble; she is an animal.
- *Eat* — 2–4 grass blades kicked up, 480 ms. Never a hole in the field.
- *Correct answer* — a hop, a 5% scale pulse, one happy bleat, three sparkles around her only.
- *Wrong attempt* — nothing punitive. She stays idle or turns curiously.

---

# Screens, in order

## 01. Boot

- **Job:** fetch every asset before anything animates.
- **Preloads:** grass, logo, the three top-down fence pieces, sign, cards, hand cursor,
  the three goat sheets, and her side-view frames.
- **Exit:** `#ftf-loader` hides when the last image settles; `titleScreen()` runs.
- **Options:** `snapGuide`, `audio`, `music`, `vo`, `debugMode`, `startRound`.

## 02. Title

- **Copy:** logo board reads *Fence the Farm*; one CSS button, *Play*. No instruction —
  the button is self-evident.
- **Composition:** board hangs on two ropes; goat centre-stage at (640, 520); button below her.
- **Goat:** **side view**, 190 px tall, hooves on the ground. Blinks on an irregular beat
  so standing still never looks like a paused image.
- **Beat loop:** looks right (950 ms) → looks left (850) → walks a few steps (1700) →
  eats (3200) → looks up (800) → bleats (1600) → walks back (1800) → idles (1500), repeat.
- **Light:** `morning`.
- **Exit:** *Play* → `startGame()`.

Returning here from *Play again* or from Explore's *Done* also tilts the camera back down,
so she becomes the portrait goat again. Coming back is a real transition, not a cut.

## 03. The tilt into the farm

One continuous world, never a cut — and a genuine change of camera.

- **Sequence:** board hauled back up its own ropes (860 ms) while the button drops away
  (380 ms); the grass settles from `scale(1.055)` to `1` over 1500 ms; she sets off at
  340 ms, so the two overlap and the eye never sees an empty stage.
- **Camera:** a single value `view`, 0 = side, 1 = overhead, eased over `TILT` = 0.62 s.
  Nothing calls for it: it follows the phase.
- **Crossover:** the side sprite is foreshortened away (`scaleY` 1 → 0.5) and slides from
  standing on the ground point to sitting over it; the plan sprite opens out of the same
  squash (`scaleY` 0.42 → 1). Both are drawn at one blended height, so the phase changing
  underneath cannot make her jump.
- **Verified:** at `view = 0.54` the two boxes converge to the same `x` and width;
  opacity 0.44 / 0.56.
- **Reduced motion:** `view` snaps; no board lift, no grass settle.

## 04. Farm 1 · Discovery

P = 20 m · 8×2 (16 m²) → 5×5 (25 m²) · cell 80 px

The only farm that teaches the interaction. It is a gated nine-beat sequence: the game
will not advance until the student has actually *done* the thing, and the numbers stay
hidden until they have been earned.

| Gate | Beat |
|------|------|
| SEE | **1.** *Give her more grass*. Goat grazes a cramped strip. 2.1 s hold. |
| SEE | **2.** Fence is built; fence value appears. Play begins. |
| TOUCH | **3.** *Drag this corner*. Handle glows and breathes; hand cursor points at it. Waits indefinitely. |
| TOUCH | **4.** Grab registered. Hint retires permanently. |
| NOTICE | **5.** First release with a larger area → *More grass — still 20 m*. She bleats. 2.2 s hold. **This is the lesson.** |
| TRY | **6.** *Can you give her even more?* Opens after 3 moves or 1 reversal. |
| TRY | **7.** *Find the biggest area*. Free play. |
| DISCOVER | **8.** 5×5 reached → *Biggest grass area!* Burst, grass puffs, side-length cards appear. |
| DISCOVER | **9–10.** Start-versus-best comparison, then *You've got it!* and *Next farm*. |

- **Skip:** *Skip tutorial* jumps to beat 7. Taught once per browser (`localStorage`
  key `ftf.tutorial`).
- **Reveal rule:** side lengths appear **after** the shape is found, not during the drag —
  during play the student reads the pasture, not numbers.

## 05. Farm 2 · Farm Record

P = 24 m · 10×2 (20 m²) → 6×6 (36 m²) · record 32 m²

- **Question:** not "what happens?" but "can you beat a number?" — *Beat the record — 32 m²*.
- **Mechanic:** a record line at 32 m². Passing it fires *New record — 33 m²* with the real
  area substituted. It fires on a genuine beat only, never on re-crossing.
- **Copy beats:** *Push it further.* → *Record smashed!*
- **Light:** `midday`. Music steps up a tier.

## 06. Farm 3 · Visual Trap

P = 28 m · 10×4 (40 m²) → 7×7 (49 m²) · forced stretch 12×2

The only farm that deliberately sends the student the wrong way first, because the
misconception has to be *felt* to be dislodged.

- **Phase 1:** *Stretch it longer*. The game asks for 12×2 — longer, and worse (24 m²).
- **The flip:** on reaching the stretch target: *Longer field. Less grass.* A pause, then
  the instruction changes to *Now find the most grass*.
- **Phase 2:** free play to 7×7. *Better. Can you do more?* on partial progress.
- **Resolution:** *Longer wasn't more grass.* Their own longest shape is remembered for the finale.
- **Light:** `evening`.

## 07. Farm 4 · Master Builder

P = 32 m · 13×3 (39 m²) → 8×8 (64 m²) · optional 48 m²

- **Question:** no scaffolding. The student is expected to know what to do.
- **Bonus:** *Make exactly 48 m²* opens once they are close, and completes at exactly 48 —
  a target that is *not* the maximum, which proves they can aim rather than just maximise.
- **Nudges:** tiered — tier 1 she walks, tier 2 she looks curious, tier 3 she bleats. She
  glances at the area card instead of the game telling them.
- **Copy:** *Master build.* then *See the proof*.
- **Light:** `golden`. Music tier 4.

## 08. Finale · Compare builds

- **Job:** put the start shape and the best shape side by side, at **the same metre** and
  on one shared ground line, so the only difference the eye can find is the shape.
- **Composition:** two pastures, `finA` (left, *Start build*) and `finB` (right, *Best
  build*). Each carries its own fence value — identical, which is the point.
- **Goat:** lives in `finB`, grazing the roomier field.
- **Exit:** *See the proof* → the tracer.

## 09. Finale · The perimeter tracer

The single most important animation in the game.

A measuring light walks both perimeters at the same speed. Both runs are the same length,
so they finish together — **that simultaneity is the proof** that the fence never changed.

- **Implementation:** SVG `rect` per run with `pathLength` normalised to P, driven by
  `stroke-dashoffset` P → 0 over 1900 ms linear. Same duration, same normalised length.
- **Layers:** three stacked rects per run sharing one dash animation — a 36 px
  `blur(10px)` amber bloom at 0.8 opacity, a 14 px dark-brown casing, and a 7 px
  near-white core (#FFFDF4) with three warm drop-shadows.
- **Position:** follows the node rectangle exactly, because `MOD.LOG = 0`. In the old
  three-quarter art it had to be lifted onto the rail line.
- **Ticks:** a measuring tick every 2 m, so the count is audible as well as visible.
- **Exit:** bloom fades; the grass reveal follows 700 ms later.

White-on-amber is the only pairing that holds contrast against both brown wood and green
grass — the earlier single gold stroke was invisible against both.

## 10. Finale · Grass reveal and the peak curve

- **Grass reveal:** the two areas are filled and counted, so "same fence" is immediately
  followed by "different grass".
- **Peak climb:** the pasture is re-shaped from the student's own start shape up through
  every step to the optimum, and the area value climbs with it — the climb is theirs, not
  a canned animation.
- **Curve:** an area-versus-length curve is drawn under the climb with a token riding it,
  peaking at `L = 8 · W = 8 · A = 64`. This is the moment the shape of the relationship appears.
- **Strategy card:** *Strategy discovered — Balanced sides → most area*, qualified
  honestly: *with the same rectangular perimeter*.
- **Goat:** happy bleat and a hop at the peak; emblem assembles rather than popping.

## 11. Formula

- **Job:** name the two quantities the student has been feeling, and separate them.
- **Content:** *Fence around the outside* (perimeter) versus *Grass inside* (area), then
  the claim in three blocks: *Fixed perimeter* — *does not mean* — *Fixed area*.
- **Tracer:** re-used for a single pasture, 1300 ms, to tie "perimeter" to the thing they
  just watched being measured.
- **Exit:** *See why* (optional algebra) or *Continue*.

## 12. See why · optional algebra

- **Audience:** opt-in. The lesson is complete without it.
- **Content:** the meter they were already reading becomes a real graph: `L + W = 16`,
  *half of the 32 m fence*, and *The path you dragged was this curve.*
- **Why it works:** the curve is not new information — it is the same drag they performed,
  re-plotted. That is the whole design.
- **Exit:** *Continue* → completion.

## 13. Completion

- **Copy:** badge board *Master builder* / *Same fence. Smarter shape.* Footer *4 farms
  completed*, then *Play again* and *Explore*.
- **Composition:** the winning 8×8 pasture is rebuilt centre stage with the same
  sink-and-rise used between farms, so the world stays continuous. Cell is fitted to the
  clear band and lands near 36.8 px.
- **Goat:** grazes the finished field.
- **Verified:** 14 px clear of the board above, 12 px clear of the footer below.

## 14. Explore · sandbox

- **Job:** no win condition, no target. *Pick a fence*, then a free hand.
- **Perimeters:** 16, 20, 24, 28, 32, 40 m. Each starts deliberately unbalanced so there
  is something to find. All six verified for invariant and module count.
- **Numbers:** side lengths are shown here, unlike during taught play — the student has
  earned them.
- **Exit:** *Done* → title, which tilts the camera back down.

---

## E. Audio

Synthesised through one `AudioContext` — no audio library, no per-sound files except the
goat samples. Music is layered: one gain per layer, and `musicTier()` opens and closes
them, so the score grows across the four farms rather than switching tracks.

| Group | Examples | Notes |
|-------|----------|-------|
| fence | `fence_post_rise`, `fence_rail_extend`, `fence_snap` | Construction patter, thinned so a whole fence does not become noise. |
| handle | `handle_grab`, `handle_release`, wood creak | Creak fires once per drag, past a 0.22 m intent threshold. |
| success | `success_chord`, `record_success`, `area_up` | |
| goat | `bleat`, `bleat_happy`, grazing, hooves | Real samples. Bleat fires on the peak mouth frame, 7–12 s cooldown. |
| ambience | birds | Occasional, randomised. |

Voice-over is a hook only. Recordings were not supplied, so `vo()` fires at the right beat
and is logged; it speaks only with `?vo=1`, using browser TTS. Synthetic speech is off by
default, on purpose.

## F. Accessibility

- **Keyboard** — the handle is focusable and steps `W` with arrow keys; every button has a
  visible focus ring.
- **Screen reader** — the handle carries `aria-valuenow` and a label; a polite live region
  announces each shape and area.
- **Reduced motion** — respected via `prefers-reduced-motion` and forceable. Autonomous
  wandering stops, the camera tilt snaps, hops and particles are suppressed, module glides
  are disabled, and holds are lengthened so nothing is missed. A full round completes.
- **Pointer** — the goat is `pointer-events: none` and can never intercept a drag.
- **Localisation** — every visible string is keyed with `data-i18n`;
  `window.ftfSetLocale(dict)` swaps a translation in at runtime.

## G. Debug and telemetry

A 20-state navigator jumps straight to any beat: *Start, Fence Intro, L1 Idle / Drag /
Wrong A / Wrong B / Success, L2 Record / New rec / Success, L3 Stretch / Flip / Success,
L4 Mastery / Bonus, Final Compare, Final Peak, Formula, Advanced, Completion, Explore.*
Without `debugMode` it is never built, not merely hidden.

`GOAT_DEBUG` is a separate constant that overlays her state, target, heading, speed and
safe box. Dead code unless deliberately switched on.

Every meaningful beat pushes an event to `window.__ftfAnalytics`: `first_handle_grab`,
`time_to_first_drag`, `round_completed`, `tutorial_skipped`, `explore_set`,
`game_completed`.

---

## H. Known gaps — the honest places to improve

| Gap | Status | Detail |
|-----|--------|--------|
| Voice-over | hook only | No recordings supplied. Ten lines are written and fire at the right beats. |
| Goat idle richness | partial | The plan sheets have no blink or tail-flick frames, so plan-view idle is a held frame plus a 1–2 px breath. The side view does blink. |
| Bleat arc shape | partial | The supplied bleat sheet is not a clean neutral→open→neutral arc; frames 2 and 6 are both wide open. Sound fires on 2. |
| Post decoration repeats | cosmetic | Every post disc carries the same pebble and flower at the same rotation. A per-node rotation would break the pattern; not yet done because the rise animation owns the transform. |
| 9×1 pastures | handled | She locks to the long axis and clears by ~1 px. Tight by construction, not by accident. |
| Osmose font | licensing | Trial font. Needs replacing or licensing before release. |
| Lost source art | unrecoverable | `hand.png` and `touch.svg` are no longer in the repo, so the drag-hint cursor cannot be re-cut from source. |
| Frame-exact timing | unverifiable | Headless Chrome does not advance rAF or CSS transitions under virtual time, so the tilt and the 2.1 s holds are verified numerically by pumping the controller, not by frame capture. |

### Bugs fixed in this pass, with the numbers

1. **Side-length cards leaked onto the title.** Explore → *Done* calls `titleScreen()`,
   which never hid them, so an `8 m` card and a clipped `m` hung over the logo. 1/1 → 0/0.
2. **Badge board covered the fence on completion.** `cell = 40, ay = 196` was hard-coded;
   post tops landed at y=162.7 while the board ends at y=190 — **27.3 px of fence hidden**,
   including the whole top rail. Now `fitPen()` derives the cell from the fence art and the
   clear band. 14 px / 12 px clearance.
3. **DOM leak (pre-existing).** Retired modules were removed by `after(210, …)`;
   `clearTimers()` runs on every phase change and cancelled exactly those timers, so a fast
   reshape stranded **33 nodes permanently**, some still visible. Cleanup now uses
   `afterKeep()`, a timer list `clearTimers()` cannot touch. 33 → 0. The grass `puff()`
   particles had the same bug.
4. **Goat stood on the fence.** Padding was budgeted from `GOAT_METRES × cell` but she was
   drawn at a clamped 58 px minimum, so the two disagreed. Worst clearance across all 30
   legal shapes was **−30.2 px**. Both now derive from one `goatBox()` call. Worst case
   **+1.2 px** at farm 4, 15×1.
5. **Perimeter tracer invisible and mispositioned.** A single 5 px gold stroke with a
   same-hue glow, pinned to the node line while rails hung 0.4 m higher. Now three layers
   and `LOG = 0`.
6. **`finaleTraceOne()` latent bug.** It unconditionally parked `trace-b`, so calling it
   *for* `trace-b` would have zeroed its own width. Only `trace-a` is ever passed, so it
   never fired in play.
7. **Module glides ignored reduced motion.** The `left`/`top` transition was set
   unconditionally.

### QA status

22 of 22 automated checks pass: the invariant across 30 shapes, module count = 2P, area
readout, fence on stage, goat never touching the fence, no HUD collision, every screen
rendering, all six explore perimeters, completion fit, card leakage, the tilt in both
directions, all three sheets loading, a reduced-motion round, zero orphaned DOM nodes, and
zero JS errors.

---

## Repository

```
/
  index.html            launcher: Play / Lab
  game/                 frozen reference build — do not edit
  lab/                  active build; all work happens here
    index.html
    css/style.css
    js/game.js          core engine, geometry, fence modules, input, rounds
    js/levels.js        per-farm mechanics and the tutorial beat machine
    js/finale.js        comparison, tracer, peak, formula, completion, explore
    js/goat.js          GoatController + the prototype adapters
    js/audio.js         synthesised SFX and layered music
    js/debug.js         20-state navigator
    js/i18n.js          string harvesting and runtime locale swap
    js/main.js          boot
    assets/art/         fence, HUD, side-view goat frames
    assets/goat/        goat-walk.png, goat-eat.png, goat-bleat.png
  vercel.json           cleanUrls + cache headers
  .vercelignore         drops source art at deploy time
```

`js/goat.js` and the other modules extend the prototype via
`Object.assign(FenceTheFarm.prototype, {…})` and are loaded after `game.js`, before
`main.js`.

**Deployment trap:** the goat sprite frames and everything in `assets/audio/` are
referenced by name at runtime (`'assets/art/' + name + '.png'`), so a text search of the
source reports them as unused. They must never be added to `.vercelignore`.
