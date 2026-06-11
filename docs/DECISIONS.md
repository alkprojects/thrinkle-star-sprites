# Decision Log

Newest first. Each entry: what, why, how to change it later.

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
