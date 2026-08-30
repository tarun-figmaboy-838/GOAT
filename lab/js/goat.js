/* ============================================================================
   FENCE THE FARM — the goat

   The farm is drawn from directly overhead, and so is she: three supplied
   sheets (walk, eat, bleat), each 4 columns by 2 rows, each frame a plan view
   of the same baby goat. Because the view is a plan, she is not mirrored to
   change direction - the whole character is turned to face where she is going,
   which is the only way to change heading without leaving the top view.

   Two rules shape everything below.

   She never crosses a fence. Her safe area is derived from the pen that is
   live right now and from the size she is actually drawn at, never from a
   guessed padding - and because she turns, the clearance she needs is a radius,
   not a pair of margins, so a turn can never push her shoulder through a rail.

   She never changes size with the shape of the pen. She is GOAT_METRES long and
   stays that long: if she grew as the field became balanced, part of the "more
   grass" impression would come from the goat instead of from the geometry, and
   the comparison the whole game rests on would stop being honest.

   The game scripts her at most beats - walk here, graze there, look up now -
   so the autonomous wandering in chooseNextBehaviour only runs in the phases
   listed in WANDER, where nothing else is driving her.
   ========================================================================== */

/* Every number the character behaves by, in one place. */
const GOAT_CONFIG = {
  columns: 4, rows: 2, frames: 8,

  walkFPS: 8, eatFPS: 6, bleatFPS: 7,

  minWalkSpeed: 35, maxWalkSpeed: 55,        // px per second, at a 72px metre
  enterSpeed: 210,                           // her scripted walk-on is brisker
  accel: 0.19,                               // seconds to reach walking speed
  turnRate: 620,                             // degrees per second, smoothed

  idleMin: 2000, idleMax: 4500,
  bleatCooldownMin: 7000, bleatCooldownMax: 12000,
  eatMin: 1600, eatMax: 2500,
  bleatMs: 1000,
  settleMin: 500, settleMax: 1200,           // the pause after eating

  minTravel: 0.9,                            // metres; shorter walks are pointless
  handleClear: 1.25,                         // exclusion radius, in goat widths

  probabilities: { walk: 0.45, eat: 0.30, bleat: 0.15, idle: 0.10 }
};

/* Set true to draw the state, target, safe box and heading over the field. */
const GOAT_DEBUG = false;

