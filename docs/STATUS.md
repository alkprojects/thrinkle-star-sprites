# Status

_Last updated: 2026-06-12, lane-view + real-ROM-measurement session_

## This session (2026-06-12)

Both items from the prior session's plan landed (details in DECISIONS.md):

- **Self-centered 3-lane view BUILT** — each client renders its own seat as the centre lane, opponents flanking; `(YOU)` + gold frame follow the local lane; incoming attacks slide in from the screen-side of their sender's lane (cosmetic). Pure renderer change in `src/render/renderer.ts`; sim untouched; 48 tests green; verified all 3 perspectives + side-entry via the preview harness. `__game.setLocalSeat(n)` cycles views in DEV.
- **Real-ROM (MAME) 2P measurement done.** Corrected the menu map (coin → **1 Player Start** → press **A** to skip the intro → **SELECT MODE**: CHARACTER/STORY/**COMPETITIVE**; "2 Players Start" does NOT open it). Reached a clean human-controlled Load Ran field (CHARACTER mode) and **visually measured horizontal wall-to-wall ≈ 52–56 frames / ~2.5 px/frame → confirms GAME_MECHANICS.md §8.2 (56f) and `tests/feel.test.ts`; sim is well-calibrated, no balance change.** Also debunked the old `0x10BC38` "player X" note — it's a background-scroll counter (see `tools/mame/README.md`). Harness `enter_character_match()` automates reaching the field.

---

_Earlier: 2026-06-11, game-vision session (after the presentation overhaul)_

## NEW: We can now SEE the original game (and measure it)

The fidelity loop no longer runs on text alone. Infrastructure built this session:

- **Original-game footage analysis**: archive.org hosts a 35-min Neo Geo CD longplay (`Neo_Geo_CD_Longplay_Twinkle_Star_Sprites`, 608×448 @ true 60fps = every Neo Geo frame) plus dozens of expert Fightcade matches (search `"twinkle star sprites" mediatype:movies`). ffmpeg (via `imageio_ffmpeg`, binary at `%LOCALAPPDATA%\Programs\Python\Python314\Lib\site-packages\imageio_ffmpeg\binaries\`) HTTP-seeks into the remote file — no full download. Extract frames to `.claude/ref/frames/` (**gitignored — ADK-copyrighted, must NEVER be committed**), view them directly, make contact sheets (`tile=4x4`) to scan time ranges, zoom crops (`crop=...,scale=...:flags=neighbor`) to inspect. `.claude/ref/measure_scroll.py` shows the measurement pattern (frame-differencing → px/frame).
- **Our-game capture**: `window.__game.startAllAi()` (all seats AI) / `start()` + `step(n)` + the `/__shot` middleware → frame sequences → ffmpeg → GIF/MP4 (`.claude/shots/ourgame.gif`). We can watch our own game in motion and hand Alex clips.
- **Feel tests** (`tests/feel.test.ts`): drive the real sim with held inputs and assert the original's measured frame data (§8.2/§9.1) — wall-to-wall 56f/80f, shot travel 34f, charge 65f/130f, i-frames 58, unnormalized diagonals.

First measured results: corrected `player.speed` 2.2→2.75, `shot.speed` 6→6.6, `chargeTicksLv1/2` 30/70→65/130 (all were off vs verified frame data). Measured the original's background scroll (~0.8–1.0 native px/frame) and our match pacing (3-AI match over in ~6 s — way too fast); both filed in FIDELITY_GAPS as 0a/0b.

## Where we are

**The game now LOOKS and SOUNDS like Twinkle Star Sprites.** Prior sessions made it mechanically faithful but it rendered as abstract vector art (stars/circles on a dark starfield, Verdana text). This session replaced the entire presentation layer with a pixel-art pipeline and chiptune audio.

What changed:
- **Pixel-art renderer** (`src/render/`): a low-res internal scene (3 fields × 160×224) integer-scaled ×3 with `antialias:false` + NEAREST textures. Cute chibi characters (Stella witch / Komet comet-kid / Lumen firefly), color-tiered zako fairies with faces, sender-colored comet fireballs, an orange "cute predator" extra, a purple plush boss with HP bar + white spawn-flash, star-burst explosions, bright per-seat fantasy skies (dawn/day/dusk) with parallax clouds/sun/hills, a 5×7 bitmap arcade font, and subtle CRT scanlines.
- **Arcade HUD**: per-field portrait, score, 5 hearts (half-heart), charge gauge with 1/2/MAX sections, bomb "B" stock (cap 3). Pixel-art title (happy-star mascot + character line-up + PRESS ENTER) and "YOU WIN!" game-over.
- **Chiptune audio** (`src/audio/music.ts`, `sfx.ts`): original upbeat major-pentatonic title + battle BGM loops; SFX retuned to FM bells, noise drums, pitch sweeps. Scene-driven (title/battle/gameover).
- **Spec**: [VISUAL_AUDIO_IDENTITY.md](VISUAL_AUDIO_IDENTITY.md) — authoritative look/sound reference from a 19-agent research workflow.

41 sim tests pass; production build clean. **Sim is untouched** — all changes are presentation, so determinism/replays/netplay are intact.

## Deployed

Live at **https://thrinkle-star-sprites.pages.dev**. Redeploy with `npm run deploy`. (This session's work is committed but redeploy is a manual step — run it to push the new look live.)

## Verifying visuals (important for future sessions)

Headless preview pages are `document.hidden`, which **pauses requestAnimationFrame** — so the rAF-driven game loop never advances in the preview. Two DEV-only aids exist:
- `window.__game.start()` / `window.__game.step(n)` — manually tick the sim + render (mirrors the frame loop). `window.__game.sim` reads state.
- A `/__shot` Vite middleware writes `extract.canvas(app.stage).toDataURL()` PNGs to `.claude/shots/` (gitignored). Use `app.renderer.extract.canvas(...)` not `.base64(...)` (the latter downscaled). `preserveDrawingBuffer` is DEV-on.

## Next steps (pick by interest)

- **Deploy the lane view** — this session's renderer change is committed but not yet pushed live. `npx wrangler pages deploy dist --project-name=thrinkle-star-sprites --branch=main` (from a worktree, the plain `npm run deploy` only makes a branch preview — see project memory). Optional first: a quick browser playtest of the new centre-lane layout at speed.
- **Finer ROM calibration (optional).** Horizontal is confirmed (56f). To add vertical (80f) / shot-travel (34f) / charge checks at sub-pixel precision, find the player struct via MAME's **debugger memory-search** — blind Lua RAM-diffing is defeated by the sprite-list + double-buffer noise (see `tools/mame/README.md`). Or extend the harness to stop at SELECT MODE → COMPETITIVE for a P2-idle, boss-free field.
- **Playtest the feel** in a real browser (`npm run dev`) — confirm BGM/SFX land and the look reads at speed. Retune palettes in `sprites.ts`/`backgrounds.ts`, BGM in `music.ts`.
- **Deeper mechanics fidelity** — the remaining gaps in [FIDELITY_GAPS.md](FIDELITY_GAPS.md) are now mostly *gameplay* (orb-based fever, charge-meter Lv2/MAX economy, best-of-3 rounds, Death reaper, zako durability tiers in the SIM — currently visual-only). These change how it *plays*, complementing this look/sound pass.
- **Balance knobs** (all in `balance.ts`): `lifeSteal.split`, `routing.incoming*Scale`, `damage.attackHit`/`maxHp` for pacing.

## Quick start for a new session
1. Read this file, then `CLAUDE.md`.
2. `npm run dev` to play; `npm test` before committing.
3. Look/sound → `docs/VISUAL_AUDIO_IDENTITY.md`; mechanics → `docs/GAME_MECHANICS.md`; 3P rules → `docs/ADAPTATION.md`; gaps → `docs/FIDELITY_GAPS.md`; decisions → `docs/DECISIONS.md`.
