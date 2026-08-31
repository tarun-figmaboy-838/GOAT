/* ============================================================================
   FENCE THE FARM — the goat mascot

   Eleven separate poses of the same character, animated into one performance.
   The artwork is never modified: everything that makes it feel like a single
   animated animal rather than a slideshow comes from timing, easing, squash and
   stretch, crossfades between poses, and particles that land on the beat.

   Two things carry most of the quality:

   1  POSES CROSSFADE. Two image layers swap roles, so a pose change is a short
      dissolve rather than a hard cut. That is what hides the differing padding
      between the supplied PNGs.

   2  ONE GROUND LINE. Each pose fills its 1254px frame differently - the lying
      pose ends at 87% of the frame, the standing one at 99% - so each carries a
      measured offset that puts her hooves on the same line. Without it she
      would visibly hop up and down the screen as poses changed, which reads as
      a bug rather than as animation.
   ========================================================================== */

const CELEBRATION_CONFIG = {
  duration: 5000,          // the whole performance, start to still
  jumpHeight: 52,          // px at the design scale; scaled down on small stages
  particleCount: 22,
  sparkleCount: 7,
  showerCount: 56,         // falling confetti, spread across the performance
  showerSpread: 2600,      // spawned in waves across this long, never at once
  ringDuration: 760,
  crossfade: 150,          // pose-to-pose dissolve; longer ghosts, shorter pops
  rollChance: 1 / 7        // how often the playful tumble replaces the ending
};

/* src is the supplied file, untouched. `ground` is the measured fraction of the
   frame at which that pose's lowest pixel sits; the controller uses it to put
   every pose on one line. `scale` is left at 1 - the poses were drawn at one
   character size and rescaling them would break that. */
const GOAT_POSES = {
  idle:      { src: 'goat-cheer (9).webp',  ground: 0.994 },
  look:      { src: 'goat-cheer (3).webp',  ground: 0.967 },
  crouch:    { src: 'goat-cheer (10).webp', ground: 0.912 },
  hop:       { src: 'goat-cheer (4).webp',  ground: 0.966 },
  jump:      { src: 'goat-cheer (5).webp',  ground: 0.990 },
  wave:      { src: 'goat-cheer (6).webp',  ground: 0.980 },
  wink:      { src: 'goat-cheer (7).webp',  ground: 0.985 },
  bigCheer:  { src: 'goat-cheer (8).webp',  ground: 0.993 },
  cheer:     { src: 'goat-cheer (11).webp', ground: 0.992 },
  sit:       { src: 'goat-cheer (2).webp',  ground: 0.988 },
  roll:      { src: 'goat-cheer (1).webp',  ground: 0.871 }
};
const POSE_BASE = 'assets/goat/';
const POSE_GROUND = 0.994;        // the line every pose is aligned to

class GoatMascotController {
  constructor(game) {
    this.g = game;
    this.wrap = game.el.mascot;
    this.layers = [game.el['pose-a'], game.el['pose-b']];
    this.front = game.el['mascot-front'];
    this.back = game.el['mascot-back'];
    this.cur = 0;
    this.pose = null;
    this.busy = false;
    this.timers = [];
    this.preload();
  }

  /* Loaded when the controller is built, not when the first celebration runs -
     the first celebration must not flicker. */
  preload() {
    this.ok = {};
    /* The images are held on the controller as well as loaded. Loaded is not
       the same as ready to paint: without an explicit decode the browser still
       has to turn 620 x 620 of PNG into a bitmap on the very frame it is asked
       to crossfade it in, which is one dropped frame per pose - eleven of them
       inside eight seconds, every one landing on a beat. Decoding up front
       moves all of that off the performance, and keeping the reference stops
       the decoded bitmap being thrown away before she needs it. */
    this.imgs = {};
    Object.keys(GOAT_POSES).forEach(k => {
      const img = new Image();
      img.onload = () => {
        this.ok[k] = true;
        if (img.decode) img.decode().catch(() => {});
      };
      img.onerror = () => { this.ok[k] = false; };
      img.src = POSE_BASE + GOAT_POSES[k].src;
      this.imgs[k] = img;
    });
  }