Object.assign(FenceTheFarm.prototype, {

  /* ------------------------------------------------------------- the art --
     Measured off the supplied sheets. Frame size is always derived from the
     loaded image rather than written down, so replacing a sheet with a higher
     resolution one of the same 4x2 layout needs no code change.
       content   how much of a frame the goat actually fills, lengthwise
       aspect    frame width / frame height, 313.5 / 627
     The sheets draw her head-down the frame, so her nose points south and a
     heading of due east needs the sprite turned back by a quarter turn. */
  SHEET: { content: 0.877, aspect: 0.5, faceDeg: 90 },
  CLIPS: {
    walk:  { src: 'assets/goat/goat-walk.png',  fps: GOAT_CONFIG.walkFPS,  loop: true },
    eat:   { src: 'assets/goat/goat-eat.png',   fps: GOAT_CONFIG.eatFPS,   loop: true },
    bleat: { src: 'assets/goat/goat-bleat.png', fps: GOAT_CONFIG.bleatFPS, loop: false }
  },
  /* Which sheet, and which frame of it, each game state is drawn from. There is
     no idle sheet, so idle borrows the calmest walking frame - all four hooves
     down - and is held still while procedural breathing does the living. */
  STATE_ART: {
    idle:    { clip: 'walk',  hold: 0 },
    curious: { clip: 'walk',  hold: 0 },
    enter:   { clip: 'walk' },
    walk:    { clip: 'walk' },
    eat:     { clip: 'eat' },
    talk:    { clip: 'bleat' },
    happy:   { clip: 'bleat' }
  },
  /* Her title-screen self, from the original side-view frames. The title is a
     portrait and not a plan: there is no fence there to establish the camera,
     and a flat overhead goat alone on the grass reads as a diagram rather than
     as an animal to care about. So she is seen from the side while the sign is
     up, looks at the player, and crosses over to the plan view as the camera
     tilts into the farm. The frames are the ones the game already shipped. */
  SIDE: {
    aspect: 0.767,                     // idle-0.png is 230 x 300
    titleH: 190,                       // her size on the title, where no metre exists
    clips: {
      idle:    ['idle-0'],
      curious: ['idle-2'],
      enter:   ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'walk-5', 'walk-6', 'walk-7'],
      walk:    ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'walk-5', 'walk-6', 'walk-7'],
      eat:     ['graze-0', 'graze-1', 'graze-1', 'graze-2', 'graze-3', 'graze-2'],
      talk:    ['bleat-0', 'bleat-1', 'bleat-2', 'bleat-1'],
      happy:   ['bleat-1', 'bleat-2', 'idle-2', 'bleat-1']
    },
    rate: { enter: 0.10, walk: 0.115, eat: 0.30, talk: 0.16, happy: 0.17 }
  },
  /* Seconds for the camera to come overhead. Slow enough that the player SEES
     her change from the portrait to the plan view while she walks - the
     crossover is the transition, so it must be watchable, not subliminal. It
     still finishes before the first fence post rises. */
  TILT: 1.05,
  BLEAT_PEAK: 2,                       // the widest mouth in the bleat sheet
  GOAT_METRES: 1.30,                   // nose to rump
  /* Phases where she is free to wander; elsewhere the game is scripting her. */
  WANDER: { play: true, finale: true, complete: true, explore: true },

  /* ====================================================== the controller == */
  goatInit() {
    if (this._goatC) return this._goatC;
    this._goatC = new GoatController(this);
    return this._goatC;
  },

  /* -------------------------------------------------------------- sizing --
     Her sprite box in px. Everything else - the safe area, the exclusion
     radius, the debug overlay - is derived from this one call, so the size she
     is drawn at and the room she is given can never disagree. That split is
     what used to let her stand on a rail: the old code budgeted for
     GOAT_METRES * cell but drew her at a clamped minimum. */
  goatBox() {
    const p = this.activePen();
    if (this.stats.phase === 'title' || !p || !p.cell) {
      const h = this.stats.phase === 'title' ? this.SIDE.titleH : 120;
      return { h: h, w: h * this.SHEET.aspect, cell: h / (this.GOAT_METRES / this.SHEET.content) };
    }
    const h = p.cell * this.GOAT_METRES / this.SHEET.content;
    return { h: h, w: h * this.SHEET.aspect, cell: p.cell };
  },
  goatHeight() { return this.goatBox().h; },
  /* Her length on the grass, which is the diameter she sweeps when she turns.
     Stated from GOAT_METRES rather than from a sheet, so which sheet happens to
     be showing can never move the fence she is allowed to walk up to. */
  goatSpan() {
    const p = this.activePen();
    if (this.stats.phase === 'title' || !p || !p.cell) return this.goatBox().h * this.SHEET.content;
    return this.GOAT_METRES * p.cell;
  },

  /* --------------------------------------------------------- safe ground --
     She turns to face her heading, so what has to fit inside the fence is a
     circle around her centre, not a rectangle. One radius therefore does all
     four sides, and no heading can ever put her through a rail.

     The radius is her half length, plus the radius of the post wood - a post is
     stouter than its rails and would otherwise catch her shoulder - plus a
     little air so she is never seen touching the fence. */
  /* Air between her and the fence: a fraction of the metre, but never less than
     a few real pixels. The fraction alone left about ONE pixel of daylight in
     the tightest legal pasture - mathematically inside the fence, but it reads
     as standing on it. The pixel floor guarantees visible daylight at every
     cell size, and it does so without ever changing her size. */
  goatAir(cell) { return Math.max(0.05 * cell, 5); },
  /* What she needs on a side she may turn on: half her length, the post disc
     (stouter than its rails, and it would otherwise catch her shoulder), air.
     One definition, so penBounds and axisLock can never disagree about it. */
  goatTurnPad(p) {
    const M = this.MOD;
    return this.goatSpan() / 2 + M.POST.w * (M.POST.wood || 1) / 2 * p.cell + this.goatAir(p.cell);
  },
  penBounds(p, L, W) {
    const M = this.MOD, c = p.cell;
    const halfWid = this.goatSpan() / 2 * this.SHEET.aspect;   // half as wide as long
    const rail = M.RAIL.h / 2 * c;                             // a plank is much thinner

    /* Turning freely costs her half LENGTH on every side, because what has to
       fit is the circle she sweeps. A pasture can be legally too narrow for
       that - 9 by 1 is a shape the player can make - and there she keeps to the
       long axis instead: across that axis she only needs her half WIDTH, and
       only a rail is in the way there, never a post. Locking her heading is the
       other half of the deal, and axisLock does it. */
    const turnPad = this.goatTurnPad(p);                 // face any way at all
    const flatPad = halfWid + rail + this.goatAir(c);    // room only for her flank
    const freeX = L * c >= 2 * turnPad, freeY = W * c >= 2 * turnPad;

    // Along the axis she walks, she always needs her half length. Across a
    // tight axis, her half width is enough - and only if the other axis is
    // roomy enough for her to lie along it in the first place.
    const padX = (freeX || !freeY) ? turnPad : flatPad;
    const padY = (freeY || !freeX) ? turnPad : flatPad;

    const x0 = p.ax + padX, x1 = p.ax + L * c - padX;
    const y0 = p.ay + padY, y1 = p.ay + W * c - padY;
    const cx = p.ax + L * c / 2, cy = p.ay + W * c / 2;
    // Still too small on an axis: stand her on its centre line rather than let
    // her drift out of the pasture altogether.
    return [
      x1 < x0 ? cx : x0, x1 < x0 ? cx : x1,
      y1 < y0 ? cy : y0, y1 < y0 ? cy : y1
    ];
  },
  /* Which way she is allowed to face in the pasture she is in: a pen too narrow
     to turn around in pins her to its long axis. Returns 'x', 'y' or null. */
  axisLock() {
    const p = this.activePen();
    if (!p || !p.cell) return null;
    const L = (p === this.pens.main) ? this.g.L : p.L;
    const W = (p === this.pens.main) ? this.g.W : p.W;
    if (!L || !W) return null;
    const turnPad = this.goatTurnPad(p);
    const c = p.cell;
    const freeX = L * c >= 2 * turnPad, freeY = W * c >= 2 * turnPad;
    if (freeX && freeY) return null;
    if (freeX) return 'x';
    if (freeY) return 'y';
    return L >= W ? 'x' : 'y';
  },
  /* Whichever enclosure she is living in right now. */
  activePen() {
    const b = this.pens.finB;
    if (b && b.L && b.W && this._goatPen === 'finB') return b;
    const a = this.pens.finA;
    if (a && a.L && a.W && this._goatPen === 'finA') return a;
    const m = this.pens.main;
    return (m && m.cell) ? m : null;
  },
  bounds() {
    const idle = [566, 716, 512, 526];
    if (this.stats.phase === 'title') return idle;
    const p = this.activePen();
    if (!p) return idle;
    const L = (p === this.pens.main) ? this.g.L : p.L;
    const W = (p === this.pens.main) ? this.g.W : p.W;
    if (!L || !W) return idle;
    return this.penBounds(p, L, W);
  },

  /* ------------------------------------------------------------- the API --
     Kept exactly as the rest of the game already calls it. The states are the
     game's vocabulary; the controller maps them onto the three sheets. */
  setGoat(s) {
    const G = this.goat;
    if (G.state === s) return;
    G.state = s; G.frame = 0; G.ft = 0; G.st = 0;
    this.goatAudioState(s);
    if (s === 'talk' || s === 'happy') G.bleatFrom = -1;      // arm the peak sound
    if (s === 'happy') { G.wig = 1; this.goatInit().celebrate(); }
    if (s === 'walk' || s === 'enter') this.goatInit().startWalk();
    if (s === 'eat') this.goatInit().startEating();
    this.goatInit().applyClip();
  },
  /* Called whenever the pasture changes. She is leashed to just inside the new
     fence and then walks the rest of the way in of her own accord, which reads
     as her noticing the change rather than being teleported by it. */
  moveGoatInside(instant) {
    const G = this.goat, b = this.bounds();
    G.h = this.goatHeight();
    const cx = Math.max(b[0], Math.min(b[1], G.x)), cy = Math.max(b[2], Math.min(b[3], G.y));
    if (cx === G.x && cy === G.y) return;
    if (instant || this.noMotion() || this.stats.phase === 'title') {
      G.x = cx; G.y = cy; G.tx = cx; G.ty = cy; return;
    }
    const slack = 0.5 * (this.pens.main.cell || 60);
    G.x = Math.max(b[0] - slack, Math.min(b[1] + slack, G.x));
    G.y = Math.max(b[2] - slack, Math.min(b[3] + slack, G.y));
    G.tx = cx; G.ty = cy;
    if (G.state !== 'walk' && G.state !== 'enter' && G.state !== 'happy') this.setGoat('walk');
  },
  /* The journey between farms: her legs move and her feet stay. The ground is
     what is travelling, so if she also translated she would out-walk it and
     arrive at the next farm somewhere off the right of the screen. She faces
     due east, into the walk. */
  goatTravel(on) {
    const C = this.goatInit();
    C.travelling = !!on;
    if (on) {
      this.setGoat('walk');
      C.wantHeading = 0;
      C.heading = 0;
    } else {
      C.speed = 0;
      this.setGoat('idle');
    }
  },
  /* Mastery farm nudge: she glances at the number instead of being told. */
  lookAtArea() {
    this.goat.lookAt = [1140, 480];
    this.setGoat('curious');
  },

  /* ------------------------------------------------------------- runtime -- */
  loop() {
    let last = performance.now();
    const step = now => {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.goatTick(dt);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },
  goatTick(dt) { this.goatInit().update(dt); }
});


