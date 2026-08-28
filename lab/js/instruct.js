/* ============================================================================
   FENCE THE FARM — the instruction controller

   Everything the sign says goes through here, so that pacing is one decision
   made in one place rather than a habit each level has to remember.

   Three behaviours:

   1  WORD BY WORD. A line is revealed a word at a time, ~210ms apart, with a
      longer pause after punctuation. Letter-by-letter was rejected: it reads as
      a computer terminal and is slower to actually read.

   2  A STABLE BOARD. Every word is laid out - and the board sized to fit the
      finished line - BEFORE the first word appears. Only the opacity of each
      word changes, so the board never grows, reflows or bounces while the
      learner is still reading. One soft settle plays after the last word, and
      that is the signal that the instruction is complete.

   3  IDLE HELP, AND ONLY THEN. The idle clock does not start when the line
      appears; it starts when the line has finished revealing AND settled.
      Otherwise a learner who is simply reading gets treated as stuck. From
      there help escalates 5s -> 10s -> 15s, one stage at a time.

   Informational lines ("More area. Same 20 m fence.") never start the idle
   clock: nothing is being asked of the player, so there is nothing to prompt.
   ========================================================================== */

const INSTRUCT = {
  wordMs: 210,                 // per word; 180-240 reads comfortably
  pause: { ',': 100, ';': 100, ':': 120, '.': 180, '!': 180, '?': 220 },
  settleWait: 210,             // after the last word, before the board settles
  settleMs: 620,               // the one soft bounce
  idleMs: 5000,                // small hand
  goatMs: 10000,               // she glances at the handle
  nudgeMs: 15000,              // a short line, last of all
  handFade: 150
};

class InstructionController {
  constructor(game) {
    this.g = game;
    this.el = game.el.plank;
    this.slot = game.el['plank-1'];
    this.hand = game.el['hint-hand'];
    this.timers = [];
    this.words = [];
    this.state = 'idle';        // idle | typing | settling | ready
    this.type = 'informational';
  }

  /* --------------------------------------------------------------- timers --
     Kept on the controller rather than in the game's scripted list, so a level
     beat cannot cancel a half-revealed sentence and leave it stranded. */
  at(ms, fn) {
    const t = setTimeout(() => { if (!this.g.dead) fn(); }, ms);
    this.timers.push(t);
    return t;
  }
  clear() { this.timers.forEach(clearTimeout); this.timers = []; }

  /* Everything this controller owns, stopped. Called on every phase change, so
     words from the farm just left can never keep appearing on the next one. */
  cancel() {
    this.clear();
    this.state = 'idle';
    this.hideHand(true);
    this.el.style.animation = 'none';
  }

  /* --------------------------------------------------------------- show ---- */
  show(opts) {
    const o = typeof opts === 'string' ? { text: opts } : (opts || {});
    const text = o.text == null ? '' : String(o.text);
    this.cancel();
    this.type = o.type || 'informational';
    this.hintTarget = o.hintTarget || 'handle';
    this.idleOn = o.idleHint !== false && this.type === 'action';

    // Lay the whole line out first and size the board to it, so nothing moves
    // once the words start arriving.
    this.slot.textContent = '';
    this.words = [];
    const parts = text.split(/(\s+)/).filter(s => s.length);
    parts.forEach(part => {
      if (/^\s+$/.test(part)) { this.slot.appendChild(document.createTextNode(part)); return; }
      const s = document.createElement('span');
      s.className = 'ftf-w';
      s.textContent = part;
      this.slot.appendChild(s);
      this.words.push(s);
    });
    this.g.fitSign(this.el);

    // The sign itself arrives as it always did.
    this.el.style.transition = 'opacity 260ms ease, transform 300ms cubic-bezier(.34,1.4,.64,1)';
    this.el.style.transform = 'translateX(-50%)';
    this.el.style.opacity = '1';

    /* One announcement of the finished sentence, never one per word - a live
       region updated per word reads out "Drag... Drag this... Drag this
       corner..." and is worse than useless. */
    if (text) this.g.announce(text);

    if (this.g.noMotion() || o.now) {
      this.words.forEach(w => w.classList.add('ftf-in'));
      this.ready();
      return;
    }

    this.state = 'typing';
    let t = 0;
    this.words.forEach((w, i) => {
      this.at(t, () => w.classList.add('ftf-in'));
      const last = w.textContent.slice(-1);
      t += INSTRUCT.wordMs + (INSTRUCT.pause[last] || 0);
      if (i === this.words.length - 1) this.at(t + INSTRUCT.settleWait, () => this.settle());
    });
    if (!this.words.length) this.ready();
  }

