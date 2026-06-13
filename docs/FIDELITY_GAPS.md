# Fidelity Gaps

What the current build still does differently from the verified original ([GAME_MECHANICS.md](GAME_MECHANICS.md)). Ordered by how much each gap changes how the game *feels*. This is the default backlog for future sessions — pick from the top.

> **Look & sound are now addressed** (2026-06-11 presentation overhaul — see [VISUAL_AUDIO_IDENTITY.md](VISUAL_AUDIO_IDENTITY.md)): pixel-art renderer, chibi characters, fairy zako, comet fireballs, plush boss, arcade HUD, bitmap font, fantasy skies, chiptune BGM + SFX. The gaps below are now almost entirely **gameplay mechanics**, not presentation. Note several are partially "faked" in the renderer ahead of the sim: zako show durability **colours** (#5) but still die in one sim hit; fireballs render **size tiers** (#6) but all have 2 HP; the boss shows a **white spawn-flash** (#9) but has a hitbox the whole time. Closing the sim side of these will make the existing visuals truthful.

## High impact

0a. **Match pacing is far too fast** (measured 2026-06-11). A 3-AI match ended in ~6 s of game time (374 ticks); a scripted-input human seat died inside 8 s. In the original, early chains send 1–2 slow fireballs any player trivially dodges; first blood almost never lands this early. Root causes to investigate, in order: AI dodge competence (eats fireballs the original's players would sidestep), 3P `routing.normalMode:'both'` doubling pressure vs 1v1, fireball dodgeability (single sway pattern vs the original's 3 baitable patterns, gap #7). Tune with `routing.incomingDensityScale` or AI improvements — NOT by inflating `maxHp` (5 hearts / 3 dmg is verified original).
    - _Update 2026-06-12 — likely already mitigated, RE-VERIFY:_ this measurement predates the sim reconciliation (commit `9f58936`). A spot all-AI match this session ran **~1340 ticks (~22 s)** before a winner, not ~6 s. Re-measure with the current sim before spending effort here; the gap may be mostly closed.
    - **✓ ADDRESSED 2026-06-13:** with the new charge economy adding pressure, all-AI rounds were still ~14–21 s (Death at 100 s never reached). Tuned `damage.attackHit` 3→2 (3P-ADAPT), `routing.incomingDensityScale` 0.35, `incomingSpeedScale` 0.85, slower charge-meter fill, and a **per-tick AI emergency-dodge** → all-AI rounds now ~30–90 s (the original's 30 s–3 min band); a human reaches Death. **The four knobs above are the top things to re-tune.**
0b. ~~**Backgrounds should be continuously scrolling terrain**~~ **✓ BUILT 2026-06-13.** `src/render/backgrounds.ts` now bakes two vertically-tiling layers per theme (opaque ground + translucent canopy) and the renderer scrolls them at ~0.85 / 1.15 u/tick — meadow (Danny) / dusk-cinema (Tyleru) / beach (Alex). Confirmed against the real ROM (lush green top-down terrain, winding paths, rivers, giant mushrooms).

1. ~~**Fever is meter-based, should be orb-based**~~ **✓ BUILT 2026-06-13** (§6). `fever.mode: 'orb'` (default) spawns a spinning blue orb on a per-field timer; only a chain explosion or a bomb detonates it → ~10s fever (the faithful hits−1 output was already in place). `fever.mode: 'meter'` keeps the old chain-meter trigger as a flippable alternative. Confirmed firing in-game (6/6 all-AI matches). Not yet modelled: the "!!" telegraph, perfect-accelerated timing, and bubbled-zako suppression during fever.
2. ~~**Charge meter economy missing**~~ **✓ BUILT 2026-06-13** (§4.2, §5.6). `balance.charge`: the gauge fills from zako kills + chains; a Lv2 release with ≥2/3 meter sends `exCount` specials, a MAX release with a full meter sends a boss, and a MAX release with a boss already in your own lane REVERSES it. Per-character `exCount`/`chargeLv1`/`bossHp`. Still simplified vs the original: no Perfect meter gain, notch costs are our values (lv2Cost 1/3, maxCost 2/3), and the MAX-with-opponent-boss "+2 extras" case isn't modelled.
3. **No rounds** (§7). Original: best 2-of-3 rounds, hearts/bombs reset, meter resets between rounds (Neo Geo). Current: single match.
4. ~~**Death (the reaper) missing**~~ **✓ BUILT 2026-06-13** (§7). `balance.death`: spawns on each field at ~100s mirrored across centre from the player's X, pursues with a limited (deterministic, trig-free) turn rate at a capped speed every char can out-circle, contact = instant elimination (i-frames pass through), killable by shots/beams/bombs, HP grows per appearance, respawns after a gap, and its corpse explodes into the chain system. The **inactivity-triggered early Death** is now in too (§7): if a player fires no shots for `death.inactivityTicks` (~30s) a one-shot Death appears that does NOT respawn after a kill (vs the time Death which respawns endlessly). Still simplified: no satellite-lock specifics, and chains don't yet directly damage Death (only its corpse feeds them). The old most-HP timeout remains as a long fallback.
5. ~~**Zako durability/colors**~~ **✓ BUILT 2026-06-13** (§3.1). Zako carry `hp`/`maxHp` (tier 1 red … 5 purple), assigned in `waves.rollTier()` (escalating over round time, softened early). A basic shot drops one tier, a beam deals `beamDamage`, and a chain explosion's blast power = its source zako's size — so big (purple) zako make big blasts that wipe smaller neighbours (`tierRadiusScale` knob), while a wall of tough zako resists single shots. Color/size now read remaining HP truthfully.
6. ~~**Fireball size tiers**~~ **✓ BUILT 2026-06-13** (§3.3). Each chain fireball is sized by the hit-index that generated it (`fireballHp`): small early, biggest from deep hits (2–5 HP / shots to reflect). A fireball shot down returns one size LARGER. (Approximation: sized per-fireball by hit-index rather than dispatched live mid-combo.)

## Medium impact

7. ~~**Fireball flight patterns**~~ **✓ BUILT 2026-06-13** (§3.4). Three patterns cycle per formation (`SimState.attackPattern`): parabola (drift + accelerating arc), diagonal-bounce (faster, snapshot-aimed, wall-bouncing), stop-and-track (descend → hover-track the victim's x → drop). Snapshot-aimed and baitable; params in `balance.attacks.pattern*`. Noticeably lengthened rounds (attacks land less reliably). Not modelled: the exact fixed cycle order vs the original's, and per-pattern frame-speeds.
8. **Zako collision stun + dizzy debuff** (§5.4). **PARTIAL ✓ 2026-06-13:** a zako clip now applies a ~5s dizzy debuff (`player.dizzyTicks`) that reduces move (≈50%) and shot speed (≈65%), shown as circling stars. Still missing: the initial *mashable stun* and the per-character (not uniform) dizzy ratios from §5.4's table.
9. **Boss behavior depth** (§4.5–4.6). Original: spawn flash (no hitbox ~1s), wander→attack→escape state machine, center-only hurtbox, 5-damage stun rule, boss clash/reversal/displacement between players, killing a boss erases its attacks. Current: hover + rain + HP pool.
10. **The 36 fixed wave formations** (§3.1). Original: hand-authored memorizable patterns, expanding pool over round time, strict left/right mirror alternation, position-reactive formations. Current: 4 procedural formation families.
11. **Recovery restriction** (§5.3). Original: below 3 hearts, zako-collision heals can only restore you to 3; only attack hits exceed it. Current: all heals cap at max.
12. **Shot limit** (§2.3). Original: max 2 player shots on screen. Current: cooldown-based autofire.
13. **Items** (§5.5, §6). Bomb coins (courier zako, coin flips, catch bomb-side-up), star coins for bubble waves. Current: fixed 2 bombs, no pickups.

## Low impact / polish

14. **Diagonal movement** should be √2 faster (unnormalized axes — original quirk). Current: normalized-ish (independent axes already, actually faithful — verify).
15. **Bubbled zako** (§3.1), **Perfect bonuses** (§10), **per-character stats/extras/bosses** (§8 has the full table), boss-spawn white flash, charge-while-bombing rules, Extra lookalikes from bosses being bomb-erasable.
16. **Two shots per screen + charge vulnerability** interactions; meter notch UI.

## Resolved (was a gap, now faithful)

- ~~Scrolling top-down terrain backgrounds (§0b)~~ → two parallax terrain layers per theme, 2026-06-13
- ~~Charge-meter economy (#2)~~ → meter fills from kills; Lv2→specials, MAX→boss, MAX-on-own-boss→reversal, 2026-06-13
- ~~Death the reaper (#4)~~ → 100s spawn, limited-turn pursuit, instant-KO contact, killable, respawns, 2026-06-13
- ~~Per-character stats (part of §8/#15)~~ → 3-character roster with asymmetric move/shot/charge/exCount/bossHp + themed extras & bosses, 2026-06-13
- ~~Zako durability tiers (#5)~~ → hp/maxHp by colour, size-scaled blasts, basic-shot-drops-one-tier, 2026-06-13
- ~~Fireball size tiers (#6)~~ → sized by combo hit-index, reverse one size larger, 2026-06-13
- ~~Fireball flight patterns (#7)~~ → 3 cycling baitable patterns (parabola / diagonal / stop-and-track), 2026-06-13
- ~~Dizzy debuff (part of #8)~~ → zako clip → ~5s reduced move/shot speed (mashable stun + per-char ratios still TODO), 2026-06-13
- ~~Inactivity-triggered early Death (part of #4)~~ → one-shot Death if a player stops firing, 2026-06-13
- ~~Orb-based fever (#1)~~ → spinning orb, chain/bomb detonates → fever; `fever.mode` flag keeps meter as fallback, 2026-06-13
- ~~Reflection ladder ping-pong escalation~~ → real ladder implemented (1:1 reverse→extra, 3-in-combo→boss)
- ~~Damage-proportional life steal~~ → fixed +1.0/+0.5 heals
- ~~Chain mapping 3+/1-per~~ → floor((hits−2)/2) from 4th hit; fever hits−1
- ~~Bombs clearing fireballs~~ → full-field zako wipe only
- ~~Zako collisions can kill~~ → floor at 0.5 hearts
- ~~Fever sending bosses~~ → fever sends more fireballs

## Deliberate 3-player divergences (NOT gaps — see ADAPTATION.md)

Three fields; normals to both opponents; extras/bosses to all; reflections return to original sender; zako heals split between both others; elimination → 1v1; pressure valves (`incomingSpeedScale`/`incomingDensityScale`).
