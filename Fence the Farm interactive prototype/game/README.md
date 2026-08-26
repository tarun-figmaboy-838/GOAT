# Fence the Farm

A 16:9 educational strategy puzzle for Grades 8–10. The player gets a fixed
amount of fence and drags **one corner** of a rectangular pasture. When one side
grows, another must shrink. The perimeter never changes; the enclosed area does.

**Same perimeter ≠ same area.**

## Run it

Open `index.html`. No build step, no bundler, no npm — plain HTML, CSS and
vanilla JavaScript. A static server is nicer for font caching but not required:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

## Structure

```
game/
  index.html          markup for every screen
  css/
    style.css         all layout, materials, keyframes and interactive states
  js/
    game.js           core: geometry, fence modules, input, round scaffolding
    levels.js         the four level mechanics, incl. the nine-beat tutorial
    finale.js         the recap, the interactive peak, the formulas, Explore
    goat.js           goat state machine, sprite clips, pathfinding
    audio.js          recorded goat SFX, synthesised UI SFX + adaptive music
    i18n.js           string dictionary harvested from the data-i18n keys
    debug.js          debug navigator (never built in production)
    main.js           bootstrap and runtime options
  assets/
    art/              fence modules, goat frames, signage, grass
    fonts/            Osmose display font (trial build — confirm licensing)
```

`audio.js`, `goat.js`, `levels.js`, `finale.js`, `i18n.js` and `debug.js` all
extend `FenceTheFarm.prototype`, so they must load after `game.js` and before
`main.js`. `index.html` already does that.

## Four farms, four questions

The same interaction each time; a different question each time. That is the
point — it is deliberately *not* four rounds of "drag until square".

| # | Farm | Fence | Start | Best | The question |
| --- | --- | --- | --- | --- | --- |
| 1 | **Discovery** | 20 m | 8 × 2 = 16 | 5 × 5 = 25 | What happens when I reshape the field? |
| 2 | **Farm Record** | 24 m | 10 × 2 = 20 | 6 × 6 = 36 | Can I beat 32 m²? Then how far can I push it? |
| 3 | **Visual Trap** | 28 m | 10 × 4 = 40 | 7 × 7 = 49 | Does making it *look* longer give more grass? |
| 4 | **Master Builder** | 32 m | 13 × 3 = 39 | 8 × 8 = 64 | Can I find the best shape with no help at all? |

- **Level 2** hangs a record board at 32 m². Matching it does nothing; passing
  it flips the board to *New record!* and re-opens the goal — the level does not
  end there. 6 × 6 gets *Record smashed!*
- **Level 3** asks the player to perform the misconception: the challenge board
  reads **Stretch it longer**. When they reach 12 × 2 the music thins out, the
  goat looks around the narrow pasture, and the board physically turns over to
  **Now give her the most grass**. The recap then compares against *their own*
  longest shape, not the level's start.
- **Level 4** shows nothing but the fence value, the area and the pasture. After
  ~13 s with no improvement the number pulses once and the goat glances at it.
  Reaching 8 × 8 opens an optional **Bonus: make exactly 48 m²** (12 × 4) that
  never blocks the way on.

Reaching the best shape always completes a farm, whichever route the player
took. No mechanic ever refuses a legal move.

## The tutorial (level 1)

Nine gated beats — **SEE → TOUCH → NOTICE → TRY → DISCOVER**. Nothing advances
on a timer where the interaction *is* the point: it waits for the first grab,
the first shape change, some experimenting, and the best shape.

1. She walks in, eats, looks at the player, bleats. Plank: *Give her more grass*
2. The fence builds. `Fence 20 m` slides in and pulses **once**, then is silent
3. Only the bottom-right post lights up. Plank: *Drag this corner*. **Waits.**
4. On grab the hand goes for good; waits for the first gain
5. *More grass — still 20 m of fence*
6. *Can you give her even more?* — free play, the mistake invited
7. *Find the biggest grass area* — no hand, no arrows
8. 5 × 5: *Biggest grass area!*
9. The recap
10. *You've got it! Same fence, more grass.* → **Next farm**

