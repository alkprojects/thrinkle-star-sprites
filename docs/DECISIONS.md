# Decision Log

Newest first. Each entry: what, why, how to change it later.

## 2026-06-12 — Self-centered 3-lane view BUILT + real-ROM measurement (Claude)

Two threads from the prior session's plan, both landed this session.

- **Self-centered 3-lane view is implemented** (the decision below, now code). Pure renderer change in `src/render/renderer.ts` (sim untouched, 48 tests green): `Renderer` gains a `localSeat`; `laneOf()` maps seats→columns rotationally (centre=localSeat, left=(localSeat+2)%3, right=(localSeat+1)%3); the `(YOU)` header + a gold frame accent follow the local lane to centre. Bonus fidelity shipped: incoming attacks slide in from the screen-side of their `originalSender`'s lane over `SIDE_ENTRY_TICKS` then settle on their true sim x (cosmetic only — hitboxes use sim coords). Solo build passes `localSeat=0`. Verified all three perspectives + the side-entry effect via the preview harness. `__game.setLocalSeat(n)` cycles perspectives in DEV.
- **2P / real-ROM measurement (MAME) — the menu map was wrong; the player-address note was wrong; the timing checks out.** Findings (full detail in `tools/mame/README.md` + harness comments):
  - **Menu map corrected.** This MVS `twinspri` does NOT open SELECT MODE from "2 Players Start" (that was a bad guess). Real path: coin → **1 Player Start** → a long scripted how-to-play intro → **press A to skip** → **SELECT MODE** (CHARACTER | STORY | COMPETITIVE, COMPETITIVE rightmost = 2P VS). Mashing A lands on CHARACTER MODE = a split-screen 1-on-1 vs CPU with **Load Ran as a fully human-controlled P1** — a clean, unscripted measurement field.
  - **`0x10BC38` is NOT the player X** — it (and `0x10C22E`) are background-scroll counters (+~3/frame, wrap at 256, drift when idle). The earlier "player horizontal @0x10BC38 (8.8 fixed)" note was the scroll counter all along. Work RAM is dominated by the sprite display list + double-buffered per-object temps (value V / V+0x100 alternating each frame), so blind Lua RAM-diffing for the player position is unreliable; use MAME's debugger memory-search next time, or the visual method.
  - **Measurement (visual, the bible's own method): Load Ran horizontal ≈ 2.5 px/frame steady, ~52–56 frames wall-to-wall** — confirms GAME_MECHANICS.md §8.2 (56f) and `tests/feel.test.ts`. Sim `player.speed` (2.75) is within eyeball error; **no balance change made**.
  - To change later: harness + reusable navigation live in `tools/mame/`; re-run for finer numbers (debugger memory-search for sub-pixel precision, or extend the harness to stop at SELECT MODE and pick COMPETITIVE for a P2-idle field).

## 2026-06-12 — Self-centered 3-lane view (owner decision)

Owner: "in Thrinkle the player's lane should always be in the middle — each of the three players, in their own browser, sees their lane as the center one."

- **Adopted.** Every client renders the same shared 3-seat sim but arranges the lanes so the LOCAL player is centre, opponents flank left/right. Rationale: centre = the natural focal point; both opponents are symmetric in the periphery (no edge-seat disadvantage); generalises the original's "focus on your own field" to three players; and the side an attack enters from can encode which opponent sent it.
- **Sim stays seat-symmetric and untouched** — this is purely renderer/presentation, so determinism/replays/netplay are unaffected. The renderer gains a `localSeat`; lane map = centre:`localSeat`, left:`(localSeat+2)%3`, right:`(localSeat+1)%3` (rotational, consistent for all viewers). Local solo build passes `localSeat=0` (YOU centre, the 2 AI flank).
- **No gameplay mirroring** of the side fields (keep identical internal orientation for fairness + readability); any mirroring stays cosmetic. **Bonus fidelity:** draw incoming attacks entering from the screen-side of their `originalSender`'s lane so 3-way pressure reads at a glance (attacks already carry `originalSender`).
- To change later: it's all in the renderer's seat→lane mapping + HUD emphasis; the sim has no notion of screen position, so nothing downstream breaks.

## 2026-06-11 — Measurement-driven fidelity loop (Claude, after owner feedback)

Owner: "this won't work unless you can SEE the actual game — speed, animations, everything; explaining the nuance isn't feasible." Agreed. Built a vision/measurement loop instead of iterating blind (details in STATUS.md):

- **Footage analysis as ground truth**: 60fps longplay + expert-match videos on archive.org, ffmpeg HTTP-seek → frames → view/measure. Extracted frames are ADK-copyrighted: they live only in gitignored `.claude/ref/`, are used solely to derive *facts* (timings, speeds, layout proportions — not copyrightable), and the art we ship stays original.
- **Feel tests over vibes** (`tests/feel.test.ts`): the bible's verified frame data is now executable — sim-driven assertions on crossing times, shot travel, charge holds, i-frames. Any speed regression fails CI. Found-and-fixed immediately: `player.speed` 2.2→2.75 (was slower than the slowest original character), `shot.speed` 6→6.6, `chargeTicksLv1/2` 30/70→65/130 (charge was 2× too fast vs Ran's 65f).
- **Our-game capture artifacts**: all-AI matches recorded to GIF/MP4 for the owner to judge feel without building locally.
- **Two measured gaps filed** (FIDELITY_GAPS 0a/0b): match pacing ~6s (much too fast; suspect AI dodging + 3P 'both' routing), background terrain scroll ~0.8–1.0 px/frame (we're static).
- **Gold standard offered, needs owner**: MAME + Lua (frame-step, input injection, memory reads) if the owner provides a legally-owned ROM dump.

## 2026-06-11 — Presentation overhaul: pixel-art look + chiptune sound (Claude)

Owner feedback: "the game looks and feels completely different to Twinkle Star Sprites — make it as close as possible in look, feel, and sound." The build was abstract vector art (stars/circles, dark starfield, Verdana). Root cause: a smooth-vector aesthetic where the original is a bright, cute, **pixel-art** Neo Geo arcade game.

- **Adopted a pixel-art rendering pipeline.** Everything organic is baked once into a 1px=1unit canvas → NEAREST texture; the scene renders at a low internal resolution (3 fields × 160×224) and the root container is integer-scaled (`SCALE=3`) with `antialias:false`. Axis-aligned bars/panels stay as `Graphics`. See `src/render/pixutil.ts`. Rationale: the Neo Geo look IS the pixel grid; smooth vectors can never read as the original. To revert/retune, art lives in `sprites.ts`/`backgrounds.ts`; palette is centralised per the spec.
- **Authoritative look/sound spec** = [VISUAL_AUDIO_IDENTITY.md](VISUAL_AUDIO_IDENTITY.md), produced by a 19-agent research+adversarial workflow. Corrections it caught: bright fantasy skies (NOT a dark starfield), bomb display caps at 3 (not 4), avoid pure black, fever flashes the character yellow, boss spawns with a ~1s white flash.
- **Original-art discipline kept** (public repo): 3 invented chibi archetypes (Stella witch / Komet comet-kid / Lumen firefly), our own 5×7 bitmap font, our own happy-star title motif, generic plush "cute predator" boss/extra. Distancing techniques are deliberate (see spec §12). Komet has no original counterpart.
- **Chiptune audio** (`src/audio/music.ts` + retuned `sfx.ts`): original bright major-pentatonic title + battle BGM loops via a WebAudio lookahead sequencer (square lead / triangle arp / saw bass / noise drums); SFX retuned to FM bells + noise + pitch sweeps. Scene-driven from `main.ts` (title/battle/gameover). Nothing samples ADK audio.
- **Sim untouched** — all changes are presentation (render/audio/config/main/vite). 41 sim tests still green; determinism/purity intact.
- **Dev verification aids** (DEV-gated, never shipped): `preserveDrawingBuffer`, `window.__app`/`window.__game.step()` manual stepper (headless preview pages are `document.hidden`, which freezes rAF), and a `/__shot` Vite middleware (`apply:'serve'`) that writes screenshots to `.claude/shots/` (gitignored).

## 2026-06-11 — Post-research reconciliation (Claude, overnight)

- **Sim follows the verified original ladder and economy** (see GAME_MECHANICS.md §4–5): 1:1 reverse→extra, 3-reverses-in-one-combo→boss, indestructible extras, 5 hearts / 3-damage attacks / fixed heals / zako can't kill. Rationale: owner said "understanding the nuances is critical"; the research refuted my earlier provisional ping-pong escalation. → all knobs in `balance.ts`.
- **Remaining divergences are catalogued, not silent** → `docs/FIDELITY_GAPS.md`, priority-ordered. Fever stays meter-based and charge stays beam-only *for now* (gaps #1, #2).
- **Match pacing left faithful-fast** (2 hits kill). If 3-player chaos makes this too brutal, tune `damage.attackHit` / `maxHp`, not the ladder.
- Review workflow (41 agents) found 34 issues incl. 2 dead config knobs and frame-rate-dependent visuals — all fixed; tests 20→41.

## 2026-06-10 — Initial decisions (owner + Claude, project kickoff)

**Owner decisions (from kickoff Q&A):**
- v1 is **solo vs 2 AI**; human multiplayer later. → Seats are controller-agnostic (`src/input/`), so adding humans = new controller, no sim changes.
- **Normal Attacks target both opponents** at full strength; Extras/Bosses also hit both. → `balance.routing`
- **Reflected attacks return to original sender.** → attack entities carry `originalSender`
- **Life-steal heals both other players.** Split amount undecided; default `'divided'` (¼ each). → `balance.lifeSteal`
- **Elimination → survivors play 1v1.** → `src/sim/elimination.ts`
- **Original art only** (copyright-safe for public repo + hosting). → `src/render/art/`
- Public repo `alkprojects/thrinkle-star-sprites`; host on **Cloudflare Pages**.

**Technical decisions (Claude, rationale recorded):**
- **TypeScript + Vite + PixiJS v8 + Vitest.** Pixi for WebGL sprite batching (3 bullet-heavy fields); Vite/Vitest for zero-friction dev loop.
- **Pure deterministic sim** (fixed 60Hz tick, seeded RNG, no DOM/random/time in `src/sim/`). Buys: unit-testable rules, replays, and a future netplay path (lockstep/rollback) without rewrite. Cost: discipline about purity.
- **All tunables in `src/config/balance.ts`** — owner iterates on major features by config flip, not refactor. Alternatives to chosen rules stay implemented behind flags.
- **Cloudflare Pages over Workers** — static site is all v1 needs; Workers/Durable Objects only if/when online netplay happens (Cloudflare supports hosting games fine; no platform limitation found).
- **Canonical mechanics reference** = Neo Geo arcade version as documented in [GAME_MECHANICS.md](GAME_MECHANICS.md); numbers marked PROVISIONAL until verified against real gameplay by owner playtest.
