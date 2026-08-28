# Deploying

Static site, no build step. Vercel serves the repo root.

```
/
  index.html          launcher: Play / Lab
  game/               THE game — you edit this, and this is what deploys
  lab/                a duplicate to experiment in
  vercel.json         cleanUrls + cache headers
  .vercelignore       keeps ~7 MB of source art out of the bundle
  scripts/
    reset-lab.ps1     throw away /lab and copy /game over it
```

One source of truth: `game/` is both the working tree and the deployed folder.
There is no publish step.

## Deploy

```bash
vercel            # preview
vercel --prod     # production
```

No project settings needed — no framework, no build command, no output
directory. Vercel serves the root, so `/` is the launcher, `/game` is the game
and `/lab` is the duplicate.

## The lab

`lab/` is a copy of the game for experiments. It is not kept in sync, on
purpose — it's yours to break. Its browser tab reads **Fence the Farm — LAB** so
the two can't be confused.

When you want a clean slate:

```powershell
.\scripts\reset-lab.ps1            # DISCARDS your experiments, recopies /game
.\scripts\reset-lab.ps1 -WhatIf    # say what would happen, change nothing
```

## What isn't shipped

`.vercelignore` drops the art the game never loads: the originals the derived
assets were cut from, and the PLAY sprite the CSS buttons replaced. That's ~7 MB
per copy. The files stay in the repo so assets can be recut.

| skipped | why |
| --- | --- |
| `pannel.png` | source for `sign.png` |
| `counter.png` | source for `card.png` |
| `score.png` | source for `area-card.png` |
| `verticalfence (3) 16.png` | source for `rail-v.png` |
| `play button sprite.png`, `btn-play-*.png` | superseded by CSS buttons |
| `banner.png` | unused |

**Do not add the goat frames or the audio to that list.** They are referenced by
name at runtime (`'assets/art/' + name + '.png'`), so a text search of the source
reports them as unused when they are not. Both published copies were loaded
standalone and reported no failed loads and no JS errors.

`hand.png` and `touch.svg` — the sources `touch.png` was cut from — are no longer
in the repo. `touch.png` itself is fine and shipping, but the cursor can't be
re-cut from source without them.

## Caching

`vercel.json` puts a one-year immutable cache on `/{game,lab}/assets/*` and
no-cache on HTML/JS/CSS, so art caches hard while code ships instantly.
Filenames are stable, so if you replace an asset in place, hard-refresh once or
rename the file.