  at(ms, fn) { const t = setTimeout(() => { if (!this.g.dead) fn(); }, ms); this.timers.push(t); return t; }
  clear() { this.timers.forEach(clearTimeout); this.timers = []; }

  /* ------------------------------------------------------------- poses --- */
  setPose(name, instant) {
    const p = GOAT_POSES[name];
    if (!p || name === this.pose) return;
    const nextI = 1 - this.cur;
    const shown = this.layers[this.cur], next = this.layers[nextI];
    next.src = POSE_BASE + p.src;
    // Every pose is nudged so its lowest pixel meets the same ground line.
    next.style.transform = 'translateY(' + ((POSE_GROUND - p.ground) * 100).toFixed(2) + '%)';
    if (instant || this.g.noMotion()) {
      next.style.opacity = '1'; shown.style.opacity = '0';
    } else {
      next.style.transition = 'opacity ' + CELEBRATION_CONFIG.crossfade + 'ms ease';
      shown.style.transition = 'opacity ' + CELEBRATION_CONFIG.crossfade + 'ms ease';
      next.style.opacity = '1'; shown.style.opacity = '0';
    }
    this.cur = nextI;
    this.pose = name;
  }

  /* The wrapper carries the performance - never the images, so a pose change
     can never disturb the motion. */
  move(y, scaleX, scaleY, rot, ms, ease) {
    const w = this.wrap;
    w.style.transition = this.g.noMotion() ? 'none'
      : 'transform ' + ms + 'ms ' + (ease || 'cubic-bezier(.3,.7,.4,1)');
    w.style.transform = 'translate(-50%, ' + y + 'px) scale(' + scaleX + ',' + scaleY + ') rotate(' + rot + 'deg)';
  }
  rest() { this.move(0, 1, 1, 0, 200, 'cubic-bezier(.4,0,.2,1)'); }

