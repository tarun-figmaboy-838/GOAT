# Deploying

Static site, no build step. Vercel serves the repo root.

```
/
  lab/                THE game — / redirects here, and this is what people see
  game/               the earlier side-view build, kept for reference
  menu.html           the chooser, at /menu — no longer the front door
  vercel.json         / -> /lab, cleanUrls, cache headers
  .vercelignore       keeps ~7 MB of source art out of the bundle
  scripts/
    reset-lab.ps1     throw away /lab and copy /game over it — see the warning
```

**The two folders have swapped roles.** `game/` was the working tree; the
top-down rebuild — the goat mascot, the journey between farms, the live
parabola screen — was all built in `lab/`, and `game/` was deliberately frozen
at the earlier side-view version. Rather than overwrite it, the launcher's
primary card was pointed at `lab/`, so what visitors get is the current build
and the old one stays reachable and unmodified.

So: **edit `lab/`.** There is still no publish step.

> `scripts/reset-lab.ps1` copies `game/` over `lab/` and predates the swap.
> Running it now would replace the current game with the old one. Do not.

## Deploy

```bash
vercel            # preview
vercel --prod     # production
```

No project settings needed — no framework, no build command, no output
directory.

| URL | what it serves |
| --- | --- |
| `/` | redirects to `/lab` — opening the site opens the game |
| `/lab` | the game |
| `/game` | the earlier side-view build |
| `/menu` | the chooser, if you want to pick |

It is a redirect and not a rewrite on purpose: every asset, script and
stylesheet path inside the game is relative, so the browser has to actually be
at `/lab/` for them to resolve. A rewrite would leave the URL at `/` and every
one of them would 404.

> **`trailingSlash` must stay `true`, and the redirect must end in a slash.**
> A relative path resolves against the *directory* of the current URL. At
> `/lab` — no slash — the browser thinks the directory is `/`, so `js/game.js`
> becomes `/js/game.js`, which 404s to an HTML page; `nosniff` then refuses to
> execute HTML as JavaScript and every script on the page dies silently. The
> result is a blank white screen with no console error a reader would
> recognise. At `/lab/` it resolves to `/lab/js/game.js` and the game runs.

### Or just connect the repo

The repo is `tarun-figmaboy-838/GOAT`. In the Vercel dashboard, **Add New →
Project → import that repo**, leave every setting on its default (Framework
preset *Other*, no build command, no output directory) and deploy. Every push
to `main` then deploys itself, and pull requests get preview URLs. This needs
no CLI and no Node installed.

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

> **Anchor any directory pattern with a leading slash.** This file uses
> `.gitignore` syntax, where a bare `assets/` matches a directory of that name
> at *any* depth. The rule meant for the loose source art at the repo root was
> written that way, so it silently excluded `game/assets/` and `lab/assets/` as
> well — 77 files, 51.6 MB, every image and sound in both games. The deploy
> rendered as a flat green page with no art at all. It is `/assets/` now.

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
