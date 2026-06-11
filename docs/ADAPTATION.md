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
A reflected attack **returns to its original sender**, not a random opponent (owner decision, 2026-06-10).

The ladder follows the verified original (GAME_MECHANICS.md §4): a destroyed **normal** returns as a **Reverse** (the ladder's only speed bump); a Reverse destroyed **individually** converts to **one Extra Attack**; **3+ Reverses caught by explosions within one combo** summon a **Boss instead** of those Extras. Extras are indestructible (dodge only); bosses are killable and never reflect. 3-player twist: Extras and Bosses route to **all** opponents (owner rule), so a reflection war between two players spills onto the third the moment it escalates.

### Timeout
`match.onTimeout`: `'most-hp'` (default) — healthiest player wins at the bell, exact tie = draw; `'sudden-death'` — everyone drops to 1 HP (healing can't undo it), next hit ends the match.

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