/* ============================================================================
   GoatController
   Owns the animation clock, the walk, the heading and the behaviour scheduler.
   It reads and writes game.goat so the rest of the game - and the debug
   readout - keeps seeing the same state bag it always has.
   ========================================================================== */
class GoatController {
  constructor(game) {
    this.game = game;
    this.G = game.goat;
    this.el = game.el.goat;
    this.sprite = game.el['goat-sprite'];
    this.side = game.el['goat-side'];
    /* 0 = seen from the side, as on the title. 1 = seen from overhead, as in the
       farm. Nothing calls for the change: it follows the phase, so pressing Play
       tilts the camera and coming back to the title tilts it down again. */
    this.view = game.stats.phase === 'title' ? 0 : 1;
    this.sideFrame = 0; this.sideFt = 0; this.sideSrc = '';
    this.clip = null;
    this.heading = 0;                 // degrees, 0 = east
    this.wantHeading = 0;
    this.speed = 0;
    this.dragging = false;
    this.lastBleat = -1e9;
    this.G.frame = 0; this.G.ft = 0; this.G.st = 0;
    this.G.next = 1.0;
    this.ready = false;
    this.preload();
  }

  /* Load all three sheets before she is allowed to animate, so the first bleat
     or first bite cannot flash an empty box. If one fails she simply keeps the
     walking sheet - never a broken character. */
  preload() {
    const clips = this.game.CLIPS, names = Object.keys(clips);
    let left = names.length;
    this.ok = {};
    names.forEach(n => {
      const img = new Image();
      img.onload = () => { this.ok[n] = true; if (--left === 0) this.ready = true; };
      img.onerror = () => { this.ok[n] = false; if (--left === 0) this.ready = true; };
      img.src = clips[n].src;
    });
  }
  clipFor(state) {
    const art = this.game.STATE_ART[state] || this.game.STATE_ART.idle;
    let name = art.clip;
    if (this.ok[name] === false) name = 'walk';          // fallback, never blank
    return { name: name, def: this.game.CLIPS[name], hold: art.hold };
  }

