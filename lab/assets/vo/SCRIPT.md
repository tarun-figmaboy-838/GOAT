# Narration script — Fence the Farm

16 lines. Drop the finished MP3s in this folder under the filenames below and they
play automatically; anything missing is silently skipped, so they can be added one
at a time without ever breaking the build.

**The source of truth for the words is `js/game.js` → `this.VO`.** If a line changes
there, re-record it; the two must not drift.

## Why these are longer than what's on screen

The instruction sign is artwork — a cream board about 340 px wide — and `fitSign()`
shrinks type to fit it, so written copy has to survive at roughly **30 characters**.
Speech has no such limit. The sign and the voice are therefore *not* transcripts of
each other: the sign states, the voice explains.

| Beat | On the sign | The voice says |
|---|---|---|
| perimeter | `Perimeter: 20 m, locked` | "This is the perimeter. Twenty metres of fence, all the way around, and it never changes." |

## Voice direction

- **Warm, unhurried, an adult talking to a 14-year-old** — not a children's presenter
  and not a documentary narrator. Interested rather than excited.
- **Never congratulatory for its own sake.** The game deliberately has no praise
  loop; the mathematics is the reward. "That is the biggest it gets" is an
  observation, not applause.
- **Let the numbers land.** A small pause before a quantity is worth more than
  emphasis on it.
- Lines are 1–2 short sentences. None should run past ~6 seconds.

## Suggested ElevenLabs settings

| Setting | Value | Why |
|---|---|---|
| Model | Multilingual v2 | best prosody on short sentences |
| Stability | ~0.45 | low enough to sound alive, high enough not to wander between takes |
| Similarity | ~0.80 | |
| Style | ~0.15 | this script wants a person, not a performance |
| Speaker boost | on | |
| Format | MP3 128 kbps 44.1 kHz | 16 lines lands around 1 MB total |

Keep **one voice for all 16** — the narrator is a single character. Generate them in
one session so the timbre matches.

## The lines

Numbers are spelled out on purpose: a synthesiser reading "20 m" may say "twenty em",
and the one thing this narration must never do is misread the quantity the whole
lesson is about.

| # | File | Line | Fires at |
|---|---|---|---|
| 1 | `hook.mp3` | How much grass can one fence hold? Let us find out. | Farm 1, beat 1 — as the fence rises around her |
| 2 | `reason.mp3` | This is her field. You have twenty metres of fence — see how much grass you can give her. | Farm 1, beat 2 — the goal |
| 3 | `perimeter.mp3` | This is the perimeter. Twenty metres of fence, all the way around, and it never changes. | Farm 1 — while the tracer walks the fence |
| 4 | `area.mp3` | And this is the area — all the grass inside. Count the squares. | Farm 1 — while the area counts 0 → 16 |
| 5 | `drag.mp3` | Drag that corner, and watch what happens. | Farm 1, beat 3 |
| 6 | `noticed.mp3` | Look at that. More grass — and still exactly twenty metres of fence. | Farm 1, beat 5 — **the lesson** |
| 7 | `more.mp3` | Try another shape. | Farm 1, beat 6 |
| 8 | `challenge.mp3` | Now find the biggest field you can. | Farm 1, beat 7 |
| 9 | `nice.mp3` | That is the biggest it gets. Same fence, more grass. | Farm 1, beat 8 — success |
| 10 | `longer.mp3` | Hmm. Longer did not mean more grass. | any farm — released on a worse shape |
| 11 | `record.mp3` | See if you can beat the farm record. | Farm 2 opening |
| 12 | `stretch.mp3` | Here is an idea. Try making the field longer. | Farm 3 opening — the trap |
| 13 | `did-longer.mp3` | Longer field. Less grass. Now find the most. | Farm 3 — the flip |
| 14 | `exact.mp3` | Exactly forty-eight. Nice and precise. | Farm 4 — precision target met |
| 15 | `master.mp3` | Master build. | Farm 4 — success |
| 16 | `final.mp3` | Same fence. Different area. | the finale |

## Plain-text list, for pasting into a batch generator

```
How much grass can one fence hold? Let us find out.
This is her field. You have twenty metres of fence — see how much grass you can give her.
This is the perimeter. Twenty metres of fence, all the way around, and it never changes.
And this is the area — all the grass inside. Count the squares.
Drag that corner, and watch what happens.
Look at that. More grass — and still exactly twenty metres of fence.
Try another shape.
Now find the biggest field you can.
That is the biggest it gets. Same fence, more grass.
Hmm. Longer did not mean more grass.
See if you can beat the farm record.
Here is an idea. Try making the field longer.
Longer field. Less grass. Now find the most.
Exactly forty-eight. Nice and precise.
Master build.
Same fence. Different area.
```

## Checking it

Open the game with `?vo=1`. Each line plays at its beat, the music bed ducks under it
(deeper and longer than it does for any sound effect), and a new line fades the
previous one out rather than cutting it. `?tts=1` falls back to the browser's own
voice — useful for timing a line before it is recorded, and never on by default,
because synthetic narration in a lesson is worse than silence.
