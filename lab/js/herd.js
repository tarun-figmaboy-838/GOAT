/* ============================================================================
   FENCE THE FARM — the herd

   One goat is the character. The rest are the reason.

   Each farm adds another animal to the field: 1, 2, 3, then 4. Nothing about
   the mathematics changes - the count is fixed for the whole of a farm, so
   every shape inside that farm is compared against the same herd - but "give
   her more grass" becomes "give THEM more grass", and a long thin strip with
   four goats standing nose to tail in it argues for itself.

   Two rules keep this safe.

   The scripted goat is untouched. GoatController still owns her completely:
   her beats, her tilt between the side and plan views, her reactions, her
   walk-on. The herd animals are ambient only - they are never addressed, never
   celebrate, never bleat (a second mouth would fight the beat her bleats land
   on), and never take part in anything the game is measuring.

   Which farm they belong to, how many, and WHICH enclosure each stands in all
   follow the phase rather than being switched on by a call, so no screen has to
   remember to clear them.

   On the recap they appear in BOTH pastures. That screen exists to say "same
   fence, different room", and the same animals in both says it hardest: four
   crammed nose to tail into 10 x 2 beside four with space to spare in 6 x 6.
   The peak, the live explanation and the completion screen keep one goat -
   single-pasture screens, where a herd is only clutter.
   ========================================================================== */

/* Slightly slower and lazier than her, so the eye still settles on the goat the
   game is actually about. */
const HERD = {
  paceMin: 0.72, paceMax: 0.95,      // fraction of her walking speed
  idleMin: 2.4, idleMax: 6.0,        // seconds
  eatMin: 2.2, eatMax: 4.5,
  weights: { walk: 0.42, eat: 0.44, idle: 0.14 }
};

class HerdGoat {
  constructor(game, penId) {
    this.g = game;
    /* null = live in whichever pasture is active, which is what the play
       screens want. A pen id pins the animal to ONE named enclosure, which is
       what the recap wants: two pastures on screen at once, each with its own
       herd, its own bounds and its own axis lock. */
    this.penId = penId || null;
    this.el = document.createElement('div');
    this.el.className = 'ftf-herd';
    this.el.setAttribute('aria-hidden', 'true');
    this.sprite = document.createElement('div');
    this.sprite.className = 'ftf-herd-sprite';
    this.el.appendChild(this.sprite);
    game.el.field.appendChild(this.el);

    const b = this.bounds();
    this.x = b[0] + Math.random() * (b[1] - b[0]);
    this.y = b[2] + Math.random() * (b[3] - b[2]);
    this.tx = this.x; this.ty = this.y;
    this.heading = Math.random() * 360;
    this.want = this.heading;
    this.speed = 0;
    this.frame = 0; this.ft = 0; this.st = 0;
    this.breath = Math.random() * 6;          // so they never breathe in unison
    this.pace = HERD.paceMin + Math.random() * (HERD.paceMax - HERD.paceMin);
    this.clipName = '';
    this.setState(Math.random() < 0.5 ? 'eat' : 'idle');
  }
  remove() { this.el.remove(); }

  /* ---- which enclosure this animal belongs to, and everything that follows
          from it. A pinned animal asks its OWN pen for all of this; an unpinned
          one falls back to the game's active-pasture answers, unchanged. ---- */
  pen() {
    if (!this.penId) return this.g.activePen();
    const p = this.g.pens[this.penId];
    return (p && p.cell && p.L && p.W) ? p : null;
  }
  bounds() {
    if (!this.penId) return this.g.bounds();
    const p = this.pen();
    return p ? this.g.penBounds(p, p.L, p.W) : this.g.bounds();
  }
  cell() { const p = this.pen(); return p ? p.cell : 72; }
  lock() {
    if (!this.penId) return this.g.axisLock();
    const p = this.pen();
    return p ? this.g.axisLockOf(p, p.L, p.W) : null;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s; this.st = 0; this.frame = 0; this.ft = 0;
    const name = s === 'eat' ? 'eat' : 'walk';       // idle borrows the calm walk frame
    if (this.clipName !== name) {
      this.clipName = name;
      this.sprite.style.backgroundImage = 'url(' + this.g.CLIPS[name].src + ')';
    }
    if (s === 'eat') this.eatFor = HERD.eatMin + Math.random() * (HERD.eatMax - HERD.eatMin);
    if (s === 'idle') this.next = HERD.idleMin + Math.random() * (HERD.idleMax - HERD.idleMin);
  }