  /* ------------------------------------------------------ the celebration --
     One choreographed timeline. The character beats are fixed - only the
     particles are random - because a mascot that moves unpredictably reads as
     broken rather than as lively. */
  /* FIVE seconds of continuous performance. The point is that she is ALWAYS
     doing something: every move() lasts until the next one starts, so the
     wrapper is never sitting still between poses. A wrapper that stops moving
     for 300ms is the single thing that makes a recording of this look stuttery,
     and dead air between beats is what makes eleven poses read as a slideshow
     rather than as one animal.

     It ran for eight seconds and had two jumps - a big leap, then a smaller
     hop to stop the back half feeling like padding. At five seconds there is no
     back half to pad, so it is one leap, one flourish and a settle, and the
     second hop is gone rather than compressed. Every beat is transform and
     opacity only, and the poses are preloaded, so nothing is fetched or laid
     out mid-sequence. */
  playLevelComplete(then) {
    if (this.busy) return;
    this.busy = true;
    this.clear();
    const C = CELEBRATION_CONFIG;
    const reduce = this.g.noMotion();
    const H = C.jumpHeight;
    const OUT = 'cubic-bezier(.15,.8,.3,1)';     // rising  - power3.out
    const IN  = 'cubic-bezier(.5,0,.85,.5)';     // falling - power2.in
    const BACK = 'cubic-bezier(.34,1.5,.64,1)';  // recovery - back.out
    const EASE = 'cubic-bezier(.45,.05,.55,.95)'; // sine - for the float and the sway

    this.setPose('idle', true);
    this.rest();

    if (reduce) {
      // Still an unmistakable success, with none of the travel.
      this.at(80,   () => { this.setPose('bigCheer'); this.g.sfx('success_chord'); this.ring(); });
      this.at(360,  () => this.sparkles(5));
      this.at(1500, () => this.setPose('cheer'));
      this.at(2600, () => { this.setPose('idle'); this.finish(then); });
      return;
    }

    /* ---- 0.00-0.64  she notices, and gathers -------------------------- */
    this.at(0,    () => { this.move(0, 1.04, 0.96, 0, 180); this.g.sfx('chime'); });
    this.at(180,  () => { this.setPose('look'); this.move(0, 1, 1, 0, 200); });
    this.at(380,  () => { this.setPose('crouch'); this.move(9, 1.07, 0.93, 0, 260, IN); });

    /* ---- 0.64-1.90  the leap, the burst, the float -------------------- */
    this.at(640,  () => { this.g.sfx('cheer_jump'); this.setPose('jump'); this.move(-H, 1, 1.06, -3, 380, OUT); });
    this.at(1020, () => {
      this.move(-H - 10, 1.02, 1.03, 2, 280, 'cubic-bezier(.3,.6,.4,1)');
      this.burst(C.particleCount); this.ring(); this.g.sfx('success_chord');
      this.shower(C.showerCount, C.showerSpread);
    });
    this.at(1300, () => { this.setPose('bigCheer'); this.g.sfx('bell_ding'); this.move(-H - 6, 1.01, 1.02, 0, 300, EASE); });
    this.at(1600, () => { this.sparkles(C.sparkleCount); this.move(-H - 2, 1, 1.02, -2, 300, EASE); });

    /* ---- 1.90-2.65  down, and the landing ----------------------------- */
    this.at(1900, () => this.move(0, 1, 1, 0, 320, IN));
    this.at(2220, () => { this.move(0, 1.08, 0.90, 0, 110, 'cubic-bezier(.3,0,.2,1)'); this.dust(); this.g.sfx('cheer_land'); });
    this.at(2330, () => this.move(0, 0.97, 1.05, 0, 150, BACK));
    this.at(2480, () => { this.setPose('wink'); this.move(0, 1, 1, 0, 170); });

    /* ---- 2.65-4.30  a sway, then the flourish. Usually a wave; sometimes
           she tips over laughing, which is the surprise that stops it
           feeling scripted. */
    this.at(2650, () => this.move(0, 1.01, 0.99, 1.5, 350, EASE));
    if (Math.random() < C.rollChance) {
      this.at(3000, () => { this.setPose('roll'); this.move(6, 1.03, 0.97, -5, 300, BACK); });
      this.at(3300, () => { this.g.sfx('bleat'); this.move(4, 1, 1, 4, 360, EASE); });
      this.at(3660, () => { this.setPose('wave'); this.move(-14, 1, 1.02, 0, 300, OUT); this.sparkles(4); });
      this.at(3960, () => this.move(0, 1, 1, 0, 340, IN));
    } else {
      this.at(3000, () => { this.setPose('wave'); this.move(-16, 1, 1.03, -3, 300, OUT); this.sparkles(4); });
      this.at(3300, () => this.move(0, 1.04, 0.96, 0, 240, IN));
      this.at(3540, () => this.move(0, 1, 1, 0, 160, BACK));
      this.at(3700, () => { this.setPose('sit'); this.move(0, 1, 1, 2, 300); });
      this.at(4000, () => this.move(0, 1, 1, -2, 300));
    }

    /* ---- 4.30-5.00  she settles. A slow breath, then still ------------ */
    this.at(4300, () => { this.setPose('look'); this.move(0, 1, 1, 0, 300); });
    this.at(4600, () => this.move(-4, 1, 1.012, 0, 400, EASE));
    this.at(4820, () => this.setPose('idle'));
    this.at(C.duration, () => this.finish(then));
  }



  finish(then) {
    this.busy = false;
    this.rest();
    this.front.innerHTML = ''; this.back.innerHTML = '';
    if (then) then();
  }

