-- TSS MAME automation harness  (MAME 0.288, romset `twinspri`)
-- ---------------------------------------------------------------------------
-- Purpose: drive the REAL arcade ROM headlessly to measure its behaviour
-- (movement speed, shot travel, chain timing, boss patterns) so our sim can be
-- calibrated against ground truth. Nothing here ships in the game; it reads
-- *facts* from the original, never its art/audio.
--
-- Run (from the MAME install dir, with this file copied alongside):
--   mame.exe twinspri -autoboot_script tss_harness.lua -autoboot_delay 2 \
--            -nothrottle -video none -sound none -seconds_to_run 60
-- Headless + -nothrottle runs ~6-8x real time. Snapshots land in
--   snap/<whatever path you pass to snap()>  (the "snap/" prefix is implicit).
--
-- HARD-WON GOTCHAS (each cost a debugging cycle — do not re-learn them):
--  1. emu.add_machine_frame_notifier() returns a SUBSCRIPTION TOKEN. If you do
--     not keep a reference to it, Lua GC collects it and the callback silently
--     stops firing a few frames later. Store it in a GLOBAL (see KEEPALIVE).
--  2. You cannot reach the game instantly. The NeoGeo BIOS attract screen
--     ("INSERT COIN") only appears ~frame 900. Inserting coins before that does
--     nothing. wait(900) before coining.
--  3. snap(name) writes to  snap/<name>  — MAME prepends the snapshot dir.
--  4. Save STATES are brittle here: `-state` at boot loads before the cart is
--     up; mac:load() mid-run tears down the frame notifier (device re-init).
--     Cheapest reliable path is to just re-navigate the menu each run (~3s).
--  5. Inputs must be RE-ASSERTED every frame (set_value) while "held"; a single
--     set_value lasts one poll. The on_frame loop below does this.
--
-- Field tags (from ioport enumeration):
--   "Coin 1", "1 Player Start", "2 Players Start",
--   "P1 Up/Down/Left/Right", "P1 A/B/C/D"  (and P2 ...).
-- A = shoot/charge (Attack Stopper), B = bomb.
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

-- Walk attract -> credits -> 1P game. Leaves you in stage 1 (story tutorial).
-- For a clean (unscripted) measurement environment, navigate to a 2P VS match
-- instead, or advance past the tutorial first.
function enter_1p_game()
  wait(900)                                   -- gotcha #2: wait for attract
  tap("Coin 1", 8); tap("Coin 1", 8); wait(20)
  tap("1 Player Start", 8); wait(240)         -- drops straight into the match
end

-- ---- EDIT THIS: the experiment ------------------------------------------
local function scenario()
  enter_1p_game()
  snap("tss/gameplay.png")
  logf("reached gameplay")
  -- example: measure something, then:
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
