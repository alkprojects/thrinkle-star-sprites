# Status

_Last updated: 2026-06-13, big fidelity pass — new roster + charge economy + Death + scrolling terrain_

## This session (2026-06-13)

Owner: "make the look and gameplay as close to the original as possible," described the ghost/charge/Death mechanics, and named **three playable characters**. Started by watching the real ROM (MAME capture, CHARACTER mode, ~74s) — the headline look gap was the background. Full rationale in DECISIONS.md.

**New playable roster** (replaces the chibi placeholders), with per-character stats baked at `createSim`:
- **Danny Donkey** — frisbees, power 2 / speed 2 (= Load-Ran baseline).
- **Heavy Tyleru** — film reels / movie monsters, 1 / 1, tanky boss.
- **Senseitional Alex** — weights, 3 / 3, fast hard-hitting glass cannon.
Human-caricature sprites + themed projectiles ("ghosts"), specials, and bosses in `src/render/sprites.ts`; `src/config/characters.ts` holds the stats + themes.

**New mechanics (both were top FIDELITY_GAPS):**
- **Charge-meter economy** — the gauge fills from kills; a Lv2 release with ≥2/3 meter sends specials, a MAX release with a full meter sends a boss, and a MAX release with a boss in your own lane reverses it back. (`balance.charge`)
- **Death the reaper** — appears at 100s, hunts you (deterministic sqrt-only steering), contact = instant loss, killable, respawns tougher, corpse feeds chains. (`balance.death`)

**Look:** the static sky is gone — each lane now flies over **scrolling top-down terrain** (meadow / dusk-cinema / beach) with a parallax canopy layer (`src/render/backgrounds.ts`). Charge HUD shows the banked meter with 1/2/MAX notches + a live hold cursor; title screen shows the roster with power/speed tiers.

**Pacing:** 3-player pressure made rounds end in ~20s (Death unreachable). Tuned `damage.attackHit` 3→2 (3P-ADAPT), `routing.incomingDensityScale` 0.35, `incomingSpeedScale` 0.85, slower meter fill, and a per-tick AI emergency-dodge → rounds now ~30–90s (humans reach Death). **These four are the top playtest knobs.**

57 sim tests green (9 new); clean build; verified in-browser. Sim stays pure/deterministic.

### Autonomous deepening (same night, owner asleep)

After the above, owner said "work autonomously for the rest of the session." A 6-agent adversarial review of the first pass came back essentially clean (one missing sub-feature). Then closed five more gameplay gaps, each tested + visually verified + kept deterministic:

- **Inactivity Death** (§7) — a one-shot Death now also appears if a player fires nothing for ~30s.
- **Fireball size tiers** (#6) — fireballs are sized by combo hit-index (small→biggest, 2–5 HP); a shot-down fireball returns one size larger.
- **Zako durability tiers** (#5) — zako carry HP 1–5 by colour; basic shots drop one tier; big (purple) zako make big cascading blasts. Colour/size now truthful.
- **Flight patterns** (#7) — fireballs fly 3 cycling baitable patterns (parabola / diagonal-bounce / stop-and-track) instead of one sway.
- **Dizzy debuff** (§5.4) — a zako clip slows your move/shot speed for ~5s (circling stars).
- **Orb-based fever** (#1) — a spinning blue orb crosses each field; a chain (or bomb) detonating it grants ~10s fever. `fever.mode` flag keeps the old meter trigger as a fallback. The AI chases orbs, so fever now fires in **6/6** all-AI matches. Two review fixes also landed (bomb radius consistency; explosion-caught reflections sized by chain, not +1).

Combined, these pushed all-AI rounds to **~48–117s** (the original's 30s–3min band) — and **Death is now reached in normal AI play** (≈2/6 matches passed its 100s spawn; a human reaches it reliably). **65 sim tests green** (18 new this session); clean build. Top pacing knobs: `damage.attackHit`, `routing.incomingDensityScale`/`incomingSpeedScale`, `charge.gainPerZako`, `death.startTicks`, `fever.mode`. Remaining big gaps: best-of-3 rounds (#3), the 36 fixed formations (#10), bomb/star coin items (#13), per-character extra/boss movesets (#9).

---

_Earlier: 2026-06-12, lane-view + real-ROM-measurement session_

## Prior session (2026-06-12)

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

- **(Done 2026-06-13) Merged to `main` + deployed to production.** Branch fast-forwarded into `main`, pushed to `origin/main`, and live at https://thrinkle-star-sprites.pages.dev (verified serving the lane-view build). Nothing to do here unless you want a browser playtest of the new centre-lane layout at speed.
- **Finer ROM calibration (optional).** Horizontal is confirmed (56f). To add vertical (80f) / shot-travel (34f) / charge checks at sub-pixel precision, find the player struct via MAME's **debugger memory-search** — blind Lua RAM-diffing is defeated by the sprite-list + double-buffer noise (see `tools/mame/README.md`). Or extend the harness to stop at SELECT MODE → COMPETITIVE for a P2-idle, boss-free field.
- **Playtest the feel** in a real browser (`npm run dev`) — confirm BGM/SFX land and the look reads at speed. Retune palettes in `sprites.ts`/`backgrounds.ts`, BGM in `music.ts`.
- **Deeper mechanics fidelity** — the remaining gaps in [FIDELITY_GAPS.md](FIDELITY_GAPS.md) are now mostly *gameplay* (orb-based fever, charge-meter Lv2/MAX economy, best-of-3 rounds, Death reaper, zako durability tiers in the SIM — currently visual-only). These change how it *plays*, complementing this look/sound pass.
- **Balance knobs** (all in `balance.ts`): `lifeSteal.split`, `routing.incoming*Scale`, `damage.attackHit`/`maxHp` for pacing.

## Quick start for a new session
1. Read this file, then `CLAUDE.md`.
2. `npm run dev` to play; `npm test` before committing.
3. Look/sound → `docs/VISUAL_AUDIO_IDENTITY.md`; mechanics → `docs/GAME_MECHANICS.md`; 3P rules → `docs/ADAPTATION.md`; gaps → `docs/FIDELITY_GAPS.md`; decisions → `docs/DECISIONS.md`.
