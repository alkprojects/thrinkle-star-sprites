-- TSS MAME automation harness  (MAME 0.288, romset `twinspri`)
-- ---------------------------------------------------------------------------
-- Purpose: drive the REAL arcade ROM headlessly to measure how the original
-- behaves (movement speed, shot travel, chain timing) so our sim can be
-- calibrated against ground truth. Nothing here ships in the game; it reads
-- *facts* from the original, never its art/audio.
--
-- Run (from the MAME install dir, with this file copied alongside mame.exe):
--   mame.exe twinspri -autoboot_script tss_harness.lua -autoboot_delay 2 \
--            -nothrottle -video none -sound none -seconds_to_run 50
-- Headless + -nothrottle runs ~6-8x real time. Snapshots land in snap/<name>;
-- the log is tss_run.log. Edit scenario() to pick an experiment.
--
-- HARD-WON GOTCHAS (each cost a debugging cycle — do not re-learn them):
--  1. emu.add_machine_frame_notifier() returns a SUBSCRIPTION TOKEN. Keep a
--     reference in a GLOBAL (KEEPALIVE) or Lua GC silently kills the callback
--     after a few frames, with NO error printed.
--  2. The NeoGeo BIOS attract ("INSERT COIN") isn't up until ~frame 900; coins
--     before that are ignored. Boot lands on a white "LEVEL n / CREDIT" BIOS
--     screen first, THEN the game title appears after coining.
--  3. snap(name) writes to  snap/<name>  (MAME prepends the snapshot dir).
--  4. Save STATES are brittle: `-state` loads before the cart boots; mac:load()
--     mid-run tears down the frame notifier. Just re-navigate the menu each run.
--  5. Re-assert held inputs EVERY frame (set_value lasts one poll). on_frame does it.
--  6. snap()/scr:pixel() both work fine under `-video none` (offscreen render).
--
-- CORRECTED MENU MAP (observed 2026-06-12; supersedes the earlier guess that
-- "2 Players Start" opens SELECT MODE — it does NOT on this MVS romset):
--   BIOS white screen (~f900) --coin xN--> game TITLE ("PUSH START", blinks,
--     with a countdown to the attract how-to-play demo)
--   --1 Player Start--> a long scripted how-to-play/tutorial intro (LOAD RAN,
--       instruction text boxes; this is what looks like "story stage 1")
--   --press A repeatedly--> SKIPS the intro --> SELECT MODE screen:
--       CHARACTER MODE | STORY MODE | COMPETITIVE MODE   (yellow/gold bg)
--       * cursor defaults near CHARACTER/STORY; COMPETITIVE = rightmost = 2P VS
--       * pressing A here selects the highlighted mode
--   CHARACTER MODE (the default the A-mash lands on) --> a split-screen 1-on-1
--       match: LOADRAN (P1, LEFT field, ~150px wide, FULLY HUMAN-CONTROLLED)
--       vs a CPU character. Each round has a ~45-frame intro before control.
--   To reach COMPETITIVE (2P VS): stop AT select mode, press P1 Right x2, A.
--
-- MEMORY-MAP FINDINGS / WARNINGS:
--  * The 68k work RAM (0x100000-0x10FFFF) is dominated by the NeoGeo sprite
--    display list (lots of 0/0x100 attribute words) and by DOUBLE-BUFFERED
--    per-object temps that ALTERNATE value V / V+0x100 (field offset) every
--    frame. Blind RAM-diffing for the player position is therefore very noisy.
--  * 0x10BC38 and 0x10C22E are BACKGROUND-SCROLL counters (+~3/frame, wrap at
--    256, drift when idle) — NOT the player position. An earlier note that
--    0x10BC38 was the player's horizontal coordinate was WRONG (it was a scroll
--    counter the whole time). Do not trust it.
--  * To find the authoritative player struct, prefer MAME's debugger memory
--    SEARCH (-debug, `cheatinit`/`cheatnext`) or watching sprite VRAM, rather
--    than blind Lua work-RAM diffs. Until then, the VISUAL method below is the
--    reliable measurement (it's the same method the bible's frame data uses).
--
-- RESULT (2026-06-12, visual measurement in CHARACTER mode, Load Ran):
--    steady horizontal speed ~= 2.5 px/frame; field wall-to-wall ~= 52-56
--    frames. This CONFIRMS GAME_MECHANICS.md 8.2 (56f) and tests/feel.test.ts.
--    Sim's player.speed (2.75) is within eyeball error; no balance change made.
--
-- Field tags (exact, from ioport enumeration): "Coin 1", "Coin 2",
--   "1 Player Start", "2 Players Start", "P1 Up/Down/Left/Right", "P1 A/B/C/D",
--   "P2 ...". A = shoot/charge (Attack Stopper), B = bomb. Screen is 320x224.
-- ---------------------------------------------------------------------------