Only one thing pulses at a time (goat → fence value → handle → area), enforced
by `pulseOnly()`. Once level 1 has been completed on a browser, a small
**Skip tutorial** chip appears during the opening beats.

## The recap — every farm ends the same way

Instead of a panel of text, the shape the player *started* with is rebuilt on
the grass beside the shape they *found* — at the same metres-per-pixel and on
one shared ground line. A gold tracer then walks both perimeters at one speed.
Both runs are the same length, so **they finish together**: that is the proof,
not a caption. Only then does the grass inside each one count up.

The fences do the explaining. `compareBuilds()` in `finale.js` serves all four
farms and the game's ending.

## The finale

The game's own ending is that same recap, then an interactive proof:

- **The peak.** The fence comes back to the middle and the player drags again,
  with a thin golden **performance meter** behind the number — no axes, no grid.
  The whole hill is plotted, so the peak is visible as a peak and the token
  falls when they push past it. `AREA HAS A MAXIMUM` is discovered, not stated.
  At 8 × 8 an emblem assembles: *Strategy discovered — balanced sides → most
  area*, with the quiet qualifier *with the same rectangular perimeter*.
- **The formulas**, resolving on the field that is still standing: a line
  travels the fence for `P = 2(L + W) → 2(8 + 8) → 32 m`, then the grass lights
  up for `A = L × W → 8 × 8 → 64 m²`, then **FIXED PERIMETER does not mean
  FIXED AREA**.
- **See why** (optional). The fence sinks away and the meter the player was
  already reading grows axes and becomes a real graph of `A = L(16 − L)`. The
  field literally becomes the mathematics.
- **Completion**: *Master builder — same fence, smarter shape.*
- **Explore**: a sandbox with six fence lengths and no win condition.

## Mathematics

One scalar drives everything. For perimeter `P` the invariant is
`length + width === P / 2`, and `area === length * width`. Every pixel is
derived from that state, so the picture can never disagree with the number —
and `setW()` asserts the invariant on every change.

The enclosure is built from `P` posts and `P` rails, one of each per metre, so
the module count *is* the perimeter. Modules are keyed by **edge and index**,
never by absolute grid position, so when the shape changes the surviving pieces
keep their identity and glide; only the pieces that genuinely joined or left
are animated. That is what makes the transfer read as *moving material* rather
than redrawing a rectangle.

The drag range runs one metre past the square, so the area is seen to fall away
on **both** sides of the balance point.

## Art

Every piece is drawn at its own natural aspect from measurements in `MOD` and
the sign metrics in `style.css`, so no artwork is ever stretched to fit.

- **post.png** meets the ground at `y = 300/356`; one per node.
- **rail-h.png** is the front run, a seamless tile, two to a metre.
- **rail-v.png** is the depth run, cut from the supplied depth-fence art
  (`verticalfence (3) 16.png`), mirrored so it tiles seamlessly along its
  length, and tone-corrected toward the front rails so all four sides read as
  one timber.
- **plank-l / plank-m / plank-r** are three slices of the supplied panel art
  (`pannel.png`): a rope-and-straw cap at each end and a middle that tiles.
  The sign shrink-wraps its text, so a short instruction and a long one both
  sit on **one line** and the board simply grows. Both caps carry the same
  straw border *and* the same slice of the cream board — the artwork's own
  board is not centred in its frame, which is why that matters.
- **card.png** is the supplied counter art, used for the fence readout.
- **title-logo.png** is the hanging title sign; it drops in from above the
  frame and settles on its ropes.
- **Buttons are CSS**, built from the PLAY sprite's own sampled palette
  (`#FCD202 / #FB8302 / #EF5000 / #EB2201`) so every button in the game belongs
  to one set.

Layout is derived, not hand-placed. `layout()` sizes the metre so the deepest
*and* widest legal pen of the round fit between the sign and the floor, landing
the opening pasture at 45–55 % of the stage width. That is what guarantees the
fence never reaches a piece of UI, whatever the player does with it.

Levels differ by **light**, never by clutter: morning, midday, late afternoon
and golden hour grade the grass and lengthen the module shadows.

## Hierarchy

