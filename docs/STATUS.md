# Status

_Last updated: 2026-06-11, game-vision session (after the presentation overhaul)_

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

- **Self-centered 3-lane view (DECIDED 2026-06-12, see DECISIONS.md — not yet built).** Each player sees THEIR OWN field as the centre lane, with the two opponents flanking left/right; in netplay every browser is self-centered over the same shared sim. This is a pure **renderer/presentation** change (sim stays seat-symmetric → determinism/netplay intact). Work: (1) `renderer` takes a `localSeat`; map seats→lanes as centre=localSeat, left=(localSeat+2)%3, right=(localSeat+1)%3; (2) HUD emphasis (YOU) moves to the centre lane; (3) bonus fidelity — render incoming attacks ENTERING from the screen side of their `originalSender`'s lane (left-opponent attacks slide in from the left, etc.) so 3-way pressure is legible. Keep all three fields the SAME internal orientation (no gameplay mirroring — fairness/readability); any mirroring is cosmetic only. Local solo build just passes `localSeat=0`.
- **2P calibration from the real ROM (in progress).** MAME harness reaches gameplay + reads RAM (`tools/mame/`). The original has a **Competitive (2P VS)** mode: coin → 2 Players Start → SELECT MODE → Competitive (rightmost) → 2P char-select → VS. Reach it robustly by **detecting the screen via a RAM/pixel signature** (fixed `wait()` delays drift because the attract loop + demo cutscenes shift timing). Then confirm the player-X address in that unscripted field and measure wall-to-wall crossing → check `tests/feel.test.ts` (asserts the bible's 56f/80f). Story-mode stage 1 scripts player movement, so it's NOT a clean measurement env — use 2P VS.
- **Playtest the feel** in a real browser (`npm run dev`) — confirm BGM/SFX land and the look reads at speed. Retune palettes in `sprites.ts`/`backgrounds.ts`, BGM in `music.ts`.
- **Deeper mechanics fidelity** — the remaining gaps in [FIDELITY_GAPS.md](FIDELITY_GAPS.md) are now mostly *gameplay* (orb-based fever, charge-meter Lv2/MAX economy, best-of-3 rounds, Death reaper, zako durability tiers in the SIM — currently visual-only). These change how it *plays*, complementing this look/sound pass.
- **Balance knobs** (all in `balance.ts`): `lifeSteal.split`, `routing.incoming*Scale`, `damage.attackHit`/`maxHp` for pacing.

## Quick start for a new session
1. Read this file, then `CLAUDE.md`.
2. `npm run dev` to play; `npm test` before committing.
3. Look/sound → `docs/VISUAL_AUDIO_IDENTITY.md`; mechanics → `docs/GAME_MECHANICS.md`; 3P rules → `docs/ADAPTATION.md`; gaps → `docs/FIDELITY_GAPS.md`; decisions → `docs/DECISIONS.md`.
