# Project Plan

Goal: a faithful, fun 3-player web adaptation of Twinkle Star Sprites, easy to iterate on, hosted at a public URL.

## Phase 0 — Research & foundation ✦ (2026-06-10, overnight)
- [x] Deep research on original mechanics → `GAME_MECHANICS.md` (multi-agent, cross-verified)
- [x] Project scaffold (Vite/TS/Pixi/Vitest), docs, GitHub repo, Cloudflare Pages
- [x] 3-player rule decisions → `ADAPTATION.md`

## Phase 1 — Core sim ✦ (overnight)
Deterministic 60Hz sim with tests: playfields, zako waves, chain explosions, charge shot, bombs, the attack escalation ladder (Normal → Reverse → Extra → Boss), 3-way routing, damage + life-steal, fever, elimination → 1v1, rounds & win.

## Phase 2 — Renderer, input, game feel ✦ (overnight)
Three fields + HUD (HP/charge/fever/target indicators), 60fps render with interpolation, keyboard controls, hit feedback, original placeholder-quality art, basic synth SFX.

## Phase 3 — AI opponents ✦ (overnight)
Two AI seats: dodge incoming, build chains, manage charge, reflect attacks. Difficulty levels. Same `Controller` interface as humans.

## Phase 4 — Iteration loop (next sessions, owner-driven)
- Owner playtests vs `GAME_MECHANICS.md` UNCERTAINTIES list; fix fidelity gaps
- Balance tuning via `balance.ts` knobs (routing feel, life-steal split, pressure scales)
- Art/audio upgrades, character variety (distinct stats + extra attacks per character)
- Menus: character select, settings screen exposing balance knobs in-UI

## Phase 5 — More humans (later)
- Local 3-player: keyboard zones + gamepad support (input layer is ready for it)
- Optional: online netplay via Cloudflare Workers + Durable Objects (sim determinism already in place)

## Verification strategy
- `npm test` — sim rules covered by unit tests (chains, routing, ladder, life-steal, elimination)
- Determinism test: same seed + same inputs ⇒ identical state hash
- Owner playtest = fidelity check against memory of the original; UNCERTAINTIES list drives questions