Two live quantities, deliberately unequal. `Fence 20 m` is small, quiet,
top-right, and never animates while dragging. The area is the hero: 72 px on
the dry-grass card, low and right of the pasture — outside the whole legal
sweep of the drag handle — and it reacts on the same frame as the fence.

## Audio

Goat footsteps, grazing and bleats use the recordings in `assets/audio`; their
volumes, fades and playback lifetimes follow the goat state so long clips do not
leak into the next animation. Fence and interface cues remain synthesised. The
names in `audio.js` are the design's own SFX library (`fence_post_rise`,
`fence_rail_retract`, `handle_grab`, `area_up`, `record_break`,
`challenge_flip`, `success_chord`, `goat_bleat_happy`, …). Music is **one
adaptive track** at 88 BPM whose layers
— pad, plucks, brushed percussion, bells — open up with the player's progress
and strip back for the level 3 pause.

**VO is a hook, not a voice.** The lines exist in `VO` in `game.js` and fire at
the right beats, but synthetic speech is off by default; `?vo=1` routes them to
the browser's own voice for testing.

## Accessibility

The drag handle is focusable; Right/Up and Left/Down step one legal state. Its
hit region is 104 × 124 px, well past the 72 × 72 minimum. Every area change is
announced through a polite live region as *Grass area 21 square metres.*
`prefers-reduced-motion` removes the ground pops, the overshoot and the
celebration while keeping every immediate state change.

## Options

Set in `js/main.js`, or at runtime with `game.setOption(key, value)`:

| key | values | meaning |
| --- | --- | --- |
| `snapGuide` | `On drag` (default), `Always`, `Never` | one-metre guide |
| `audio` | `true` / `false` | all SFX |
| `music` | `true` / `false` | ambience and the adaptive track |
| `vo` | `true` / `false` | speak the VO lines (also `?vo=1`) |
| `debugMode` | `true` / `false` | debug navigator (also `?debug=1`) |
| `startRound` | `1`–`4` | opening farm (also `?round=3`) |

## Debug navigator

Open with `?debug=1`, then press **D**. It jumps to every state in the flow —
Start, Fence Intro, L1 Idle/Drag/Wrong A/Wrong B/Success, L2 Record/New rec/
Success, L3 Stretch/Flip/Success, L4 Mastery/Bonus, Final Compare, Final Peak,
Formula, Advanced, Completion, Explore — sets the four lights, toggles motion,
the metre grid and a dimension overlay, clears the tutorial flag, and runs
**Sweep states**, which steps every legal shape of the round and verifies that
the drawn rectangle, the module counts, the pixels-per-metre on both axes and
the printed number all agree.

Last verified: **30 legal states across the four farms, 0 mismatches**, and a
full playthrough — title → 4 farms → recap → peak → formulas → algebra →
completion → Explore → title — with **no errors**.

Without `debugMode` the navigator is not merely hidden: it is never built.

## Localisation

Every visible string carries a `data-i18n` key. `game.dict` is the harvested
English dictionary; `window.ftfSetLocale({ ... })` swaps a translation in at
runtime. No text is baked into the artwork except the title logo and the
supplied PLAY sprite (the title keeps a visually hidden `<h1>` for both screen
readers and translation).

## Analytics

Gameplay events queue on `window.__ftfAnalytics` — `round_started`,
`tutorial_beat`, `tutorial_skipped`, `first_handle_grab`, `time_to_first_drag`,
`first_drag_direction`, `new_best_area`, `area_decrease`, `suboptimal_release`,
`hint_shown`, `record_broken`, `stretch_reached`, `bonus_completed`,
`optimal_area_reached`, `round_completed`, `recap_started`, `peak_found`,
`formula_revealed`, `advanced_revealed`, `explore_set`, `game_completed`.
Nothing personal is recorded.

## Supplied source art

`banner.png`, `pannel.png`, `counter.png`, `play button sprite.png` and
`verticalfence (3) 16.png` are the originals. None is loaded at runtime; they
are kept so the derived assets can be recut. The scripts that cut them measured
the artwork rather than assuming it — worth repeating if the source changes.
