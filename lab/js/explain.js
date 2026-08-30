/* ============================================================================
   FENCE THE FARM — the live explanation

   This screen replaces the three static panels that used to do the explaining:
   the formula board, the "See why" algebra wall, and the "Strategy discovered"
   card. All three told the student something. This one lets them do it.

   The pasture is real and the handle is live. The fence is pinned at the
   perimeter they finished with and visibly cannot change. As they drag:

     the two side lengths change
     L + W stays at half the perimeter, in front of them
     the area is recomputed and shown
     a token rides the area-against-length curve at their hand

   And the strategy is never printed. It appears only if and when they land on
   the balanced shape themselves - which is the whole difference between being
   told a rule and finding one.
   ========================================================================== */

Object.assign(FenceTheFarm.prototype, {

  /* Where the pasture and the curve live on this screen. The pasture takes the
     left, the curve the right, and the cell is chosen so that EVERY shape the
     student can drag to still fits - otherwise the fence would run off the
     screen the moment they explored the extremes. */
  LIVE: { px0: 70, px1: 610, py0: 150, py1: 560 },

  explainScreen() {
    this.clearTimers();
    const g = this.g, A = this.LIVE;

    // Everything that belonged to the old explanation screens goes away.
    ['fin', 'fm', 'adv', 'complete', 'explore', 'title'].forEach(k => {
      if (this.el[k]) this.el[k].style.display = 'none';
    });
    this.el.emblem.style.display = 'none';
    this.el['curve-peak'].style.opacity = '0';
    this.el.trace.style.opacity = '0';
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    this.retractPlank();
    this.closeChoice();
    this.el['live-why'].classList.remove('ftf-in');
    this.el['live-strategy'].classList.remove('ftf-in');

    this.stats.phase = 'explain';
    this.stats.completed = false;
    this._goatPen = 'main';
    this._liveMoves = 0;
    this._liveFound = false;

    /* One cell for every shape they can reach. Lmax is the longest the pasture
       can get, Wmax the deepest, so sizing against both means no drag can push
       the fence off the screen or under the curve. */
    const half = g.half, Lmax = half - 1, Wmax = Math.min(half - 1, Math.ceil(half / 2) + 1);
    const o = this.fenceOver();
    const cell = Math.min((A.px1 - A.px0) / (Lmax + 2 * o.side),
                          (A.py1 - A.py0) / (Wmax + o.up + o.down));

    const wait = this.dropPen('main');
    this.after(wait, () => {
      /* Start them on the LOPSIDED shape this farm began with, never on the
         balanced one. Opening on the answer would hand them the discovery and
         reveal the strategy line before they had touched anything - which is
         the one thing this screen exists not to do. */
      const st = this.ROUNDS[g.round] && this.ROUNDS[g.round].start;
      const W0 = st ? Math.min(Wmax, st[1]) : Math.max(1, Math.round(half * 0.22));
      const L0 = half - W0;
      this.applyLayout(g.perimeter, L0, W0, cell,
        A.px0 + o.side * cell, A.py0 + o.up * cell, g.round);
      this.el.fill.style.transition = 'opacity 420ms ease, background 420ms ease';
      this.el.fill.style.background = 'rgba(108,208,48,.30)';
      this.el.fill.style.opacity = '1';
      this.render({ instant: true, noFence: true });

      this.el.curve.classList.add('ftf-live-pos');
      this.el.curve.classList.add('ftf-graph');
      this.el.curve.style.opacity = '1';

      this.el['fence-badge'].style.opacity = '1';   // pinned, and says so
      /* The area card stays down: the live A pill IS the area readout here, and
         two of them - one of which lags the drag - is exactly the clutter this
         screen exists to remove. */
      this.el['area-card'].style.opacity = '0';
      this.el.live.classList.add('ftf-on');

      this.buildFence(560, () => {
        this.showHandle(true);
        this.pulseOnly('handle');
        this.moveGoatInside(true);
        this.setGoat('eat');
        this.render();
        this.explainStep();
      });
      /* No floating side-length cards on this screen. The live pill already
         reads "A = 7 x 9 = 63 m²", which states both sides - so the cards were
         duplicate information, and on a deep pen the W card landed on the
         graph while the L card collided with the strategy line. */
      this.showDims(false);
      this.explainStep();
    });

    this.track('explain_started', { perimeter: g.perimeter });
  },

  /* Called on every shape change while this screen is up. Everything the
     student can see is recomputed from the one state, so the arithmetic, the
     curve and the fence can never disagree. */
  explainStep() {
    if (this.stats.phase !== 'explain') return;
    const g = this.g, area = g.L * g.W;
    this.el['live-lw'].textContent = 'L + W = ' + g.L + ' + ' + g.W + ' = ' + g.half;
    this.el['live-a'].textContent = 'A = ' + g.L + ' × ' + g.W + ' = ' + area + ' m²';
    this.el['why-2'].textContent = g.perimeter + ' = 2 (L + W)';
    this.el['why-3'].textContent = 'L + W = ' + g.half;
    this.advCurve();
    /* The peak label names the peak, so it belongs to the peak: it used to be
       written once and left up, which meant the screen claimed "A = 64" while
       the player was standing on 15 x 1. */
    this.el['curve-peak'].style.opacity = (g.L === g.W) ? '1' : '0';

    /* The peak. Only once, and only after a move of their own - the first call
       is the screen drawing itself, and that must never count as a discovery. */
    if (g.L === g.W && !this._liveFound && this._liveMoves > 0) {
      this._liveFound = true;
      this.el['live-strategy'].classList.add('ftf-in');
      this.el['curve-peak'].textContent = g.L + ' × ' + g.W + ' = ' + area + ' m² — the most from ' + g.perimeter + ' m';
      this.el['curve-peak'].style.opacity = '1';
      this.sfx('success_chord');
      this.setGoat('happy');
      this.track('explain_peak_found', { moves: this._liveMoves });
    }
    this._liveMoves++;
  },

  explainWhy() {
    this.el['live-why'].classList.toggle('ftf-in');
    this.track('explain_why_opened', {});
  }
});

