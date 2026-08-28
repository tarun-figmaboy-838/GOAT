/* ============================================================================
   FENCE THE FARM — sound
   Fence and UI cues are synthesised. Goat cues use the supplied recordings,
   with state-bound loops and short fades so they follow her animation. Nothing
   plays until the first user gesture.

   Music is ONE adaptive track: a base bed with layers that come in as the
   player gets closer to the best shape, never a different loud song per level.
   ========================================================================== */
Object.assign(FenceTheFarm.prototype, {

  /* ------------------------------------------------------ goat recordings --
     HTMLAudio keeps these recordings working when index.html is opened from
     disk as well as when the game is served over HTTP. */
  prepareGoatAudio() {
    if (this.options.audio === false || this._goatAudio || typeof Audio === 'undefined') return;
    const make = (file, volume, loop) => {
      const el = new Audio('assets/audio/' + file);
      el.preload = 'auto'; el.loop = !!loop; el.volume = 0; el.playsInline = true;
      return { el: el, volume: volume };
    };
    this._goatAudio = {
      walk:  make('yodguard-horse-walking-sound-4-450266.mp3', 0.10, true),
      eat:   make('dueg-oth-reh-frisst-gras-142719.mp3', 0.20, true),
      bleat: make('dragon-studio-goat-kid-bleating-390290.mp3', 0.34, false),
      happy: make('freesound_community-baby-goat-bleating-87916.mp3', 0.27, false)
    };
    this._goatFades = new Map();

    this._unlockGoatAudio = () => {
      this._goatAudioUnlocked = true;
      this.ac();
      this.goatAudioState(this.goat.state, true);
      this.root.removeEventListener('pointerdown', this._unlockGoatAudio);
      window.removeEventListener('keydown', this._unlockGoatAudio);
    };
    this.root.addEventListener('pointerdown', this._unlockGoatAudio, { once: true });
    window.addEventListener('keydown', this._unlockGoatAudio, { once: true });
  },
  fadeGoatAudio(item, target, ms, pauseWhenDone) {
    if (!item) return;
    const el = item.el, old = this._goatFades && this._goatFades.get(el);
    if (old) clearInterval(old);
    const from = el.volume, started = performance.now(), duration = Math.max(1, ms);
    const timer = setInterval(() => {
      const p = Math.min(1, (performance.now() - started) / duration);
      el.volume = from + (target - from) * p;
      if (p < 1) return;
      clearInterval(timer); this._goatFades.delete(el);
      if (pauseWhenDone) { el.pause(); el.currentTime = 0; }
    }, 25);
    this._goatFades.set(el, timer);
  },
  playGoatAudio(item, restart, randomStart) {
    if (!item || !this._goatAudioUnlocked || this.options.audio === false) return false;
    const el = item.el;
    if (restart) {
      el.pause();
      if (randomStart && Number.isFinite(el.duration) && el.duration > 4) {
        el.currentTime = Math.random() * Math.max(0, el.duration - 3.2);
      } else el.currentTime = 0;
    }
    el.playbackRate = 0.96 + Math.random() * 0.08;
    const playing = el.play();
    if (playing && playing.catch) playing.catch(() => {});
    this.fadeGoatAudio(item, item.volume, 110, false);
    return true;
  },
  goatAudioState(state, fromUnlock) {
    this.prepareGoatAudio();
    if (!this._goatAudio) return;
    const active = (state === 'walk' || state === 'enter') ? 'walk' : (state === 'eat' ? 'eat' : '');
    ['walk', 'eat'].forEach(kind => {
      const item = this._goatAudio[kind];
      if (kind === active) {
        if (item.el.paused) this.playGoatAudio(item, true, kind === 'eat');
      } else if (!item.el.paused) this.fadeGoatAudio(item, 0, 90, true);
    });
    if (fromUnlock && state === 'talk') this.playGoatVoice(false);
    if (fromUnlock && state === 'happy') this.playGoatVoice(true);
  },
  playGoatVoice(happy) {
    this.prepareGoatAudio();
    if (!this._goatAudio) return false;
    const other = this._goatAudio[happy ? 'bleat' : 'happy'];
    if (!other.el.paused) this.fadeGoatAudio(other, 0, 70, true);
    const item = this._goatAudio[happy ? 'happy' : 'bleat'];
    if (!this.playGoatAudio(item, true, false)) return false;
    // The happy source has several calls; use the excerpt that fits the
    // 2.4-second celebration instead of letting all eight seconds continue.
    if (happy) {
      clearTimeout(this._goatHappyStop);
      this._goatHappyStop = setTimeout(() => this.fadeGoatAudio(item, 0, 180, true), 2150);
    }
    return true;
  },
  stopGoatAudio(immediate) {
    if (!this._goatAudio) return;
    clearTimeout(this._goatHappyStop);
    Object.keys(this._goatAudio).forEach(k => {
      const item = this._goatAudio[k];
      if (immediate) {
        const fade = this._goatFades && this._goatFades.get(item.el);
        if (fade) { clearInterval(fade); this._goatFades.delete(item.el); }
        item.el.pause(); item.el.currentTime = 0; item.el.volume = 0;
      }
      else if (!item.el.paused) this.fadeGoatAudio(item, 0, 100, true);
    });
  },
  destroyGoatAudio() {
    this.stopGoatAudio(true);
    if (this._goatFades) this._goatFades.forEach(clearInterval);
    if (this._unlockGoatAudio) {
      this.root.removeEventListener('pointerdown', this._unlockGoatAudio);
      window.removeEventListener('keydown', this._unlockGoatAudio);
    }
    this._goatAudio = null;
  },

  ac() {
    if (this.options.audio === false) return null;
    if (!this._ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this._ac = new AC();
      this._bus = this._ac.createGain();
      this._bus.gain.value = 0.85;
      this._bus.connect(this._ac.destination);
    }
    if (this._ac.state === 'suspended') this._ac.resume();
    return this._ac;
  },
  noiseBuf(dur, decay) {
    const ac = this._ac, n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (decay === false ? 1 : 1 - i / n);
    return b;
  },

  /* ------------------------------------------------------------ materials -- */
  wood(freq, dur, gain, q) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.6);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0007, t + dur);
    o.connect(g); g.connect(this._bus); o.start(t); o.stop(t + dur + 0.02);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), ng = ac.createGain();
    s.buffer = this.noiseBuf(Math.min(dur, 0.12));
    f.type = 'bandpass'; f.frequency.value = freq * 3.2; f.Q.value = q || 1.6;
    ng.gain.setValueAtTime(gain * 0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.0007, t + Math.min(dur, 0.14));
    s.connect(f); f.connect(ng); ng.connect(this._bus); s.start(t);
  },
  pluck(freq, gain, dur, type) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime, d = dur || 0.42;
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), g2 = ac.createGain();
    o.type = type || 'sine'; o2.type = 'triangle';
    o.frequency.value = freq; o2.frequency.value = freq * 2.01;
    g2.gain.value = 0.22;
    g.gain.setValueAtTime(gain || 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + d);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this._bus);
    o.start(t); o2.start(t); o.stop(t + d + 0.02); o2.stop(t + d + 0.02);
  },
  rasp(from, to, dur, gain, q) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noiseBuf(dur, false);
    f.type = 'bandpass'; f.Q.value = q || 3.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.22);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    s.connect(f); f.connect(g); g.connect(this._bus); s.start(t); s.stop(t + dur + 0.02);
  },

  /* ---------------------------------------------------------------- cues --
     The design's library, one entry per name. Every cue takes a small random
     pitch variation so repetition never sounds mechanical. */
  sfx(kind) {
    if (this.options.audio === false) return;
    const v = 0.94 + Math.random() * 0.12;
    switch (kind) {
      /* fence */
      case 'fence_post_rise':    this.wood(150 * v, 0.17, 0.28); break;
      case 'fence_post_sink':    this.wood(112 * v, 0.20, 0.16, 0.9); break;
      case 'fence_rail_extend':  this.rasp(360 * v, 950 * v, 0.15, 0.09); this.wood(200 * v, 0.11, 0.10, 1.2); break;
      case 'fence_rail_retract': this.rasp(820 * v, 300 * v, 0.19, 0.06, 2.2); break;
      case 'fence_snap':         this.wood(320 * v, 0.08, 0.15, 2.4); break;
      case 'fence_snap_big':     this.wood(104 * v, 0.30, 0.40, 1.1); this.after(70, () => this.wood(330, 0.08, 0.14, 2.4)); break;
      /* handle */
      case 'handle_grab':        this.wood(520 * v, 0.05, 0.16, 3); break;
      case 'handle_release':     this.wood(300 * v, 0.05, 0.08, 3); break;
      /* the two numbers */
      case 'area_up':            this.pluck(523 * v, 0.14, 0.36); break;
      case 'area_down':          this.pluck(311 * v, 0.10, 0.30); break;
      case 'measure_tick':       this.rasp(2400, 1700, 0.028, 0.022, 7); break;
      /* level furniture */
      case 'record_break':       this.wood(240 * v, 0.12, 0.26, 2); this.after(90, () => this.pluck(880, 0.14, 0.5)); break;
      case 'record_success':     [659, 880, 1175].forEach((f, i) => this.after(i * 85, () => this.pluck(f, 0.12, 0.6))); break;
      case 'challenge_flip':     this.rasp(700, 200, 0.24, 0.10, 2); this.after(230, () => this.wood(260, 0.12, 0.2, 2)); break;
      case 'success_chord':      [523, 659, 784].forEach((f, i) => this.after(i * 100, () => this.pluck(f, 0.15, 0.8))); break;
      case 'chime':              [659, 880].forEach((f, i) => this.after(i * 90, () => this.pluck(f, 0.10, 0.5))); break;
      case 'button_press':       this.wood(196 * v, 0.11, 0.15); break;
      /* the goat */
      case 'goat_bleat':         if (!this.playGoatVoice(false)) this.bleat(0); break;
      case 'goat_bleat_happy':   if (!this.playGoatVoice(true)) this.bleat(1); break;
      case 'goat_eat':           this.goatAudioState('eat'); break;
      case 'goat_step':          this.goatAudioState('walk'); break;
      case 'grass_rustle':       this.rasp(1800, 900, 0.13, 0.03, 3); break;
      case 'bird':               this.bird(); break;
      /* aliases used by the goat state machine */
      case 'bleat':              if (!this.playGoatVoice(false)) this.bleat(0); break;
      case 'bleat_happy':        if (!this.playGoatVoice(true)) this.bleat(1); break;
      case 'chew':               this.goatAudioState('eat'); break;
    }
  },
  bleat(happy) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime, base = (happy ? 470 : 400) + Math.random() * 70;
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    const lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (happy ? 0.86 : 0.7), t + 0.42);
    lfo.frequency.value = 20 + Math.random() * 6; lg.gain.value = 30 + Math.random() * 12;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 1500;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.45);
    o.connect(f); f.connect(g); g.connect(this._bus);
    o.start(t); lfo.start(t); o.stop(t + 0.47); lfo.stop(t + 0.47);
  },
  bird() {
    const n = 2 + Math.round(Math.random()), base = 2100 + Math.random() * 700;
    for (let i = 0; i < n; i++) {
      this.after(i * 110, () => {
        const a = this.ac(); if (!a) return;
        const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 1.28, t + 0.05);
        o.frequency.exponentialRampToValueAtTime(base * 0.92, t + 0.09);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.012, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0004, t + 0.1);
        o.connect(g); g.connect(this._bus); o.start(t); o.stop(t + 0.12);
      });
    }
  },

  /* ------------------------------------------------------------ ambience --
     Grass wind with distant birds, and over it one farm-strategy track at
     88 BPM whose layers open up with the player's progress. */
  ambience() {
    const ac = this.ac(); if (!ac || this._amb) return;
    this._amb = true;
    this._tier = 0;

    const n = ac.createBufferSource();
    n.buffer = this.noiseBuf(3, false); n.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ac.createGain(); g.gain.value = 0.022;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(this._bus);
    n.start(); lfo.start();

    const chirp = () => {
      if (this.dead) return;
      if (Math.random() < 0.5) this.sfx('bird');
      this.after(7000 + Math.random() * 9000, chirp);
    };
    this.after(4200, chirp);

    if (this.options.music === false) return;

    // One gain per layer; musicTier() opens and closes them.
    this._lay = {};
    ['pad', 'pluck', 'perc', 'bell'].forEach(k => {
      const gg = ac.createGain(); gg.gain.value = 0; gg.connect(this._bus);
      this._lay[k] = gg;
    });
    // Warm pad, two voices slightly detuned.
    [196, 294].forEach((hz, i) => {
      const o = ac.createOscillator(), pf = ac.createBiquadFilter(), pg = ac.createGain();
      o.type = 'triangle'; o.frequency.value = hz * (i ? 1.003 : 1);
      pf.type = 'lowpass'; pf.frequency.value = 700;
      pg.gain.value = 0.013;
      const sw = ac.createOscillator(), sg = ac.createGain();
      sw.frequency.value = 0.045 + i * 0.011; sg.gain.value = 0.008;
      sw.connect(sg); sg.connect(pg.gain);
      o.connect(pf); pf.connect(pg); pg.connect(this._lay.pad);
      o.start(); sw.start();
    });
    this.musicTier(1);

    const scale = [392, 440, 523, 587, 659, 784];
    const BEAT = 682;                                  // about 88 BPM
    let step = 0;
    const beat = () => {
      if (this.dead) return;
      const T = this._tier;
      if (T >= 2 && step % 2 === 0) this.layRasp('perc', 2600, 1800, 0.035, 0.012, 6);
      if (T >= 1 && Math.random() < 0.42) this.layPluck('pluck', scale[Math.floor(Math.random() * scale.length)], 0.04, 0.9);
      if (T >= 2 && step % 8 === 0) this.layPluck('pluck', 196, 0.03, 1.4);
      if (T >= 3 && step % 4 === 2) this.layPluck('bell', scale[2 + Math.floor(Math.random() * 4)] * 2, 0.02, 1.3);
      step++;
      this.after(BEAT, beat);
    };
    this.after(900, beat);
  },
  layPluck(layer, freq, gain, dur) {
    const ac = this.ac(); if (!ac || !this._lay || !this._lay[layer]) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = layer === 'bell' ? 'sine' : 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g); g.connect(this._lay[layer]);
    o.start(t); o.stop(t + dur + 0.02);
  },
  layRasp(layer, from, to, dur, gain, q) {
    const ac = this.ac(); if (!ac || !this._lay || !this._lay[layer]) return;
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noiseBuf(dur, false);
    f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    s.connect(f); f.connect(g); g.connect(this._lay[layer]);
    s.start(t); s.stop(t + dur + 0.02);
  },
  /* Tier 0 strips the music back to the wind - used for the level 3 pause. */
  musicTier(tier, hard) {
    if (this.options.music === false) return;
    this._tier = tier;
    const ac = this._ac; if (!ac || !this._lay) return;
    const t = ac.currentTime, ramp = hard ? 0.35 : 2.2;
    const set = (k, v) => {
      const gg = this._lay[k]; if (!gg) return;
      gg.gain.cancelScheduledValues(t);
      gg.gain.setValueAtTime(gg.gain.value, t);
      gg.gain.linearRampToValueAtTime(v, t + ramp);
    };
    set('pad',   tier >= 1 ? 0.9 : 0.18);
    set('pluck', tier >= 1 ? 0.9 : 0);
    set('perc',  tier >= 2 ? 0.9 : 0);
    set('bell',  tier >= 3 ? 0.9 : 0);
    if (tier >= 4) this.after(120, () => { [523, 659, 784, 1046].forEach((f, i) => this.after(i * 70, () => this.layPluck('bell', f, 0.03, 1.6))); });
  }
});
