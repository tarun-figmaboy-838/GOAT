/* ============================================================================
   FENCE THE FARM — level mechanics
   Four farms, four questions, one interaction:

     1  Discovery      a gated nine-beat tutorial
     2  Farm Record    beat 32 m², then push past it
     3  Visual Trap    stretch it longer, then be shown what that cost
     4  Master Builder no help at all, plus an optional exact-area build

   The core calls levelReset / levelIntro / levelBegin / levelStep /
   levelRelease / levelPlank / levelSucceed / levelEvent, and each mechanic
   answers for itself. Nothing here ever blocks the player: reaching the best
   shape always completes the farm, whichever route they took to it.
   ========================================================================== */
Object.assign(FenceTheFarm.prototype, {

  round() { return this.ROUNDS[this.g.round]; },
  mechanic() { return this.round().mechanic; },

  levelReset() {
    const r = this.round();
    this.lv = {
      record: r.record || 0, beaten: false, flagged: false,
      stretched: false, flipped: false, longest: r.start[0], pausedAt: 0,
      bonusOpen: false, bonusDone: false,
      tutBeat: 0, tutMoves: 0, tutNoticed: false
    };
  },

  /* Called once she has walked in (first farm) or is standing ready. */
  levelIntro() {
    switch (this.mechanic()) {
      case 'tutorial':      return this.tutBeat(1);
      case 'record':        return this.recordIntro();
      case 'misconception': return this.trapIntro();
      default:              return this.masteryIntro();
    }
  },

  /* Play has started: the handle is live. */
  levelBegin() {
    switch (this.mechanic()) {
      case 'tutorial':      return;                 // the beat machine drives it
      case 'record':        return this.recordBegin();
      case 'misconception': return this.trapBegin();
      default:              return this.masteryBegin();
    }
  },

  /* The plank's resting copy for this level, restored after any message. */
  levelPlank() {
    if (this.stats.completed || this.stats.phase !== 'play') { this.retractPlank(); return; }
    switch (this.mechanic()) {
      case 'tutorial':      return this.tutPlank();
      case 'record':
        return this.plankSay(this.recordLine());
      case 'misconception':
        return this.plankSay(this.t(this.lv.flipped ? 'instruction.mostGrass' : 'instruction.stretch'));
      default: return this.retractPlank();           // mastery says nothing
    }
  },

  /* One legal state to the next. */
  levelStep(prevArea, area, dir, isBest) {
    if (this.stats.phase === 'peak') { this.peakStep(area); return; }
    if (this.stats.phase === 'explore') { this.showDims(true); return; }
    switch (this.mechanic()) {
      case 'tutorial':      return this.tutStep(prevArea, area, dir);
      case 'record':        return this.recordStep(area, isBest);
      case 'misconception': return this.trapStep(area, isBest);
      default:              return this.masteryStep(area, isBest);
    }
  },

  /* The handle was let go on a shape that is not the best one. */
  levelRelease() {
    const g = this.g, area = g.L * g.W;
    if (this.stats.completed || this.stats.phase !== 'play') return;
    if (this.mechanic() === 'tutorial') { this.tutRelease(area); return; }
    if (this.mechanic() === 'mastery') return;       // the mastery farm stays quiet
    // Consequence only, never a verdict.
    if (area < g.startArea) {
      this.showToast('feedback.longerLess', 1400);
      this.setGoat('eat');
      this.track('suboptimal_release', { area: area, kind: 'longer_less' });
    } else if (area > g.startArea && !this.lv.beaten) {
      this.showToast('feedback.tryMore', 1900);
      this.setGoat('curious');
      this.track('suboptimal_release', { area: area, kind: 'better' });
    }
  },

  levelEvent(what) {
    if (what === 'grab' && this.mechanic() === 'tutorial') this.tutOnGrab();
    if (what === 'grab') this.el.skip.classList.remove('ftf-in');
  },

  levelSucceed() {
    switch (this.mechanic()) {
      case 'tutorial':      return this.tutBeat(8);
      case 'record':        return this.recordSucceed();
      case 'misconception': return this.trapSucceed();
      default:              return this.masterySucceed();
    }
  },

  /* ==========================================================================
     LEVEL 1 · DISCOVERY — the gated tutorial
     SEE -> TOUCH -> NOTICE -> TRY -> DISCOVER. Nothing advances on a timer
     where an interaction is the point: the game waits for the first grab, the
     first shape change, some experimenting, and the best shape.
     ====================================================================== */
  tutBeat(n) {
    if (this.dead) return;
    this.lv.tutBeat = n;
    this.track('tutorial_beat', { beat: n });
    const F = this['tut' + n];
    if (F) F.call(this);
  },

  /* Beat 1 — give the player a reason. Only the goat is alive. */
  tut1() {
    this.plankDrop(this.t('tut.reason'));
    this.pulseOnly('goat');
    this.vo('vo.reason');
    this.setGoat('talk');
    this.after(this.noMotion() ? 0 : 900, () => this.setGoat('eat'));
    this.after(this.noMotion() ? 0 : 2100, () => this.tutBeat(2));
  },

  /* Beat 2 — the fence is a limited, fixed amount. It pulses once. */
  tut2() {
    this.buildFence(1150, () => {
      this.showNumbers(true);
      this.vo('vo.fence');
      if (this.tutorialSeen()) this.el.skip.classList.add('ftf-in');
      this.after(this.noMotion() ? 0 : 1250, () => { this.beginPlay(); this.tutBeat(3); });
    });
  },

  /* Beat 3 — show what can be touched, then WAIT. */
  tut3() {
    this.plankSay(this.t('tut.touch'));
    this.pulseOnly('handle');
    this.vo('vo.drag');
    this.el.hand.style.opacity = '1';
    this.track('hint_shown', { which: 'hand' });
    this.demoHandle();
    if (this.tutorialSeen()) this.el.skip.classList.add('ftf-in');
  },
  tutOnGrab() {
    if (this.lv.tutBeat === 3) this.tutBeat(4);
  },

  /* Beat 4 — feel the constraint. Waits for the first real shape change. */
  tut4() {
    this.el.skip.classList.remove('ftf-in');
    this.pulseOnly(null);
    this.plankSay(this.t('tut.touch'));
  },

  /* Beat 5 — make the player notice what changed, and what did not. */
  tut5() {
    this.lv.tutNoticed = true;
    this.pulseOnly('area');
    this.vo('vo.same');
    // "More grass!" over "Fence is still 20 m": the second line is the point.
    this.plankSay(this.t('tut.noticed').replace('20', String(this.g.perimeter)));
    this.setGoat('happy');
    this.after(this.noMotion() ? 0 : 2200, () => { if (this.lv.tutBeat === 5) this.tutBeat(6); });
  },

  /* Beat 6 — invite the mistake. Free dragging, no steering. */
  tut6() {
    this.pulseOnly(null);
    this.plankSay(this.t('tut.more'));
    this.lv.tutMoves = 0;
  },

  /* Beat 7 — the real challenge, with the training wheels gone. */
  tut7() {
    this.pulseOnly(null);
    this.hideHint();
    this.plankSay(this.t('tut.challenge'));
  },

  /* Beat 8 — success. */
  tut8() {
    this.plankSay(this.t('tut.success'));
    this.vo('vo.nice');
    // Hold on the finished pasture so the revealed side lengths can be read
    // before the recap replaces them with its own cards.
    this.after(this.noMotion() ? 0 : 2100, () => this.tutBeat(9));
  },

  /* Beat 9 - the recap: the shape they started with is rebuilt beside the
     shape they found, and the tracer proves the fence never changed. */
  tut9() {
    const r = this.round(), g = this.g;
    this.compareBuilds(r.start, [g.L, g.W], g.perimeter, {
      then: () => this.tutBeat(10)
    });
  },

  /* Tutorial complete. */
  tut10() {
    this.markTutorialSeen();
    this.plankSay(this.t('tut.gotIt'));
    this.offerNext('action.next');
    this.setGoat('eat');
  },

  tutPlank() {
    const b = this.lv.tutBeat;
    if (b <= 2) return this.plankSay(this.t('tut.reason'));
    if (b === 3 || b === 4) return this.plankSay(this.t('tut.touch'));
    if (b === 6) return this.plankSay(this.t('tut.more'));
    return this.plankSay(this.t('tut.challenge'));
  },

  tutStep(prevArea, area, dir) {
    const b = this.lv.tutBeat;
    // Beat 4 completes on the first change that actually gains grass.
    if (b === 4) {
      if (area > prevArea) { this.setGoat('talk'); this.tutBeat(5); }
      else this.showToast('feedback.longerLess', 1400);
      return;
    }
    if (b === 6) {
      this.lv.tutMoves++;
      // Once they have felt both directions, or moved a few times, hand them
      // the goal and stop talking.
      if (this.lv.tutMoves >= 3 || this.stats.reversals >= 1) this.tutBeat(7);
    }
  },

  tutRelease(area) {
    const g = this.g;
    if (area < g.startArea) {
      this.showToast('feedback.longerLess', 1500);
      this.vo('vo.longer');
      this.setGoat('curious');
      this.track('suboptimal_release', { area: area, kind: 'longer_less' });
      if (this.lv.tutBeat === 6) this.after(1600, () => { if (this.lv.tutBeat === 6) this.tutBeat(7); });
    } else if (this.lv.tutBeat >= 6 && area > g.startArea) {
      this.showToast('feedback.tryMore', 1700);
      this.setGoat('curious');
    }
  },

  /* Returning players can step straight to the interactive part. */
  tutSkip() {
    if (this.mechanic() !== 'tutorial') return;
    this.track('tutorial_skipped', { beat: this.lv.tutBeat });
    this.el.skip.classList.remove('ftf-in');
    this.hideHint();
    this.clearTimers();
    if (this.stats.phase !== 'play') {
      this.buildFence(0, () => { this.showNumbers(false); this.beginPlay(); this.tutBeat(7); });
    } else this.tutBeat(7);
  },

  /* ==========================================================================
     LEVEL 2 · FARM RECORD — beat 32 m², then see how far it goes
     ====================================================================== */
  recordIntro() {
    this.buildFence(700, () => {
      this.showNumbers(false);
      this.after(this.noMotion() ? 0 : 200, () => this.beginPlay());
    });
  },
  recordBegin() {
    // No separate board: the challenge, the number and the result all speak
    // through the one sign, so nothing crowds the middle of the screen.
    this.plankDrop(this.recordLine());
    this.vo('vo.record');
    // She walks the long pasture first, so its size registers.
    const b = this.bounds();
    this.goat.tx = b[0] + 8; this.goat.ty = (b[2] + b[3]) / 2;
    this.setGoat('walk');
    this.after(3200, () => {
      if (this.stats.phase !== 'play' || this.stats.grabbed) return;
      const b2 = this.bounds();
      this.goat.tx = b2[1] - 8; this.goat.ty = (b2[2] + b2[3]) / 2;
      this.setGoat('walk');
    });
  },
  /* The record is a number in a sentence, not a second board. */
  recordLine() {
    if (!this.lv.beaten) return this.t("instruction.record").replace("32", String(this.lv.record));
    return this.t("instruction.push");
  },
  recordStep(area, isBest) {
    // At exactly the record, nothing dramatic: they have only matched it.
    if (area > this.lv.record && !this.lv.beaten) {
      this.lv.beaten = true;
      this.lv.record = area;
      this.track("record_broken", { area: area });
      this.sfx("record_break");
      this.setGoat("happy");
      // The level does NOT end here. The goal simply opens up.
      this.plankSay(this.t("record.new").replace("33", String(area)));
      this.after(1600, () => { if (!this.stats.completed && this.stats.phase === "play") this.levelPlank(); });
      return;
    }
    if (this.lv.beaten && area > this.lv.record) this.lv.record = area;
    if (isBest) this.musicTier(this.tierFor(area));
  },
  recordSucceed() {
    this.sfx("record_success");
    this.after(620, () => this.plankSay(this.t("success.r2")));
    // Then the same recap every farm ends with - after a beat on the side
    // lengths this farm just revealed.
    this.after(2400, () => {
      const r = this.round(), g = this.g;
      this.compareBuilds(r.start, [g.L, g.W], g.perimeter, { then: () => this.offerNext("action.next") });
    });
  },

  /* ==========================================================================
     LEVEL 3 · VISUAL TRAP — the game asks the player to perform the
     misconception, then shows them what it cost.
     ====================================================================== */
  trapIntro() {
    this.buildFence(700, () => {
      this.showNumbers(false);
      this.after(this.noMotion() ? 0 : 200, () => this.beginPlay());
    });
  },
  trapBegin() {
    // She walks the long axis: the pasture is meant to look substantial.
    const b = this.bounds();
    this.goat.tx = b[1] - 8; this.goat.ty = (b[2] + b[3]) / 2;
    this.setGoat('walk');
    this.after(this.noMotion() ? 0 : 1500, () => {
      this.plankDrop(this.t('instruction.stretch'));
      this.vo('vo.stretch');
    });
    this.after(3400, () => { if (this.stats.phase === 'play' && !this.stats.grabbed) this.setGoat('eat'); });
  },
  trapStep(area, isBest) {
    const r = this.round(), stretchW = r.forcedStretch[1];
    // The pasture has been stretched as far as the challenge asked.
    if (!this.lv.stretched && this.g.W <= stretchW) {
      this.lv.stretched = true;
      this.lv.longest = Math.max(this.lv.longest, this.g.L);
      this.track('stretch_reached', { shape: this.g.L + 'x' + this.g.W, area: area });
      this.trapPause();
      return;
    }
    if (this.g.L > this.lv.longest) this.lv.longest = this.g.L;
    if (isBest && this.lv.flipped) this.musicTier(this.tierFor(area));
  },
  /* A held beat in the narrow pasture: she takes two steps, looks around, and
     the music thins out. Then the board changes its mind. */
  trapPause() {
    const b = this.bounds();
    this.goat.tx = b[0] + (b[1] - b[0]) * 0.35; this.goat.ty = (b[2] + b[3]) / 2;
    this.setGoat('walk');
    this.musicTier(0, true);
    this.after(this.noMotion() ? 0 : 900, () => this.setGoat('curious'));
    this.after(this.noMotion() ? 0 : 1700, () => {
      this.lv.flipped = true;
      this.plankFlip(this.t('instruction.mostGrass'));
      this.vo('vo.didLonger');
      this.musicTier(1);
    });
  },
  trapSucceed() {
    const g = this.g;
    // The comparison uses the long shape THEY stretched to, not the level's
    // start - so the recap answers the question the level asked them.
    const L2 = this.lv.longest, W2 = g.half - L2;
    this.after(620, () => this.plankSay(this.t("success.r3")));
    this.after(2400, () => {
      this.compareBuilds([L2, W2], [g.L, g.W], g.perimeter, {
        tagA: "final.longest", tagB: "final.bestBuild",
        then: () => this.offerNext("action.next")
      });
    });
  },

  /* ==========================================================================
     LEVEL 4 · MASTER BUILDER — no instruction, no record, no target.
     Feedback arrives as sound and as the goat, never as text.
     ====================================================================== */
  masteryIntro() {
    this.buildFence(700, () => {
      this.showNumbers(false);
      this.after(this.noMotion() ? 0 : 200, () => this.beginPlay());
    });
  },
  masteryBegin() {
    this.retractPlank();
    this.pulseOnly(null);
    this.setGoat('eat');
    // After a long stall the number itself pulses. The answer is never given.
    const check = () => {
      if (this.dead || this.stats.phase !== 'play' || this.stats.completed) return;
      if (this.stats.bestArea <= this.g.startArea) {
        this.pulseOnly('area');
        this.lookAtArea();
        this.track('hint_shown', { which: 'area_pulse' });
        this.after(900, () => this.pulseOnly(null));
      }
      this.after(13000, check);
    };
    this.after(13000, check);
  },
  /* Progress speaks through her and through the music (§dynamic feedback). */
  tierFor(area) {
    const best = this.g.half * this.g.half / 4, f = area / best;
    if (f >= 0.995) return 4;
    if (f >= 0.94) return 3;
    if (f >= 0.8) return 2;
    if (f > this.g.startArea / best) return 1;
    return 0;
  },
  masteryStep(area, isBest) {
    if (!isBest) return;
    const tier = this.tierFor(area);
    if (tier <= this.stats.tier) return;
    this.stats.tier = tier;
    this.musicTier(tier);
    if (tier === 1) this.setGoat('walk');
    else if (tier === 2) { this.setGoat('curious'); }
    else if (tier === 3) { this.setGoat('talk'); }
  },
  masterySucceed() {
    this.after(700, () => {
      this.plankSay(this.t('success.r4'));
      this.showDims(true);
    });
    // The optional exact-area build. Never required, and the way on stays open.
    const target = this.round().optionalTarget;
    if (target) {
      this.after(1300, () => {
        this.lv.bonusOpen = true;
        this.stats.completed = false;          // the handle stays live for it
        this.el.handle.style.cursor = 'grab';
        this.el['bonus-txt'].textContent = this.t('bonus.make').replace('48', String(target));
        this.el.bonus.classList.add('ftf-in');
        this.render();
      });
    }
    this.after(1500, () => this.offerNext('action.reveal'));
  },
  /* The bonus is checked on every state while it is open. */
  bonusCheck(area) {
    if (!this.lv.bonusOpen || this.lv.bonusDone) return;
    const target = this.round().optionalTarget;
    if (area !== target) return;
    this.lv.bonusDone = true;
    this.track('bonus_completed', { area: area });
    this.el.bonus.classList.add('ftf-done');
    this.el['bonus-txt'].textContent = this.t('bonus.done');
    this.sfx('record_success');
    this.setGoat('happy');
    this.bump(this.el['area-val'], 'ftf-pop', 420);
  }
});

/* The bonus needs to see every state change, including ones after success. */
(function (proto) {
  const step = proto.levelStep;
  proto.levelStep = function (prevArea, area, dir, isBest) {
    step.call(this, prevArea, area, dir, isBest);
    if (this.lv && this.lv.bonusOpen) this.bonusCheck(area);
  };
})(FenceTheFarm.prototype);
