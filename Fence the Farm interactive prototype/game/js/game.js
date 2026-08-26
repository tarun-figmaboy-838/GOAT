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
      { id: 1, name: 'Discovery',      perimeter: 20, start: [8, 2],  optimum: [5, 5], mechanic: 'tutorial',      light: 'morning' },
      { id: 2, name: 'Farm Record',    perimeter: 24, start: [10, 2], optimum: [6, 6], mechanic: 'record',        light: 'midday',  record: 32 },
      { id: 3, name: 'Visual Trap',    perimeter: 28, start: [10, 4], optimum: [7, 7], mechanic: 'misconception', light: 'evening', forcedStretch: [12, 2] },
      { id: 4, name: 'Master Builder', perimeter: 32, start: [13, 3], optimum: [8, 8], mechanic: 'mastery',       light: 'golden',  optionalTarget: 48 }
    ];

    /* The playable box, in the 1280 x 720 design space. The pasture is sized so
       every legal shape of a round fits inside it, which is what keeps the
       fence clear of the HUD however the player reshapes it. */
    this.LAY = { PLANK_BOT: 128, BOTTOM: 700, LEFT: 80, RIGHT: 966, CX: 640 };

    /* Fence module metrics, as fractions of one metre (= one cell). Measured
       off the artwork, so every piece is drawn at its natural aspect and
       nothing is ever squashed to fit.
         POST  post.png    212 x 356, meets the ground at y = 300/356
         RAIL  rail-h.png  the front run, a seamless tile, two to a metre
         VRAIL rail-v.png  the depth run, cut from the supplied depth-fence art
                           and mirrored so it tiles seamlessly along its length
       LOG is where the rails meet the post logs, measured above the node. */
    this.MOD = {
      LOG:   144 / 360,
      POST:  { w: 212 / 360, h: 356 / 360, ox: 106 / 360, oy: 300 / 360 },
      RAIL:  { h: 166 / 400, tile: 0.5 },
      VRAIL: { w: 0.21, tile: 0.63 }
    };

    /* The finale keeps the same farm: one cell for both fields, one ground
       line, and a place for the winning pasture to come back to. */
    this.FIN = { cell: 40, ground: 500, ax: 140, bx: 820, soloCell: 44, soloX: 228, soloY: 168 };

    /* Short VO lines. Recordings were not supplied, so vo() is a hook: it
       fires at the right beat and is logged, and only speaks if options.vo is
       switched on. Synthetic speech is off by default, on purpose. */
    this.VO = {
      'vo.reason':    'This goat needs more grass.',
      'vo.fence':     'You have 20 metres of fence.',
      'vo.drag':      'Drag the corner.',
      'vo.same':      'The fence stayed the same, but the grass grew.',
      'vo.longer':    'Hmm. Longer did not mean more grass.',
      'vo.nice':      'Nice. Same fence, more grass.',
      'vo.record':    'Beat the farm record.',
      'vo.stretch':   'Make it longer.',
      'vo.didLonger': 'Did longer mean more grass?',
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
    this._onResize = () => this.fit();
    window.addEventListener('resize', this._onResize);
    this.bindInput();
    this.prepareGoatAudio();
    this.preload();
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
    if (this._key) window.removeEventListener('keydown', this._key);
    cancelAnimationFrame(this.raf);
    this.clearTimers();
    (this._perm || []).forEach(clearInterval);
    if (this.destroyGoatAudio) this.destroyGoatAudio();
    if (this._ac) { try { this._ac.close(); } catch (e) {} }
  }

  /* ---------------------------------------------------------------- infra -- */
  fit() { this.root.style.transform = 'scale(' + Math.min(window.innerWidth / 1280, window.innerHeight / 720) + ')'; }
  after(ms, fn) { const t = setTimeout(() => { if (!this.dead) fn(); }, ms); this.timers.push(t); return t; }
  clearTimers() { this.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); this.timers = []; }
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
    const list = ['assets/art/grass-bg.png', 'assets/art/title-logo.png',
      'assets/art/post.png', 'assets/art/rail-h.png', 'assets/art/rail-v.png'];
    for (let i = 0; i < 8; i++) list.push('assets/art/walk-' + i + '.png');
    ['idle-0', 'idle-1', 'idle-2', 'bleat-0', 'bleat-1', 'bleat-2', 'graze-0', 'graze-1', 'graze-2', 'graze-3']
      .forEach(n => list.push('assets/art/' + n + '.png'));
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
    el.style.transition = 'left 170ms cubic-bezier(.4,0,.2,1), top 170ms cubic-bezier(.4,0,.2,1)';
    if (m.t === 'p') {
      el.style.width = (M.POST.w * c) + 'px'; el.style.height = (M.POST.h * c) + 'px';
      el.style.background = 'url(assets/art/post.png) 0 0 / 100% 100% no-repeat';
      el.style.transformOrigin = '50% 100%';
    } else if (m.t === 'h') {
      el.style.width = c + 'px'; el.style.height = (M.RAIL.h * c) + 'px';
      el.style.background = 'url(assets/art/rail-h.png) 0 50% / ' +
        (M.RAIL.tile * c) + 'px ' + (M.RAIL.h * c) + 'px repeat-x';
      el.style.transformOrigin = m.o || '0% 50%';
    } else {
      el.style.width = (M.VRAIL.w * c) + 'px'; el.style.height = c + 'px';
      el.style.background = 'url(assets/art/rail-v.png) 50% 0 / ' +
        (M.VRAIL.w * c) + 'px ' + (M.VRAIL.tile * c) + 'px repeat-y';
      el.style.transformOrigin = m.o || '50% 0%';
    }
    el.style.filter = this.baseFilter(m.t, false);
    this.placeModule(p, el, m);
    return el;
  }
  placeModule(p, el, m) {
    const c = p.cell, M = this.MOD, q = this.penPx(p, m.x, m.y), x = q[0], y = q[1];
    if (m.t === 'p') {
      el.style.left = (x - M.POST.ox * c) + 'px';
      el.style.top = (y - M.POST.oy * c) + 'px';
      el.style.zIndex = String(200 + Math.round(y / 4) * 2 + 1);
    } else if (m.t === 'h') {
      el.style.left = x + 'px';
      el.style.top = (y - M.LOG * c - M.RAIL.h * c / 2) + 'px';
      el.style.zIndex = String(200 + Math.round(y / 4) * 2);
      el.style.transformOrigin = m.o || '0% 50%';
    } else {
      el.style.left = (x - M.VRAIL.w * c / 2) + 'px';
      el.style.top = (y - M.LOG * c) + 'px';
      el.style.zIndex = String(200 + Math.round((y + c / 2) / 4) * 2);
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
      this.after(210, () => el.remove());
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
      this.after(230, () => el.remove());
    });
    if (!fast) { this.sfx('fence_rail_retract'); this.after(110, () => this.sfx('fence_post_sink')); }
    p.L = 0; p.W = 0;
    return fast ? 0 : 240;
  }
  dropAllPens(opts) { Object.keys(this.pens).forEach(id => this.dropPen(id, opts)); }
  /* Slide a whole pen to a new origin; the edge-keyed modules just glide. */
  glidePen(id, ax, ay, ms) {
    const p = this.pens[id]; if (!p) return;
    p.ax = ax; p.ay = ay;
    const d = this.noMotion() ? 0 : (ms || 700);
    p.nodes.forEach(el => { el.style.transition = 'left ' + d + 'ms cubic-bezier(.4,0,.2,1), top ' + d + 'ms cubic-bezier(.4,0,.2,1)'; });
    this.syncPen(p, { instant: true });
    this.after(d + 40, () => {
      p.nodes.forEach(el => { el.style.transition = 'left 170ms cubic-bezier(.4,0,.2,1), top 170ms cubic-bezier(.4,0,.2,1)'; });
    });
  }
  /* Grass displacement where a post arrives or leaves. Never a dust cloud. */
  puff(x, y, p) {
    if (this.noMotion()) return;
    const s = p ? p.cell / 72 : 1, w = 44 * s, h = 28 * s;
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:' + (x - w / 2) + 'px;top:' + (y - h / 2) + 'px;width:' + w + 'px;height:' + h +
      'px;border-radius:50%;z-index:199;background:radial-gradient(circle,rgba(214,232,160,.8) 0%,rgba(150,190,90,0) 70%);' +
      'animation:ftf-puff 420ms ease-out forwards';
    this.el.modules.appendChild(d);
    this.after(450, () => d.remove());
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
    this.el.hand.style.left = (hp[0] + 14) + 'px';
    this.el.hand.style.top = (hp[1] - 0.05 * c) + 'px';

    if (owns && !opts.noFence) this.syncPen(p, opts);
    else if (!owns) this.dropPen('main', { instant: true });

    // Exactly one corner ever looks draggable.
    if (this._cornerEl) { this._cornerEl.style.filter = this.baseFilter('p', false); this._cornerEl.style.scale = ''; }
    const corner = p.nodes.get('rp:' + g.W);
    if (corner && !this.stats.completed && this.dragAllowed()) {
      corner.style.filter = 'brightness(1.12) saturate(1.08) drop-shadow(0 0 6px rgba(255,196,74,.9)) ' +
        'drop-shadow(var(--sh-x) var(--sh-y) var(--sh-blur) var(--sh-ink))';
      corner.style.zIndex = '880';
      corner.style.transition = 'left 170ms cubic-bezier(.4,0,.2,1), top 170ms cubic-bezier(.4,0,.2,1), scale 220ms cubic-bezier(.34,1.4,.64,1)';
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
  placeDims(p, L, W) {
    const main = !p;
    p = p || this.pens.main;
    if (L == null) L = main ? this.g.L : p.L;
    if (W == null) W = main ? this.g.W : p.W;
    const a = this.penPx(p, L / 2, W), b = this.penPx(p, L, W / 2);
    this.el['dim-w'].textContent = L + ' m';
    this.el['dim-w'].style.left = a[0] + 'px';
    this.el['dim-w'].style.top = (a[1] + p.cell * 0.42) + 'px';
    this.el['dim-h'].textContent = W + ' m';
    this.el['dim-h'].style.left = (b[0] + p.cell * 0.55) + 'px';
    this.el['dim-h'].style.top = b[1] + 'px';
  }
  showDims(on) {
    this.el['dim-w'].style.opacity = on ? '1' : '0';
    this.el['dim-h'].style.opacity = on ? '1' : '0';
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
    this.el.ring.style.animation = what === 'handle' && !this.noMotion() ? 'ftf-ring 1700ms ease-out infinite' : 'none';
    if (what === 'fence') this.bump(this.el['fence-badge'], 'ftf-pop', 480);
    if (what === 'area') this.bump(this.el['area-val'], 'ftf-pop', 480);
    if (what === 'goat') this.goat.wig = 0.5;
  }

  /* -------------------------------------------------------- shape control -- */
  setW(nw, src) {
    const g = this.g;
    nw = Math.max(1, Math.min(g.Wmax, Math.round(nw)));
    if (nw === g.W) return false;

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
      h.style.cursor = 'grabbing';
      this.el.glow.style.animation = 'none';
      this.el.glow.style.transform = 'scale(1.16)';
      if (this.options.snapGuide !== 'Never') { this.el.grid.style.opacity = '.1'; this.el.guide.style.opacity = '.42'; }
      this.el.plank.style.transform = 'translateX(-50%) translateY(-34%)';
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
      h.style.cursor = this.stats.completed ? 'default' : 'grab';
      this.el.glow.style.transform = '';
      if (!this.noMotion() && this._pulse === 'handle') this.el.glow.style.animation = 'ftf-breathe 2100ms ease-in-out infinite';
      if (this.options.snapGuide !== 'Always') this.el.grid.style.opacity = '0';
      this.el.guide.style.opacity = '0';
      this.el.plank.style.transform = 'translateX(-50%)';
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
    this.el['to-formula'].addEventListener('click', () => { this.sfx('button_press'); this.formulaScreen(); });
    this.el['see-why'].addEventListener('click', () => { this.sfx('button_press'); this.advancedScreen(); });
    this.el['adv-done'].addEventListener('click', () => { this.sfx('button_press'); this.completeScreen(); });
    this.el['to-complete'].addEventListener('click', () => { this.sfx('button_press'); this.completeScreen(); });
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
    if (this.g.L === this.g.W && !this.stats.completed && this.dragAllowed()) { this.succeed(); return; }
    this.levelRelease();
  }

  /* ------------------------------------------------------- the one channel --
     Instruction, challenge and consequence all speak through the plank, so
     two messages can never stack up on screen. */
  /* One line, always. The sign grows to fit whatever it has to say, so no
     message ever wraps and none is ever truncated. */
  plankSay(line) {
    const p = this.el.plank;
    p.style.animation = "none";
    this.el["plank-1"].textContent = line || "";
    this.fitSign(p);
    p.style.transition = "opacity 260ms ease, transform 300ms cubic-bezier(.34,1.4,.64,1)";
    p.style.transform = "translateX(-50%)";
    p.style.opacity = "1";
  }
  /* Round a sign's middle up to a whole number of straw periods. The tile and
     both cap cuts share one 75px lattice, so a whole-period middle means the
     woven pattern runs unbroken from the left rope to the right one - however
     long or short the line happens to be. */
  fitSign(sign) {
    const mid = sign.querySelector('.ftf-sign-m');
    if (!mid) return;
    const h = parseFloat(getComputedStyle(sign).height) || 130;
    const period = h * 0.19789;                    // 75 / 379 of the artwork
    mid.style.width = 'auto';
    const rc = this.root.getBoundingClientRect();
    const scale = rc.width ? rc.width / 1280 : 1;
    const need = mid.getBoundingClientRect().width / scale;
    mid.style.width = (Math.max(1, Math.ceil(need / period)) * period) + 'px';
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
    this.el.hand.style.opacity = '0';
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
    this.clearTimers();
    this.stats.phase = 'title';
    this.stats.completed = false;
    this.dropAllPens({ instant: true });
    ['fin', 'fm', 'adv', 'complete', 'explore'].forEach(k => { this.el[k].style.display = 'none'; });
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
    if (!this.noMotion()) this.el.logo.style.animation = 'ftf-logo-drop 1150ms cubic-bezier(.3,.7,.3,1) both';
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
  startGame() {
    this.clearTimers();
    this.sfx('button_press');
    this.el.title.style.transition = 'opacity 420ms ease';
    this.el.title.style.opacity = '0';
    this.after(440, () => { this.el.title.style.display = 'none'; });
    this.setGoat('curious');
    if (!this.noMotion()) {
      this.el.field.style.transformOrigin = '640px 520px';
      this.el.field.style.transition = 'transform 620ms cubic-bezier(.4,0,.2,1)';
      this.el.field.style.transform = 'scale(1.05)';
    }
    const ri = Math.max(0, Math.min(3, (this.options.startRound || 1) - 1));
    this._fresh = true;
    this.after(this.noMotion() ? 0 : 520, () => this.startRound(ri));
  }

  /* ====================== ROUND SCAFFOLD ================================= */
  startRound(ri) {
    this.clearTimers();
    ['title', 'fin', 'fm', 'adv', 'complete', 'explore'].forEach(k => { this.el[k].style.display = 'none'; });
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
    this.el.handle.style.opacity = '0';
    this.el.handle.style.cursor = 'grab';
    this.el.handle.style.transform = 'translate(0,0)';
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    this.el.burst.style.opacity = '0';
    this.el.ghost.style.opacity = '0';
    this.el.trace.style.opacity = '0';
    this.el.skip.classList.remove('ftf-in');
    this.el.record.classList.remove('ftf-in', 'ftf-beat', 'ftf-flag');
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
    this.el.handle.style.opacity = '1';
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
    this.announce('Best shape found. ' + g.L + ' by ' + g.W + ' metres, ' + this.t('a11y.area').toLowerCase() + ' ' + area +
      ' ' + this.t('a11y.sqm') + ', with the same ' + g.perimeter + ' metres of fence.');
    this.track('round_completed', { area: area });
    this.levelSucceed();
  }
  offerNext(labelKey) {
    this.el.next.querySelector('span').textContent = this.t(labelKey || 'action.next');
    this.el.next.style.opacity = '1';
    this.el.next.style.pointerEvents = 'auto';
  }
  advance() {
    this.el.next.style.opacity = '0'; this.el.next.style.pointerEvents = 'none';
    this.el.next.classList.remove('ftf-mid');
    this.sfx('button_press');
    if (this.g.round >= 3) { this.finaleStart(); return; }
    this.showDims(false);
    this.el.handle.style.opacity = '0';
    this.el.ghost.style.opacity = '0';
    this.el.record.classList.remove('ftf-in');
    this.retractPlank();
    const wait = Math.max(this.dropPen('main'), this.dropPen('finA'), this.dropPen('finB'));
    this.el.fin.style.display = 'none';
    [0, 1].forEach(i => { if (this['_fg' + i]) this['_fg' + i].style.opacity = '0'; });
    this.after(wait, () => this.startRound(this.g.round + 1));
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
    this.el.handle.style.opacity = this.dragAllowed() && !s.completed ? '1' : '0';
    this.el.handle.style.cursor = s.completed ? 'default' : 'grab';
    this.el.fill.style.opacity = s.phase === 'title' ? '0' : '1';
    this.el.field.style.transform = 'scale(1)';
    this.el.burst.style.opacity = '0';
    this.el.grid.style.opacity = this.options.snapGuide === 'Always' ? '.1' : '0';
    if (s.phase !== 'play' && s.phase !== 'finale' && s.phase !== 'peak') this.retractPlank();
    if (s.phase === 'title') this.dropAllPens({ instant: true });
    this.moveGoatInside(true);
    this.render({ instant: true });
  }
}
