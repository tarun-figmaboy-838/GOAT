/* ============================================================================
   FENCE THE FARM — core engine
   Geometry, the fence module system, input, and the round scaffolding.
   Level mechanics live in levels.js; the finale lives in finale.js.

   One scalar drives the whole game. For a perimeter P the invariant is
        length + width === P / 2
   and the area is length * width. Every pixel is derived from that state, so
   the picture can never disagree with the number.
   ========================================================================== */
class FenceTheFarm {
  constructor(options) {
    this.options = Object.assign({
      snapGuide: 'On drag', audio: true, music: true, vo: false,
      debugMode: false, startRound: 1
    }, options || {});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => this.init());
    else this.init();
  }
  setOption(key, value) {
    this.options[key] = value;
    if ((key === 'music' || key === 'audio') && this.stopBgm) {
      if (value === false) this.stopBgm();
      else if (this._goatAudioUnlocked) this.startBgm();
    }
    if (key === 'audio' && value === false && this.stopGoatAudio) this.stopGoatAudio(true);
    if (key === 'audio' && value !== false && this.prepareGoatAudio) {
      this.prepareGoatAudio();
      if (this.goat) this.goatAudioState(this.goat.state);
    }
    if (this.root) this.refresh();
  }

  init() {
    this.root = document.getElementById('ftf-stage');
    if (!this.root) return;

    /* Four farms, four different questions built on the same interaction.
       The optimum is never shown before the player finds it. */
    this.ROUNDS = [
      { id: 1, name: 'Discovery',      perimeter: 20, start: [8, 2],  optimum: [5, 5], mechanic: 'tutorial',      light: 'morning', goats: 1 },
      { id: 2, name: 'Farm Record',    perimeter: 24, start: [10, 2], optimum: [6, 6], mechanic: 'record',        light: 'midday',  record: 32, goats: 2 },
      { id: 3, name: 'Visual Trap',    perimeter: 28, start: [10, 4], optimum: [7, 7], mechanic: 'misconception', light: 'evening', forcedStretch: [12, 2], goats: 3 },
      { id: 4, name: 'Master Builder', perimeter: 32, start: [13, 3], optimum: [8, 8], mechanic: 'mastery',       light: 'golden',  optionalTarget: 48, goats: 4 }
    ];

    /* The playable box, in the 1280 x 720 design space. The pasture is sized so
       every legal shape of a round fits inside it, which is what keeps the
       fence clear of the HUD however the player reshapes it. */
    /* DONE_TOP / DONE_BOT are the clear band the completion pasture may use:
       the badge board ends at 190 and #ftf-complete-foot starts at 532, so the
       pasture is fitted between them rather than given a fixed cell - which is
       what used to leave the board sitting on top of the fence. */
    this.LAY = { PLANK_BOT: 104, BOTTOM: 700, LEFT: 80, RIGHT: 966, CX: 640,
                 DONE_TOP: 204, DONE_BOT: 520 };

    /* Fence module metrics, as fractions of one metre (= one cell).

       The farm is drawn from directly overhead, so a post is the round end of a
       sawn log and a rail is a plank lying on the grass. Both were cut from the
       supplied top-view kit and measured off it:
         POST   td-post.png    265 x 265, a 203px wood disc centred in the box,
                               the rest being the grass collar around it. The
                               box is square and the disc is concentric, so the
                               post is simply centred on its node - ox and oy
                               are half the box.
         RAIL   td-rail-h.png  900 x 134, a plank of even thickness end to end.
         VRAIL  td-rail-v.png  the same plank turned a quarter turn.

       LOG is 0 because nothing hangs above anything from this angle: rails lie
       on the node lines. Every screen that measures the fence - the perimeter
       tracer, the pasture fitter, the side-length cards, the drag handle - reads
       these numbers, so they all follow the art to the top view on their own. */
    this.MOD = {
      LOG:   0,
      POST:  { w: 0.594, h: 0.594, ox: 0.297, oy: 0.297, wood: 0.766 },
      RAIL:  { h: 0.30, tile: 1 },
      VRAIL: { w: 0.30, tile: 1 }
    };

    /* The finale keeps the same farm: one cell for both fields, one ground
       line, and a place for the winning pasture to come back to. */
    this.FIN = { cell: 40, ground: 500, ax: 140, bx: 820, soloCell: 44, soloX: 228, soloY: 168 };

    /* Short VO lines. Recordings were not supplied, so vo() is a hook: it
       fires at the right beat and is logged, and only speaks if options.vo is
       switched on. Synthetic speech is off by default, on purpose. */
    /* The narration script. These are the exact words the recordings say, and
       they are the source of truth for generating them - see assets/vo/.

       They are DELIBERATELY LONGER than the sign. The sign is artwork with a
       cream board about 340px across, so written copy has to survive at roughly
       thirty characters; speech has no such limit. The pairing is the point:
       you read "Perimeter: 20 m, locked" and you hear the sentence that
       explains it. Neither is a transcript of the other.

       Numbers are spelled out. A synthesiser reading "20 m" can say "twenty em"
       or "twenty metres" depending on the day, and the one thing narration must
       never do is misread the quantity the whole lesson is about. */
    this.VO = {
      'vo.hook':      'How much grass can one fence hold? Let us find out.',
      'vo.reason':    'This is her field. You have twenty metres of fence — see how much grass you can give her.',
      'vo.fence':     'This is the perimeter. Twenty metres of fence, all the way around, and it never changes.',
      'vo.area':      'And this is the area — all the grass inside. Count the squares.',
      'vo.drag':      'Drag that corner, and watch what happens.',
      'vo.same':      'Look at that. More grass — and still exactly twenty metres of fence.',
      'vo.more':      'Try another shape.',
      'vo.challenge': 'Now find the biggest field you can.',
      'vo.nice':      'That is the biggest it gets. Same fence, more grass.',
      'vo.longer':    'Hmm. Longer did not mean more grass.',
      'vo.record':    'See if you can beat the farm record.',
      'vo.stretch':   'Here is an idea. Try making the field longer.',
      'vo.didLonger': 'Longer field. Less grass. Now find the most.',
      'vo.exact':     'Exactly forty-eight. Nice and precise.',
      'vo.master':    'Master build.',
      'vo.final':     'Same fence. Different area.'
    };

    this.el = {};
    this.root.querySelectorAll('[id^="ftf-"]').forEach(n => { this.el[n.id.slice(4)] = n; });

    this.pens = {};
    this.g = { round: 0, perimeter: 20, half: 10, L: 8, W: 2, cell: 78.7, ax: 258, ay: 216, Wmax: 6, Lmax: 9, startArea: 16 };
    this.stats = {
      phase: 'title', bestArea: 0, dragging: false, completed: false, grabbed: false,
      firstChange: false, reversals: 0, lastDir: 0, retries: 0, t0: 0, tier: 0
    };
    this.goat = { x: 640, y: 600, face: -1, state: 'idle', frame: 0, ft: 0, st: 0, next: 2, tx: 640, ty: 600, h: 236, jump: 0, wig: 0 };
    this.timers = [];
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.initStrings();
    this.fit();
    /* Rotating a phone fires resize before the new dimensions have settled, so
       the fit is repeated on the next frame; and a toolbar sliding in or out
       moves the visual viewport without firing a window resize at all. */
    this._onResize = () => { this.fit(); requestAnimationFrame(() => this.fit()); };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onResize);
      window.visualViewport.addEventListener('scroll', this._onResize);
    }
    this.bindInput();
    this.prepareGoatAudio();
    this.preload();
    /* Build the mascot controller now rather than at the first celebration.
       Constructing it is what loads and decodes its eleven poses, so leaving it
       until playGoatCelebration made the FIRST celebration - the one that has
       to land hardest - the one that paid for 11 x 620px of PNG mid-performance. */
    if (this.mascot) this.mascot();
    this.newPen('main', this.el.modules);
    this.layout(0);
    this.loop();
    this.titleScreen();
    window.game = this;
    // The navigator is not merely hidden in production: it is never built.
    if (this.options.debugMode) { this.buildDebug(); this.el.debug.style.display = 'block'; }
  }

  destroy() {
    this.dead = true;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._onResize);
      window.visualViewport.removeEventListener('scroll', this._onResize);
    }
    if (this._key) window.removeEventListener('keydown', this._key);
    cancelAnimationFrame(this.raf);
    this.clearTimers();
    (this._keep || []).forEach(clearTimeout);
    this._keep = [];
    (this._perm || []).forEach(clearInterval);
    if (this._bgm) { try { this._bgm.el.pause(); } catch (e) {} }
    if (this.destroyGoatAudio) this.destroyGoatAudio();
    if (this._ac) { try { this._ac.close(); } catch (e) {} }
  }

  /* ---------------------------------------------------------------- infra -- */
  /* The stage is a fixed 1280 x 720 that is scaled to fit and letterboxed,
     never reflowed, so every position in the game can stay in design pixels.

     What it fits INTO is the visual viewport wherever the browser offers one.
     On a phone window.innerHeight includes the strip hidden under a collapsing
     address bar, so fitting to it puts the bottom of the stage behind the
     toolbar - and then jumps the moment that bar slides away. visualViewport
     reports the region actually on screen, which is the one to fill. */
  viewSize() {
    const v = window.visualViewport;
    return v ? [v.width, v.height] : [window.innerWidth, window.innerHeight];
  }
  fit() {
    const s = this.viewSize();
    this.root.style.transform = 'scale(' + Math.min(s[0] / 1280, s[1] / 720) + ')';
  }
  after(ms, fn) { const t = setTimeout(() => { if (!this.dead) fn(); }, ms); this.timers.push(t); return t; }
  clearTimers() {
    this.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); this.timers = [];
    // A phase change must also stop a half-revealed sentence: words from the
    // farm just left must never keep arriving on the next one.
    if (this._instr) this._instr.cancel();
  }
  pokeIdle() { if (this._instr) this._instr.poke(); }
  /* Housekeeping that must still happen after the screen it belonged to has
     gone. clearTimers() runs on every phase change and would otherwise cancel
     the only thing left to tidy up, so these are kept apart from the scripted
     timers and are only dropped when the game itself is destroyed. */
  afterKeep(ms, fn) {
    const t = setTimeout(() => { if (!this.dead) fn(); }, ms);
    (this._keep = this._keep || []).push(t);
    return t;
  }
  noMotion() { return this.reduce || this.forceReduce; }
  track(name, data) {
    const ev = Object.assign({ e: name, t: Math.round(performance.now()), round: this.g.round + 1 }, data || {});
    (window.__ftfAnalytics = window.__ftfAnalytics || []).push(ev);
    if (this.options.debugMode) console.debug('[ftf]', ev.e, ev);
  }
  vo(key) {
    const line = this.VO[key];
    if (!line) return;
    this.track('vo', { line: key });
    // Narration outranks everything: the bed drops further and for longer than
    // it does for any sound effect.
    if (this.duckBgm) this.duckBgm(this.BGM.voDuck, this.BGM.voMs);
    if (!this.options.vo || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.98; u.pitch = 1.02;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  setLight(name) { this.root.dataset.light = name || 'midday'; }
  preload() {
    const list = ['assets/art/grass-bg.webp', 'assets/art/title-logo.webp',
      'assets/art/td-post.webp', 'assets/art/td-rail-h.webp', 'assets/art/td-rail-v.webp',
      'assets/art/sign.webp', 'assets/art/card.webp', 'assets/art/area-card.webp', 'assets/art/touch.webp',
      // The three plan-view sheets. She must never flash an empty box the first
      // time she bites or bleats, so they come with the rest of the scene.
      'assets/goat/goat-walk.webp', 'assets/goat/goat-eat.webp', 'assets/goat/goat-bleat.webp'];
    // Her side-view frames, for the title and for the tilt out of it.
    for (let i = 0; i < 8; i++) list.push('assets/art/walk-' + i + '.webp');
    ['idle-0', 'idle-1', 'idle-2', 'bleat-0', 'bleat-1', 'bleat-2', 'graze-0', 'graze-1', 'graze-2', 'graze-3']
      .forEach(n => list.push('assets/art/' + n + '.webp'));
    let left = list.length;
    const done = () => { if (--left <= 0 && !this.dead) this.el.loader.style.display = 'none'; };
    list.forEach(src => { const im = new Image(); im.onload = done; im.onerror = done; im.src = src; });
  }
  /* Level 1 is only taught once per browser (§skip behaviour). */
  tutorialSeen() { try { return localStorage.getItem('ftf.tutorial') === '1'; } catch (e) { return false; } }
  markTutorialSeen() { try { localStorage.setItem('ftf.tutorial', '1'); } catch (e) {} }

  /* ------------------------------------------------------------- geometry --
     Wmax lets the player overshoot past the square, so the area is seen to
     fall away on BOTH sides of the balance point, while the opening pasture
     still lands at 45-55% of the stage width. */
  /* Take a retired module out of the DOM once its exit animation has played.
     A timer alone is not enough: clearTimers() runs on every phase change, and
     a reshape still animating when one lands used to leave its retired modules
     in the document for good - a single fast climb stranded 33 of them, and any
     that had not finished fading stayed on screen. animationend does the work
     now; the timer is only a backstop for a browser that never fires it, and
     remove() is idempotent so both firing is harmless. */
  retire(el, ms) {
    const kill = () => el.remove();
    el.addEventListener('animationend', kill, { once: true });
    el.addEventListener('animationcancel', kill, { once: true });
    this.afterKeep(ms, kill);
  }
  /* How far the fence art reaches past its node rectangle, in cells. Any screen
     that has to fit a pasture into a gap reads it from here, so re-cutting the
     module art moves those layouts with it instead of stranding them. */
  fenceOver() {
    const M = this.MOD;
    return { up: M.POST.oy, down: M.POST.h - M.POST.oy, side: M.POST.w / 2 };
  }
  /* The biggest cell that puts a whole L x W pasture inside a vertical band,
     and the ay that centres it there. */
  fitPen(L, W, top, bot, maxCell) {
    const o = this.fenceOver(), span = W + o.up + o.down;
    const cell = Math.min(maxCell, (bot - top) / span);
    const slack = (bot - top) - cell * span;
    return { cell: cell, ax: this.LAY.CX - L * cell / 2, ay: top + slack / 2 + o.up * cell };
  }
  layout(ri) {
    const r = this.ROUNDS[ri], half = r.perimeter / 2, A = this.LAY, M = this.MOD;
    const L0 = r.start[0], Lmax = half - 1;
    const Wmax = Math.min(half - 1, Math.ceil(half / 2) + 1);
    // The deepest legal pen, plus the post art standing above the far row and
    // the grass below the near row, must fit between the plank and the floor.
    let cell = Math.min(
      0.50 * 1280 / L0,
      (A.RIGHT - A.LEFT) / Lmax,
      (A.BOTTOM - A.PLANK_BOT) / (Wmax + M.POST.h)
    );
    cell = Math.max(0.45 * 1280 / L0, Math.min(0.55 * 1280 / L0, cell));
    this.applyLayout(r.perimeter, L0, r.start[1], cell,
      Math.max(A.LEFT, Math.min(A.CX - L0 * cell / 2, A.RIGHT - Lmax * cell)),
      A.PLANK_BOT + M.POST.oy * cell, ri);
  }
  /* A free layout, for Explore and for the finale's solo pasture. */
  applyLayout(perimeter, L, W, cell, ax, ay, ri) {
    const half = perimeter / 2;
    this.g = {
      round: ri == null ? this.g.round : ri,
      perimeter: perimeter, half: half, L: L, W: W,
      cell: cell, ax: ax, ay: ay,
      Wmax: Math.min(half - 1, Math.ceil(half / 2) + 1), Lmax: half - 1,
      startArea: L * W
    };
    const p = this.pens.main;
    p.L = L; p.W = W; p.cell = cell; p.ax = ax; p.ay = ay;
  }
  px(mx, my) { return [this.g.ax + mx * this.g.cell, this.g.ay + my * this.g.cell]; }

  /* --------------------------------------------------- fence module system --
     A pen is one enclosure. Modules are keyed by EDGE and index, never by
     absolute grid position, so when the shape changes the surviving pieces
     keep their identity and simply glide. Only the pieces that genuinely
     joined or left are animated - which is what makes the transfer read as
     moving material rather than rebuilding a rectangle. */
  newPen(id, layer) {
    const p = { id: id, L: 0, W: 0, cell: 72, ax: 0, ay: 0, nodes: new Map(), layer: layer || this.el.modules };
    this.pens[id] = p;
    return p;
  }
  penPx(p, mx, my) { return [p.ax + mx * p.cell, p.ay + my * p.cell]; }

  /* One post per node and one rail per metre, so the piece count IS the
     perimeter: P posts and P rails, whatever shape the pen is in.
     Build order: anchor, then clockwise - top, right, bottom, left. */
  penSeq(L, W) {
    const s = [];
    const post = (k, x, y) => s.push({ k: k, t: 'p', x: x, y: y });
    const rail = (k, t, x, y, o) => s.push({ k: k, t: t, x: x, y: y, o: o });
    post('tp:0', 0, 0);
    for (let i = 0; i < L; i++) { rail('tr:' + i, 'h', i, 0, '0% 50%');  post('tp:' + (i + 1), i + 1, 0); }
    for (let j = 0; j < W; j++) { rail('rr:' + j, 'v', L, j, '50% 0%');  post('rp:' + (j + 1), L, j + 1); }
    for (let i = L - 1; i >= 0; i--) { rail('br:' + i, 'h', i, W, '100% 50%'); post('bp:' + i, i, W); }
    for (let j = W - 1; j >= 0; j--) { rail('lr:' + j, 'v', 0, j, '50% 100%'); if (j > 0) post('lp:' + j, 0, j); }
    return s;
  }
  makeModule(p, m) {
    const c = p.cell, M = this.MOD, el = document.createElement('div');
    el.dataset.t = m.t;
    el.style.position = 'absolute';
    // Surviving modules glide to their new node as the pasture is reshaped -
    // but not for a player who has asked for reduced motion, who should see the
    // fence simply be in its new shape.
    el.style.transition = this.noMotion() ? 'none'
      : 'left 170ms cubic-bezier(.4,0,.2,1), top 170ms cubic-bezier(.4,0,.2,1)';
    if (m.t === 'p') {
      el.style.width = (M.POST.w * c) + 'px'; el.style.height = (M.POST.h * c) + 'px';
      el.style.background = 'url(assets/art/td-post.webp) 0 0 / 100% 100% no-repeat';
      // Seen from overhead a post is a disc, so it turns about its own centre.
      el.style.transformOrigin = '50% 50%';
    } else if (m.t === 'h') {
      // One plank to the metre, drawn to fill the module. Stretching the plank
      // rather than tiling it is what keeps a run of rails free of seams and
      // free of half-planks at the corners; the grain is far too fine at these
      // sizes for the horizontal squash to be visible.
      el.style.width = c + 'px'; el.style.height = (M.RAIL.h * c) + 'px';
      el.style.background = 'url(assets/art/td-rail-h.webp) 50% 50% / 100% 100% no-repeat';
      el.style.transformOrigin = m.o || '0% 50%';
    } else {
      el.style.width = (M.VRAIL.w * c) + 'px'; el.style.height = c + 'px';
      el.style.background = 'url(assets/art/td-rail-v.webp) 50% 50% / 100% 100% no-repeat';
      el.style.transformOrigin = m.o || '50% 0%';
    }
    el.style.filter = this.baseFilter(m.t, false);
    this.placeModule(p, el, m);
    return el;
  }
  placeModule(p, el, m) {
    const c = p.cell, M = this.MOD, q = this.penPx(p, m.x, m.y), x = q[0], y = q[1];
    /* From directly overhead there is no depth to sort: the fence lies flat on
       the grass, so the old y-based stacking is replaced by one fixed order -
       planks first, then the post discs that cap their ends. */
    if (m.t === 'p') {
      el.style.left = (x - M.POST.ox * c) + 'px';
      el.style.top = (y - M.POST.oy * c) + 'px';
      el.style.zIndex = '240';
    } else if (m.t === 'h') {
      el.style.left = x + 'px';
      el.style.top = (y - M.LOG * c - M.RAIL.h * c / 2) + 'px';
      el.style.zIndex = '210';
      el.style.transformOrigin = m.o || '0% 50%';
    } else {
      el.style.left = (x - M.VRAIL.w * c / 2) + 'px';
      el.style.top = (y - M.LOG * c) + 'px';
      el.style.zIndex = '210';
      el.style.transformOrigin = m.o || '50% 0%';
    }
  }
  /* Shadow length and lean come from the level's light (§level variation). */
  baseFilter(t, tight) {
    const k = tight ? 0.35 : 1;
    return 'drop-shadow(calc(var(--sh-x) * ' + k + ') calc(var(--sh-y) * ' + k + ') var(--sh-blur) var(--sh-ink))';
  }
  syncPen(p, opts) {
    opts = opts || {};
    const seq = this.penSeq(p.L, p.W), want = new Set(seq.map(m => m.k));
    const fast = this.noMotion() || opts.instant;

    p.nodes.forEach((el, key) => {
      if (want.has(key)) return;
      p.nodes.delete(key);
      if (fast) { el.remove(); return; }
      const t = el.dataset.t;
      el.style.animation = (t === 'p' ? 'ftf-sink 190ms' : t === 'v' ? 'ftf-railout-v 150ms' : 'ftf-railout 150ms') + ' ease-in forwards';
      this.retire(el, 210);
    });

    let lastSound = -999;
    seq.forEach((m, i) => {
      const have = p.nodes.get(m.k);
      if (have) { this.placeModule(p, have, m); return; }
      const el = this.makeModule(p, m);
      p.nodes.set(m.k, el);
      p.layer.appendChild(el);
      if (fast) return;
      const delay = opts.stagger ? Math.round(i * opts.stagger) : 0;
      el.style.animation = (m.t === 'p' ? 'ftf-rise 210ms' : m.t === 'v' ? 'ftf-railin-v 170ms' : 'ftf-railin 170ms') +
        ' cubic-bezier(.34,1.4,.64,1) ' + delay + 'ms both';
      if (!opts.stagger) return;
      // Construction patter, thinned out so a whole fence does not become noise.
      if (delay - lastSound >= 58) {
        lastSound = delay;
        const q = this.penPx(p, m.x, m.y);
        this.after(delay, () => {
          if (m.t === 'p') { this.sfx('fence_post_rise'); this.puff(q[0], q[1], p); }
          else this.sfx(i % 3 === 0 ? 'fence_rail_extend' : 'fence_snap');
        });
      }
    });
  }
  dropPen(id, opts) {
    const p = this.pens[id]; if (!p) return 0;
    opts = opts || {};
    const fast = this.noMotion() || opts.instant;
    p.nodes.forEach((el, key) => {
      p.nodes.delete(key);
      if (fast) { el.remove(); return; }
      const t = el.dataset.t;
      el.style.animation = (t === 'p' ? 'ftf-sink 200ms' : t === 'v' ? 'ftf-railout-v 160ms' : 'ftf-railout 160ms') + ' ease-in forwards';
      this.retire(el, 230);
    });
    if (!fast) { this.sfx('fence_rail_retract'); this.after(110, () => this.sfx('fence_post_sink')); }
    p.L = 0; p.W = 0;
    return fast ? 0 : 240;
  }
  dropAllPens(opts) { Object.keys(this.pens).forEach(id => this.dropPen(id, opts)); }
  /* Grass displacement where a post arrives or leaves. Never a dust cloud. */
  puff(x, y, p) {
    if (this.noMotion()) return;
    const s = p ? p.cell / 72 : 1, w = 44 * s, h = 28 * s;
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:' + (x - w / 2) + 'px;top:' + (y - h / 2) + 'px;width:' + w + 'px;height:' + h +
      'px;border-radius:50%;z-index:199;background:radial-gradient(circle,rgba(214,232,160,.8) 0%,rgba(150,190,90,0) 70%);' +
      'animation:ftf-puff 420ms ease-out forwards';
    this.el.modules.appendChild(d);
    // Kept out of the scripted timers for the same reason retired modules are:
    // a phase change landing mid-puff must not leave the tuft in the document.
    this.afterKeep(450, () => d.remove());
  }

  /* ----------------------------------------------------------------- draw -- */
  /* Phases in which the main pen is the live pasture. The finale's two
     comparison pens and the advanced reveal deliberately have none. */
  ownsMain() {
    const ph = this.stats.phase;
    return ph === 'intro' || ph === 'play' || ph === 'peak' ||
           ph === 'formula' || ph === 'explore' || ph === 'complete';
  }
  dragAllowed() {
    const ph = this.stats.phase;
    return ph === 'play' || ph === 'peak' || ph === 'explore';
  }
  render(opts) {
    opts = opts || {};
    const g = this.g, p = this.pens.main, c = g.cell, M = this.MOD;
    const owns = this.ownsMain();
    p.cell = c; p.ax = g.ax; p.ay = g.ay;
    if (owns) { p.L = g.L; p.W = g.W; }
    const w = g.L * c, h = g.W * c;

    this.el.fill.style.left = g.ax + 'px'; this.el.fill.style.top = g.ay + 'px';
    this.el.fill.style.width = w + 'px';  this.el.fill.style.height = h + 'px';
    // The grass grows subtly richer as the pasture nears its best shape.
    const ratio = Math.min(1, (g.L * g.W) / (g.half * g.half / 4));
    this.el.fill.style.background = 'rgba(' + Math.round(134 - 26 * ratio) + ',' + Math.round(196 + 16 * ratio) + ',' +
      Math.round(46 + 6 * ratio) + ',' + (0.15 + 0.16 * ratio) + ')';

    this.el.grid.style.left = g.ax + 'px'; this.el.grid.style.top = g.ay + 'px';
    this.el.grid.style.width = w + 'px';  this.el.grid.style.height = h + 'px';
    this.el.grid.style.background =
      'repeating-linear-gradient(90deg,rgba(255,255,255,.9) 0 1px,transparent 1px ' + c + 'px),' +
      'repeating-linear-gradient(0deg,rgba(255,255,255,.9) 0 1px,transparent 1px ' + c + 'px)';

    const hp = this.px(g.L, g.W);
    this.el.handle.style.left = hp[0] + 'px';
    this.el.handle.style.top = (hp[1] - M.LOG * c) + 'px';
    // Point the fingertip at the HANDLE, not at the fence node. The handle is
    // centred LOG * cell above the node - the same point the glow ring uses -
    // so anchoring to hp[1] alone left the hand a whole log-height too low.
    // The glove points up-left, with its fingertip at 11.33% across and 0.28%
    // down - measured off the art, not guessed - so its arm falls away to the
    // lower right, clear of the pasture.
    const hw = this.el.hand.offsetWidth || 96, hh = this.el.hand.offsetHeight || 115;
    const hcx = hp[0], hcy = hp[1] - M.LOG * c;
    this.el.hand.style.left = (hcx + 15 - hw * 0.1133) + 'px';
    this.el.hand.style.top = (hcy + 11 - hh * 0.0028) + 'px';

    if (owns && !opts.noFence) this.syncPen(p, opts);
    else if (!owns) this.dropPen('main', { instant: true });

    /* Exactly one corner ever looks draggable. Handing the badge on has to put
       the previous holder back the way it was found - ALL of it. Its z-index
       used to be left at 880, so every post that had ever been the live corner
       went on floating above the whole fence for the rest of the round. */
    if (this._cornerEl) {
      this._cornerEl.style.filter = this.baseFilter('p', false);
      this._cornerEl.style.scale = '';
      this._cornerEl.style.zIndex = '240';          // the plain post layer
    }
    const corner = p.nodes.get('rp:' + g.W);
    if (corner && !this.stats.completed && this.dragAllowed()) {
      corner.style.filter = 'brightness(1.12) saturate(1.08) drop-shadow(0 0 6px rgba(255,196,74,.9)) ' +
        'drop-shadow(var(--sh-x) var(--sh-y) var(--sh-blur) var(--sh-ink))';
      corner.style.zIndex = '880';
      /* makeModule deliberately gives a module NO transition under reduced
         motion. Setting one here unconditionally overrode that for the corner -
         and once a post has been the corner it keeps the glide for good, so a
         player who asked for no motion still got sliding fence posts. */
      corner.style.transition = this.noMotion() ? 'none'
        : 'left 170ms cubic-bezier(.4,0,.2,1), top 170ms cubic-bezier(.4,0,.2,1), scale 220ms cubic-bezier(.34,1.4,.64,1)';
      corner.style.scale = '1.05';
      this._cornerEl = corner;
    } else this._cornerEl = null;

    this.el['fence-val'].textContent = g.perimeter + ' m';
    const area = g.L * g.W;
    this.el.handle.setAttribute('aria-valuenow', String(area));
    this.el.handle.setAttribute('aria-valuetext', g.L + ' by ' + g.W + ' metres, ' + area + ' square metres');
    this.el.handle.setAttribute('aria-label',
      'Fence shape control. Fixed perimeter ' + g.perimeter + ' metres. ' + this.t('a11y.area') + ' ' + area + ' ' + this.t('a11y.sqm') + '.');
    this.updateGuide();
    this.placeDims();
    this.debugStats();
  }
  /* The two side lengths ride just INSIDE their own edge. Outside the fence
     they would fall off the floor at the deepest pen and collide with the
     area card at the widest; inside, they are always on screen, always next
     to the side they measure, and they move with the drag. */
  placeDims(p, L, W) {
    const main = !p;
    p = p || this.pens.main;
    if (L == null) L = main ? this.g.L : p.L;
    if (W == null) W = main ? this.g.W : p.W;
    // Outside its own edge, clear of the post art: these label the fence from
    // the grass, the way a measurement should. They only appear once the shape
    // is found, which is always the square - never the deepest or widest pen -
    // so there is always room below and to the right for them.
    /* Each measured side gets a dotted golden line running its full length,
       with its number card sitting ON the line's midpoint - so "8 m" IS the
       bottom edge, visibly, rather than a number floating near the fence. The
       lines sit one comfortable step outside the fence art. */
    const o = this.fenceOver(), c = p.cell;
    const bl = this.penPx(p, 0, W), br = this.penPx(p, L, W), tr = this.penPx(p, L, 0);
    const yb = bl[1] + o.down * c + 14;                  // below the bottom run
    const xr = tr[0] + o.side * c + 14;                  // right of the right run
    const set = (id, x1, y1, x2, y2) => {
      ['', '-gl'].forEach(sfx => {
        const el = this.el[id + sfx];
        el.setAttribute('x1', x1); el.setAttribute('y1', y1);
        el.setAttribute('x2', x2); el.setAttribute('y2', y2);
      });
    };
    set('mL', bl[0], yb, br[0], yb);
    set('mW', xr, tr[1], xr, br[1]);
    const dot = (id, x, y) => { this.el[id].setAttribute('cx', x); this.el[id].setAttribute('cy', y); };
    dot('mL-a', bl[0], yb); dot('mL-b', br[0], yb);
    dot('mW-a', xr, tr[1]); dot('mW-b', xr, br[1]);

    /* The card sits BESIDE its line, not on it: centred on the line it covers
       the dots and reads as a collision. Below the bottom line, right of the
       side line - clamped so a deep Explore shape cannot push it off stage. */
    this.el['dim-w'].textContent = L + ' m';
    this.el['dim-w'].style.left = ((bl[0] + br[0]) / 2) + 'px';
    this.el['dim-w'].style.top = Math.min(yb + 38, 688) + 'px';
    this.el['dim-h'].textContent = W + ' m';
    this.el['dim-h'].style.left = Math.min(xr + 56, 1198) + 'px';
    this.el['dim-h'].style.top = ((tr[1] + br[1]) / 2) + 'px';
  }
  showDims(on) {
    // One soft chime the moment the measurements appear - never on re-calls.
    if (on && this.el.measure && !this.el.measure.classList.contains('ftf-in')) this.sfx('chime');
    this.el['dim-w'].style.opacity = on ? '1' : '0';
    this.el['dim-h'].style.opacity = on ? '1' : '0';
    if (this.el.measure) this.el.measure.classList.toggle('ftf-in', !!on);
  }
  updateGuide() {
    const g = this.g;
    const w0 = Math.max(1, g.W - 2), w1 = Math.min(g.Wmax, g.W + 2);
    const a = this.px(g.half - w0, w0), b = this.px(g.half - w1, w1);
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
    this.el.guide.style.width = len + 'px';
    this.el.guide.style.left = ((a[0] + b[0]) / 2 - len / 2) + 'px';
    this.el.guide.style.top = ((a[1] + b[1]) / 2 - 1.5) + 'px';
    this.el.guide.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)';
  }
  /* The area value reacts on the same frame as the fence. */
  setArea(prev) {
    const a = this.g.L * this.g.W, v = this.el['area-val'];
    v.textContent = String(a);
    if (this.noMotion() || a === prev) return;
    v.style.animation = 'none'; void v.offsetWidth;
    v.style.animation = (a > prev ? 'ftf-pop 300ms' : 'ftf-dip 260ms') + ' cubic-bezier(.34,1.4,.64,1)';
  }
  bump(el, kf, ms) {
    if (!el || this.noMotion()) return;
    el.style.animation = 'none'; void el.offsetWidth;
    el.style.animation = kf + ' ' + (ms || 320) + 'ms cubic-bezier(.34,1.4,.64,1)';
  }
  announce(msg) { this.el.a11y.textContent = msg; }

  /* --------------------------------------------------- highlight discipline --
     Only one thing pulses at a time. The goat, the fence value, the handle and
     the area never glow together (§tutorial highlight rules). */
  pulseOnly(what) {
    this._pulse = what;
    const live = this.dragAllowed() && !this.stats.completed;
    this.el.glow.style.opacity = what === 'handle' ? '1' : (live ? '.7' : '0');
    this.el.glow.style.animation = what === 'handle' && !this.noMotion() ? 'ftf-breathe 2100ms ease-in-out infinite' : 'none';
    this.el.ring.style.opacity = what === 'handle' ? '1' : '0';
    /* The ripple and the hand are one gesture, so they are started in the same
       instant and share a period: the ring leaves the post exactly as the
       finger rests on it, and has faded by the time the hand pulls away. Both
       are cleared first so a re-pulse restarts them together rather than
       letting one carry on out of phase. */
    const beat = what === 'handle' && !this.noMotion();
    this.el.ring.style.animation = 'none';
    this.el.hand.style.animation = 'none';
    if (beat) {
      void this.el.ring.offsetWidth;
      this.el.ring.style.animation = 'ftf-ring 1900ms ease-out infinite';
      this.el.hand.style.animation = 'ftf-hand 1900ms ease-in-out infinite';
    }
    if (what === 'fence') this.bump(this.el['fence-badge'], 'ftf-pop', 480);
    if (what === 'area') this.bump(this.el['area-val'], 'ftf-pop', 480);
    if (what === 'goat') this.goat.wig = 0.5;
  }

  /* -------------------------------------------------------- shape control -- */
  setW(nw, src) {
    const g = this.g;
    nw = Math.max(1, Math.min(g.Wmax, Math.round(nw)));
    if (nw === g.W) return false;
    // Reshaping is activity whether it came from the pointer or the keyboard,
    // so both reset the idle clock through exactly the same path.
    this.pokeIdle();

    const prevArea = g.L * g.W, dir = nw > g.W ? 1 : -1, grew = nw > g.W;
    if (this.stats.lastDir && dir !== this.stats.lastDir) this.stats.reversals++;
    this.stats.lastDir = dir;

    // The one line that guarantees fence is never invented or lost.
    g.W = nw; g.L = g.half - nw;
    if (2 * (g.L + g.W) !== g.perimeter) console.error('[ftf] perimeter invariant broken', g.L, g.W, g.perimeter);

    const area = g.L * g.W, isBest = area > this.stats.bestArea;
    this.render({ transfer: true });
    this.setArea(prevArea);

    // Material leaves one orientation and arrives in the other, at once.
    const cA = this.px(g.L, g.W), cB = this.px(0, g.W);
    this.puff(cA[0], cA[1], this.pens.main);
    this.puff(cB[0], cB[1], this.pens.main);
    this.sfx(grew ? 'fence_rail_extend' : 'fence_rail_retract');
    this.after(70, () => this.sfx('fence_snap'));
    this.sfx(area > prevArea ? 'area_up' : 'area_down');

    if (isBest) { this.stats.bestArea = area; this.track('new_best_area', { area: area }); }
    else if (area < prevArea) this.track('area_decrease', { area: area });
    this.moveGoatInside();

    if (!this.stats.firstChange) {
      this.stats.firstChange = true;
      this.track('first_drag_direction', { dir: dir > 0 ? 'toward_balanced' : 'toward_longer' });
      this.track('first_area_change', { area: area, from: prevArea });
    }
    this.announce(this.t('a11y.area') + ' ' + area + ' ' + this.t('a11y.sqm') + '.');

    // Hand the change to whatever mechanic is running.
    this.levelStep(prevArea, area, dir, isBest);
    if (src === 'key' && !this.stats.dragging) this.evaluateRelease();
    return true;
  }

  /* ------------------------------------------------- one fact, one place --
     The handle is a 104 x 124 box that never leaves the DOM. Whether it can be
     seen and whether it can be touched are the same fact, so they are set
     together: while it is invisible it takes no pointer events and owns no
     cursor at all, and the pointer over empty grass stays a plain pointer.
     The stylesheet, not JavaScript, decides which cursor a live handle shows,
     so no inline value can ever get left behind on a screen that has none. */
  showHandle(on) {
    const h = this.el.handle;
    h.style.opacity = on ? '1' : '0';
    h.classList.toggle('ftf-live', !!on);
    h.classList.remove('ftf-held');
    h.style.cursor = '';
    h.style.pointerEvents = '';
  }

  bindInput() {
    const h = this.el.handle;

    h.addEventListener('pointerdown', e => {
      if (!this.dragAllowed() || this.stats.completed) return;
      e.preventDefault();
      this.ac(); this.ambience();
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
      const rc = this.root.getBoundingClientRect(), s = rc.width / 1280, hp = this.px(this.g.L, this.g.W);
      this._grabDx = (e.clientX - rc.left) / s - hp[0];
      this._grabDy = (e.clientY - rc.top) / s - hp[1];
      this.stats.dragging = true;
      this.pokeIdle();                    // taking hold is the clearest activity there is
      h.classList.add('ftf-held');
      this.el.glow.style.animation = 'none';
      this.el.glow.style.transform = 'scale(1.16)';
      if (this.options.snapGuide !== 'Never') { this.el.grid.style.opacity = '.1'; this.el.guide.style.opacity = '.42'; }
      this.sfx('handle_grab');
      this.tightenShadows(true);
      this._creaked = false;
      if (this._cornerEl) this._cornerEl.style.scale = '0.97';   // press: 1 -> .97
      if (!this.stats.grabbed) {
        this.stats.grabbed = true;
        this.track('first_handle_grab', {});
        this.track('time_to_first_drag', { ms: Math.round(performance.now() - this.stats.t0) });
        this.hideHint();
        this.levelEvent('grab');
      }
    });

    /* Free pointer movement is folded into one legal ratio: the pen always
       satisfies L + W = P / 2, whatever path the hand takes. */
    h.addEventListener('pointermove', e => {
      if (!this.stats.dragging) return;
      const r = this.root.getBoundingClientRect(), s = r.width / 1280, g = this.g;
      const px = (e.clientX - r.left) / s - (this._grabDx || 0);
      const py = (e.clientY - r.top) / s - (this._grabDy || 0);
      const intent = ((py - g.ay) / g.cell + (g.half - (px - g.ax) / g.cell)) / 2;
      if (!this._creaked && Math.abs(intent - g.W) > 0.22) { this._creaked = true; this.wood(88, 0.13, 0.05, 1.1); }
      // Hysteresis, so a hand resting near a boundary cannot chatter.
      if (Math.abs(intent - g.W) > 0.62) this.setW(intent > g.W ? Math.ceil(intent - 0.5) : Math.floor(intent + 0.5), 'drag');
    });

    const up = () => {
      if (!this.stats.dragging) return;
      this.stats.dragging = false;
      h.classList.remove('ftf-held');
      this.el.glow.style.transform = '';
      if (!this.noMotion() && this._pulse === 'handle') this.el.glow.style.animation = 'ftf-breathe 2100ms ease-in-out infinite';
      if (this.options.snapGuide !== 'Always') this.el.grid.style.opacity = '0';
      this.el.guide.style.opacity = '0';
      this.tightenShadows(false);
      if (this._cornerEl) this._cornerEl.style.scale = '1.05';
      this.sfx('handle_release');
      this.evaluateRelease();
    };
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);

    /* Keyboard: one legal state per key press. */
    h.addEventListener('keydown', e => {
      if (!this.dragAllowed() || this.stats.completed) return;
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowUp';
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
      if (!fwd && !back) return;
      e.preventDefault();
      this.ac(); this.hideHint();
      if (!this.stats.grabbed) { this.stats.grabbed = true; this.levelEvent('grab'); }
      this.setW(this.g.W + (fwd ? 1 : -1), 'key');
    });

    this.el.play.addEventListener('click', () => { this.ac(); this.ambience(); this.startGame(); });
    this.el.next.addEventListener('click', () => this.advance());
    this.el.skip.addEventListener('click', () => { this.sfx('button_press'); this.tutSkip(); });
    /* The explanation is one live screen. The emblem's Continue is the only way
       into it, and its own two buttons are the only way out - the formula board
       and the algebra wall that used to sit between them are gone, along with
       the four buttons that led in and out of them. */
    this.el['to-formula'].addEventListener('click', () => { this.sfx('button_press'); this.explainScreen(); });
    this.el['live-done'].addEventListener('click', () => {
      this.sfx('button_press');
      this.closeLive();
      this.completeScreen();
    });
    this.el.replay.addEventListener('click', () => { this.sfx('button_press'); this.el.complete.style.display = 'none'; this._fresh = true; this.startRound(0); });
    this.el['explore-btn'].addEventListener('click', () => { this.sfx('button_press'); this.exploreScreen(); });
    this.el['explore-exit'].addEventListener('click', () => { this.sfx('button_press'); this.titleScreen(); });

    this._key = e => {
      if (!this.options.debugMode) return;
      if (e.key === 'd' || e.key === 'D') {
        const d = this.el.debug;
        d.style.display = d.style.display === 'block' ? 'none' : 'block';
      }
    };
    window.addEventListener('keydown', this._key);
  }
  tightenShadows(tight) {
    const p = this.pens.main;
    p.nodes.forEach(el => { if (el !== this._cornerEl) el.style.filter = this.baseFilter(el.dataset.t, tight); });
    this.el.fill.style.boxShadow = tight ? 'inset 0 0 26px rgba(46,92,16,.4)' : 'inset 0 0 40px rgba(46,92,16,.28)';
  }

  /* --------------------------------------------------------- consequences --
     Never a cross, a buzzer or a lost life. The mathematics does the talking:
     if the area falls, the number falls, and the player can recover at once. */
  evaluateRelease() {
    if (this.stats.phase === 'explore') { this.showDims(true); return; }
    /* On the mastery farm the square does not end the level until the precision
       contract has been met - otherwise a player who happens to drag through
       8 x 8 first would skip the precision stage entirely. It simply waits. */
    const held = this.lv && this.lv.precise === false;
    if (this.g.L === this.g.W && !this.stats.completed && this.dragAllowed() && !held) { this.succeed(); return; }
    this.levelRelease();
  }

  /* ------------------------------------------------------- the one channel --
     Instruction, challenge and consequence all speak through the plank, so
     two messages can never stack up on screen. */
  /* One line, always. The sign grows to fit whatever it has to say, so no
     message ever wraps and none is ever truncated. */
  /* Routed through the instruction controller, which paces the reveal and
     decides whether the line is a request (and so starts the idle clock) or a
     remark. Levels keep calling plankSay and get the pacing for free. */
  plankSay(line, opts) {
    if (!this.instructor) { this.plankSayNow(line); return; }   // module not loaded
    this.instructor().show(Object.assign({ text: line, type: this.lineType(line) }, opts || {}));
  }
  /* Unpaced, for the controller itself and for anything that must not animate. */
  plankSayNow(line) {
    const p = this.el.plank;
    p.style.animation = "none";
    this.el["plank-1"].textContent = line || "";
    this.fitSign(p);
    p.style.transition = "opacity 260ms ease, transform 300ms cubic-bezier(.34,1.4,.64,1)";
    p.style.transform = "translateX(-50%)";
    p.style.opacity = "1";
  }
  /* A line either asks the player for something or tells them something. Only
     the asking kind may go on to offer idle help - prompting someone to act on
     "More area. Same 20 m fence." would be prompting them to act on nothing. */
  lineType(line) {
    const asks = [
      this.t('tut.reason'), this.t('tut.touch'), this.t('tut.more'), this.t('tut.challenge'),
      this.t('instruction.drag'), this.t('instruction.record'), this.t('instruction.push'),
      this.t('instruction.stretch'), this.t('instruction.mostGrass'),
      this.t('mastery.max'), this.t('bonus.make'),
      this.t('feedback.short'), this.t('feedback.over')
    ];
    /* Several of these lines carry a number that changes with the farm - the
       record to beat, the exact target, how far short the build is. They are
       compared with the digits blanked out, so "Beat the record - 32 m" and
       "Beat the record - 48 m" count as the same request and both go on to
       offer idle help. Matching on identity meant they silently did not. */
    const norm = s => String(s || '').replace(/\d+/g, '#');
    const n = norm(line);
    return asks.some(a => norm(a) === n) ? 'action' : 'informational';
  }
  /* Round a sign's middle up to a whole number of straw periods. The tile and
     both cap cuts share one 75px lattice, so a whole-period middle means the
     woven pattern runs unbroken from the left rope to the right one - however
     long or short the line happens to be. */
  /* The sign is one undivided piece of artwork, so its board is a fixed size.
     Rather than let a long line overflow it or wrap, step the type down until
     it fits. Every line the game speaks is short, so this almost never fires -
     but it means no message can ever break the board. */
  fitSign(sign, opts) {
    const mid = sign && sign.querySelector('.ftf-sign-m');
    if (!mid) return;
    const lines = Array.from(mid.children);
    if (!lines.length) return;
    const roomW = mid.clientWidth, roomH = mid.clientHeight;
    if (!roomW || !roomH) return;
    opts = opts || {};
    /* `min` is the size the type would LIKE to stop at. `floor` is the size it
       is actually allowed to reach, and it exists because min was being treated
       as a hard stop: a line that still did not fit at 22px was rendered at 22px
       anyway and simply hung off both ends of the board. Six of the game's lines
       did exactly that. The board wins now - the search may go all the way down
       to `floor`, so no message can overflow, and copy that has to shrink far is
       a copy problem the measurement will make obvious. */
    const min = opts.min || 22, max = opts.max || 42, floor = opts.floor || 15;
    const fillW = roomW * 0.94, fillH = roomH * 0.94;

    // Remember each line's authored size so repeat calls measure from the same
    // starting point rather than compounding.
    lines.forEach(l => { if (!l.dataset.size) l.dataset.size = String(parseFloat(getComputedStyle(l).fontSize)); });
    const ratios = lines.map(l => parseFloat(l.dataset.size));
    const lead = Math.max.apply(null, ratios);

    // Widen or narrow the whole block by one factor, so a short line grows to
    // fill the board and a long one shrinks to sit on it. Binary search beats
    // stepping: eight passes lands within a fifth of a pixel.
    let lo = Math.min(min, floor) / lead, hi = max / lead;
    // Measure each LINE, not the container: a container's scrollWidth is
    // clamped to its clientWidth, so it can never report that the text is
    // narrower than the board - which would make growing impossible.
    const fits = k => {
      lines.forEach((l, i) => { l.style.fontSize = (ratios[i] * k) + 'px'; });
      let w = 0, h = 0;
      lines.forEach(l => { w = Math.max(w, l.offsetWidth); h += l.offsetHeight; });
      return w <= fillW && h <= fillH;
    };
    if (fits(hi)) return;                       // already comfortable at the cap
    for (let i = 0; i < 8; i++) {
      const mididx = (lo + hi) / 2;
      if (fits(mididx)) lo = mididx; else hi = mididx;
    }
    fits(lo);
  }
  /* It swings down on its ropes, overshoots once and settles. */
  plankDrop(line) {
    this.plankSay(line);
    if (this.noMotion()) return;
    const p = this.el.plank;
    p.classList.remove("ftf-drop"); void p.offsetWidth;
    p.classList.add("ftf-drop");
    this.sfx("fence_post_rise");
    this.after(820, () => p.classList.remove("ftf-drop"));
  }
  /* The challenge board physically turns over; the copy swaps while it is
     edge-on, so the player sees one board change its mind. */
  plankFlip(line) {
    const p = this.el.plank;
    this.sfx("challenge_flip");
    if (this.noMotion()) { this.plankSay(line); return; }
    p.classList.remove("ftf-flip"); void p.offsetWidth;
    p.classList.add("ftf-flip");
    this.after(340, () => this.plankSay(line));
    this.after(740, () => p.classList.remove("ftf-flip"));
  }
  /* ----------------------------------------------------- the spotlight ----
     Dims the stage and lifts the named elements above the dim. One subject at
     a time: calling it again lowers whatever was lit before, so two things can
     never be spotlit at once - that would defeat the pointing. */
  spotlight(ids) {
    (this._lit || []).forEach(el => el.classList.remove('ftf-lit', 'ftf-beacon'));
    this._lit = [];
    if (!ids || !ids.length) {
      this.el.veil.classList.remove('ftf-in');
      this.el.modules.classList.remove('ftf-fade');   // lights fully back up
      return;
    }
    this.el.veil.classList.add('ftf-in');
    ids.forEach(k => {
      const el = this.el[k]; if (!el) return;
      el.classList.add('ftf-lit');
      this._lit.push(el);
    });
    // The sign does the pointing, so it is always above the veil too.
    this.el.plank.classList.add('ftf-lit');
    this._lit.push(this.el.plank);
  }

  /* The fixed perimeter is the conceptual anchor, so when it needs pointing at
     it draws attention to itself once rather than being narrated. */
  lockPulse() {
    const c = this.el['fence-badge'];
    this.bump(c, 'ftf-lock-pulse', 620);
    this.sfx('fence_snap');
  }

  /* A message that shows for a moment and then hands the plank back. */
  showToast(key, ms) {
    this._msg = key;
    this.plankSay(this.t(key));
    this.track('hint_shown', { which: key });
    clearTimeout(this._toastT);
    this._toastT = this.after(ms, () => { this._msg = null; this.levelPlank(); });
  }
  retractPlank() {
    this.el.plank.style.animation = 'none';
    this.el.plank.style.transition = 'opacity 420ms ease, transform 420ms ease';
    this.el.plank.style.transform = 'translateX(-50%) translateY(-52%)';
    this.el.plank.style.opacity = '0';
  }
  /* Once she has been touched, the training wheels are gone for good. */
  hideHint() {
    this.el.ring.style.animation = 'none';
    this.el.ring.style.opacity = '0';
    this.el.hand.style.animation = 'none';
    this.el.hand.style.opacity = '0';
    // There are two hands - the tutorial's and the idle one - and this is the
    // single "training wheels off" call, so it puts both away.
    if (this._instr) this._instr.hideHand(true);
    this.el.skip.classList.remove('ftf-in');
    if (!this.stats.dragging) this.el.guide.style.opacity = '0';
  }
  demoHandle() {
    if (this.noMotion() || this.stats.grabbed || !this.dragAllowed()) return;
    const off = this.g.cell * 0.55, h = this.el.handle;
    h.style.transition = 'transform 520ms cubic-bezier(.4,0,.2,1)';
    h.style.transform = 'translate(' + (-off) + 'px,' + off + 'px)';
    if (this._cornerEl) this._cornerEl.style.scale = '1.12';
    this.after(560, () => { h.style.transform = 'translate(0,0)'; if (this._cornerEl) this._cornerEl.style.scale = '1.05'; });
    this.after(1250, () => { if (!this.stats.grabbed) this.demoHandle(); });
  }

  /* ============================== SCREEN 1 · TITLE ======================== */
  titleScreen() {
    this.closeLive();
    this.clearTimers();
    this.stats.phase = 'title';
    this.stats.completed = false;
    // Explore leaves the side lengths on screen, and Done comes straight back
    // here - so the title has to put them away or they hang over the logo.
    this.showDims(false);
    if (this.spotlight) this.spotlight(null);
    this.dropAllPens({ instant: true });
    ['fin', 'complete', 'explore'].forEach(k => { this.el[k].style.display = 'none'; });
    this.el.emblem.style.display = 'none';
    this.el.title.style.display = 'block';
    this.el.title.style.opacity = '1';
    this.layout(0);
    this.setLight('morning');
    this._goatPen = 'main';
    this.goat.h = 200;
    this.goat.x = 640; this.goat.y = 520; this.goat.tx = 640; this.goat.ty = 520; this.goat.face = -1;
    this.setGoat('idle');
    this.syncView();
    // On the title she is tappable: a poke gets a bleat and a little hop, with
    // a cooldown so mashing cannot spam her. Everywhere else she stays
    // pointer-transparent so she can never block the maths.
    this.el['goat-side'].style.pointerEvents = 'auto';
    this.el['goat-side'].style.cursor = 'pointer';
    if (!this._goatPoke) {
      this._goatPoke = () => {
        if (this.stats.phase !== 'title' || this._pokeCool) return;
        this._pokeCool = true;
        this.after(1100, () => { this._pokeCool = false; });
        this.goat.jump = 0.55;
        this.setGoat('talk');
        this.sfx('bleat');
      };
      this.el['goat-side'].addEventListener('pointerdown', this._goatPoke);
    }
    this.el.play.style.animation = '';
    if (!this.noMotion()) this.el.logo.style.animation = 'ftf-logo-drop 1150ms cubic-bezier(.3,.7,.3,1) both';
    else this.el.logo.style.animation = '';
    this.titleBeat(0);
  }
  /* She looks around, takes a few small steps, eats, looks at the player and
     bleats. No instruction: the Play button is self-evident. */
  titleBeat(i) {
    if (this.dead || this.stats.phase !== 'title') return;
    const beats = [
      () => { this.setGoat('curious'); this.goat.face = 1;  return 950; },
      () => { this.setGoat('curious'); this.goat.face = -1; return 850; },
      () => { this.goat.tx = 592; this.goat.ty = 524; this.setGoat("walk"); return 1700; },
      () => { this.setGoat('eat'); return 3200; },
      () => { this.setGoat('idle'); this.goat.face = 1; return 800; },
      () => { this.setGoat('talk'); return 1600; },
      () => { this.goat.tx = 688; this.goat.ty = 516; this.setGoat("walk"); return 1800; },
      () => { this.setGoat('idle'); return 1500; }
    ];
    const ms = beats[i % beats.length]();
    this.after(this.noMotion() ? Math.max(900, ms) : ms, () => this.titleBeat(i + 1));
  }
  /* ---------------------------------------------- title -> first farm ----
     One continuous world, never a cut. The title board is hauled back up its
     own ropes and out of frame, the button drops away beneath it, the camera
     settles, and she simply keeps walking - so the instruction sign that
     arrives a moment later reads as the NEXT sign on the same ropes rather
     than as a new screen. */
  startGame() {
    this.clearTimers();
    this.sfx('button_press');
    const ri = Math.max(0, Math.min(3, (this.options.startRound || 1) - 1));
    this._fresh = true;

    if (this.noMotion()) {
      this.el.title.style.display = 'none';
      this.startRound(ri);
      return;
    }

    // The board goes up the way it came down, with the rope taking the strain.
    // Both the arrival and the departure are set inline, so neither can be
    // outranked by the other - a class rule would lose to the inline arrival.
    this.el.title.classList.add('ftf-lift');
    this.el.logo.style.animation = 'ftf-sign-away 860ms cubic-bezier(.42,0,.86,.32) forwards';
    this.el.play.style.animation = 'ftf-btn-away 380ms cubic-bezier(.5,0,.8,.2) forwards';
    this.after(120, () => this.sfx('fence_rail_retract'));
    this.after(880, () => {
      this.el.title.style.display = 'none';
      this.el.title.classList.remove('ftf-lift');
    });

    // A slow settle on the world itself. Nothing else touches the grass, so
    // this cannot be clobbered by the round starting underneath it.
    this.el.grass.style.transition = 'none';
    this.el.grass.style.transform = 'scale(1.055)';
    this.after(40, () => {
      this.el.grass.style.transition = 'transform 1500ms cubic-bezier(.25,.75,.25,1)';
      this.el.grass.style.transform = 'scale(1)';
    });

    // Leaving the title, she goes back to being scenery the pointer ignores.
    this.el['goat-side'].style.pointerEvents = 'none';
    // She looks up at the departing sign, then heads for her field.
    this.setGoat('curious');
    this.goat.face = 1;
    // She sets off while the board is still climbing, so the two overlap and
    // the eye never sees an empty stage between them.
    this.after(340, () => this.startRound(ri));
  }

  /* ====================== ROUND SCAFFOLD ================================= */
  /* ------------------------------------------------------ closing the live --
     The live explanation used to be closed by exactly one button. Every other
     way out of it - the proof, the finale, a restart, the title - left ftf-on
     set, so its hint, its two pills, its derivation and its buttons went on
     rendering over the top of whatever screen came next, and its curve stayed
     parked in the right half. Closing it is now one call that every screen
     entry makes, so no new route can ever forget. */
  closeLive() {
    this.el.live.classList.remove('ftf-on');
    this.el['live-strategy'].classList.remove('ftf-in');
    this.el.curve.classList.remove('ftf-live-pos');
  }

  startRound(ri) {
    this.clearTimers();
    this.closeLive();
    // NOT the title: startGame is still hauling it up its ropes, and hiding it
    // here would cut that short. It hides itself when it has finished leaving.
    ['fin', 'complete', 'explore'].forEach(k => { this.el[k].style.display = 'none'; });
    this.el.emblem.style.display = 'none';
    this.dropAllPens({ instant: true });
    this.layout(ri);
    const g = this.g, r = this.ROUNDS[ri];
    this.setLight(r.light);
    this._goatPen = 'main';

    this.stats.phase = 'intro';
    this.stats.completed = false; this.stats.dragging = false; this.stats.grabbed = false;
    this.stats.firstChange = false; this.stats.tier = 0;
    this.stats.bestArea = g.L * g.W; this.stats.lastDir = 0; this.stats.reversals = 0;
    this.stats.t0 = performance.now();

    // Only the goat and the grass. The fence, and then the numbers, follow.
    this.el['fence-badge'].style.opacity = '0';
    this.el['area-card'].style.opacity = '0';
    this.el.curve.style.opacity = '0';
    this.el.curve.classList.remove('ftf-graph');
    this.el['curve-peak'].style.opacity = '0';
    this.el.plank.style.opacity = '0';
    this.el.plank.style.transform = 'translateX(-50%)';
    this.showHandle(false);
    this.el.handle.style.transform = 'translate(0,0)';
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    this.el.burst.style.opacity = '0';
    this.el.ghost.style.opacity = '0';
    this.el.trace.style.opacity = '0';
    this.el.skip.classList.remove('ftf-in');
    this.el.bonus.classList.remove('ftf-in', 'ftf-done');
    this.showDims(false);
    this.el.hand.style.opacity = '0';
    this.pulseOnly(null);
    this.el.grid.style.opacity = this.options.snapGuide === 'Always' ? '.1' : '0';
    this.el.guide.style.opacity = '0';
    this.el.fill.style.transition = 'none';
    this.el.fill.style.opacity = '0';
    this.el.field.style.transition = 'none';
    this.el.field.style.transform = 'scale(1)';
    this.el.goat.style.opacity = '1';

    this.render({ instant: true, noFence: true });
    this.el['area-val'].textContent = String(g.L * g.W);
    this.el['fence-val'].textContent = g.perimeter + ' m';
    this.levelReset();

    this._retries = this._retries || {};
    this._retries[ri] = (this._retries[ri] || 0) + 1;
    this.stats.retries = this._retries[ri] - 1;
    this.track('round_started', { perimeter: g.perimeter, start: r.start.join('x'), mechanic: r.mechanic });

    const b = this.bounds();
    if (this._fresh) {
      // First farm: she walks in, looks around and bleats before the build.
      this._fresh = false;
      this.goat.h = this.goatHeight();
      this.goat.tx = g.ax + g.L * g.cell * 0.5;
      this.goat.ty = b[2] + (b[3] - b[2]) * 0.6;
      this.setGoat('enter');
      this._enterDone = () => this.levelIntro();
      if (this.noMotion()) { this.goat.x = this.goat.tx; this.goat.y = this.goat.ty; this.setGoat('idle'); this.levelIntro(); }
    } else {
      this.setGoat('idle');
      this.moveGoatInside();
      this.after(this.noMotion() ? 0 : 120, () => this.levelIntro());
    }
  }
  /* Anchor post, then clockwise. Posts rise out of the grass, rails extend
     from the post already standing. 1 - 1.3 s: fast and premium. */
  buildFence(ms, then) {
    const g = this.g, p = this.pens.main, n = 2 * g.perimeter;
    this.el.fill.style.transition = 'opacity 620ms ease, background 220ms ease';
    this.el.fill.style.opacity = '1';
    const stagger = this.noMotion() ? 0 : (ms || 900) / n;
    p.L = g.L; p.W = g.W;
    this.syncPen(p, { stagger: stagger });
    const total = this.noMotion() ? 0 : stagger * n + 210;
    this.after(total, () => { this.sfx('fence_snap_big'); if (then) then(); });
    return total;
  }
  showNumbers(pulseFence) {
    this.el['fence-badge'].style.opacity = '1';
    this.el['area-card'].style.opacity = '1';
    if (!this.noMotion()) {
      this.el['area-card'].style.animation = 'none'; void this.el['area-card'].offsetWidth;
      this.el['area-card'].style.animation = 'ftf-card-in 300ms cubic-bezier(.34,1.3,.64,1)';
    }
    // One pulse on the fence value, then it is quiet for good: this amount is
    // fixed, and its stillness is the message.
    if (pulseFence) this.after(240, () => this.pulseOnly('fence'));
  }
  beginPlay() {
    this.stats.phase = 'play';
    this.el.handle.style.transition = 'opacity 300ms ease';
    this.showHandle(true);
    this.stats.t0 = performance.now();
    this.render();
    this.levelBegin();
  }

  /* ------------------------------------------------------------- success -- */
  succeed() {
    if (this.stats.completed) return;
    const g = this.g, area = g.L * g.W;
    this.stats.completed = true;
    this.stats.bestArea = area;
    this.track('optimal_area_reached', { area: area, reversals: this.stats.reversals, ms: Math.round(performance.now() - this.stats.t0) });

    this.hideHint();
    this.pulseOnly(null);
    this.el.glow.style.transition = 'opacity 500ms ease';
    this.el.glow.style.opacity = '0';
    this.render();
    this.bump(this.el['area-val'], 'ftf-hero', 620);

    this.announce('Best shape found. ' + g.L + ' by ' + g.W + ' metres, ' + this.t('a11y.area').toLowerCase() + ' ' + area +
      ' ' + this.t('a11y.sqm') + ', with the same ' + g.perimeter + ' metres of fence.');
    this.track('round_completed', { area: area });
    /* levelSucceed is wrapped by cheer.js, so this is what starts the mascot -
       and the mascot blurs the farm out and takes the goat off the field for
       eight seconds. Which is why the beats that happen ON the pasture are no
       longer scheduled here: they used to fire at +300ms and +560ms, behind the
       blur, so the burst, the grass puffs and the reveal of the side lengths
       all played to a screen nobody could see. succeedField() is handed to the
       celebration instead and plays as the farm comes back. */
    this.levelSucceed();
  }
  /* The pasture's own moment of success. Deliberately separate from succeed()
     so its owner can decide WHEN the field is worth looking at. */
  succeedField() {
    const g = this.g;
    // Final fence snap: the whole enclosure settles once.
    this.after(90, () => {
      if (!this.noMotion()) this.pens.main.nodes.forEach(el => { el.style.animation = 'ftf-rise 220ms cubic-bezier(.34,1.4,.64,1)'; });
      this.sfx('fence_snap');
    });
    this.after(190, () => { this.goat.jump = 0.55; this.setGoat('happy'); });
    // A few grass particles and a soft glow. No confetti.
    this.after(300, () => {
      this.sfx('success_chord');
      this.el.burst.style.opacity = '1';
      this.after(880, () => { this.el.burst.style.opacity = '0'; });
      const step = Math.max(1, Math.round(g.L / 4));
      for (let i = 0; i <= g.L; i += step) { const q = this.px(i, g.W); this.puff(q[0], q[1], this.pens.main); }
      for (let j = 0; j <= g.W; j += Math.max(1, Math.round(g.W / 3))) { const q = this.px(0, j); this.puff(q[0], q[1], this.pens.main); }
    });
    // The side lengths are a reveal, not a readout: they appear once the shape
    // is found, so during play the player is reading the pasture, not numbers.
    this.after(560, () => { this.placeDims(); this.showDims(true); });
  }
  offerNext(labelKey) {
    const b = this.el.next;
    b.querySelector('span').textContent = this.t(labelKey || 'action.next');
    /* Centre it on the recap's gap only once the label is on it: the button is
       sized by its own text now, so its width is not known until it has some. */
    if (b.classList.contains('ftf-mid') && this._nextMid != null) {
      b.style.left = Math.round(this._nextMid - b.offsetWidth / 2) + 'px';
    }
    b.style.opacity = '1';
    b.style.pointerEvents = 'auto';
  }
  advance() {
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    /* A button that has left the screen must not keep the keyboard focus. This
       one is hidden with opacity, so it stays focusable AND focused - and when
       it comes back with a new label the browser still counts it as
       focus-visible and paints the focus ring around it. That ring is why this
       one button looked unlike every other button in the game. */
    this.el.next.blur();
    this.el.next.classList.remove('ftf-mid');
    this.el.next.style.left = ''; this.el.next.style.marginLeft = ''; this._nextMid = null;   // back to its corner
    this.sfx('button_press');
    if (this.g.round >= 3) { this.finaleStart(); return; }
    this.showDims(false);
    this.showHandle(false);
    this.el.ghost.style.opacity = '0';
    this.retractPlank();
    const wait = Math.max(this.dropPen('main'), this.dropPen('finA'), this.dropPen('finB'));
    this.el.fin.style.display = 'none';
    [0, 1].forEach(i => { if (this['_fg' + i]) this['_fg' + i].style.opacity = '0'; });
    this.after(wait, () => this.travelTo(this.g.round + 1));
  }

  /* --------------------------------------------------------- the journey --
     Between farms the player used to watch one fence sink, then a full second
     of empty grass, then another fence rise in the same shot - so farm 2 read
     as farm 1 with a different rectangle, and nothing ever said how far they
     had come. Now they travel: the ground scrolls past under a trotting goat,
     the day moves on while they walk rather than while the screen is empty,
     and a signpost swings down to name the farm they have reached and mark it
     off against the four. The dead second became the reward.

     Nothing here is on the critical path. Under reduced motion the whole
     journey is skipped and the next farm simply starts, exactly as before. */
  travelTo(ri) {
    if (this.noMotion()) { this.startRound(ri); return; }
    /* A full screen of ground in 780ms was a whip-pan, not a walk, and it left
       the signpost only about 380ms fully settled - not long enough to read
       "Farm 2 of 4 / Farm Record" before the next fence started rising under
       it. The walk is now 1150ms and the sign holds for a whole second. */
    const D = 1150, W = 1280;
    const A = this.el.grass, B = this.el['grass-2'];
    this.stats.phase = 'travel';
    this.el.fill.style.transition = 'none';
    this.el.fill.style.opacity = '0';
    /* The old fence has finished sinking by now, but its pieces are retired on
       their own timers - and a leftover post would hang motionless in the air
       while the ground scrolled away underneath it. The field does not travel;
       only the ground does. So the pen is emptied outright first. */
    this.dropAllPens({ instant: true });
    this.root.classList.add('ftf-travelling');

    /* Two sheets of ground moving as one. The second waits exactly one screen
       to the right, so what arrives is the same texture and the snap back at
       the end lands on an identical frame - there is nothing to see. */
    [A, B].forEach(el => { el.style.transition = 'none'; el.style.transform = 'translateX(0)'; });
    void A.offsetWidth;
    [A, B].forEach(el => {
      el.style.transition = 'transform ' + D + 'ms cubic-bezier(.5,0,.2,1)';
      el.style.transform = 'translateX(' + (-W) + 'px)';
    });

    // The day advances while they are walking, which is the only time it reads
    // as a day advancing. The grass cross-fades its light over 900ms.
    this.setLight(this.ROUNDS[ri].light);
    this.goatTravel(true);
    this.travelSign(ri);
    this.hoofbeats(D);
    this.sfx('farm_turn');
    this.track('farm_travel', { to: ri + 1 });

    this.after(D, () => {
      [A, B].forEach(el => { el.style.transition = 'none'; el.style.transform = 'translateX(0)'; });
      this.root.classList.remove('ftf-travelling');
      this.goatTravel(false);
      this.sfx('bird');                       // she has arrived somewhere new
      this.startRound(ri);
    });
  }

  /* The signpost. One CSS animation carries in, hold and out, so a timer that
     never fires cannot leave it hanging over the farm. */
  travelSign(ri) {
    const t = this.el.travel, r = this.ROUNDS[ri];
    this.el['travel-cap'].textContent = 'Farm ' + (ri + 1) + ' of ' + this.ROUNDS.length;
    this.el['travel-name'].textContent = r.name;
    const dots = this.el['travel-dots'].children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].className = i < ri ? 'ftf-done' : (i === ri ? 'ftf-now' : '');
    }
    t.classList.remove('ftf-in');
    void t.offsetWidth;                        // restart, even farm after farm
    t.classList.add('ftf-in');
    /* startRound clears the game's timers halfway through this, so the two
       that have to outlive it are the keeping kind. */
    this.afterKeep(300, () => this.sfx('sign_swing'));
    this.afterKeep(2260, () => t.classList.remove('ftf-in'));
  }

  /* Seven steps across the journey, alternating weight so it reads as an
     animal walking rather than as a metronome. */
  hoofbeats(ms) {
    const n = 7, gap = ms / n;
    for (let i = 0; i < n; i++) {
      this.afterKeep(Math.round(i * gap + 40), () => this.sfx(i % 2 ? 'hoof_soft' : 'hoof'));
    }
  }

  /* -------------------------------------------------- rebuild from state -- */
  refresh() { if (this.root) this.syncView(); }
  syncView() {
    const s = this.stats, playing = s.phase === 'play';
    this.el.loader.style.display = 'none';
    this.el.debug.style.display = this.options.debugMode ? (this.el.debug.style.display || 'block') : 'none';
    this.el['fence-badge'].style.opacity = playing ? '1' : '0';
    this.el['area-card'].style.opacity = playing ? '1' : '0';
    this.el.goat.style.opacity = '1';
    this.showHandle(this.dragAllowed() && !s.completed);
    this.el.fill.style.opacity = s.phase === 'title' ? '0' : '1';
    this.el.field.style.transform = 'scale(1)';
    this.el.burst.style.opacity = '0';
    this.el.grid.style.opacity = this.options.snapGuide === 'Always' ? '.1' : '0';
    // The ambient grass life follows the game's own reduce switch as well as
    // the OS one, so the debug toggle stops it too.
    this.root.classList.toggle('ftf-still', this.noMotion());
    if (s.phase !== 'play' && s.phase !== 'finale' && s.phase !== 'peak') this.retractPlank();
    if (s.phase === 'title') this.dropAllPens({ instant: true });
    this.moveGoatInside(true);
    this.render({ instant: true });
  }
}
