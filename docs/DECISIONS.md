# Decision Log

Newest first. Each entry: what, why, how to change it later.

## 2026-06-13 — New roster, charge-meter economy, Death reaper, scrolling terrain (Claude)

Owner brief: "now that you can test the actual game make the look and gameplay as close to the original as possible" + described the ghost/charge/Death mechanics + named three playable characters. Observed the real ROM first (MAME capture, CHARACTER mode, ~74s of Load-Ran play) to ground the look.

- **Biggest look gap was the background.** The real ROM flies over BRIGHT, CONTINUOUSLY SCROLLING TOP-DOWN TERRAIN (green forests, dirt paths, rivers, giant red mushrooms), not a static sky — this is most of its sense of speed (FIDELITY_GAPS §0b). Replaced the sky-gradient `backgrounds.ts` with two vertically-scrolling parallax terrain layers (ground + canopy) per theme: **meadow** (Danny), **cinema** (Tyleru, dusk), **sunny** (Alex, beach). Renderer scrolls them ~0.85 / 1.15 u/tick.
- **New roster replaces the chibi placeholders** (Stella/Komet/Lumen → owner's three). `src/config/characters.ts` now carries per-character `CharStats` (moveSpeed, shotSpeed, shotReload, chargeLv1, beamDamage, exCount, bossHp) + an `attackTheme` + terrain `theme`:
  - **Danny Donkey** — chubby blonde, FRISBEE attacks, **2/2** (= the Load-Ran baseline, so feel tests stay green).
  - **Heavy Tyleru** — balding+stubble, FILM-REEL/movie attacks, **1/1**, slow/weak but a 25-HP tanky boss.
  - **Senseitional Alex** — ripped, shades, shirtless, WEIGHT attacks, **3/3**, fast hard shots, 4 specials, 18-HP glass-cannon boss.
  Stats are baked onto each PlayerSim at `createSim` (defaults to baseline when none passed → existing tests unaffected). Human-caricature player sprites + themed projectile/extra/boss art live in `sprites.ts`.
- **Charge-meter economy** (owner's described mechanic; was FIDELITY_GAP #2, now built). The gauge fills as you destroy zako; a release SPENDS meter on top of the beam: hold ≥ Lv2 AND meter ≥ 2/3 → send `exCount` specials; hold ≥ MAX AND meter full → send a Boss; MAX with a boss already in YOUR lane → **reversal** (clears it, sends your boss out). Config: `balance.charge` + `shot.chargeTicksMax`.
- **Death the reaper** (was FIDELITY_GAP #4, now built). Arms at `death.startTicks` (100s), pursues the player with a *limited turn rate* (deterministic **sqrt-only** steering — no trig — so replays/netplay stay bit-exact), contact = instant KO (i-frames pass through), killable by shots/beams/bombs (respawns tougher), and its corpse explodes into the chain system. Config: `balance.death`. Owner's "ghost → flashing ghost → special" maps to our existing **normal → reverse → extra** ladder, now themed + with a flashing reverse.
- **Pacing.** 3-player `both` routing made rounds end in ~20s, so Death (100s) was never reached. Tuned the knobs: `damage.attackHit` **3→2** (three clean hits to kill — a documented 3P-ADAPT; set 3 for the purest 1v1 feel), `routing.incomingDensityScale` **0.35**, `incomingSpeedScale` **0.85**, slower meter fill, plus a per-tick **AI emergency-dodge**. All-AI rounds now span ~30–90s (the original's 30s–3min band); a human (better than this AI) survives to 100s and meets Death. **These are the top playtest knobs.**
- Sim stays pure & deterministic. 57 sim tests green (9 new: charge economy + Death). Clean typecheck/build. Verified in-browser: scrolling terrain, the three caricatures, the ghost ladder, specials, themed boss, the Death reaper sprite, charge HUD with 1/2/MAX notches, title roster with power/speed tiers.
- To change later: roster art/stats → `characters.ts` + `sprites.ts`; charge/Death rules → `balance.charge`/`balance.death`; pacing → the four knobs above; terrain → `backgrounds.ts`.
- **Autonomous deepening (same night).** Owner said "work autonomously for the rest of the session." A 6-agent adversarial review of the first pass found only one missing sub-feature (clean otherwise). Then closed five more gameplay gaps, each tested + verified + kept deterministic: inactivity-triggered Death (§7), fireball **size tiers** by combo hit-index + reverse-one-size-larger (#6), **zako durability** tiers (HP/colour/size, size-scaled blasts) (#5), **3 baitable flight patterns** (#7), and the **dizzy** debuff (§5.4). Key implementation rule kept throughout: new attack/zako/death state uses optional fields (so test fixtures default cleanly) and **arrays not Sets** (e.g. explosion `hitIds`) so sim state stays JSON-serialisable for replays/netplay; Death/pattern steering uses sqrt + arithmetic only (no trig). Net effect on pace: all-AI rounds ~20s → ~40–70s (closer to the original + Death), no further knob change needed. A second 6-agent review caught two real bugs (bomb used the static zako radius not the size-scaled one — harmless since bomb radius dwarfs it, but fixed for consistency; and explosion-caught fireballs reflected at "+1 size" when they should be sized by the chain's hit count, §4.1 — fixed). Then added **orb-based fever** (#1) behind a `fever.mode` flag ('orb' default, 'meter' fallback — Alex's keep-alternatives-flippable preference): a spinning orb crosses each field, a chain/bomb detonates it → fever; the AI chases orbs so fever fires in 6/6 matches. This pushed rounds to **~48–117s** and made **Death reachable in AI play** (the user's "play to ~100s" ask). 65 sim tests; clean build; two adversarial reviews run.

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
