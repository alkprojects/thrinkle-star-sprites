# Status

_Last updated: 2026-06-11, presentation-overhaul session_

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

- **Playtest the feel** in a real browser (`npm run dev`) — confirm BGM/SFX land and the look reads at speed. Retune palettes in `sprites.ts`/`backgrounds.ts`, BGM in `music.ts`.
- **Deeper mechanics fidelity** — the remaining gaps in [FIDELITY_GAPS.md](FIDELITY_GAPS.md) are now mostly *gameplay* (orb-based fever, charge-meter Lv2/MAX economy, best-of-3 rounds, Death reaper, zako durability tiers in the SIM — currently visual-only). These change how it *plays*, complementing this look/sound pass.
- **Balance knobs** (all in `balance.ts`): `lifeSteal.split`, `routing.incoming*Scale`, `damage.attackHit`/`maxHp` for pacing.

## Quick start for a new session
1. Read this file, then `CLAUDE.md`.
2. `npm run dev` to play; `npm test` before committing.
3. Look/sound → `docs/VISUAL_AUDIO_IDENTITY.md`; mechanics → `docs/GAME_MECHANICS.md`; 3P rules → `docs/ADAPTATION.md`; gaps → `docs/FIDELITY_GAPS.md`; decisions → `docs/DECISIONS.md`.