  /* The board acknowledges that the line is complete. Deliberately small: 4px
     up, 2px back, once. A spring would read as cartoon UI. */
  settle() {
    this.state = 'settling';
    if (this.g.noMotion()) { this.ready(); return; }
    this.el.style.animation = 'ftf-plank-settle ' + INSTRUCT.settleMs + 'ms cubic-bezier(.22,.9,.32,1.12)';
    this.g.sfx('plank_tick');
    this.at(INSTRUCT.settleMs, () => { this.el.style.animation = 'none'; this.ready(); });
  }

  /* The instruction is now readable and complete. Only from here does the
     learner count as idle. */
  ready() {
    this.state = 'ready';
    if (this.idleOn) this.armIdle();
  }

  /* If the player already knows what to do and acts mid-sentence, the sentence
     gets out of the way rather than making them wait for it. */
  finishNow() {
    if (this.state !== 'typing' && this.state !== 'settling') return;
    this.clear();
    this.words.forEach(w => w.classList.add('ftf-in'));
    this.el.style.animation = 'none';
    this.ready();
  }

  /* --------------------------------------------------------------- idle ---- */
  armIdle() {
    this.clear();
    if (!this.idleOn) return;
    this.at(INSTRUCT.idleMs, () => this.showHand());
    this.at(INSTRUCT.goatMs, () => {
      if (this.g.stats.dragging) return;
      this.g.lookAtHandle && this.g.lookAtHandle();
    });
    this.at(INSTRUCT.nudgeMs, () => {
      if (this.g.stats.dragging) return;
      this.g.track('hint_tier_shown', { tier: 3, target: this.hintTarget });
    });
  }
  /* Any real interaction. Mouse movement is deliberately NOT an interaction:
     thinking with the cursor on screen is not activity. */
  poke() {
    if (this.state === 'typing' || this.state === 'settling') this.finishNow();
    this.hideHand();
    if (this.state === 'ready') this.armIdle();
  }

  /* ---------------------------------------------------------- the hand ---- */
  showHand() {
    if (this.g.stats.dragging || !this.g.dragAllowed()) return;
    /* Never two hands. The tutorial's own large hand is the teacher during the
       beat that explains the control; this small one is for the idle moments
       afterwards. If that one is up, this one stays away - two hands pointing
       at the same corner is worse than none. */
    const big = this.g.el.hand;
    if (big && getComputedStyle(big).opacity !== '0') return;
    const p = this.handPoint();
    if (!p) return;
    const h = this.hand;
    h.style.left = p[0] + 'px';
    h.style.top = p[1] + 'px';
    h.classList.add('ftf-in');
    h.classList.toggle('ftf-still', this.g.noMotion());
    this.g.track('hint_tier_shown', { tier: 1, target: this.hintTarget });
  }
  hideHand(instant) {
    const h = this.hand;
    if (!h) return;
    h.classList.remove('ftf-in');
    if (instant) h.classList.remove('ftf-still');
  }
  /* Offset up and left of the corner, so the hand points AT the control
     without ever sitting on top of it. */
  handPoint() {
    const g = this.g;
    if (this.hintTarget === 'handle') {
      if (!g.dragAllowed()) return null;
      const q = g.px(g.g.L, g.g.W);
      return [q[0] + 14, q[1] + 10];
    }
    const b = g.el.next;
    if (b && getComputedStyle(b).opacity !== '0') {
      const r = b.getBoundingClientRect(), s = g.root.getBoundingClientRect();
      const k = 1280 / s.width;
      return [(r.right - s.left) * k - 10, (r.bottom - s.top) * k - 8];
    }
    return null;
  }
}

Object.assign(FenceTheFarm.prototype, {
  instructor() {
    if (!this._instr) this._instr = new InstructionController(this);
    return this._instr;
  },
  /* The sign's one entry point. Levels keep calling plankSay(line) and get the
     paced reveal for free; anything that needs the line to be treated as a
     request rather than a remark passes { type: 'action' }. */
  say(line, opts) { this.instructor().show(Object.assign({ text: line }, opts || {})); },
  /* She looks at the corner - the second rung of the idle ladder. */
  lookAtHandle() {
    if (!this.dragAllowed()) return;
    const q = this.px(this.g.L, this.g.W);
    this.goat.lookAt = [q[0], q[1]];
    if (this.goat.state === 'idle' || this.goat.state === 'eat') this.setGoat('curious');
    this.track('hint_tier_shown', { tier: 2, target: 'handle' });
  }
});
