# 3-Player Adaptation Design

How Thrinkle Star Sprites changes Twinkle Star Sprites' 1v1 systems for three players.
The original game's systems are documented in [GAME_MECHANICS.md](GAME_MECHANICS.md) — this file only covers what we change and why. Every rule here is a config value in `src/config/balance.ts`; the chosen defaults are marked, alternatives stay implemented behind flags so design iteration is a one-line change.

## Layout
Three playfields side by side. Each player sees incoming attacks in their own field exactly as in the original.

## Attack routing (the core 3-player question)

### Normal Attacks from chains
**Default: `'both'`** — chain attacks are sent to BOTH opponents at full strength (owner decision, 2026-06-10).
Implemented alternatives: `'round-robin'`, `'retaliation'` (target whoever hit you last), `'manual'` (button toggles target), `'leader'` (target healthiest opponent).
Consequence of `'both'`: incoming pressure roughly doubles vs 1v1. Global tuning knobs exposed for compensation if play feels too dense: `incomingSpeedScale`, `incomingDensityScale` (default 1.0 — start faithful, tune from playtests).

### Extra Attacks and Boss Attacks
Always sent to **both** opponents (owner decision, 2026-06-10).

### Reflections (Reverse Attacks)
A reflected attack **returns to its original sender**, not a random opponent (owner decision, 2026-06-10). Every attack entity carries `originalSender` through its whole reflection chain, so escalation ping-pongs between the original sender and whoever keeps reflecting — third parties only get involved when escalation reaches a tier that targets everyone (per GAME_MECHANICS.md ladder rules).

## Life economy

### Life-steal
Original rule: damage yourself on a zako/obstacle → opponent recovers half of it.
3-player rule: **both** other players recover (owner decision, 2026-06-10).
**Default split: `'divided'`** — the original's half is split between them (¼ each), conserving the original's total health economy. Alternative `'each'` (both heal the full half) is one config flip; flagged as a top playtest knob since the owner hasn't chosen the amount yet.

### Elimination
When a player hits zero HP they're out; the **two survivors finish 1v1** (owner decision, 2026-06-10).
- The eliminated player's in-flight attacks resolve normally; nothing new is generated.
- Attacks with `originalSender` = eliminated player can still be reflected — they go back toward the eliminated seat's field which is now inert, so reflections targeting an empty seat are dropped. (Knob: `reflectionToEliminated: 'drop' | 'redirect-other'`.)
- Routing modes collapse naturally: 'both' becomes the single opponent.

## Open design questions (revisit after playtests)
- Does 'both' routing make the early game too chaotic at 3 players? (Use `incomingDensityScale`.)
- Life-steal `'divided'` vs `'each'` — owner to pick after feel test.
- Should the first-eliminated player get something (spectate cam, ghost mode)? Currently: spectates.
