/* ============================================================================
   FENCE THE FARM — the finale
   An interactive proof, not a textbook page. Four phases, all on the same
   grass, and then the explanation - which is also on the same grass.

     1  replay the two builds side by side
     2  trace both perimeters at one speed - they finish together
     3  fill both interiors and count the grass up
     4  hand the fence back and let the player find the peak on a meter

   Phase 5 used to live here too: a formula board, then an optional algebra
   wall. Both were screens that TOLD the student the result. They are gone, and
   explain.js has the job instead - one live screen where the perimeter is
   pinned, the handle works, and every number moves with their hand. advCurve()
   stayed behind because that screen draws its graph with it.
   ========================================================================== */
Object.assign(FenceTheFarm.prototype, {

  /* ====================== THE RECAP ======================================
     Every farm ends the same way, and so does the game: the shape they began
     with is rebuilt next to the shape they found, on the same grass, at the
     same metres-per-pixel and on one shared ground line. A gold tracer then
     walks both perimeters at one speed - they finish together, which is the
     proof - and only then does the grass inside each one count up.

     No panel, no paragraph. The fences do the explaining.
     ==================================================================== */
  compareBuilds(A, B, perimeter, opts) {
    opts = opts || {};
    this.clearTimers();
    this.stats.phase = 'finale';
    this._cmpThen = opts.then || null;
    this.finA = { L: A[0], W: A[1] };
    this.finB = { L: B[0], W: B[1] };

    // One cell for both pens, chosen so the pair fits the stage with room to
    // breathe, and one ground line so the eye can compare them fairly.
    /* The pair is depth-limited, not width-limited: at DEPTH 262 an 8 x 8 pen
       was only 32.75 px to the metre and the top third of the stage sat empty.
       Giving the depth the room that was going to waste anyway makes both pens
       about a quarter bigger, which is the whole point of this screen - the two
       areas have to be worth comparing by eye. */
    /* GAP is what makes the middle read as a PLACE: the way-on button lives
       between the two builds, so the gap has to be wide enough that the button
       sits in clear grass rather than squeezed between the cards. */
    const GAP = 220, SPAN = 1200, GROUND = 482, DEPTH = 336;
    const cell = Math.min((SPAN - GAP) / (A[0] + B[0]), DEPTH / Math.max(A[1], B[1]));
    const wA = A[0] * cell, wB = B[0] * cell;
    const ax = (1280 - (wA + GAP + wB)) / 2;
    const bx = ax + wA + GAP;
    this._cmp = { cell: cell, ground: GROUND, ax: ax, bx: bx, wA: wA, wB: wB };

    this.el.bonus.classList.remove('ftf-in');
    this.el.ghost.style.opacity = '0';
    this.showHandle(false);
    this.showDims(false);
    this.el['area-card'].style.opacity = '0';
    this.el['fence-badge'].style.opacity = '0';
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    this.el.fill.style.transition = 'opacity 380ms ease';
    this.el.fill.style.opacity = '0';
    this.el.fin.style.display = 'block';
    ['fin-a-lbl', 'fin-b-lbl'].forEach(k => { this.el[k].style.opacity = '0'; });
    this.el.fin.querySelectorAll('.ftf-cmp-per, .ftf-cmp-area').forEach(n => { n.style.opacity = '0'; });
    this.el['fa-area'].textContent = '0';
    this.el['fb-area'].textContent = '0';
    // The labels sit under their own pen, wherever that pen ended up.
    this.el['fin-a-lbl'].style.left = Math.round(ax + wA / 2 - 160) + 'px';
    this.el['fin-b-lbl'].style.left = Math.round(bx + wB / 2 - 160) + 'px';
    /* The card has to clear the LOWEST thing the fence draws, not the ground
       line: from overhead the post discs are centred on their node and so hang
       below it. Taking the overhang from the art means the card cannot end up
       resting on the rail again if the modules are ever recut. */
    const cardTop = Math.round(GROUND + this.fenceOver().down * cell + 14);
    this.el["fin-a-lbl"].style.top = this.el["fin-b-lbl"].style.top = cardTop + "px";
    /* The way on sits in the gap BETWEEN the two cards. It used to be centred
       on the stage, which is not the same thing: the cards are centred under
       their own pens, so with two pens of different widths the middle of the
       stage can land on top of a card - and once the cards were enlarged, it
       did. Centre it on the real gap instead. */
    this.el.next.classList.add("ftf-mid");
    const aR = ax + wA / 2 + 160, bL = bx + wB / 2 - 160;   // facing card edges
    // offerNext centres the button on this once it knows its own width.
    this._nextMid = Math.max(160, Math.min(1120, (aR + bL) / 2));
    this.el.next.style.marginLeft = '0';
    this.el['fin-a-lbl'].querySelector('.ftf-cmp-tag').textContent = this.t(opts.tagA || 'final.startBuild');
    this.el['fin-b-lbl'].querySelector('.ftf-cmp-tag').textContent = this.t(opts.tagB || 'final.bestBuild');

    const wait = this.dropPen('main');
    this.after(wait, () => {
      const pa = this.pens.finA || this.newPen('finA', this.el.modules);
      const pb = this.pens.finB || this.newPen('finB', this.el.modules);
      pa.cell = cell; pa.ax = ax; pa.ay = GROUND - A[1] * cell; pa.L = A[0]; pa.W = A[1];
      pb.cell = cell; pb.ax = bx; pb.ay = GROUND - B[1] * cell; pb.L = B[0]; pb.W = B[1];
      const st = this.noMotion() ? 0 : 480 / (2 * perimeter);
      this.syncPen(pa, { stagger: st });
      this.syncPen(pb, { stagger: st });

      this._goatPen = 'finB';
      this.goat.h = this.goatHeight();
      this.goat.x = pb.ax + cell; this.goat.y = pb.ay + B[1] * cell - cell;
      this.setGoat('idle');

      this.el['fa-dims'].textContent = A[0] + ' × ' + A[1] + ' m';
      this.el['fb-dims'].textContent = B[0] + ' × ' + B[1] + ' m';
      /* Wait for the fence the tracer is about to measure to actually BE there.
         The labels and the tracer used to run on fixed 560ms / +460ms timers
         while the build takes stagger x 2P + 210 - which is comfortably shorter
         at every perimeter, so it worked, but only by arithmetic that nothing
         checked. Deriving the wait from the same stagger the build was given
         means a measuring light can never walk a half-built fence, whatever the
         perimeter and however slow the device. */
      const built = this.noMotion() ? 0 : st * 2 * perimeter + 210;
      this.after(this.noMotion() ? 0 : Math.max(560, built + 120), () => {
        this.el['fin-a-lbl'].style.opacity = '1';
        this.el['fin-b-lbl'].style.opacity = '1';
        this.after(this.noMotion() ? 0 : 460, () => this.finaleTrace(perimeter));
      });
    });
    this.track('recap_started', { a: A.join('x'), b: B.join('x'), perimeter: perimeter });
  },

  /* The game's own ending is the same recap, then the interactive proof. */
  finaleStart() {
    this.closeLive();
    const r = this.ROUNDS[3];
    this.retractPlank();
    this.compareBuilds(r.start, r.optimum, r.perimeter, { then: () => { this._nextIsPeak = true; this.offerNext('action.reveal'); } });
  },

  /* ------------------------------------------------------------- phase 2 --
     A gold tracer walks each perimeter at the same speed. Both runs are 32 m
     long, so they finish together - that IS the proof, not a caption. */
  /* The rectangle the tracer follows is NOT the pen's node rectangle: the posts
     meet the ground there, but their rails hang LOG of a metre higher up. Trace
     the node line and the stroke runs across the middle of the fence instead of
     along it - so the whole rectangle is lifted onto the rail line. */
  traceRect(el, p, L, W, cell, per) {
    el.setAttribute('x', String(p.ax));
    el.setAttribute('y', String(p.ay - this.MOD.LOG * cell));
    el.setAttribute('width', String(L * cell));
    el.setAttribute('height', String(W * cell));
    el.setAttribute('pathLength', String(per));
    el.style.strokeDasharray = per;
    el.style.strokeDashoffset = per;
    el.style.transition = 'none';
  },
  /* Casing and core for one run, so they grow as a single stroke. */
  traceLayers(id) { return [this.el[id + '-gl'], this.el[id + '-bg'], this.el[id]]; },

  finaleTrace(perimeter) {
    const C = this._cmp, per = perimeter || this.ROUNDS[3].perimeter;
    const runs = [
      { id: 'trace-a', pen: 'finA', L: this.finA.L, W: this.finA.W },
      { id: 'trace-b', pen: 'finB', L: this.finB.L, W: this.finB.W }
    ];
    const all = [];
    runs.forEach(r => this.traceLayers(r.id).forEach(el => {
      this.traceRect(el, this.pens[r.pen], r.L, r.W, C.cell, per);
      all.push(el);
    }));
    this.el.trace.style.opacity = '1';

    const dur = this.noMotion() ? 0 : 1900;
    this.after(30, () => {
      all.forEach(el => {
        el.style.transition = 'stroke-dashoffset ' + dur + 'ms linear';
        el.style.strokeDashoffset = '0';
      });
    });
    // A soft measuring tick per metre, thinned so it reads as measuring.
    if (!this.noMotion()) {
      for (let i = 1; i <= per; i += 2) this.after(30 + dur * i / per, () => this.sfx('measure_tick'));
    }
    this.after(dur + 120, () => {
      this.sfx('fence_snap_big');
      this.after(90, () => this.sfx('chime'));
      this.el['fa-per'].textContent = per + ' m';
      this.el['fb-per'].textContent = per + ' m';
      this.el.fin.querySelectorAll('.ftf-cmp-per').forEach(n => { n.style.opacity = '1'; });
      this.after(this.noMotion() ? 0 : 700, () => this.finaleGrass());
    });
  },

  /* ------------------------------------------------------------- phase 3 --
     Now the interiors. The grass counts up, and the second number runs away
     from the first. She looks at both, then goes where the grass is. */
  finaleGrass() {
    const C = this._cmp;
    this.el.trace.style.opacity = '0';
    // Two grass fills, drawn behind the fences.
    ['finA', 'finB'].forEach((id, i) => {
      const p = this.pens[id], d = i ? this.finB : this.finA;
      let box = this['_fg' + i];
      if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:absolute;z-index:96;border-radius:4px;opacity:0;' +
          'transition:opacity 620ms ease;box-shadow:inset 0 0 40px rgba(46,92,16,.3)';
        this.el.field.appendChild(box);
        this['_fg' + i] = box;
      }
      box.style.left = p.ax + 'px'; box.style.top = p.ay + 'px';
      box.style.width = (d.L * C.cell) + 'px'; box.style.height = (d.W * C.cell) + 'px';
      box.style.background = i ? 'rgba(120,214,60,.34)' : 'rgba(140,196,50,.2)';
      this.after(40, () => { box.style.opacity = '1'; });
    });

    this.el.fin.querySelectorAll('.ftf-cmp-area').forEach(n => { n.style.opacity = '1'; });
    const a = this.finA.L * this.finA.W, b = this.finB.L * this.finB.W;
    this.countUp(this.el['fa-area'], a, 900);
    this.countUp(this.el['fb-area'], b, 1500);

    this.after(this.noMotion() ? 0 : 1700, () => {
      this.vo('vo.final');
      this.sfx('area_up');
      // She looks at the long field, then walks into the big one.
      this.goat.face = -1;
      this.setGoat('curious');
      this.after(900, () => {
        const p = this.pens.finB;
        this.goat.tx = p.ax + this.finB.L * C.cell * 0.55;
        this.goat.ty = p.ay + this.finB.W * C.cell * 0.6;
        this.setGoat('walk');
        this.after(1600, () => this.setGoat('eat'));
      });
      // Hand back to whoever asked for the recap.
      this.after(2300, () => { if (this._cmpThen) this._cmpThen(); });
    });
  },
  countUp(el, to, ms) {
    if (this.noMotion() || !ms) { el.textContent = String(to); return; }
    const t0 = performance.now();
    const tick = () => {
      if (this.dead) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.textContent = String(Math.round(to * (0.15 + 0.85 * k * k)));
      if (k < 1) requestAnimationFrame(tick); else el.textContent = String(to);
    };
    requestAnimationFrame(tick);
  },

  /* ------------------------------------------------------------- phase 4 --
     The fence comes back to the middle and the player drags again, with a
     performance meter behind the number. Past the balance point the token
     falls: the peak is discovered, not announced. */
  finalePeak() {
    this.clearTimers();
    const r = this.ROUNDS[3], F = this.FIN;
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    this.el.fin.style.display = 'none';
    [0, 1].forEach(i => { if (this['_fg' + i]) this['_fg' + i].style.opacity = '0'; });

    const wait = Math.max(this.dropPen('finA'), this.dropPen('finB'));
    this.after(wait, () => {
      this.stats.phase = 'peak';
      this.stats.completed = false;
      this._goatPen = 'main';
      // Start from the shape they began the farm with, so the climb is theirs.
      this.applyLayout(r.perimeter, r.start[0], r.start[1], F.soloCell, F.soloX, F.soloY);
      this.stats.bestArea = r.start[0] * r.start[1];
      this.el.fill.style.opacity = '1';
      this.el['fence-badge'].style.opacity = '1';
      this.el['area-card'].style.opacity = '1';
      this.el['area-val'].textContent = String(r.start[0] * r.start[1]);
      this.buildFence(600, () => {
        this.showHandle(true);
        this.pulseOnly('handle');
        this.peakCurve();
        this.el.curve.style.opacity = '1';
        this.moveGoatInside(true);
        this.setGoat('eat');
        this.render();
      });
    });
    this.track('peak_started', {});
  },
  /* A(W) = (half - W) * W, drawn in the meter's own viewBox. The WHOLE hill is
     plotted, not just the legal slice, so the player can see there is a
     maximum and where on it they are standing. No axes and no grid yet: this
     reads as a performance meter, not as school graphing. */
  peakCurve() {
    const g = this.g, V = { x0: 30, x1: 228, y0: 14, y1: 110 };
    const wLo = 1, wHi = g.half - 1;
    let lo = Infinity, hi = -Infinity;
    for (let w = wLo; w <= wHi; w++) { const a = (g.half - w) * w; if (a < lo) lo = a; if (a > hi) hi = a; }
    this._pk = { V: V, wLo: wLo, wHi: wHi, lo: lo, hi: hi };
    const pt = w => this.peakPt(w);
    let d = '';
    for (let w = wLo; w <= wHi; w += 0.25) {
      const p = pt(w);
      d += (d ? ' L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
    this.el['curve-path'].setAttribute('d', d);
    this.peakStep(g.L * g.W);
  },
  peakPt(w) {
    const g = this.g, k = this._pk, V = k.V;
    const a = (g.half - w) * w;
    const x = V.x0 + (w - k.wLo) / (k.wHi - k.wLo) * (V.x1 - V.x0);
    const y = V.y1 - (a - k.lo) / (k.hi - k.lo) * (V.y1 - V.y0);
    return [x, y];
  },
  peakStep(area) {
    if (!this._pk) return;
    const g = this.g, p = this.peakPt(g.W);
    this.el['curve-tok'].setAttribute('cx', p[0].toFixed(1));
    this.el['curve-tok'].setAttribute('cy', p[1].toFixed(1));
    const drop = this.el['curve-drop'];
    drop.setAttribute('x1', p[0].toFixed(1)); drop.setAttribute('x2', p[0].toFixed(1));
    drop.setAttribute('y1', p[1].toFixed(1)); drop.setAttribute('y2', String(this._pk.V.y1));
    if (g.L === g.W && !this.stats.completed) this.peakFound();
  },
  peakFound() {
    this.stats.completed = true;
    const g = this.g;
    this.pulseOnly(null);
    this.el.glow.style.opacity = '0';
    this.el.handle.classList.remove('ftf-live');   // seen, but the drag is over
    this.bump(this.el['area-val'], 'ftf-hero', 620);
    this.after(90, () => {
      if (!this.noMotion()) this.pens.main.nodes.forEach(el => { el.style.animation = 'ftf-rise 220ms cubic-bezier(.34,1.4,.64,1)'; });
      this.sfx('fence_snap_big');
    });
    this.after(200, () => { this.goat.jump = 0.55; this.setGoat('happy'); });
    this.after(320, () => {
      this.sfx('success_chord');
      this.el['curve-peak'].textContent = g.L + ' × ' + g.W + ' = ' + (g.L * g.W) + ' m²';
      this.el['curve-peak'].style.opacity = '1';
      this.musicTier(4);
    });
    // The emblem assembles rather than popping, and it speaks in the numbers
    // this player actually climbed through - not in textbook terms.
    this.after(900, () => {
      const r = this.ROUNDS[g.round];
      this.el['emb-sum'].textContent =
        r.start[0] + ' × ' + r.start[1] + ' = ' + (r.start[0] * r.start[1]) + ' m²' +
        '   →   ' + g.L + ' × ' + g.W + ' = ' + (g.L * g.W) + ' m²';
      // flex, not block: the card and the way-on sit side by side in one bar.
      this.el.emblem.style.display = 'flex';
      if (!this.noMotion()) this.el.emblem.style.animation = 'ftf-fadein 520ms ease';
      this.sfx('record_success');
    });
    this.track('peak_found', { area: g.L * g.W });
  },

  /* Re-uses the tracer for a single pen. */
  finaleTraceOne(id, p, L, W, dur) {
    const per = 2 * (L + W);
    // Park the run we are not using, casing and all.
    const other = id === 'trace-a' ? 'trace-b' : 'trace-a';
    this.traceLayers(other).forEach(el => el.setAttribute('width', '0'));
    const layers = this.traceLayers(id);
    layers.forEach(el => this.traceRect(el, p, L, W, p.cell, per));
    this.el.trace.style.opacity = '1';
    if (this.noMotion()) { layers.forEach(el => { el.style.strokeDashoffset = '0'; }); return; }
    this.after(30, () => layers.forEach(el => {
      el.style.transition = 'stroke-dashoffset ' + dur + 'ms linear';
      el.style.strokeDashoffset = '0';
    }));
    for (let i = 1; i <= per; i += 2) this.after(30 + dur * i / per, () => this.sfx('measure_tick'));
  },

  /* Now with axes: x is length, y is area, and the peak is marked. The curve
     is drawn in the meter's own viewBox, so growing the element grows the
     graph - it is literally the same curve, rescaled. */
  advCurve() {
    const g = this.g, V = { x0: 30, x1: 228, y0: 14, y1: 110 };
    const lLo = 1, lHi = g.half - 1;
    let lo = 0, hi = -Infinity;
    for (let l = lLo; l <= lHi; l++) { const a = l * (g.half - l); if (a > hi) hi = a; }
    const pt = l => {
      const a = l * (g.half - l);
      return [V.x0 + (l - lLo) / (lHi - lLo) * (V.x1 - V.x0),
              V.y1 - (a - lo) / (hi - lo) * (V.y1 - V.y0)];
    };
    let d = '';
    for (let l = lLo; l <= lHi; l += 0.1) {
      const p = pt(l);
      d += (d ? ' L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
    this.el['curve-path'].setAttribute('d', d);
    const p = pt(g.L);
    this.el['curve-tok'].setAttribute('cx', p[0].toFixed(1));
    this.el['curve-tok'].setAttribute('cy', p[1].toFixed(1));
    const drop = this.el['curve-drop'];
    drop.setAttribute('x1', p[0].toFixed(1)); drop.setAttribute('x2', p[0].toFixed(1));
    drop.setAttribute('y1', p[1].toFixed(1)); drop.setAttribute('y2', String(V.y1));
    // The axes span the drawn range.
    const ax = this.el['curve-axes'].children;
    ax[0].setAttribute('x1', V.x0); ax[0].setAttribute('x2', V.x0);
    ax[0].setAttribute('y1', V.y0); ax[0].setAttribute('y2', V.y1);
    ax[1].setAttribute('x1', V.x0); ax[1].setAttribute('x2', V.x1 + 8);
    ax[1].setAttribute('y1', V.y1); ax[1].setAttribute('y2', V.y1);
  },

  /* ------------------------------------------------------------ complete -- */
  completeScreen() {
    this.closeLive();
    this.clearTimers();
    this.stats.phase = 'complete';
    this.el.emblem.style.display = 'none';
    this.el.curve.style.opacity = '0';
    this.el.curve.classList.remove('ftf-graph');
    this.el['curve-peak'].style.opacity = '0';
    this.el.trace.style.opacity = '0';
    this.el['area-card'].style.opacity = '0';
    this.el['fence-badge'].style.opacity = '0';
    this.showHandle(false);
    this.showDims(false);
    // The winning pasture is rebuilt centre stage - the same sink-and-rise
    // the game uses between farms, so the world stays continuous.
    this._goatPen = 'main';
    const r = this.ROUNDS[3], L = r.optimum[0], W = r.optimum[1];
    // Fit the winning pasture into the gap the panel leaves rather than trusting
    // a fixed cell: at cell 40 the post tops rose 27px behind the badge board.
    const f = this.fitPen(L, W, this.LAY.DONE_TOP, this.LAY.DONE_BOT, 40);
    const wait = this.dropPen('main');
    this.after(wait, () => {
      this.applyLayout(r.perimeter, L, W, f.cell, f.ax, f.ay, 3);
      this.el.fill.style.transition = 'opacity 500ms ease, background 500ms ease';
      this.el.fill.style.background = 'rgba(108,208,48,.34)';
      this.el.fill.style.opacity = '1';
      this.render({ instant: true, noFence: true });
      this.buildFence(620, () => { this.setGoat('eat'); this.render(); });
      this.moveGoatInside(true);
    });
    this.fitSign(this.el.badge, { min: 18, max: 44 });
    this.el.complete.style.display = 'block';
    if (!this.noMotion()) this.el.complete.style.animation = 'ftf-fadein 520ms ease both';
    this.sfx('record_success');
    this.musicTier(4);
    this.track('game_completed', {});
  },

  /* ======================================================== EXPLORE ===== */
  exploreScreen() {
    this.closeLive();
    this.clearTimers();
    this.stats.phase = 'explore';
    this.stats.completed = false;
    ['fin', 'complete', 'title'].forEach(k => { this.el[k].style.display = 'none'; });
    this.el.emblem.style.display = 'none';
    this.el.curve.style.opacity = '0';
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    this.retractPlank();
    this.setLight('midday');
    this._goatPen = 'main';
    this.el.explore.style.display = 'block';

    // No win condition, no target: several fence lengths and a free hand.
    if (!this._exploreBuilt) {
      this._exploreBuilt = true;
      [16, 20, 24, 28, 32, 40].forEach(p => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ftf-chip ftf-focus';
        b.textContent = p + ' m';
        b.setAttribute('aria-pressed', 'false');
        b.onclick = () => { this.sfx('button_press'); this.exploreSet(p); };
        this.el['explore-chips'].appendChild(b);
      });
    }
    this.exploreSet(24);
  },
  exploreSet(perimeter) {
    const A = this.LAY, M = this.MOD, half = perimeter / 2;
    const Lmax = half - 1, Wmax = Math.min(half - 1, Math.ceil(half / 2) + 1);
    // A start that is deliberately unbalanced, so there is something to find.
    const W0 = Math.max(1, Math.round(half * 0.25)), L0 = half - W0;
    let cell = Math.min(0.50 * 1280 / L0, (A.RIGHT - A.LEFT) / Lmax,
      (A.BOTTOM - A.PLANK_BOT) / (Wmax + M.POST.h));
    cell = Math.max(0.45 * 1280 / L0, Math.min(0.55 * 1280 / L0, cell));
    const ay = A.PLANK_BOT + M.POST.oy * cell;
    const ax = Math.max(A.LEFT, Math.min(A.CX - L0 * cell / 2, A.RIGHT - Lmax * cell));

    Array.from(this.el['explore-chips'].children).forEach(b => {
      b.setAttribute('aria-pressed', String(b.textContent === perimeter + ' m'));
    });

    const wait = this.dropPen('main');
    this.after(wait, () => {
      this.applyLayout(perimeter, L0, W0, cell, ax, ay);
      this.stats.bestArea = 0;
      this.el['fence-val'].textContent = perimeter + ' m';
      this.el['area-val'].textContent = String(L0 * W0);
      this.el['fence-badge'].style.opacity = '1';
      this.el['area-card'].style.opacity = '1';
      this.el.fill.style.opacity = '1';
      this.showDims(false);
      this.buildFence(650, () => {
        this.showHandle(true);
        this.pulseOnly('handle');
        this.moveGoatInside(true);
        this.setGoat('eat');
        this.render();
      });
    });
    this.track('explore_set', { perimeter: perimeter });
  }
});

/* The NEXT button leads into the peak phase once the comparison is done. */
(function (proto) {
  const adv = proto.advance;
  proto.advance = function () {
    if (this._nextIsPeak) { this._nextIsPeak = false; this.sfx('button_press'); this.finalePeak(); return; }
    adv.call(this);
  };
})(FenceTheFarm.prototype);
