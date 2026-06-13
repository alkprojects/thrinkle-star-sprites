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

## What works (proven)

- **Boot → menu navigation → live gameplay**, fully scripted (coin, start).
- **Input injection** (8-way stick + A/B), re-asserted each frame.
- **Frame capture** at native 320×224 — view the PNGs directly.
- **Memory reads** of 68k work RAM `0x100000–0x10FFFF`. RAM-diffing while moving
  located the player object struct at **~0x10A000**; `0x10BC38` tracks horizontal
  input (8.8 fixed-point, observed +0x300/frame = 3.0 px/f) — needs final
  confirmation in an unscripted match (the story-mode tutorial scripts movement).

## Gotchas (baked into the harness comments — read them before editing)

1. **Keep the frame-notifier subscription in a global** or Lua GC silently kills
   your callback after a few frames. This one is vicious — no error is printed.
2. **`wait(900)` before inserting coins** — the attract screen isn't up before
   ~frame 900; early coins are ignored.
3. `snap("x.png")` → `snap/x.png` (MAME prepends the snapshot dir).
4. **Save states are brittle**: `-state` loads before the cart boots; `mac:load()`
   mid-run tears down notifiers. Just re-navigate the menu each run (~3 s at 8×).
5. **Re-assert held inputs every frame** (one `set_value` lasts a single poll).

## Next (to finish calibration)

- Get into a **2P VS match** (or past the tutorial) for an unscripted field, then
  confirm the X-coordinate address and measure wall-to-wall crossing in frames →
  compare to `tests/feel.test.ts` (currently asserts the bible's 56f/80f).
- Find Y, HP/heart, charge-gauge, and fireball-position addresses the same way
  (RAM-diff a controlled action). A community cheat/RAM map for `twinspri`, if one
  exists, would shortcut this.
