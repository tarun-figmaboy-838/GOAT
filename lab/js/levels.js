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
      record: r.record || 0, beaten: false, matched: false, flagged: false,
      stretched: false, flipped: false, longest: r.start[0], pausedAt: 0,
      precise: true,            // mastery sets it false while its target is open
      tutBeat: 0, tutMoves: 0, tutNoticed: false
    };
    this.spotlight(null);       // a new farm never inherits the intro's veil
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
      /* Mastery used to say nothing at all - which also meant it never had an
         actionable line, so the idle hand could never arm on this farm. It now
         states whichever contract is open. */
      default:
        return this.plankSay(this.masteryLine());
    }
  },
  /* Distance feedback while the precision contract is open. It says how far
     off and which way - never which shape to build. Hitting it exactly closes
     the contract and opens the mastery one. */
  precisionStep(area) {
    const target = this.round().optionalTarget;
    if (!target || this.lv.precise) return;
    if (area === target) {
      this.lv.precise = true;
      this.track('exact_area_completed', { area: area, moves: this.stats.reversals });
      this.sfx('record_success');
      this.setGoat('happy');
      this.bump(this.el['area-val'], 'ftf-pop', 420);
      this.plankSay(this.t('feedback.exact').replace('48', String(target)));
      this.vo('vo.exact');
      this.after(this.noMotion() ? 0 : 1900, () => {
        if (this.stats.phase !== 'play') return;
        this.plankSay(this.t('mastery.max'));
        this.vo('vo.final');
      });
      return;
    }
    const d = Math.abs(target - area);
    const key = area < target ? 'feedback.short' : 'feedback.over';
    this.showToast2(this.t(key).replace('2', String(d)), 1500);
  },
  /* A toast that carries an already-built string rather than a key. */
  showToast2(line, ms) {
    this.plankSay(line);
    clearTimeout(this._toastT);
    this._toastT = this.after(ms, () => { this._msg = null; this.levelPlank(); });
  },
  masteryLine() {
    const target = this.round().optionalTarget;
    if (target && !this.lv.precise) return this.t('bonus.make').replace('48', String(target));
    return this.t('mastery.max');
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

  /* Beat 1 — the FENCE, and the problem it makes. Nothing is said.

     This beat used to assert "give her more grass" over an empty lawn: the
     fence was not built until beat 2, so the cramped field the line was about
     was not on screen while the line was being read. The picture comes first
     now. The posts rise around her, she walks the length of the strip - which
     is what makes 8 x 2 read as long and thin rather than merely small - and
     only then does anything speak. */
  tut1() {
    // The hook, asked while the fence is going up around her. It was briefly a
    // line on the title screen; every line the game speaks belongs on this one
    // board, after Play, so copy never has two homes.
    this.plankDrop(this.t('tut.hook'));
    this.vo('vo.hook');
    this.buildFence(1150, () => {
      if (this.tutorialSeen()) this.el.skip.classList.add('ftf-in');
      const b = this.bounds();
      this.goat.tx = b[1]; this.goat.ty = (b[2] + b[3]) / 2;
      this.setGoat('walk');
      this.after(this.noMotion() ? 0 : 1200, () => this.tutBeat(2));
    });
  },

  /* Beat 2 — THE GOAL, in one sentence, before a word of vocabulary.

     This line used to be a riddle - "Same fence. More grass. Find out how." -
     and the player then met two definitions before ever being told what they
     were trying to achieve. The objective did not arrive until beat 7, by which
     point they had been dragging for a while and had worked it out or not. It
     is the first thing said now.

     Then the interface is introduced: the stage dims and the two ideas the game
     runs on are pointed at one at a time, in the real UI, each arriving WITH
     its own card rather than after both cards are already up. Perimeter first -
     the tracer walks the fence while its card is lit - then area, counted in
     square metres. Skipping remains available throughout. */
  tut2() {
    this.plankDrop(this.t('tut.reason').replace('20', String(this.g.perimeter)));
    this.pulseOnly('goat');
    this.vo('vo.reason');
    this.setGoat('talk');
    this.after(this.noMotion() ? 0 : 900, () => this.setGoat('eat'));
    this.after(this.noMotion() ? 300 : 2600, () => this.tutIntroFence());
  },
  /* "This is your fence." The field and the fence card lift out of the dim,
     and the measuring light walks the perimeter while the player watches. */
  tutIntroFence() {
    if (this.lv.tutBeat !== 2) return;
    this.pulseOnly(null);
    /* One card at a time, and each arrives WITH the idea it belongs to. Both
       used to be revealed a beat earlier, which put two unexplained numbers on
       screen while the first of them was being explained. */
    this.el['fence-badge'].style.opacity = '1';
    this.spotlight(['field', 'trace', 'fence-badge']);
    this.el['fence-badge'].classList.add('ftf-beacon');
    this.plankSay(this.t('tut.per').replace('20', String(this.g.perimeter)));
    this.vo('vo.fence');
    const g = this.g;
    this.after(this.noMotion() ? 0 : 700, () => {
      this.finaleTraceOne('trace-a', this.pens.main, g.L, g.W, 1600);
    });
    this.after(this.noMotion() ? 900 : 3300, () => this.tutIntroArea());
  },
  /* "The grass inside is the area." The fill sweeps once while its card is
     lit; the fence drops back into the dim so only one idea is on stage.

     And the area is COUNTED, not just named. The metre grid the drag already
     uses is turned up for this beat and the card runs 0 -> 16 alongside it, so
     what the player sees is sixteen squares being counted rather than a word
     with a number beside it. Naming a quantity and showing it are not the same
     lesson, and this one is cheap: both the grid and countUp already exist. */
  tutIntroArea() {
    if (this.lv.tutBeat !== 2) return;
    this.el.trace.style.opacity = '0';
    this.spotlight(['field', 'area-card']);
    // The fence steps back while the inside is the subject.
    this.el.modules.classList.add('ftf-fade');
    this.el['area-card'].style.opacity = '1';
    this.el['area-card'].classList.add('ftf-beacon');
    this.plankSay(this.t('tut.area'));
    this.vo('vo.area');
    this.sfx('area_up');
    /* The interior has to actually LIGHT UP: the fill is lifted above the veil
       but the grass texture underneath it is not, so at its usual 22% tint the
       inside still reads dim. It is held bright for the whole beat - the
       subject of this beat is the inside - and eased back only when the veil
       lifts and render() restores the colour play actually uses. */
    const f = this.el.fill, area = this.g.L * this.g.W;
    f.style.transition = this.noMotion() ? 'none' : 'background 500ms ease';
    this.el.grid.style.opacity = '.3';
    this.after(this.noMotion() ? 0 : 60, () => {
      f.style.background = 'rgba(168,236,96,.66)';
      this.el['area-val'].textContent = '0';
      this.countUp(this.el['area-val'], area, this.noMotion() ? 0 : 1300);
    });
    this.after(this.noMotion() ? 900 : 3000, () => {
      if (this.lv.tutBeat !== 2) return;
      this.spotlight(null);
      this.el.modules.classList.remove('ftf-fade');
      // The grid goes back to whatever the snap-guide option asks for.
      this.el.grid.style.opacity = this.options.snapGuide === 'Always' ? '.1' : '0';
      this.el['area-val'].textContent = String(area);
      f.style.transition = 'background 900ms ease';
      this.render({ instant: true });
      this.beginPlay();
      this.tutBeat(3);
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
  /* The check. The whole lesson turns on noticing that the perimeter did NOT
     move while the area did, so it is worth one short question rather than one
     more sentence they can read past. A wrong pick is not a failure state: the
     locked card pulses, and they look again.

     If they never answer - or take hold of the corner instead - the beat carries
     on regardless. It is a check, not a gate. */
  /* Beat 6 — invite the mistake. Free dragging, no steering. */
  tut6() {
    this.pulseOnly(null);
    this.plankSay(this.t('tut.more'));
    this.vo('vo.more');
    this.lv.tutMoves = 0;
  },

  /* Beat 7 — the real challenge, with the training wheels gone. */
  tut7() {
    this.pulseOnly(null);
    this.hideHint();
    this.plankSay(this.t('tut.challenge'));
    this.vo('vo.challenge');
  },

  /* Beat 8 — success. */
  tut8() {
    this.plankSay(this.t('tut.success').replace('25', String(this.g.L * this.g.W)));
    this.vo('vo.nice');
    // Hold on the finished pasture so the revealed side lengths can be read
    // before the recap replaces them with its own cards.
    this.after(this.noMotion() ? 0 : 3800, () => this.tutBeat(9));
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
    /* Skipping mid-intro must put back EVERYTHING the intro borrowed: the
       lights, the tracer, the dimmed fence, and the metre grid the area beat
       turns up. Leaving any of them meant a skipped tutorial started with the
       grid on or the fence still faded. */
    this.spotlight(null);
    this.el.trace.style.opacity = '0';
    this.el.modules.classList.remove('ftf-fade');
    this.el.grid.style.opacity = this.options.snapGuide === 'Always' ? '.1' : '0';
    if (this.stats.phase !== 'play') {
      this.buildFence(0, () => { this.showNumbers(false); this.beginPlay(); this.tutBeat(7); });
    } else this.tutBeat(7);
  },

  /* ==========================================================================
     LEVEL 2 · FARM RECORD — beat 32 m², then see how far it goes
     ====================================================================== */
  recordIntro() { this.farmIntro(); },
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
    /* Matching the record is an achievement, not a near miss. It used to pass
       in silence, which read as failure at the exact moment the player had hit
       the number they were given. It is acknowledged once, and the goal then
       stays open - beating it is still the level. */
    if (area === this.lv.record && !this.lv.beaten && !this.lv.matched) {
      this.lv.matched = true;
      this.track('record_matched', { area: area });
      this.sfx('chime');
      this.setGoat('curious');
      this.plankSay(this.t('record.match').replace('32', String(area)));
      this.after(1500, () => { if (!this.stats.completed && this.stats.phase === 'play') this.levelPlank(); });
      return;
    }
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
    // Long enough to actually READ the revealed measurements before the recap.
    this.after(5200, () => {
      const r = this.round(), g = this.g;
      this.compareBuilds(r.start, [g.L, g.W], g.perimeter, { then: () => this.offerNext("action.next") });
    });
  },

  /* ==========================================================================
     LEVEL 3 · VISUAL TRAP — the game asks the player to perform the
     misconception, then shows them what it cost.
     ====================================================================== */
  trapIntro() { this.farmIntro(); },
  trapBegin() {
    // She walks the long axis: the pasture is meant to look substantial.
    const b = this.bounds();
    this.goat.tx = b[1] - 8; this.goat.ty = (b[2] + b[3]) / 2;
    this.setGoat('walk');
    this.after(this.noMotion() ? 0 : 1500, () => {
      this.plankDrop(this.t('instruction.stretch'));
      this.vo('vo.stretch');
    });
    this.after(3400, () => {
      if (this.stats.phase === 'play' && !this.stats.grabbed) this.setGoat('eat');
    });
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
      this.track('misconception_result_seen', {});
    });
  },
  trapSucceed() {
    const g = this.g;
    // The comparison uses the long shape THEY stretched to, not the level's
    // start - so the recap answers the question the level asked them.
    const L2 = this.lv.longest, W2 = g.half - L2;
    this.after(620, () => this.plankSay(this.t("success.r3")));
    // Long enough to actually READ the revealed measurements before the recap.
    this.after(5200, () => {
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
  masteryIntro() { this.farmIntro(); },
  /* One rhythm for every farm arrival, step by step rather than a cut:
     the new light settles over the empty grass, THEN the fence builds, THEN
     the numbers arrive, and only then does play begin and the sign speak.
     Each beat gets its own moment - that is what makes a farm change read as
     arriving somewhere new instead of as the screen being swapped. */
  farmIntro() {
    this.sfx('farm_turn');
    this.after(this.noMotion() ? 0 : 620, () => {
      this.buildFence(950, () => {
        this.after(this.noMotion() ? 0 : 380, () => {
          this.showNumbers(false);
          this.after(this.noMotion() ? 0 : 650, () => this.beginPlay());
        });
      });
    });
  },
  /* Level 4 is two contracts, not one maximise with an optional extra.

     First: build EXACTLY the target. That is a different skill from
     maximising - it asks them to steer the relationship rather than push it
     one way - and it is the reason the target is deliberately not the maximum.
     Only once it is met does the farm ask for the largest area.

     Reaching the square early does not skip the precision stage: succeed() is
     gated on lv.precise, so the square simply waits its turn. */
  masteryBegin() {
    this.retractPlank();
    this.pulseOnly(null);
    this.setGoat('eat');
    const target = this.round().optionalTarget;
    if (target) {
      this.lv.precise = false;
      this.after(this.noMotion() ? 0 : 500, () => {
        this.plankSay(this.t('bonus.make').replace('48', String(target)));
      });
    } else {
      this.lv.precise = true;
    }
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
    // While the precision contract is open, every move gets distance feedback:
    // how far off they are, and which way. Never which shape to build.
    if (!this.lv.precise) { this.precisionStep(area); return; }
    if (!isBest) return;
    const tier = this.tierFor(area);
    if (tier <= this.stats.tier) return;
    this.stats.tier = tier;
    this.musicTier(tier);
    if (tier === 1) this.setGoat('walk');
    else if (tier === 2) { this.setGoat('curious'); }
    else if (tier === 3) { this.setGoat('talk'); }
  },
  /* By the time the square is reached the precision contract is already met -
     it is a gate before success, not an extra afterwards - so this simply
     closes the farm. The old post-success bonus flow (which reopened the
     handle after completing, and needed a levelStep wrapper to watch for the
     target) is gone with it. */
  masterySucceed() {
    this.after(700, () => {
      this.plankSay(this.t('success.r4'));
      this.vo('vo.master');
      this.showDims(true);
    });
    this.after(1500, () => this.offerNext('action.reveal'));
  }
});
