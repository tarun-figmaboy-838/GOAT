/* ============================================================================
   FENCE THE FARM — debug navigator
   Never enabled in production: without options.debugMode (or ?debug=1) it is
   never built at all. Press D to show and hide it.
   ========================================================================== */
Object.assign(FenceTheFarm.prototype, {

  mkBtn(label, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'padding:5px 8px;border-radius:7px;border:1px solid #4746A0;background:#292969;' +
      'color:#D5D5FA;font:600 11.5px "Nunito Sans",sans-serif;cursor:pointer';
    b.onmouseenter = () => { b.style.background = '#383882'; };
    b.onmouseleave = () => { b.style.background = '#292969'; };
    b.onclick = fn;
    return b;
  },

  /* Jump into a farm and hold it at a named point. */
  dbgRound(ri, then, wait) {
    this.el.title.style.display = 'none';
    this._fresh = false;
    this.forceReduce = true;                 // skip the scripted build for jumps
    this.startRound(ri);
    this.after(wait == null ? 80 : wait, () => {
      this.forceReduce = false;
      if (then) then();
      this.render();
      this.debugStats();
    });
  },
  dbgDrag(w) { this.stats.grabbed = true; this.hideHint(); this.setW(w, 'debug'); },

  buildDebug() {
    const S = this.el['debug-screens'], T = this.el['debug-toggles'];
    const add = (label, fn) => S.appendChild(this.mkBtn(label, fn));

    add('Start',        () => this.titleScreen());
    add('Fence Intro',  () => { this.el.title.style.display = 'none'; this._fresh = true; this.startRound(0); });

    add('L1 Idle',      () => this.dbgRound(0, () => { this.beginPlay(); this.tutBeat(3); }));
    add('L1 Drag',      () => this.dbgRound(0, () => { this.beginPlay(); this.tutBeat(4); this.dbgDrag(3); }));
    add('L1 Wrong A',   () => this.dbgRound(0, () => { this.beginPlay(); this.tutBeat(6); this.dbgDrag(1); this.tutRelease(9); }));
    add('L1 Wrong B',   () => this.dbgRound(0, () => { this.beginPlay(); this.tutBeat(6); this.dbgDrag(3); this.tutRelease(21); }));
    add('L1 Success',   () => this.dbgRound(0, () => { this.beginPlay(); this.tutBeat(7); this.dbgDrag(5); }));

    add('L2 Record',    () => this.dbgRound(1, () => { this.beginPlay(); }));
    add('L2 New rec',   () => this.dbgRound(1, () => { this.beginPlay(); this.dbgDrag(4); }));
    add('L2 Success',   () => this.dbgRound(1, () => { this.beginPlay(); this.dbgDrag(6); }));

    add('L3 Stretch',   () => this.dbgRound(2, () => { this.beginPlay(); }));
    add('L3 Flip',      () => this.dbgRound(2, () => { this.beginPlay(); this.dbgDrag(2); }));
    add('L3 Success',   () => this.dbgRound(2, () => { this.beginPlay(); this.lv.stretched = true; this.lv.flipped = true; this.lv.longest = 12; this.dbgDrag(7); }));

    add('L4 Mastery',   () => this.dbgRound(3, () => { this.beginPlay(); }));
    add('L4 Bonus',     () => this.dbgRound(3, () => { this.beginPlay(); this.dbgDrag(8); }));

    add('Final Compare', () => this.dbgFinaleAt('compare'));
    add('Final Peak',    () => this.dbgFinaleAt('peak'));
    add('Formula',       () => { this.dbgSolo(); this.formulaScreen(); });
    add('Advanced',      () => { this.dbgSolo(); this.advancedScreen(); });
    add('Completion',    () => { this.dbgSolo(); this.completeScreen(); });
    add('Explore',       () => this.exploreScreen());

    T.appendChild(this.mkBtn('Reset round', () => { this._fresh = false; this.startRound(this.g.round); }));
    T.appendChild(this.mkBtn('Toggle grid', () => { this.el.grid.style.opacity = this.el.grid.style.opacity === '0.1' ? '0' : '0.1'; }));
    T.appendChild(this.mkBtn('Toggle motion', () => { this.forceReduce = !this.forceReduce; this.debugStats(); }));
    T.appendChild(this.mkBtn('Dimensions', () => {
      const d = this.el.dimdebug;
      d.style.display = d.style.display === 'block' ? 'none' : 'block';
      this.debugStats();
    }));
    ['morning', 'midday', 'evening', 'golden'].forEach(l => T.appendChild(this.mkBtn(l, () => this.setLight(l))));
    T.appendChild(this.mkBtn('Sweep states', () => this.sweep()));
    T.appendChild(this.mkBtn('Clear tutorial flag', () => { try { localStorage.removeItem('ftf.tutorial'); } catch (e) {} }));
    T.appendChild(this.mkBtn('Log events', () => console.table(window.__ftfAnalytics || [])));

    this._statT = setInterval(() => { if (this.el.debug.style.display === 'block') this.debugStats(); }, 250);
    this._perm = this._perm || [];
    this._perm.push(this._statT);
  },

  /* Stage the finale directly, without playing four farms first. */
  dbgFinaleAt(where) {
    this.el.title.style.display = 'none';
    this.forceReduce = true;
    this._fresh = false;
    this.startRound(3);
    this.after(60, () => {
      this.beginPlay();
      this.dbgDrag(8);
      this.stats.completed = true;
      this.forceReduce = false;
      if (where === 'peak') this.finalePeak();
      else this.finaleStart();
    });
  },
  /* The solo 8 x 8 pasture that the formula and completion screens sit on. */
  dbgSolo() {
    this.el.title.style.display = 'none';
    ['fin', 'fm', 'adv', 'complete', 'explore'].forEach(k => { this.el[k].style.display = 'none'; });
    this.el.emblem.style.display = 'none';
    this.clearTimers();
    this.dropAllPens({ instant: true });
    const r = this.ROUNDS[3], F = this.FIN;
    this.stats.phase = 'peak';
    this.stats.completed = true;
    this._goatPen = 'main';
    this.setLight('golden');
    this.applyLayout(r.perimeter, r.optimum[0], r.optimum[1], F.soloCell, F.soloX, F.soloY, 3);
    this.stats.bestArea = r.optimum[0] * r.optimum[1];
    this.el.fill.style.opacity = '1';
    this.el['fence-badge'].style.opacity = '1';
    this.el['area-card'].style.opacity = '1';
    this.el['fence-val'].textContent = r.perimeter + ' m';
    this.el['area-val'].textContent = String(r.optimum[0] * r.optimum[1]);
    this.el.handle.style.opacity = '0';
    this.render({ instant: true });
    this.moveGoatInside(true);
    this.setGoat('eat');
  },

  /* Steps every legal shape of the round and checks that the drawn rectangle,
     the module counts and the printed number all agree. */
  sweep() {
    const g = this.g, keep = g.W, rows = [];
    for (let w = 1; w <= g.Wmax; w++) {
      g.W = w; g.L = g.half - w;
      this.render({ instant: true });
      this.el['area-val'].textContent = String(g.L * g.W);
      const keys = Array.from(this.pens.main.nodes.keys());
      const posts = keys.filter(k => k[1] === 'p').length;
      const rails = keys.filter(k => k[1] === 'r').length;
      const wpx = parseFloat(this.el.fill.style.width), hpx = parseFloat(this.el.fill.style.height);
      const shown = Number(this.el['area-val'].textContent);
      rows.push({
        shape: g.L + ' x ' + g.W,
        perimeter: 2 * (g.L + g.W),
        area: g.L * g.W, shown: shown,
        posts: posts, rails: rails,
        pxPerMetreX: +(wpx / g.L).toFixed(2),
        pxPerMetreY: +(hpx / g.W).toFixed(2),
        ok: 2 * (g.L + g.W) === g.perimeter && posts === g.perimeter && rails === g.perimeter &&
            shown === g.L * g.W && Math.abs(wpx / g.L - hpx / g.W) < 0.01
      });
    }
    g.W = keep; g.L = g.half - keep;
    this.render({ instant: true });
    this.el['area-val'].textContent = String(g.L * g.W);
    const bad = rows.filter(r => !r.ok).length;
    console.table(rows);
    console.log('[ftf] round ' + (g.round + 1) + ': ' + rows.length + ' legal states, ' + bad + ' mismatches');
    this.el['debug-stats'].textContent = 'sweep round ' + (g.round + 1) + '\n' + rows.length + ' legal states\n' +
      bad + ' mismatches\n(see console table)';
    return rows;
  },

  debugStats() {
    const g = this.g, e = this.el['debug-stats'];
    if (!e) return;
    const r = this.ROUNDS[g.round] || {}, lv = this.lv || {};
    const keys = Array.from(this.pens.main.nodes.keys());
    const posts = keys.filter(k => k[1] === 'p').length;
    const rails = keys.filter(k => k[1] === 'r').length;
    e.textContent =
      'level      ' + (g.round + 1) + '  ' + (r.name || '-') +
      '\nmechanic   ' + (r.mechanic || '-') +
      '\nperimeter  ' + g.perimeter + '  (L+W=' + g.half + ')' +
      '\nlength     ' + g.L +
      '\nwidth      ' + g.W +
      '\narea       ' + (g.L * g.W) +
      '\nbestArea   ' + this.stats.bestArea +
      '\ntargetArea ' + (r.optimum ? r.optimum[0] * r.optimum[1] : '-') +
      '\nrecord     ' + (lv.record || '-') + (lv.beaten ? '  BEATEN' : '') +
      '\ninvariant  2(' + g.L + '+' + g.W + ')=' + (2 * (g.L + g.W)) + ' / ' + g.perimeter +
      '\nposts      ' + posts + ' / ' + g.perimeter +
      '\nrails      ' + rails + ' / ' + g.perimeter +
      '\nmodulesX   ' + (2 * g.L) + '   modulesY ' + (2 * g.W) +
      '\ncell       ' + g.cell.toFixed(1) + ' px/m' +
      '\ndragValue  ' + g.W + ' of 1-' + g.Wmax +
      '\nphase      ' + this.stats.phase +
      '\ndragState  ' + (this.stats.dragging ? 'dragging' : this.stats.grabbed ? 'released' : 'untouched') +
      '\ngoatState  ' + this.goat.state +
      '\ntutBeat    ' + (lv.tutBeat || '-') +
      '\nstretched  ' + (lv.stretched ? 'yes' : 'no') + '  flipped ' + (lv.flipped ? 'yes' : 'no') +
      '\nbonus      ' + (lv.bonusOpen ? (lv.bonusDone ? 'done' : 'open') : '-') +
      '\ntier       ' + this.stats.tier + '  light ' + (this.root.dataset.light || '-') +
      '\nreduced    ' + (this.noMotion() ? 'yes' : 'no');
    if (this.el.dimdebug && this.el.dimdebug.style.display === 'block') {
      this.el.dimdebug.textContent = g.L + ' x ' + g.W + '   P = ' + (2 * (g.L + g.W)) +
        '   A = ' + (g.L * g.W) + '   pieces ' + keys.length + '   posts ' + posts + '   rails ' + rails;
    }
  }
});