  /* Somewhere in the safe area, far enough to be worth walking to, and never on
     the drag handle - the same exclusion the scripted goat respects, for the
     same reason: that corner must always be grabbable. */
  pick(b) {
    const g = this.g;
    const cell = this.cell();
    const minD = Math.max(0.9 * cell, g.goatSpan() * 0.7);
    const ex = g.goatBox().w * GOAT_CONFIG.handleClear;
    const room = g.goatSpan() * 0.75;
    let hx = null, hy = null;
    if (g.dragAllowed()) { const h = g.px(g.g.L, g.g.W); hx = h[0]; hy = h[1]; }
    for (let i = 0; i < 16; i++) {
      const tx = b[0] + Math.random() * (b[1] - b[0]);
      const ty = b[2] + Math.random() * (b[3] - b[2]);
      if (Math.hypot(tx - this.x, ty - this.y) < minD && i < 12) continue;
      if (hx != null && Math.hypot(tx - hx, ty - hy) < ex) continue;
      // Not on top of another animal, and never on top of HER.
      if (i < 12 && this.crowded(tx, ty, room)) continue;
      return [tx, ty];
    }
    return null;
  }
  /* Everyone else in THIS enclosure. Animals in the other recap pen are not
     crowding anyone - keeping their own space against an animal on the far side
     of the stage would push both herds toward their fences for no reason. The
     scripted goat counts only where she actually is. */
  others() {
    const h = (this.g._herd || []).filter(o => o !== this && o.penId === this.penId);
    const hers = this.g._goatPen || 'main';
    const mine = this.penId || (this.g.activePen() === this.g.pens.main ? 'main' : null);
    if (!this.penId || hers === mine) h.push({ x: this.g.goat.x, y: this.g.goat.y });
    return h;
  }
  crowded(x, y, room) {
    return this.others().some(o => Math.hypot(x - o.x, y - o.y) < room);
  }
  /* Personal space, applied every frame whatever they are doing. Two goats in
     the same spot read as one broken sprite, and choosing well-spaced targets
     is not enough on its own: a pasture closing around the herd pushes them
     together no matter what they picked. A gentle shove apart costs nothing,
     and the fence clamp still runs afterwards so it always has the last word. */
  separate(dt) {
    const room = this.g.goatSpan() * 0.75;
    let px = 0, py = 0;
    this.others().forEach(o => {
      const dx = this.x - o.x, dy = this.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0.001 && d < room) { px += dx / d * (room - d); py += dy / d * (room - d); }
      else if (d <= 0.001) px += room;            // exactly stacked: break the tie
    });
    if (!px && !py) return;
    const k = Math.min(1, dt * 7);          // firm enough to converge in about a second
    const mx = px * k, my = py * k;
    this.x += mx; this.y += my;
    /* Carry the destination with them. Without this the push and the walk fight
       each other every frame - shoved apart, then steering straight back to a
       target that has not moved - which reads as two animals vibrating rather
       than two animals making room. */
    this.tx += mx; this.ty += my;
  }
  choose(b) {
    let r = Math.random(), pick = 'idle';
    if ((r -= HERD.weights.walk) < 0) pick = 'walk';
    else if ((r -= HERD.weights.eat) < 0) pick = 'eat';
    if (pick === 'walk') {
      const t = this.pick(b);
      if (!t) pick = 'eat'; else { this.tx = t[0]; this.ty = t[1]; }
    }
    this.setState(pick);
  }

  update(dt, b) {
    const g = this.g, C = GOAT_CONFIG;
    const cell = this.cell();
    const px0 = this.x, py0 = this.y;     // where it stood before anything moved it
    this.st += dt;

    /* --- what to do next --- */
    if (g.noMotion()) {
      // Still animals in a field, but they do not set off on their own.
      this.setState('eat');
    } else if (this.state === 'eat') {
      if (this.st > this.eatFor) this.setState('idle');
    } else if (this.state === 'walk') {
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
      /* Arrival on the axis they can actually travel - the same trap the
         scripted goat hit. Farm 2 starts at 10 x 2, which is narrow enough to
         lock the heading, so a target with any off-axis component would leave a
         herd animal sliding east and west for ever, never arriving, never
         grazing. That endless slide is what reads as glitching. */
      const lock = this.lock();
      const reach = lock === 'x' ? Math.abs(dx) : lock === 'y' ? Math.abs(dy) : d;
      if (reach < Math.max(2, cell * 0.05)) { this.speed = 0; this.setState(Math.random() < 0.7 ? 'eat' : 'idle'); }
      else {
        const cruise = (C.minWalkSpeed + C.maxWalkSpeed) / 2 * (cell / 72) * this.pace;
        this.want = Math.atan2(dy, dx) * 180 / Math.PI;
        const off = this.delta(this.heading, this.want);
        const brake = Math.min(1, d / Math.max(1, cruise * 0.28));
        const hold = Math.max(0, 1 - Math.abs(off) / 70);      // barely move mid-turn
        const wantSpeed = cruise * brake * (0.25 + 0.75 * hold);
        this.speed += (wantSpeed - this.speed) * Math.min(1, dt / C.accel);
        const rad = this.heading * Math.PI / 180;
        this.x += Math.cos(rad) * this.speed * dt;
        this.y += Math.sin(rad) * this.speed * dt;
      }
    } else if (this.st > this.next) {
      this.choose(b);
    }

    if (!g.noMotion()) this.separate(dt);

    /* --- the fence still wins, in every state ---
       Same rule the scripted goat lives by: the pasture can close over an
       animal that is standing still, so the clamp cannot live inside the
       walking branch. */
    /* A leash first, then a walk. Giving ground at walking pace is right when
       the fence has moved a little, and completely wrong when it has moved a
       lot: dragging the corner several metres in one sweep left the herd
       stranded outside the pasture for a second or more while they ambled back,
       which is the bug where "some goats go outside the fence". The scripted
       goat never had it because moveGoatInside() hard-clamps her to within half
       a metre of the fence on every single shape change. The herd gets the same
       leash - snapped to just outside, then walking the last of it in. */
    const slack = cell * 0.18;
    this.x = Math.max(b[0] - slack, Math.min(b[1] + slack, this.x));
    this.y = Math.max(b[2] - slack, Math.min(b[3] + slack, this.y));

    const cx = Math.max(b[0], Math.min(b[1], this.x));
    const cy = Math.max(b[2], Math.min(b[3], this.y));
    const gx = cx - this.x, gy = cy - this.y, gd = Math.hypot(gx, gy);
    // A whole pixel, not a hundredth of one: at 0.01 an animal resting exactly
    // on the boundary re-faced the clamp every frame and twitched.
    if (gd > 1) {
      if (g.noMotion()) { this.x = cx; this.y = cy; }
      else {
        const step = C.maxWalkSpeed * (cell / 72) * dt * 3;
        if (gd <= step) { this.x = cx; this.y = cy; }
        else { this.x += gx / gd * step; this.y += gy / gd * step; }
        this.want = Math.atan2(gy, gx) * 180 / Math.PI;
      }
      // Give ground to a real place, so the walk does not steer straight back out.
      this.tx = cx; this.ty = cy;
    }

    /* --- heading, with the same axis lock a pen too narrow to turn in wants --- */
    const lock = this.lock();
    if (lock) {
      const snap = lock === 'x' ? [0, 180] : [90, -90];
      let best = snap[0], bd = 1e9;
      snap.forEach(a => { const q = Math.abs(this.delta(a, this.want)); if (q < bd) { bd = q; best = a; } });
      this.want = best;
    }
    if (g.noMotion()) this.heading = this.want;
    else {
      const dh = this.delta(this.heading, this.want), step = C.turnRate * dt;
      this.heading += Math.abs(dh) <= step ? dh : Math.sign(dh) * step;
    }

    /* --- frames ---
       An animal that is being MOVED must have its legs moving, whatever it
       thinks it is doing. Two things shift one without it deciding to walk: the
       fence closing on it, and another goat making room. Both changed only its
       position, so it slid across the grass in a frozen pose - which is the
       "animation issue" you see when the pasture is dragged and the herd
       rearranges itself. `slid` measures what actually happened this frame
       rather than trusting the behaviour state, so the legs move whenever the
       ground beneath them does. */
    /* Reduced motion stops them DECIDING to go anywhere - the branch above pins
       them to grazing - but it does not freeze the sprite. The scripted goat's
       updateAnimation has never checked noMotion either, so gating this on it
       left a field where one animal chewed and three were statues. What reduced
       motion is owed is no travel and no camera work, not a still photograph. */
    const slid = Math.hypot(this.x - px0, this.y - py0) > cell * 0.004;
    if (this.state !== 'idle' || slid) {
      const fps = this.state === 'eat' ? C.eatFPS : C.walkFPS;
      this.ft += dt;
      const per = 1 / fps;
      while (this.ft >= per) { this.ft -= per; this.frame = (this.frame + 1) % GOAT_CONFIG.frames; }
    }
    const col = this.frame % C.columns, row = Math.floor(this.frame / C.columns);
    this.sprite.style.backgroundPosition =
      (col / (C.columns - 1) * 100) + '% ' + (row / (C.rows - 1) * 100) + '%';

    /* --- draw. Same box and the same nose-south rotation she uses, so the herd
           and the character are unmistakably the same animal. --- */
    const box = g.goatBox();
    this.breath += dt;
    const float = g.noMotion() || this.state === 'walk' ? 0
      : Math.sin(this.breath * 2.1) * Math.max(1, box.h * 0.012);
    this.el.style.width = box.w + 'px';
    this.el.style.height = box.h + 'px';
    this.el.style.transform =
      'translate(' + (this.x - box.w / 2) + 'px,' + (this.y - box.h / 2 + float) + 'px) ' +
      'rotate(' + (this.heading - g.SHEET.faceDeg).toFixed(2) + 'deg)';
  }
  delta(from, to) {
    let d = (to - from) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }
}