  /* --------------------------------------------------------- particles ---
     Built here and removed with the layer they live in, so a celebration can
     never leave anything behind. Counts drop on small stages. */
  budget(n) {
    const w = window.innerWidth || 1280;
    return Math.round(n * (w < 620 ? 0.5 : w < 980 ? 0.72 : 1));
  }
  burst(n) {
    if (this.g.noMotion()) return;
    const N = this.budget(n);
    const shapes = ['ftf-p-rect', 'ftf-p-dot', 'ftf-p-dia'];
    const cols = ['#FFCA4A', '#FF9E2C', '#9BE3F0', '#8FD65B', '#FFF6E0'];
    for (let i = 0; i < N; i++) {
      const front = i % 3 !== 0;                 // most in front, some behind
      const d = document.createElement('i');
      const s = 6 + Math.random() * 7;
      d.className = 'ftf-part ' + shapes[i % shapes.length];
      d.style.cssText = 'width:' + s + 'px;height:' + (s * (i % 3 ? 1 : 1.8)) + 'px;' +
        'background:' + cols[i % cols.length] + ';' +
        'opacity:' + (front ? 1 : .6) + ';';
      (front ? this.front : this.back).appendChild(d);
      /* Up and out of the chest, then gravity takes it. The cone SKIPS the
         section that would cross her face: front particles fan to her left or
         right, and only the behind-layer ones may pass overhead. */
      const side = i % 2 ? [190, 245] : [295, 350];
      const span = front ? side : [220, 320];
      const a = (span[0] + Math.random() * (span[1] - span[0])) * Math.PI / 180;
      const dist = (front ? 90 : 60) + Math.random() * 110;
      const vx = Math.cos(a) * dist, vy = Math.sin(a) * dist;
      const life = 700 + Math.random() * 600;
      d.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(' + (front ? 1 : .8) + ')', opacity: front ? 1 : .6 },
        { transform: 'translate(calc(-50% + ' + vx * .8 + 'px), calc(-50% + ' + vy * .9 + 'px)) rotate(140deg) scale(1)', opacity: 1, offset: .45 },
        { transform: 'translate(calc(-50% + ' + vx + 'px), calc(-50% + ' + (vy + 150) + 'px)) rotate(300deg) scale(.7)', opacity: 0 }
      ], { duration: life, easing: 'cubic-bezier(.25,.6,.5,1)', fill: 'forwards' });
    }
  }
  sparkles(n) {
    if (this.g.noMotion()) return;
    const N = this.budget(n);
    for (let i = 0; i < N; i++) {
      const d = document.createElement('i');
      const s = 12 + Math.random() * 9;
      /* OUTSIDE her silhouette, always. She fills roughly a 210px half-width
         from the anchor, so the ring of sparkles starts well beyond that -
         they frame her rather than sitting on her face, which is also what
         makes them readable: a pale dot on white fur is invisible, the same
         dot on grass glows. */
      const a = (-172 + (i / N) * 214) * Math.PI / 180;
      const r = 290 + Math.random() * 70;     // x0.82 vertical squash still clears her ~210px half-width
      d.className = 'ftf-part ftf-p-spark';
      d.style.cssText = 'width:' + s + 'px;height:' + s + 'px;' +
        'margin-left:' + (Math.cos(a) * r) + 'px;margin-top:' + (Math.sin(a) * r * .82) + 'px;' +
        'animation:ftf-spark ' + (460 + Math.random() * 280) + 'ms ' + (i * 55) + 'ms ease-out both;';
      this.front.appendChild(d);
    }
  }
  /* The shower: confetti falling across the whole stage for the length of the
     celebration, which is what makes it read as a party rather than as a single
     pop. Pieces are spawned in small waves rather than all at once - forty
     animations starting on one frame is exactly how a celebration ends up
     stuttering - and each one removes itself when it lands. They fall in the
     BACK layer, behind her, so nothing ever crosses her face. */
  shower(total, spread) {
    if (this.g.noMotion()) return;
    const N = this.budget(total);
    const cols = ['#FFCA4A', '#FF9E2C', '#9BE3F0', '#8FD65B', '#FFF6E0', '#FF7A9C'];
    const greens = ['#8FD65B', '#6FBF33', '#B8E86A'];
    const waves = 8, per = Math.ceil(N / waves);
    for (let w = 0; w < waves; w++) {
      this.at(w * (spread / waves), () => {
        for (let i = 0; i < per; i++) {
          const d = document.createElement('i');
          // A third of the shower is grass: thin green blades tumbling among
          // the confetti, so the celebration is made of the field she won.
          const blade = (w + i) % 3 === 0;
          const s = blade ? 3.5 + Math.random() * 2 : 7 + Math.random() * 9;
          const tall = blade || Math.random() < .45;
          // Placed against the stage, not the mascot, so it crosses the sky.
          const x = -620 + Math.random() * 1240;
          d.className = 'ftf-part ' + (blade ? 'ftf-p-blade' : (Math.random() < .5 ? 'ftf-p-rect' : 'ftf-p-dia'));
          d.style.cssText = 'width:' + s + 'px;height:' + (blade ? s * 4.6 : (tall ? s * 1.9 : s)) + 'px;' +
            'background:linear-gradient(180deg,' +
              (blade ? greens[(w + i) % greens.length] + ',' + greens[(w + i + 1) % greens.length]
                     : cols[(w + i) % cols.length] + ',' + cols[(w + i) % cols.length]) + ');' +
            'margin-left:' + x + 'px;margin-top:-460px;opacity:.9;';
          this.back.appendChild(d);
          const drift = -70 + Math.random() * 140;
          const life = 2600 + Math.random() * 1800;
          const spin = 220 + Math.random() * 520;
          const a = d.animate([
            { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 0 },
            { transform: 'translate(calc(-50% + ' + drift * .4 + 'px), calc(-50% + 180px)) rotate(' + spin * .35 + 'deg)', opacity: .95, offset: .18 },
            { transform: 'translate(calc(-50% + ' + drift + 'px), calc(-50% + 700px)) rotate(' + spin + 'deg)', opacity: .9, offset: .82 },
            { transform: 'translate(calc(-50% + ' + drift * 1.1 + 'px), calc(-50% + 820px)) rotate(' + spin * 1.1 + 'deg)', opacity: 0 }
          ], { duration: life, easing: 'cubic-bezier(.35,.15,.5,1)', fill: 'forwards' });
          a.onfinish = () => d.remove();      // never accumulates
        }
      });
    }
  }
  ring() {
    if (this.g.noMotion()) {
      const r = document.createElement('i');
      r.className = 'ftf-part ftf-p-ring'; r.style.opacity = '.3';
      this.back.appendChild(r); return;
    }
    const r = document.createElement('i');
    r.className = 'ftf-part ftf-p-ring';
    this.back.appendChild(r);
    r.animate([
      { transform: 'translate(-50%,-50%) scale(.35)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(.8)', opacity: .45, offset: .4 },
      { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 0 }
    ], { duration: CELEBRATION_CONFIG.ringDuration, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
  }
  dust() {
    if (this.g.noMotion()) return;
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('i');
      const s = 22 + Math.random() * 18;
      d.className = 'ftf-part ftf-p-dust';
      d.style.cssText = 'width:' + s + 'px;height:' + (s * .55) + 'px;' +
        'margin-left:' + (-40 + i * 40) + 'px;margin-top:112px;' +
        'animation:ftf-dust 340ms ' + (i * 40) + 'ms ease-out both;';
      this.back.appendChild(d);
    }
  }
}

Object.assign(FenceTheFarm.prototype, {
  mascot() {
    if (!this._mascot) this._mascot = new GoatMascotController(this);
    return this._mascot;
  }
});