local mac  = manager.machine
local scr  = mac.screens:at(1)
local prog = mac.devices[":maincpu"].spaces["program"]  -- 68000 program space

-- field lookup by human-readable name
local F = {}
for _, port in pairs(mac.ioport.ports) do
  for fname, field in pairs(port.fields) do F[fname] = field end
end

local held = {}
local log = io.open("tss_run.log", "w")

-- ---- public-ish helpers usable from scenario() --------------------------
function logf(...) log:write(string.format(...) .. "\n"); log:flush() end
function snap(name) scr:snapshot(name) end
function wait(n) for _ = 1, n do coroutine.yield() end end
function press(name) held[name] = true end
function release(name) held[name] = false end
function tap(name, frames)
  if not F[name] then logf("NO FIELD: %s", name); return end
  held[name] = true; wait(frames or 8); held[name] = false; wait(6)
end
function u8(a)  return prog:read_u8(a)  end
function u16(a) return prog:read_u16(a) end  -- honours 68k big-endianness
function frame() return scr:frame_number() end
function pixel(x, y) local ok, v = pcall(function() return scr:pixel(x, y) end); return ok and v or -1 end

-- Coin up and reach the CHARACTER-MODE 1-on-1 match (LOADRAN, human P1) by
-- mashing A through the tutorial + SELECT MODE. Over-mashing A in-match just
-- fires shots (harmless). Lands controllable a little after frame ~2000.
function enter_character_match()
  wait(900)                                       -- gotcha #2
  for _ = 1, 8 do tap("Coin 1", 6) end
  tap("1 Player Start", 10)
  while frame() < 1950 do tap("P1 A", 6); wait(14) end
  wait(150)                                       -- past the ~45f round intro
end

-- ---- EDIT THIS: the experiment -------------------------------------------
-- Default: VISUAL horizontal wall-to-wall measurement of Load Ran. Park at the
-- left wall, traverse right, snapshot at known frame offsets; read her pixel X
-- from the snapshots (crop the LEFT field bottom strip, e.g. with ffmpeg
-- `crop=150:30:8:178,scale=900:180:flags=neighbor`; screen_x = 8 + crop_x/6).
local function scenario()
  enter_character_match()
  held["P1 Down"] = true; wait(70); held["P1 Down"] = false; wait(4)  -- to the bottom, clear of the boss
  held["P1 Left"] = true; wait(110); held["P1 Left"] = false; wait(4) -- park at left wall
  snap("tss/wtw_00.png"); logf("f=%d parked left", frame())
  held["P1 Right"] = true
  for i = 1, 7 do wait(12); snap(string.format("tss/wtw_%02d.png", i * 12)); logf("f=%d +%d", frame(), i * 12) end
  held["P1 Right"] = false; wait(6)
  snap("tss/wtw_wall.png"); logf("f=%d right wall", frame())
  mac:exit()
end

-- ---- driver (don't edit below) ------------------------------------------
local co = coroutine.create(scenario)
local function on_frame()
  for name, on in pairs(held) do
    if F[name] then F[name]:set_value(on and 1 or 0) end
  end
  if coroutine.status(co) ~= "dead" then
    local ok, err = coroutine.resume(co)
    if not ok then logf("SCENARIO ERROR: %s", tostring(err)) end
  end
end

KEEPALIVE = emu.add_machine_frame_notifier(on_frame)  -- gotcha #1: must persist
logf("harness loaded, screen %dx%d", scr.width, scr.height)
