# Thrinkle Star Sprites

3-player web homage to Twinkle Star Sprites (ADK, Neo Geo, 1996). Solo-vs-2-AI first; built for local 3-human and eventual netplay. Hosted on Cloudflare Pages, repo at alkprojects/thrinkle-star-sprites.

## Commands
- `npm run dev` — dev server
- `npm test` — sim unit tests (run before every commit)
- `npm run build` — typecheck + production build
- `npm run deploy` — build + deploy to Cloudflare Pages (needs `wrangler login`)

## Architecture (load-bearing rules)
- `src/sim/` is a **pure deterministic simulation**: fixed 60Hz tick, NO `Math.random()`, NO `Date`, NO DOM/Pixi imports. All randomness goes through the seeded RNG in sim state. This purity is what makes replays, tests, and future netplay possible — never break it.
- **Every gameplay number and rule variant lives in `src/config/balance.ts`.** Damage, chain mappings, attack routing mode, life-steal split, fever thresholds, speeds. Never hardcode a tunable in sim code. The user iterates on design by flipping config values.
- `src/render/` (PixiJS) and `src/ai/` only *read* sim state; inputs flow in through the `Controller` interface in `src/input/`. AI and humans are interchangeable seats.
- Mechanics fidelity questions → `docs/GAME_MECHANICS.md` (the original-game bible). 3-player rule changes → `docs/ADAPTATION.md`. Don't re-research the original game; it's documented.

## Workflow
- Start of session: read `docs/STATUS.md` (current state + next steps). End of session: update it.
- Record design/architecture decisions in `docs/DECISIONS.md` with rationale.
- Original art only — never add ADK-copyrighted assets (public repo + public hosting).
