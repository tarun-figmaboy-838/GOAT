/* ============================================================================
   FENCE THE FARM — level celebration staging

   The performance itself lives in mascot.js. This file only sets the stage for
   it: the farm falls out of focus, everything that is not the goat is taken off
   screen, the mascot plays, and then the explanation arrives.

   Wordless on purpose. No panel, no badge, no "Level Complete" - the moment is
   carried by the character and the timing, which is what makes it feel earned
   rather than announced.
   ========================================================================== */

Object.assign(FenceTheFarm.prototype, {

  /* Called at the end of every farm. `then` is whatever that farm does to
     explain itself, and it always runs - even if the celebration is cut short -
     so the flow can never be left stranded. */
  playGoatCelebration(then) {
    if (this._cheering) return;                  // never twice for one farm
    this._cheering = true;
    /* The hand-off deliberately survives clearTimers() so it cannot be lost -
       but that also means it survives a RESTART. If the farm has changed by
       the time it fires, running `then` would push the OLD farm's success into
       the new one (the QA caught it driving a fresh tutorial to beat 9). The
       generation stamp lets the hand-off notice it is stale and stand down. */
    this._cheerGen = (this._cheerGen || 0) + 1;
    const gen = this._cheerGen;
    const safeThen = then && (() => { if (this._cheerGen === gen) then(); });

    this.lockInput(true);
    // A question left open would sit on top of her; put it away rather than
    // merely fading it.
    this.closeChoice();
    this.el.field.classList.add('ftf-defocus');
    this.root.classList.add('ftf-cheering');     // everything but the goat goes
    /* Her field self is hidden with display, not opacity: opacity is
       transitioned on that element and written inline from several places, so
       it is not a reliable way to be certain she is gone. */
    this.el.goat.style.display = 'none';
    if (this.el['goat-side']) this.el['goat-side'].style.display = 'none';
    this.el.cheer.classList.add('ftf-on');
    this.track('level_celebrated', { round: this.g.round + 1 });

    /* The hand-off is on a timer clearTimers() cannot cancel. If a level beat
       fired clearTimers() mid-celebration the explanation would never arrive
       and the farm would sit blurred and unplayable. */
    let handed = false;
    const done = () => { if (handed) return; handed = true; this.endCelebration(safeThen); };
    this.mascot().playLevelComplete(done);
    // Comfortably past the 8s performance: this is a safety net for a
    // controller that somehow never reports finishing, not the usual path.
    this.afterKeep(9200, done);
  },

  endCelebration(then) {
    this.el.cheer.classList.remove('ftf-on');
    this.el['mascot-front'].innerHTML = '';      // no particle outlives this
    this.el['mascot-back'].innerHTML = '';
    this.el.field.classList.remove('ftf-defocus');    // eases back on its own
    this.root.classList.remove('ftf-cheering');       // the HUD fades back in
    this.el.goat.style.display = '';                  // she is back in the field
    if (this.el['goat-side']) this.el['goat-side'].style.display = '';
    this.lockInput(false);
    this._cheering = false;
    if (then) then();
  },

  /* Held only for the length of the celebration. The handle is put beyond reach
     rather than disabled, so nothing has to be re-enabled afterwards and a
     stuck flag can never leave the game unplayable. */
  lockInput(on) {
    this._inputLocked = !!on;
    this.el.handle.style.pointerEvents = on ? 'none' : '';
    this.el.next.style.pointerEvents = on ? 'none' : (this.el.next.style.opacity === '1' ? 'auto' : 'none');
  }
});

/* One insertion point for all four farms. Whatever a level does to explain
   itself becomes the celebration's hand-off, so the order is always
   solved -> she celebrates -> the explanation arrives, and no level has to
   remember to do it. */
(function (proto) {
  const succeed = proto.levelSucceed;
  proto.levelSucceed = function () {
    this.playGoatCelebration(() => succeed.call(this));
  };
  // Each farm gets its own single celebration.
  const reset = proto.levelReset;
  proto.levelReset = function () {
    this._cheering = false;
    this.endCelebration(null);
    reset.call(this);
  };
})(FenceTheFarm.prototype);
