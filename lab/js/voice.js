/* ============================================================================
   FENCE THE FARM — the voice

   Recorded narration for the lines the sign speaks. The game has always fired
   vo(key) at the right beats and logged it; what it did with that was browser
   text-to-speech, off by default, because synthetic speech in a lesson for
   fourteen-year-olds is worse than silence. This plays real recordings instead.

   THE FILES ARE OPTIONAL. Every one that is missing is simply not heard - the
   beat still fires, the bed still ducks, the game is unchanged. So the audio
   can be recorded, re-recorded and dropped in one line at a time without ever
   putting the build in a broken state.

   WHY THE VOICE SAYS MORE THAN THE SIGN

   The sign is a piece of artwork with a cream board about 340px wide, and
   fitSign shrinks type to fit it - so every line the game writes has to survive
   at around thirty characters. That is a hard constraint on written copy and no
   constraint at all on speech. The voice therefore carries the fuller sentence
   and the sign keeps the short one, which is the right division of labour: you
   read "Perimeter: 20 m, locked" and you hear "This is the perimeter - twenty
   metres of fence, all the way around, and it never changes."

   ONE VOICE AT A TIME. A new line stops the one before it, for the same reason
   the sign has one board: two sentences arriving together is no sentences.
   ========================================================================== */

/* key -> file under assets/vo/. Keys match the VO map in game.js, so a line
   with no file here is simply silent. */
const VOICE_FILES = {
  'vo.hook':      'hook.mp3',
  'vo.reason':    'reason.mp3',
  'vo.fence':     'perimeter.mp3',
  'vo.area':      'area.mp3',
  'vo.drag':      'drag.mp3',
  'vo.same':      'noticed.mp3',
  'vo.more':      'more.mp3',
  'vo.challenge': 'challenge.mp3',
  'vo.nice':      'nice.mp3',
  'vo.longer':    'longer.mp3',
  'vo.record':    'record.mp3',
  'vo.stretch':   'stretch.mp3',
  'vo.didLonger': 'did-longer.mp3',
  'vo.exact':     'exact.mp3',
  'vo.master':    'master.mp3',
  'vo.final':     'final.mp3'
};

const VOICE = {
  base: 'assets/vo/',
  vol: 0.92,
  fadeOut: 140          // when a line is cut short, it is faded, never chopped
};

Object.assign(FenceTheFarm.prototype, {

  /* Built on the first user gesture, with the rest of the audio - browsers will
     not let a page hold decoded audio before one. Each line is its own element
     so a beat never waits on a decode. */
  prepareVoice() {
    if (this._vo) return;
    this._vo = {};
    Object.keys(VOICE_FILES).forEach(k => {
      const el = new Audio(VOICE.base + VOICE_FILES[k]);
      el.preload = 'auto';
      el.volume = VOICE.vol;
      /* A missing recording is a normal state, not an error: the line is just
         not heard. Marking it here means speak() never even tries, so a 404
         cannot cost a beat its timing. */
      el.addEventListener('error', () => { this._vo[k].ok = false; }, { once: true });
      this._vo[k] = { el: el, ok: true };
    });
  },

  /* Say one line. Returns true if a recording actually started, so the caller
     can tell the difference between "spoken" and "silent". */
  voiceSay(key) {
    if (this.options.vo === false) return false;
    this.prepareVoice();
    const item = this._vo[key];
    if (!item || item.ok === false) return false;
    /* An element that has already failed to fetch reports it here, and it is
       worth asking BEFORE claiming the line is spoken: this return value is
       what decides whether the text-to-speech fallback gets a turn, so an
       optimistic true would silently disable it for every line. */
    if (item.el.error || item.el.networkState === 3) { item.ok = false; return false; }
    this.voiceStop();
    try {
      item.el.currentTime = 0;
      item.el.volume = VOICE.vol;
      const p = item.el.play();
      if (p && p.catch) p.catch(() => {
        /* Two very different reasons land here: no recording, and no user
           gesture yet. Only the first is permanent, so only the first is
           remembered - otherwise one early beat before the first tap would
           silence that line for the rest of the session. */
        if (item.el.error || item.el.networkState === 3) item.ok = false;
      });
      this._voNow = item;
      return true;
    } catch (e) { return false; }
  },

  /* Cut the current line. Faded rather than stopped dead: a hard cut on a human
     voice is a click, and it is the one sound in the game that cannot be
     mistaken for part of the farm. */
  voiceStop() {
    const cur = this._voNow;
    if (!cur || cur.el.paused) return;
    const el = cur.el, step = el.volume / Math.max(1, VOICE.fadeOut / 16);
    const t = setInterval(() => {
      el.volume = Math.max(0, el.volume - step);
      if (el.volume <= 0.001) { clearInterval(t); try { el.pause(); el.currentTime = 0; } catch (e) {} }
    }, 16);
    (this._perm = this._perm || []).push(t);
    this._voNow = null;
  },

  /* Every phase change silences the narrator, for the same reason clearTimers
     stops a half-revealed sentence: a line about the farm just left must never
     keep talking over the next one. */
  destroyVoice() {
    this.voiceStop();
    Object.keys(this._vo || {}).forEach(k => { try { this._vo[k].el.pause(); } catch (e) {} });
  }
});

/* vo() keeps its job - firing at the beat, logging it, ducking the bed - and
   hands the speaking to the recordings. Browser text-to-speech stays as the
   fallback ONLY when it is explicitly asked for with ?tts=1, because synthetic
   narration is worse than none in a lesson. */
(function (proto) {
  const vo = proto.vo;
  proto.vo = function (key) {
    vo.call(this, key);                       // track + duck, exactly as before
    if (this.voiceSay(key)) return;           // a real recording is playing
    if (!this.options.tts || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const line = this.VO[key];
      if (!line) return;
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.98; u.pitch = 1.02;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  };
  // A new screen stops the narrator, like it stops everything else.
  const clear = proto.clearTimers;
  proto.clearTimers = function () { this.voiceStop(); clear.call(this); };
})(FenceTheFarm.prototype);