  /* ------------------------------------------------------------ the sheet -- */
  applyClip() {
    const c = this.clipFor(this.G.state);
    if (this.clipName !== c.name) {
      this.clipName = c.name;
      this.sprite.style.backgroundImage = 'url(' + c.def.src + ')';
    }
    this.clip = c;
    this.G.frame = c.hold != null ? c.hold : 0;
    this.drawFrame();
  }
  /* Frame to background-position. With a background sized 400% by 200% the two
     percentages are just the frame's place in its row and column, so nothing
     here depends on the pixel size of the sheet. */
  drawFrame() {
    const C = GOAT_CONFIG, i = this.G.frame % C.frames;
    const col = i % C.columns, row = Math.floor(i / C.columns);
    this.sprite.style.backgroundPosition =
      (col / (C.columns - 1) * 100) + '% ' + (row / (C.rows - 1) * 100) + '%';
  }
  /* ------------------------------------------------------- the side view --
     The original frame-per-file animation, kept for the title. Her blink is on
     an irregular beat so that standing still never looks like a paused image. */
  updateSide(dt) {
    const g = this.game, G = this.G, S = g.SIDE;
    let name;
    if (G.state === 'idle') {
      if (this.blinkT == null) this.blinkT = 1.2 + Math.random() * 2.4;
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blinkOn = !this.blinkOn;
        this.blinkT = this.blinkOn ? 0.11 + Math.random() * 0.08 : 1.3 + Math.random() * 2.8;
        if (this.blinkOn) this.blinkEar = Math.random() < 0.4;
      }
      name = this.blinkOn ? (this.blinkEar ? 'idle-2' : 'idle-1') : 'idle-0';
    } else {
      const clip = S.clips[G.state] || S.clips.idle, rate = S.rate[G.state] || 0.3;
      this.sideFt += dt;
      if (this.sideFt >= rate) { this.sideFt = 0; this.sideFrame = (this.sideFrame + 1) % clip.length; }
      name = clip[this.sideFrame % clip.length];
    }
    const src = 'assets/art/' + name + '.png';
    if (this.sideSrc !== src) { this.sideSrc = src; this.side.src = src; }
  }

  updateAnimation(dt) {
    const G = this.G, c = this.clip;
    if (!c) { this.applyClip(); return; }
    if (c.hold != null) return;                       // idle and curious hold still
    G.ft += dt;
    const step = 1 / c.def.fps;
    while (G.ft >= step) {
      G.ft -= step;
      const next = G.frame + 1;
      if (next >= GOAT_CONFIG.frames && !c.def.loop) { G.frame = GOAT_CONFIG.frames - 1; break; }
      G.frame = next % GOAT_CONFIG.frames;
      this.onFrame(G.frame);
    }
    this.drawFrame();
  }
  /* One bleat is one sound, fired on the frame where the mouth is widest. */
  onFrame(f) {
    const G = this.G;
    if ((G.state === 'talk' || G.state === 'happy') && f === this.game.BLEAT_PEAK && G.bleatFrom !== 1) {
      G.bleatFrom = 1;
      this.game.sfx(G.state === 'happy' ? 'bleat_happy' : 'bleat');
      this.lastBleat = performance.now();
      this.arcs();
    }
    if (G.state === 'eat' && (f === 2 || f === 6)) this.crumbs();
  }

  /* ------------------------------------------------------------ movement -- */
  updateBounds() { this.b = this.game.bounds(); }

  startWalk() {
    this.speed = Math.max(this.speed, 4);
  }
  startEating() {
    this.G.eatFor = (GOAT_CONFIG.eatMin + Math.random() * (GOAT_CONFIG.eatMax - GOAT_CONFIG.eatMin)) / 1000;
  }
  stopMovement() { this.speed = 0; }

  /* A destination worth walking to: inside the safe area, far enough to be a
     journey rather than a twitch, and never on top of the drag handle - that
     corner is the one thing on screen the player has to be able to see and
     grab. */
  chooseWalkTarget() {
    const g = this.game, b = this.b, G = this.G;
    const minD = Math.max(GOAT_CONFIG.minTravel * (g.activePen() ? g.activePen().cell : 60),
                          g.goatSpan() * 0.8);
    const ex = g.goatBox().w * GOAT_CONFIG.handleClear;
    let hx = null, hy = null;
    if (g.dragAllowed()) { const h = g.px(g.g.L, g.g.W); hx = h[0]; hy = h[1]; }
    for (let i = 0; i < 24; i++) {
      const tx = b[0] + Math.random() * (b[1] - b[0]);
      const ty = b[2] + Math.random() * (b[3] - b[2]);
      if (Math.hypot(tx - G.x, ty - G.y) < minD && i < 18) continue;
      if (hx != null && Math.hypot(tx - hx, ty - hy) < ex) continue;
      return [tx, ty];
    }
    return null;
  }

  /* Weighted, so her day never settles into a recognisable cycle. */
  chooseNextBehaviour() {
    const g = this.game, C = GOAT_CONFIG, P = C.probabilities;
    const canBleat = performance.now() - this.lastBleat >
      (C.bleatCooldownMin + Math.random() * (C.bleatCooldownMax - C.bleatCooldownMin));
    let r = Math.random(), pick = 'idle';
    if ((r -= P.walk) < 0) pick = 'walk';
    else if ((r -= P.eat) < 0) pick = 'eat';
    else if ((r -= P.bleat) < 0) pick = canBleat ? 'talk' : 'eat';
    if (pick === 'walk') {
      const t = this.chooseWalkTarget();
      if (!t) { pick = 'eat'; }
      else { this.G.tx = t[0]; this.G.ty = t[1]; }
    }
    g.setGoat(pick);
    if (pick === 'idle') this.G.next = (C.idleMin + Math.random() * (C.idleMax - C.idleMin)) / 1000;
  }

  updateMovement(dt) {
    const g = this.game, G = this.G;
    /* On the journey between farms the walk cycle plays but she does not
       travel: the ground is doing that underneath her. updateAnimation runs off
       dt, not off speed, so her legs keep moving either way. */
    if (this.travelling) return;
    const walking = G.state === 'walk' || G.state === 'enter';
    if (!walking) { this.speed = 0; return; }

    const dx = G.tx - G.x, dy = G.ty - G.y, d = Math.hypot(dx, dy);
    const cell = g.activePen() ? g.activePen().cell : 72;
    // Her pace is given in px/sec at a 72px metre and scaled with the metre, so
    // she covers ground at the same rate in metres whatever the farm.
    const C = GOAT_CONFIG;
    const cruise = (G.state === 'enter' ? C.enterSpeed
      : (C.minWalkSpeed + C.maxWalkSpeed) / 2) * (cell / 72);

    if (d < Math.max(2, cell * 0.05)) { this.arrive(); return; }

    // Turn to face the way she is about to go before she gets up to speed, so a
    // change of direction reads as a decision rather than a slide.
    this.wantHeading = Math.atan2(dy, dx) * 180 / Math.PI;
    const off = this.angleDelta(this.heading, this.wantHeading);

    // Ease in, and ease out over the last stride so she does not stop dead.
    const brake = Math.min(1, d / Math.max(1, cruise * 0.28));
    const turnHold = Math.max(0, 1 - Math.abs(off) / 70);      // barely move mid-turn
    const want = cruise * brake * (0.25 + 0.75 * turnHold);
    this.speed += (want - this.speed) * Math.min(1, dt / C.accel);

    const rad = this.heading * Math.PI / 180;
    G.x += Math.cos(rad) * this.speed * dt;
    G.y += Math.sin(rad) * this.speed * dt;

    // Staying inside the fence is not this method's business any more: it was
    // only ever enforced here, which meant it was only ever enforced while she
    // happened to be walking. keepInside now does it in every state.
  }

  /* --------------------------------------------------------- the fence wins --
     The pasture can move while she is standing still, and it does: the player
     drags a side in and the fence closes over a goat who is grazing, bleating
     or celebrating. The clamp used to live inside the walking branch above, so
     none of those states was ever pulled back - and moveGoatInside politely
     declined to move her at all while she was happy, so a pen squeezed shut
     during a celebration left her standing on the rail for good.

     This runs every frame, whatever she is doing. She gives ground at her own
     walking pace rather than being snapped, so it reads as a goat stepping out
     of the way of the fence. The one exception is her walk-on: the whole point
     of the entrance is that she starts outside. */
  keepInside(dt) {
    const g = this.game, G = this.G, b = this.b;
    /* No pasture exists between farms - the old one has sunk and the new one
       has not been laid - so there is no fence to be pushed back inside, and
       bounds() would only drag her to the empty-stage default. */
    if (!b || G.state === 'enter' || this.travelling ||
        g.stats.phase === 'title' || g.stats.phase === 'travel') return;
    const tx = Math.max(b[0], Math.min(b[1], G.x));
    const ty = Math.max(b[2], Math.min(b[3], G.y));
    const dx = tx - G.x, dy = ty - G.y, d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    if (g.noMotion()) { G.x = tx; G.y = ty; G.tx = tx; G.ty = ty; return; }
    const cell = g.activePen() ? g.activePen().cell : 72;
    // Faster than she can walk, so she can never outrun the fence, but still a
    // walk rather than a teleport.
    const step = GOAT_CONFIG.maxWalkSpeed * (cell / 72) * dt * 1.5;
    if (d <= step) { G.x = tx; G.y = ty; } else { G.x += dx / d * step; G.y += dy / d * step; }
    /* She faces the way she is giving ground and her legs move with her - but a
       bleat and a celebration are held frames whose whole point is the frame,
       so those are left to finish and only her position is corrected. */
    if (G.state === 'happy' || G.state === 'talk') return;
    this.wantHeading = Math.atan2(dy, dx) * 180 / Math.PI;
    G.tx = tx; G.ty = ty;
    if (G.state !== 'walk') g.setGoat('walk');
  }
  arrive() {
    const G = this.G, g = this.game;
    this.speed = 0;
    if (G.state === 'enter') {
      G.state = 'idle'; this.applyClip();
      if (g._enterDone) { const f = g._enterDone; g._enterDone = null; f(); }
      return;
    }
    const C = GOAT_CONFIG;
    g.setGoat(Math.random() < 0.55 ? 'eat' : 'idle');
    G.next = (C.idleMin + Math.random() * (C.idleMax - C.idleMin)) / 1000;
  }

  angleDelta(from, to) {
    let d = (to - from) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }
  updateHeading(dt) {
    const G = this.G;
    // Anything that wants her to look somewhere sets it here; otherwise she
    // keeps the heading her last walk gave her.
    if (G.lookAt) {
      this.wantHeading = Math.atan2(G.lookAt[1] - G.y, G.lookAt[0] - G.x) * 180 / Math.PI;
      G.lookAt = null;
    } else if (G.face && G.state !== 'walk' && G.state !== 'enter') {
      this.wantHeading = G.face > 0 ? 0 : 180;
      G.face = 0;
    }
    /* In a pasture too narrow to turn around in, her safe area was worked out
       on the assumption that she lies along the long axis - so hold her to it,
       or the clearance penBounds granted would be a fiction. */
    const lock = this.game.axisLock();
    if (lock) {
      const snap = lock === 'x' ? [0, 180] : [90, -90];
      let best = snap[0], bd = 1e9;
      snap.forEach(a => { const d = Math.abs(this.angleDelta(a, this.wantHeading)); if (d < bd) { bd = d; best = a; } });
      this.wantHeading = best;
    }
    const d = this.angleDelta(this.heading, this.wantHeading);
    if (this.game.noMotion()) { this.heading = this.wantHeading; return; }
    const step = GOAT_CONFIG.turnRate * dt;
    this.heading += Math.abs(d) <= step ? d : Math.sign(d) * step;
  }

  /* --------------------------------------------------- the player's hands --
     While the fence is being dragged she stops choosing for herself: the
     student is doing the thinking and she must not pull the eye away from the
     corner. She keeps her place, turns her head toward the corner that is
     moving, and waits. */
  onFenceDragStart() {
    this.dragging = true;
    const G = this.G;
    if (G.state === 'walk') { this.game.setGoat('idle'); this.speed = 0; }
    G.next = 1e9;
  }
  onFenceDrag() {
    const g = this.game, G = this.G;
    if (!g.dragAllowed()) return;
    const h = g.px(g.g.L, g.g.W);
    this.wantHeading = Math.atan2(h[1] - G.y, h[0] - G.x) * 180 / Math.PI;
  }
  onFenceDragEnd() {
    this.dragging = false;
    const C = GOAT_CONFIG;
    // A beat to let the fence settle, then she gets on with her day - or walks
    // back in, if the pasture shrank around her.
    this.G.next = (C.settleMin + Math.random() * (C.settleMax - C.settleMin)) / 1000;
    this.game.moveGoatInside();
  }

  /* ------------------------------------------------------------ reactions -- */
  /* Two small arcs beside her mouth. Not a speech bubble - she is an animal. */
  arcs() {
    const g = this.game;
    if (g.noMotion()) return;
    const box = g.goatBox();
    for (let i = 0; i < 2; i++) {
      const d = document.createElement('div');
      const s = box.w * (0.30 + i * 0.16);
      d.style.cssText = 'position:absolute;left:' + (this.G.x - s / 2) + 'px;top:' + (this.G.y - s / 2) + 'px;' +
        'width:' + s + 'px;height:' + s + 'px;border-radius:50%;z-index:299;pointer-events:none;' +
        'border:' + Math.max(1.5, box.w * 0.035) + 'px solid rgba(255,252,236,.85);' +
        'border-color:rgba(255,252,236,.9) transparent transparent transparent;' +
        'animation:ftf-goat-arc 620ms ' + (i * 90) + 'ms ease-out forwards';
      g.el.field.appendChild(d);
      g.afterKeep(760 + i * 90, () => d.remove());
    }
  }
  /* A few blades kicked up where she is biting. Never a hole in the field. */
  crumbs() {
    const g = this.game;
    if (g.noMotion()) return;
    const box = g.goatBox(), n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      const s = Math.max(2, box.w * 0.07);
      const a = Math.random() * Math.PI * 2, r = box.h * 0.3;
      d.style.cssText = 'position:absolute;left:' + (this.G.x + Math.cos(a) * r * 0.4) + 'px;' +
        'top:' + (this.G.y + Math.sin(a) * r * 0.4) + 'px;width:' + s + 'px;height:' + s * 1.7 + 'px;' +
        'border-radius:40% 40% 10% 10%;z-index:299;pointer-events:none;background:#6FBF33;' +
        'animation:ftf-goat-crumb 480ms ease-out forwards';
      g.el.field.appendChild(d);
      g.afterKeep(560, () => d.remove());
    }
  }
  /* The correct answer. A hop, a pulse and one happy bleat, and a few sparkles
     - deliberately around her only, because the fence is the thing the player
     should be looking at. */
  celebrate() {
    const g = this.game;
    this.G.jump = 0.55;
    if (g.noMotion()) return;
    const box = g.goatBox();
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      const s = Math.max(4, box.w * 0.13);
      const a = -Math.PI / 2 + (i - 1) * 0.85, r = box.h * 0.52;
      d.style.cssText = 'position:absolute;left:' + (this.G.x + Math.cos(a) * r - s / 2) + 'px;' +
        'top:' + (this.G.y + Math.sin(a) * r - s / 2) + 'px;width:' + s + 'px;height:' + s + 'px;' +
        'z-index:301;pointer-events:none;border-radius:50%;background:#FFF6C9;' +
        'box-shadow:0 0 ' + (s * 1.4) + 'px ' + (s * 0.5) + 'px rgba(255,203,74,.75);' +
        'animation:ftf-goat-spark 760ms ' + (i * 110) + 'ms ease-out forwards';
      g.el.field.appendChild(d);
      g.afterKeep(900 + i * 110, () => d.remove());
    }
  }

  /* ------------------------------------------------------------ behaviour -- */
  updateBehaviour(dt) {
    const g = this.game, G = this.G, C = GOAT_CONFIG;
    G.st += dt;

    // Watch the handle rather than patching the drag handlers: one place to
    // notice the student has taken hold, and it cannot get out of step.
    const dragging = !!g.stats.dragging;
    if (dragging && !this.dragging) this.onFenceDragStart();
    else if (!dragging && this.dragging) this.onFenceDragEnd();
    if (dragging) { this.onFenceDrag(); return; }

    if (G.state === 'eat') {
      if (G.st > (G.eatFor || 2)) {
        g.setGoat('idle');
        G.next = (C.settleMin + Math.random() * (C.settleMax - C.settleMin)) / 1000;
      }
      return;
    }
    if (G.state === 'talk')   { if (G.st > C.bleatMs / 1000) g.setGoat('idle'); return; }
    if (G.state === 'happy')  { if (G.st > 2.4) g.setGoat('idle'); return; }
    if (G.state === 'curious') { if (G.st > 1.7) g.setGoat('idle'); return; }
    // Autonomous behaviour waits for the sheets: nothing should start before
    // there is art to start it with. It also stays off under reduced motion,
    // where the game still scripts her but she never sets off on her own.
    if (G.state === 'idle' && g.WANDER[g.stats.phase] && this.ready && !g.noMotion()) {
      if (G.st > G.next) this.chooseNextBehaviour();
    }
  }

  /* ---------------------------------------------------------------- draw -- */
  update(dt) {
    const g = this.game, G = this.G;
    if (!this.el) return;
    // The camera follows the phase. On the title she is a side-view portrait;
    // everywhere else the farm is seen from overhead and so is she.
    const want = g.stats.phase === 'title' ? 0 : 1;
    if (g.noMotion()) this.view = want;
    else if (this.view !== want) {
      const step = dt / g.TILT;
      this.view = want > this.view ? Math.min(want, this.view + step) : Math.max(want, this.view - step);
    }
    this.updateBounds();
    this.updateBehaviour(dt);
    this.updateMovement(dt);
    this.keepInside(dt);          // the fence has the last word on where she is
    this.updateHeading(dt);
    if (this.view < 1) this.updateSide(dt);
    if (this.view > 0) this.updateAnimation(dt);
    this.draw(dt);
    if (GOAT_DEBUG) this.debug();
  }
  draw(dt) {
    const g = this.game, G = this.G, box = g.goatBox();
    G.h = box.h;

    // A hop for a success, and the calm breathing that keeps a held frame from
    // looking like a still image.
    const jump = G.jump > 0 ? Math.sin((1 - G.jump / 0.55) * Math.PI) : 0;
    if (G.jump > 0) G.jump = Math.max(0, G.jump - dt);
    G.breath = (G.breath || 0) + dt;
    const still = G.state === 'idle' || G.state === 'eat' || G.state === 'curious';
    let float = 0, scale = 1;
    if (!g.noMotion()) {
      // A 1-2px float on a slow two-second breath. Enough that a held frame is
      // clearly a living animal, far too little to read as a bounce.
      if (still) float = Math.sin(G.breath * 2.1) * Math.max(1, box.h * 0.012);
      scale = 1 + jump * 0.05;
      if (G.wig > 0) G.wig = Math.max(0, G.wig - dt * 1.4);
    }
    const lift = jump * box.h * 0.05;

    /* The tilt. As the camera comes overhead the side view is foreshortened
       away and the plan view opens out of the same squash, and the side sprite
       slides from standing on the ground point to sitting over it - so the two
       converge on one box and the crossover has nothing to give it away. Only
       one of them is ever paying for a redraw. */
    const v = this.view, ease = v * v * (3 - 2 * v);
    /* She is 190px tall on the title, where there is no metre to size her by,
       and a metre-true size in the field. Both sprites are drawn at one blended
       height across the tilt so the phase changing underneath - which happens
       while the camera is still moving - cannot make her jump. Her collision
       size is never blended: bounds() always uses her real one. */
    const hNow = g.SIDE.titleH + (box.h - g.SIDE.titleH) * ease;

    if (v < 1) {
      const sw = hNow * g.SIDE.aspect;
      this.side.style.height = hNow + 'px';
      this.side.style.opacity = String(1 - ease);
      // The side art faces left, so facing east is the mirrored one.
      this.side.style.transform =
        'translate(' + (G.x - sw / 2) + 'px,' + (G.y - hNow * (1 - 0.5 * ease) - lift + float) + 'px) ' +
        'scaleX(' + (this.heading > 90 || this.heading < -90 ? 1 : -1) + ') ' +
        'scaleY(' + (1 - 0.5 * ease).toFixed(4) + ')';
    } else if (this.side.style.opacity !== '0') {
      this.side.style.opacity = '0';
    }

    this.sprite.style.opacity = String(ease);
    // The walk, eat and bleat sheets all draw her nose down the frame - due
    // south, or +90 in screen terms - so those are turned BACK by that much to
    // leave her nose on her heading. Either way the character is turned, never
    // mirrored, so the plan view always holds.
    const pw = hNow * g.SHEET.aspect;
    this.el.style.width = pw + 'px';
    this.el.style.height = hNow + 'px';
    this.el.style.transform =
      'translate(' + (G.x - pw / 2) + 'px,' + (G.y - hNow / 2 - lift + float) + 'px) ' +
      'rotate(' + (this.heading - g.SHEET.faceDeg).toFixed(2) + 'deg) ' +
      'scale(' + scale.toFixed(4) + ',' + (scale * (0.42 + 0.58 * ease)).toFixed(4) + ')';
  }

  /* Never shown in production - GOAT_DEBUG is a constant, so this whole
     overlay is dead code unless it is switched on deliberately. */
  debug() {
    const g = this.game, G = this.G;
    if (!this._dbg) {
      this._dbg = document.createElement('div');
      this._dbg.style.cssText = 'position:absolute;left:0;top:0;z-index:990;pointer-events:none;' +
        'font:600 10px monospace;color:#fff;text-shadow:0 1px 2px #000';
      g.el.field.appendChild(this._dbg);
      this._box = document.createElement('div');
      this._box.style.cssText = 'position:absolute;z-index:989;pointer-events:none;' +
        'border:1px dashed rgba(255,255,255,.8)';
      g.el.field.appendChild(this._box);
    }
    const b = this.b;
    this._box.style.left = b[0] + 'px'; this._box.style.top = b[2] + 'px';
    this._box.style.width = (b[1] - b[0]) + 'px'; this._box.style.height = (b[3] - b[2]) + 'px';
    this._dbg.style.left = (G.x + 12) + 'px'; this._dbg.style.top = (G.y - 8) + 'px';
    this._dbg.textContent = G.state + ' f' + G.frame + ' hdg' + Math.round(this.heading) +
      ' sp' + Math.round(this.speed) + ' -> ' + Math.round(G.tx) + ',' + Math.round(G.ty);
  }
}
