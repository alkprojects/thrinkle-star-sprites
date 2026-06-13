# Learning the original from the real ROM (MAME)

This is the **gold-standard fidelity channel**: drive the actual Twinkle Star
Sprites arcade ROM in MAME, headlessly, to measure how the original *really*
behaves — exact movement speeds, shot travel, chain timing, boss patterns — and
calibrate our sim against those numbers. The other two channels (archive.org
footage analysis, and capturing our own game) are described in `docs/STATUS.md`.

**Copyright:** the ROM and any frames/states it produces are ADK's and stay on
the local machine only (never committed; see the project's no-copyrighted-assets
rule). We extract *facts* — frame counts, pixel distances, RAM values — which are
not copyrightable. Only the original tooling in this folder is versioned.

## Setup (one-time)

- MAME 0.288 at `C:\Users\ALK\Desktop\mame` (`mame.exe`).
- Legally-owned romset `twinspri.zip` + BIOS `neogeo.zip` in `roms/`
  (`mame.exe twinspri -verifyroms` → "is good").
- Copy `tss_harness.lua` next to `mame.exe` (or pass an absolute path).

## Run an experiment

```sh
cd /c/Users/ALK/Desktop/mame
mame.exe twinspri -autoboot_script tss_harness.lua -autoboot_delay 2 \
         -nothrottle -video none -sound none -seconds_to_run 60
```

Headless + `-nothrottle` runs ~6–8× real time. Edit the `scenario()` function in
`tss_harness.lua` to script inputs / capture / memory reads, then re-run.
Snapshots write to `snap/<name>`; logs to `tss_run.log`.

## What works (proven, 2026-06-12)

- **Boot → menu navigation → live, unscripted gameplay**, fully scripted from Lua.
  `enter_character_match()` reaches a controllable Load Ran field (see menu map).
- **Input injection** (8-way stick + A/B), re-asserted each frame.
- **Frame capture** at native 320×224 — view the PNGs directly (works under `-video none`).
- **`scr:pixel(x,y)`** reads work too (handy for screen-signature detection).
- **Memory reads** of 68k work RAM `0x100000–0x10FFFF`.
- **Measurement done (visual):** Load Ran horizontal **≈ 2.5 px/frame**, wall-to-wall
  **≈ 52–56 frames** → confirms GAME_MECHANICS.md §8.2 (56f) and `tests/feel.test.ts`.

## ⚠️ Memory-map corrections (don't re-learn these)

- **`0x10BC38` is the BACKGROUND-SCROLL counter, NOT the player X.** So is `0x10C22E`.
  Both step ~+3/frame, wrap at 256, and drift when idle. The earlier note calling
  `0x10BC38` the player's 8.8-fixed horizontal position was wrong (it was the scroll
  counter the whole time; that's why story-stage-1 "movement" looked scripted).
- Work RAM is dominated by the **NeoGeo sprite display list** (0/0x100 attribute
  words) and **double-buffered per-object temps** that alternate `V / V+0x100`
  (field offset) every frame. Blind Lua RAM-diffing for the player position is
  therefore noisy and unreliable. To find the authoritative player struct, use
  MAME's debugger memory **search** (`-debug`, `cheatinit`/`cheatnext`) or watch
  sprite VRAM. Until then the **visual method** (crop the player out of snapshots
  and read its pixel X) is the reliable measurement — it's how the bible's frame
  data was derived anyway.

## Gotchas (baked into the harness comments — read them before editing)

1. **Keep the frame-notifier subscription in a global** or Lua GC silently kills
   your callback after a few frames. This one is vicious — no error is printed.
2. **`wait(900)` before inserting coins** — the attract screen isn't up before
   ~frame 900; early coins are ignored.
3. `snap("x.png")` → `snap/x.png` (MAME prepends the snapshot dir).
4. **Save states are brittle**: `-state` loads before the cart boots; `mac:load()`
   mid-run tears down notifiers. Just re-navigate the menu each run (~3 s at 8×).
5. **Re-assert held inputs every frame** (one `set_value` lasts a single poll).

## Menu map (CORRECTED — observed 2026-06-12)

The earlier map was wrong: **"2 Players Start" does NOT open SELECT MODE** on this
MVS romset. The real flow:

```
BIOS white screen ("LEVEL n / CREDIT", ~f900) --coin xN--> game TITLE
  (blinking PUSH START, with a countdown into the attract how-to-play demo)
  --1 Player Start--> long scripted how-to-play intro (LOAD RAN + instruction
        text boxes; looks like "story stage 1", auto-plays/cycles tips)
     --press A repeatedly (skips the intro)--> SELECT MODE (yellow/gold bg):
          CHARACTER MODE | STORY MODE | COMPETITIVE MODE
          (COMPETITIVE = rightmost = 2P VS; A selects the highlighted mode)
  CHARACTER MODE (where mashing A lands) --> split-screen 1-on-1 vs CPU:
        LOADRAN = P1, LEFT field (~150px), FULLY HUMAN-CONTROLLED, unscripted.
        Each round has a ~45-frame intro before control begins.
```

`enter_character_match()` in the harness automates this (coin → 1P start → mash A
to ~f1950 → settle). Over-mashing A in-match just fires shots (harmless). Fixed
`wait()` timing held up across runs here, but for COMPETITIVE you must STOP at
SELECT MODE — detect it by its yellow bg via `scr:pixel()` (it's a static, low-
volatility screen after the busy intro), then `P1 Right` x2 + `P1 A`.

## Done this session

- Reached an unscripted, human-controlled field (CHARACTER mode, Load Ran).
- Measured horizontal wall-to-wall ≈ 52–56f / ~2.5 px/f (visual) → matches the
  bible's 56f; sim's `player.speed` 2.75 is within measurement error, no change.

## Next (to refine)

- For sub-pixel precision, find the player struct via MAME's debugger memory
  **search** (the work-RAM diff approach is defeated by sprite-list noise + the
  V/V+0x100 double-buffering — see corrections above). Then measure X/Y/charge/
  fireball addresses directly and add vertical (80f) + shot-travel (34f) checks.
- Optionally extend the harness to stop at SELECT MODE and pick **COMPETITIVE**
  (P2 idle) for an even cleaner, boss-free field at round start.
