# Decision Log

Newest first. Each entry: what, why, how to change it later.

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
