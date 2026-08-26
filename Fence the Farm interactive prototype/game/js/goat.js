/* ============================================================================
   FENCE THE FARM — the goat
   A small state machine: idle, walk, eat, talk, happy, curious (plus one
   internal 'enter' for her walk-on at the first farm). She never crosses a
   fence, and when the pasture changes she walks to the new safe region rather
   than being teleported into it.
   ========================================================================== */
Object.assign(FenceTheFarm.prototype, {

  CLIP: {
    idle:    ['idle-0'],
    enter:   ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'walk-5', 'walk-6', 'walk-7'],
    walk:    ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'walk-5', 'walk-6', 'walk-7'],
    eat:     ['graze-0', 'graze-1', 'graze-1', 'graze-2', 'graze-3', 'graze-2'],
    talk:    ['bleat-0', 'bleat-1', 'bleat-2', 'bleat-1'],
    happy:   ['bleat-1', 'bleat-2', 'idle-2', 'bleat-1'],
    curious: ['idle-2']
  },
  RATE: { enter: 0.10, walk: 0.115, eat: 0.30, talk: 0.16, happy: 0.17 },
  // Phases where she is free to wander; elsewhere the game is scripting her.
  WANDER: { play: true, finale: true, complete: true, explore: true },

  setGoat(s) {
    const G = this.goat;
    if (G.state === s) return;
    G.state = s; G.frame = 0; G.ft = 0; G.st = 0;
    this.goatAudioState(s);
    if (s === 'talk') this.sfx('bleat');
    if (s === 'happy') { this.sfx('bleat_happy'); G.wig = 1; }
  },

  /* ------------------------------------------------------- pathfinding ---
     The safe region is the fence bounds less a padding, so she can graze up
     to the rails without ever standing on top of one. */
  penBounds(p, L, W) {
    // The near padding keeps her feet at or above the near rail, so the front
    // fence never buries her; the far padding keeps her clear of the far rail.
    const padX = p.cell * 0.45, padT = p.cell * 0.34, padB = p.cell * 0.45;
    const x0 = p.ax + padX, x1 = p.ax + L * p.cell - padX;
    const y0 = p.ay + padT, y1 = p.ay + W * p.cell - padB;
    return [x0, Math.max(x0, x1), y0, Math.max(y0, y1)];
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
    if (this.stats.phase === 'title') return [566, 716, 512, 526];
    const p = this.activePen();
    if (!p) return [566, 716, 512, 526];
    const L = (p === this.pens.main) ? this.g.L : p.L;
    const W = (p === this.pens.main) ? this.g.W : p.W;
    if (!L || !W) return [566, 716, 512, 526];
    return this.penBounds(p, L, W);
  },
  /* She is about 1.35 m tall and stays that size. Her pixel height therefore
     depends only on the metre, never on the shape of the pen: if she grew as
     the field became balanced, part of the "more grass" impression would come
     from the goat instead of from the geometry, and the comparison the whole
     game rests on would stop being honest. The near rail is kept off her by
     padding in penBounds, not by shrinking her. */
  GOAT_METRES: 1.35,
  goatHeight() {
    const ph = this.stats.phase;
    if (ph === "title") return 200;
    const p = this.activePen();
    return Math.max(58, Math.min(140, (p ? p.cell : this.g.cell) * this.GOAT_METRES));
  },
  /* Called whenever the pasture changes. She is leashed to just inside the new
     fence and then walks the rest of the way in of her own accord. */
  moveGoatInside(instant) {
    const G = this.goat, b = this.bounds();
    G.h = this.goatHeight();
    const cx = Math.max(b[0], Math.min(b[1], G.x)), cy = Math.max(b[2], Math.min(b[3], G.y));
    if (cx === G.x && cy === G.y) return;
    if (instant || this.noMotion() || this.stats.phase === 'title') { G.x = cx; G.y = cy; return; }
    const slack = 0.5 * (this.pens.main.cell || 60);
    G.x = Math.max(b[0] - slack, Math.min(b[1] + slack, G.x));
    G.y = Math.max(b[2] - slack, Math.min(b[3] + slack, G.y));
    G.tx = cx; G.ty = cy;
    if (G.state !== 'walk' && G.state !== 'enter' && G.state !== 'happy') this.setGoat('walk');
  },
  /* Mastery farm nudge: she glances at the number instead of being told. */
  lookAtArea() {
    this.goat.face = this.goat.x < 800 ? 1 : -1;
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
  frameSrc(name) {
    const src = 'assets/art/' + name + '.png';
    if (this._gsrc !== src) { this._gsrc = src; this.el.goat.src = src; }
  },
  goatTick(dt) {
    const G = this.goat;
    G.ft += dt; G.st += dt;

    /* --- sprite --- */
    if (G.state === 'idle') {
      // Blink and ear twitch on an irregular beat; otherwise she stands still.
      if (G.blinkT == null) G.blinkT = 1.2 + Math.random() * 2.4;
      G.blinkT -= dt;
      if (G.blinkT <= 0) {
        G.blinkOn = !G.blinkOn;
        G.blinkT = G.blinkOn ? 0.11 + Math.random() * 0.08 : 1.3 + Math.random() * 2.8;
        if (G.blinkOn) G.tw = Math.random() < 0.4 ? 2 : 1;
      }
      this.frameSrc(G.blinkOn ? (G.tw === 2 ? 'idle-2' : 'idle-1') : 'idle-0');
    } else if (G.state === 'curious') {
      this.frameSrc('idle-2');
    } else {
      const clip = this.CLIP[G.state] || this.CLIP.idle, rate = this.RATE[G.state] || 0.3;
      if (G.ft >= rate) {
        G.ft = 0; G.frame = (G.frame + 1) % clip.length;
        this.frameSrc(clip[G.frame]);
      }
    }

    /* --- behaviour --- */
    if (G.state === 'walk' || G.state === 'enter') {
      const dx = G.tx - G.x, dy = G.ty - G.y, d = Math.sqrt(dx * dx + dy * dy);
      const sp = G.state === 'enter' ? 215 : 64;
      if (d < 4) {
        if (G.state === 'enter') {
          G.state = 'idle';
          if (this._enterDone) { const f = this._enterDone; this._enterDone = null; f(); }
        } else {
          this.setGoat(Math.random() < 0.55 ? 'eat' : 'idle');
          G.next = 2 + Math.random() * 2.5;
        }
      } else {
        G.x += dx / d * sp * dt; G.y += dy / d * sp * dt;
        if (Math.abs(dx) > 3) G.face = dx > 0 ? 1 : -1;
      }
    } else if (G.state === 'eat') {
      if (G.st > 2.8) { this.setGoat('idle'); G.next = 1.6 + Math.random() * 2; }
    } else if (G.state === 'talk') {
      if (G.st > 1.0) this.setGoat('idle');
    } else if (G.state === 'happy') {
      if (G.st > 2.4) this.setGoat('idle');
    } else if (G.state === 'curious') {
      if (G.st > 1.7) this.setGoat('idle');
    } else if (G.state === 'idle' && this.WANDER[this.stats.phase]) {
      // Wander only where the game is not scripting her.
      if (G.st > G.next) {
        const b = this.bounds();
        if (Math.random() < 0.55) {
          G.tx = b[0] + Math.random() * (b[1] - b[0]);
          G.ty = b[2] + Math.random() * (b[3] - b[2]);
          this.setGoat('walk');
        } else this.setGoat('eat');
      }
    }

    /* --- draw --- */
    const jump = G.jump > 0 ? Math.sin((1 - G.jump / 0.55) * Math.PI) * 30 : 0;
    if (G.jump > 0) G.jump = Math.max(0, G.jump - dt);
    G.breath = (G.breath || 0) + dt;
    const still = (G.state === 'idle' || G.state === 'eat' || G.state === 'curious') && !this.noMotion();
    const sy = still ? 1 + 0.014 * Math.sin(G.breath * 2.1) : 1;
    // Tail and bell rock through a success, and she gives a small head bob
    // when she is curious. Both are off under reduced motion.
    let rot = 0;
    if (!this.noMotion()) {
      if (G.wig > 0) { G.wig = Math.max(0, G.wig - dt * 1.4); rot = 3.4 * G.wig * Math.sin(G.breath * 15); }
      else if (G.state === 'curious') rot = 1.6 * Math.sin(G.breath * 3.1);
    }
    this.el.goat.style.height = G.h + 'px';
    // The source art faces left, so face = +1 (moving right) must mirror.
    this.el.goat.style.transform =
      'translate(' + (G.x - G.h * 0.42) + 'px,' + (G.y - G.h - jump) + 'px) rotate(' + rot.toFixed(2) + 'deg) scaleX(' + (-G.face) + ') scaleY(' + sy.toFixed(4) + ')';
    this.el.goat.style.zIndex = String(200 + Math.round(G.y / 4) * 2 + 1);
  }
});