/* The live screen has to be a place the handle works, and a place the main pen
   is the real pasture - so it joins the phases that allow both. */
(function (proto) {
  const owns = proto.ownsMain, drag = proto.dragAllowed, step = proto.levelStep;
  proto.ownsMain = function () { return this.stats.phase === 'explain' || owns.call(this); };
  proto.dragAllowed = function () { return this.stats.phase === 'explain' || drag.call(this); };
  /* Reshaping on this screen is not a level move - there is nothing to succeed
     at - so the level mechanics are skipped and only the readouts update. */
  proto.levelStep = function (prevArea, area, dir, isBest) {
    if (this.stats.phase === 'explain') { this.explainStep(); return; }
    step.call(this, prevArea, area, dir, isBest);
  };
  /* Nor is LETTING GO of the handle. levelStep was guarded but evaluateRelease
     was not, so releasing on the balanced shape ran the farm's entire success
     path straight over the top of the explanation: the plank came back saying
     "Master build." across the live hint, succeed() threw the side-length cards
     and their measurement lines back onto grass this screen deliberately keeps
     clear, and "See the proof" was offered beside the screen's own two buttons.

     Landing on the square here is a discovery, not a win - there is nothing to
     complete on this screen - and explainStep is what marks it. */
  const rel = proto.evaluateRelease, relLv = proto.levelRelease;
  proto.evaluateRelease = function () {
    if (this.stats.phase === 'explain') { this.explainStep(); return; }
    rel.call(this);
  };
  proto.levelRelease = function () {
    if (this.stats.phase === 'explain') return;
    relLv.call(this);
  };
})(FenceTheFarm.prototype);