Object.assign(FenceTheFarm.prototype, {
  /* How many EXTRA animals belong on screen right now. Follows the phase, so
     no screen has to remember to clear them: the recap, the tracer, the peak,
     the live explanation and the completion screen are all measuring screens,
     and a measuring screen has exactly one goat in it. */
  /* Which animals belong on screen right now, and in which enclosure. Follows
     the phase, so no screen has to remember to clear them.

     On the RECAP both pastures get the farm's whole herd. That screen exists to
     say "same fence, different room", and the strongest way to say it is the
     same animals in both: four crammed nose to tail into 10 x 2 beside four with
     space to spare in 6 x 6. The scripted goat already lives in finB, so finB
     asks for one fewer and the two pens end up with the same head count.

     The peak, the live explanation and the completion screen stay at one goat -
     those are single-pasture screens, and a herd there is only clutter. */
  herdSpec() {
    const ph = this.stats.phase;
    const r = this.ROUNDS[this.g.round];
    const n = Math.max(1, (r && r.goats) || 1);
    if (ph === 'intro' || ph === 'play') return [{ pen: null, n: n - 1 }];
    /* On the recap BOTH pastures get the farm's whole herd. That screen exists
       to say "same fence, different room", and the same animals in both says it
       hardest: four crammed nose to tail into 13 x 3 beside four with space to
       spare in 8 x 8. The scripted goat already lives in finB, so finB asks for
       one fewer and the two pens end up with the same head count - which is the
       whole point, because an unequal count would be a different argument. */
    if (ph === 'finale') {
      const a = this.pens.finA, b = this.pens.finB;
      const built = p => !!(p && p.cell && p.L && p.W);
      return [
        { pen: 'finA', n: built(a) ? n : 0 },
        { pen: 'finB', n: built(b) ? n - 1 : 0 }
      ];
    }
    return [];
  },
  herdSet(spec) {
    const key = spec.map(s => s.pen + ':' + s.n).join('|');
    if (key === this._herdKey) return;
    // Never before the sheets are loaded: an empty box is worse than no goat.
    if (spec.some(s => s.n > 0) && !this.goatInit().ready) return;
    /* Order matters: herdClear() resets the key, so the key has to be stamped
       AFTER it. Stamping first meant every tick found a null key, cleared the
       herd and built a brand new one - so the animals were destroyed and
       recreated sixty times a second, at fresh random positions, in fresh
       random states, with their frame counter reset each time. They never
       animated and never stayed put: the "goats flickering too fast to see". */
    this.herdClear();
    spec.forEach(s => {
      for (let i = 0; i < s.n; i++) this._herd.push(new HerdGoat(this, s.pen));
    });
    this._herdKey = key;
  },
  herdClear() { (this._herd || []).forEach(h => h.remove()); this._herd = []; this._herdKey = null; },
  herdTick(dt) {
    this._herd = this._herd || [];
    this.herdSet(this.herdSpec());
    if (!this._herd.length) return;
    // Each animal asks its OWN enclosure where it may stand.
    this._herd.forEach(h => h.update(dt, h.bounds()));
  }
});

/* Driven by the one animation loop the game already runs, right after her. */
(function (proto) {
  const tick = proto.goatTick;
  proto.goatTick = function (dt) { tick.call(this, dt); this.herdTick(dt); };
  const die = proto.destroy;
  proto.destroy = function () { this.herdClear(); die.call(this); };
})(FenceTheFarm.prototype);
