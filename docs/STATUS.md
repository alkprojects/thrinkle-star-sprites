# Status

_Last updated: 2026-06-11, end of kickoff overnight session_

## Where we are

**The game is playable end-to-end**: title → 3-field match (you vs 2 AI) → elimination → 1v1 → winner → rematch. 41 sim tests pass, including full-match determinism. Repo: https://github.com/alkprojects/thrinkle-star-sprites (CI runs tests+build on push).

Built tonight: deterministic 60Hz sim (pure, seeded RNG, netplay-ready), PixiJS renderer with original procedural art, WebAudio synth SFX, two AI opponents, the verified original attack ladder (normal→reverse→extra/boss via 3-reverses-in-one-combo), 5-heart life economy with fixed life-steal, all owner 3P rules. A 36-agent research workflow produced [GAME_MECHANICS.md](GAME_MECHANICS.md) (the original-game bible, adversarially verified); a 41-agent review workflow found 34 issues, all fixed.

## Deployed ✅

Live at **https://thrinkle-star-sprites.pages.dev** (Cloudflare Pages, project `thrinkle-star-sprites`). Redeploy any time with `npm run deploy` (wrangler is authenticated on this machine as of 2026-06-11).

## Next steps (pick by interest)

- **Playtest!** Compare against memory of the original. Check the UNCERTAINTIES list (GAME_MECHANICS.md §13) and [FIDELITY_GAPS.md](FIDELITY_GAPS.md) — the prioritized "still differs from the arcade" backlog. Top gaps: orb-based fever, charge-meter Lv2/MAX sends, best-of-3 rounds, Death reaper, zako color durability.
- **Balance knobs to feel out** (all in [balance.ts](../src/config/balance.ts)): `lifeSteal.split` ('divided' vs 'each' — owner hasn't picked), `routing.incomingDensityScale/SpeedScale` (3-player pressure), `attacks.extrasDestructible` (extras may overwhelm at 3 players since they hit both opponents).
- Matches end FAST now (2 clean hits kill, like the arcade). If too fast for 3P, `damage.attackHit` and `player.maxHp` are the knobs.

## Quick start for a new session
1. Read this file, then `CLAUDE.md`.
2. `npm run dev` to play; `npm test` before committing.
3. Original mechanics → `docs/GAME_MECHANICS.md`; 3P rules → `docs/ADAPTATION.md`; gaps → `docs/FIDELITY_GAPS.md`; decisions → `docs/DECISIONS.md`.
