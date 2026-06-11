# Visual & Audio Identity — Thrinkle Star Sprites

> The authoritative, implementable spec for making an **original, copyright-safe** homage **look** and **sound** like *Twinkle Star Sprites* (ADK, Neo Geo MVS, 1996). Concrete enough to build from. Hex values and pixel dimensions here are matched to the renderer (`src/render/sprites.ts`, `backgrounds.ts`, `pixelfont.ts`, `src/config/characters.ts`); treat those files as the source of truth and this doc as the rationale + extension spec.
>
> **Uncertainty markers:** `[VERIFIED]` = corroborated by primary sources / the game-mechanics bible. `[EVOKE]` = a stylistic choice we adopt to *feel* like the original where the original is undocumented — implement freely, it is ours. `[UNVERIFIED]` = a plausible-but-unconfirmed claim about the original; do not present as fact and do not copy-match.
>
> Produced by a 19-agent research+adversarial-verification workflow (2026-06-11). Companion to `GAME_MECHANICS.md` (mechanics bible) and `FIDELITY_GAPS.md` (backlog).

---

## 1. Art direction north star

Bright, candy-saturated "kawaii fairyland" on the surface — pastel-and-neon skies, round chibi sprites with dot eyes and permanent smiles, a permanently delighted tone — wrapped around frantic, nerve-wracking competitive play. The defining trick of the original is **incongruity**: the cuter and happier it looks, the more shocking the intensity feels, so the visuals should never telegraph difficulty — they should stay cheerful while the screen fills with chaos. Everything reads instantly at a glance (color-coded enemies, color-coded attacks) because the game is too fast to parse anything that isn't.

---

## 2. Resolution & pixel-art rules

- **Reference resolution: 320×224** (Neo Geo MVS standard). `[VERIFIED]` Author every sprite/UI element against this internal grid, then upscale. Each field is 160×224 internal units; nearest-neighbor scaling does the enlargement.
- **Nearest-neighbor only.** No bilinear, no smoothing, no anti-aliasing anywhere. Every texture is baked on a `1px = 1 unit` canvas and scaled crisp (`bake()` / `NEAREST`).
- **Integer coordinates in world space.** Sub-pixel positions may be *tracked* by the sim, but render to integer pixel boundaries. Sprite anchor is center so the hitbox center and visual center align.
- **1px outlines, flat fills.** Every sprite gets a 1px dark navy outline (`#2a1a3a`). Fills are flat color plus at most **one shadow tone and one highlight tone** per region — mirrors character artist Mimori Fujinomiya's documented approach. `[VERIFIED]` No gradients on sprites; gradients are reserved for sky backgrounds only.
- **Palette discipline / "color doubling."** The Neo Geo's real constraint was 15 visible colors + transparency per 16×16 sprite, expanded by *layering* two sprites to fake more colors. `[VERIFIED]` Adopt the discipline: tight ~6–10 color set per sprite; for richer looks, **layer two semi-transparent passes** (firefly wings, fireball glow trails) rather than a gradient.
- **Animation budget is tiny and that's correct.** ±1px vertical bob (even/odd frame), ±1px wing/hair flap. Avoid tweened/smooth animation.
- **Optional scanline overlay** `[EVOKE]`: a faint 1px-every-2px dark line at ~10–15% opacity sells the CRT-cabinet feel. Subtle, toggleable.

---

## 3. Color palette

### Core / universal
| Role | Hex | Notes |
|---|---|---|
| Sprite outline (navy) | `#2a1a3a` | every sprite, 1px |
| Eye / pupil dark | `#3a2150` (lit) / `#241038` (zako) | dark, never pure black |
| Skin / cream | `#ffe0c2` | all chibi faces |
| White core / sparkle | `#ffffff` / `#fff6d0` | highlights, twinkles |

> **Avoid pure black** (`#000000`). Use dark navy/purple in its place. `[VERIFIED]`

### Sky backgrounds (3 themes)
Bright fantasy skies — **not** a dark starfield. `[VERIFIED — adversarial correction applied]`

| Theme (seat) | top | mid | low | cloud / shade | orb | hill |
|---|---|---|---|---|---|---|
| **dawn** (Stella) | `#3b2a6a` | `#ff9ec4` | `#ffe0a8` | `#ffd9ec` / `#ffb0d0` | `#fff1b0` | `#c77ab0` |
| **day** (Komet) | `#2a6cd0` | `#73c4ff` | `#d6f1ff` | `#ffffff` / `#cfe6ff` | `#fff6c8` | `#6fb86f` |
| **dusk** (Lumen) | `#281a5a` | `#8a52b8` | `#ff9ed0` | `#e9c4ff` / `#b98ad8` | `#ffd0e6` | `#6a4a9a` |

### Zako durability tiers (universal, color = remaining HP)
Load-bearing gameplay readout, not decoration — consistent across all stages. `[VERIFIED]`

| HP | Tier | Hex |
|---|---|---|
| 5 | Purple/Pink | `#b46cff` |
| 4 | Blue | `#5b8cff` |
| 3 | Green | `#5fd36a` |
| 2 | Yellow | `#ffe04d` |
| 1 | Red | `#ff5d5d` |

### Attack projectiles (color = sender identity)
| Element | Hex | Notes |
|---|---|---|
| P1 fireball | `#ff6fb7` | original P1 is **orange**; our roster maps P1→Stella pink (deliberate roster choice) `[VERIFIED orange in original]` |
| P2 fireball | `#9a6cff` | original P2 is **blue/purple** |
| Reverse mark | `#fff2a8` | yellow chevrons on flipped fireballs; original reverse flashes green/purple `[VERIFIED]` |
| Fever yellow | `#ffe04d` / `#ffff00` | character + fireballs flash yellow during fever `[VERIFIED]` |

### Effects & HUD accents
| Element | Hex |
|---|---|
| Explosion outer / inner / twinkle | `#ffb24d` / `#fff0b8` / `#fff6d0` |
| Heart full / half-right / empty | `#ff4d7a` / `#ff9ab8` / `#5a2a3a` |
| Charge gauge fill | `#ff4400`→`#ff8800` (red→orange) |
| Bomb coin body / inner / 'B' | `#ff8ab8` / `#ffc4dd` / `#5a1a3a` |
| Fever orb | `#4488ff` body, crescent in `#cfe6ff`/white |

---

## 4. Backgrounds

Bright fantasy sky per seat, banded into soft pixel gradients on upscale, with one scrolling cloud parallax layer. Static thematic set-pieces, **not** action-scrolling — the original's "vertical scroll" is enemy formation entry from the top, not background scroll; no parallax depth layering is documented. `[VERIFIED — adversarial correction applied]` Backgrounds drift, they do not strobe; all visual energy goes to enemies, fireballs, explosions.

**Layers (back→front):** sky gradient (static) → soft sun/moon orb (stacked translucent circles) → faint upper twinkles (~18 small stars @35%, gentle, not a starfield) → distant rolling hills (summed sines) → cloud parallax strip (the only animated bg layer, slow drift).

**Per-stage theming** `[EVOKE, informed by VERIFIED stage list]`: the original had six themed stages (FORRETT land, ACHELIS water, CLOUDIA sky, FREEZIA ice, MEVIOUS CASTLE, WONDER WORLD space). Our 3-seat homage maps to **dawn / day / dusk** tied to the three characters. Rule when adding stages: theme the background only; **zako sprite colors stay universal** so durability stays readable.

---

## 5. Zako fairy design + chain explosion look

**Zako:** 16×16px round fairy creatures, **color = HP tier**. One design, five recolors — deliberate cute homogeneity. `[VERIFIED]` Body = outlined circle + upper-left highlight; two small shaded wings flapping ±1px; white square eyes + dark pupils + short smile; a pale-gold 4-point head twinkle. Author 3–4 subtle size variants for formation depth `[EVOKE]`.

**Bubbled (shabon) zako:** a zako in a semi-transparent bubble. **One shot pops the bubble instantly**; inner zako is invulnerable ~0.5s during the pop. A chain-breaking nuisance, **not** a two-stage shield. `[VERIFIED — adversarial correction applied]`

**Chain explosions** — the single most important effect (the original iterated it 10+ times). `[VERIFIED]` Radial 6-frame starburst: white core (2 frames) → 6-point orange star (`#ffb24d`) + warm-cream inner star (`#fff0b8`), radii scaling with progress, alpha fading; scatter yellow sparkle pixels (`#fff2a8`) past frame 2. **Scale with source:** purple(5HP) blast ≈ 48px, red(1HP) ≈ 16px `[VERIFIED scaling]`. Explosion **active frames outlive the visible animation** `[VERIFIED]`. Stagger adjacent explosions ~2 frames so a chain reads as a wave `[EVOKE]`. (No documented victory-only full-screen sparkle spectacle — don't build one. `[adversarial correction]`)

---

## 6. Fireballs / extra attacks / boss + spawn telegraphs

**Fireballs:** comet projectiles, color by sender, sized by the combo hit-index. Radii: small 4px (hits 2–5) → med 5.5 → big 7 → biggest 8.5 (16th+) `[VERIFIED tiers]`. Navy outline, sender body, lighter core, white highlight, upward 3-circle flame trail. **Reverse:** slightly faster, 8 yellow chevrons (`#fff2a8`) pulsing ~3–4Hz (original flashes green/purple). **Fever:** overlay yellow flash on the body, spawn rate multiplies. `[VERIFIED]`

**Extra attacks** (indestructible, dodge only): unique creature per character. Generic "cute predator" 24×22px orange creature, tall ears, *angry* dark-red eyes, fanged mouth. Movement personalities from the original `[VERIFIED]`: arc-and-home, 90°-turning space-filler, edge-climb-then-dive, homing curve.

**Boss** (3+ fireballs chain-destroyed): big plush-beast filling the field. Generic ~52×46px purple plush (concentric body circles, tall ears, big eyes, blush cheeks). **Spawn telegraph (critical):** boss appears top-center and **flashes white ~1s with NO hit detection**, then gains its hurtbox `[VERIFIED]`. Red flash on hit; gray/dim while stunned; killing a boss erases all its attacks `[VERIFIED]`. Telegraph every strike with a visible windup.

---

## 7. Character design language (3 original chibi sprites)

Three archetypes, 24×28px, one construction grammar: round cream head (~1/3 height), navy 1px outline, flat fills + one shadow tone, dot eyes (`#3a2150`), short smile, ±1px idle bob.

- **Stella — pink star-witch (dawn):** dress `#ff6fb7`, hair `#fff0a8`, accent `#ffd1e8`. Pointed witch hat + pale band, wand sparkle. **Underslung broom** (brown handle, gold bristles) — under her, never hand-held `[EVOKE — copyright-distancing]`.
- **Komet — cyan comet-kid (day):** suit `#4fd2ff`, spiky hair `#2a6cff`, accent `#c9f2ff`. Goggles instead of a hat; **double-star stardust tail** from upper-left. No counterpart in the original — our invention.
- **Lumen — golden firefly-sprite (dusk):** body `#ffd75e`, antennae/glow `#ff9e3d`, accent `#fff3c4`. Glowing abdomen; **large translucent layered wings** (the color-doubling trick); antennae with tiny star tips.

> **Roster note:** the original's 13 characters are cute witch/wizard/creature archetypes. There is **no comet-kid** in the original. Do not present any of our three as a renamed original character.

---

## 8. HUD layout & typography

Two (here: three) independent playfields, each framed by its own HUD; a bright center divider separates fields. `[VERIFIED]` Per field top→bottom:

- **Score** — top, chunky bitmap font, white/bright-yellow, monospaced digits. `[VERIFIED]`
- **Hearts** — below score. Up to **5 hearts, half-heart increments** (you can't die from popcorn enemies — min 0.5). Full `#ff4d7a`; half = left full / right `#ff9ab8`; empty `#5a2a3a`. `[VERIFIED]`
- **Charge gauge** — bottom corner (P1 bottom-left, P2 bottom-right). Three marked zones **1 / 2 / MAX**, fills red→orange (`#ff4400`→`#ff8800`). `[VERIFIED]`
- **Bomb stock** — circled **'B'** coins. Start with 2, **max display 3** (not 4). `[VERIFIED max=3]`
- **No visible round timer.** `[VERIFIED]` (Ours shows one as a Death-reaper stand-in — see FIDELITY_GAPS.)

**Special-item warnings:** a flashing **`!!`** from the top telegraphs incoming fever orbs / coins / all-bubble formations. `[VERIFIED]`

**Typography:** the 5×7 bitmap font (`pixelfont.ts`), uppercase + digits + punctuation, baked NEAREST. Chunky arcade letterforms. The original's *exact* title typeface is undocumented — ours is an original design. `[adversarial correction: title font UNVERIFIED]`

---

## 9. Title screen / banners

**Title** `[EVOKE — original logo/title art undocumented]`: bright sky + cloud parallax; a large hand-drawn **happy star** central motif (the original's iconic "one ridiculously happy star" `[VERIFIED motif]` — draw our own, do not reproduce ADK's); title in the 5×7 font, large, multicolor; gentle star twinkle; ±1px bob.

**In-game banners** (chunky font, brief, punchy):
- **FEVER** — large yellow flashing letters on fever activation (triggered by the blue crescent fever orb). `[VERIFIED]`
- **CHAIN / combo count** — cascading numbers rising from the kill, white/yellow, scale-and-fade `[EVOKE readability addition]`.
- **PERFECT** — single enemy's chain clears the whole formation; multicolor cycling letters, grants bonus charge. `[VERIFIED mechanic]`
- **VS / ROUND / WIN** — split-screen VS + divider is `[VERIFIED]`; specific banner art is not documented — design restrained own banners. Don't invent a documented-looking victory spectacle. `[adversarial correction]`

---

## 10. Music direction

Style: **"impossibly upbeat" J-pop / disco-fusion chiptune** — cheerful to the point of incongruity. `[VERIFIED style]` Original hardware: **Yamaha YM2610 (4 FM + 3 SSG square + 1 noise + 6 ADPCM-A + 1 ADPCM-B = 14 ch)** `[VERIFIED]`. Emulate its *character* in WebAudio.

- **Tempo:** title ~140–155 BPM; battle ~160+ BPM. 4/4. `[EVOKE]`
- **Key/scale:** bright C/F/G/D major, leaning **major pentatonic** (1-2-3-5-6) + diatonic 4/7 lifts. Progressions I–V, I–IV–V, I–vi–IV–V. `[EVOKE]`
- **Instrumentation:** Lead = square (snappy 10–20ms attack, light vibrato, optional bitcrush). Harmony = triangle 16th-note arpeggios (fake full chords). Bass = sawtooth walking 8ths, low-pass ~4kHz. Drums = noise (kick LP~200Hz, snare ~4kHz, hat HP~8kHz); kick on 1+syncopated 8th, snare 2&4, 16th hats.
- **ADSR:** Lead A10–20/D20/S0.7/R30 · Harmony A20/D50/S0.8/R80 · Bass A5/D100/S0.9/R150 · Drums A0/D80–150/S0/R0 (ms).
- **Title theme:** 32–64 bar arch (arpeggio intro → pentatonic peak → IV→V→I lift → fuller restatement). **Battle loop:** denser/faster, walking bass, driving kick/snare, 16th lead runs + counter-melody arp.

---

## 11. SFX direction

Bright, punchy, high-presence (5–8kHz), percussive/staccato. Pair every bright hit with a yellow/white visual flash. FM-style bells = sine carrier + sine modulator (high index); impacts = pitched tone + filtered noise.

| Event | Sonic character |
|---|---|
| **Fireball fire** | up-sweep ~250→1.5kHz over 80–120ms + brief noise; pitch rises with combo depth; ±50–100¢ random |
| **Zako pop** | sine burst 220–440Hz, ~50ms, soft env; pitch by tier |
| **Explosion** | percussive pop: ~20ms attack, FM tone + pink-noise, 1.5kHz→200Hz decay over 200–300ms |
| **Chain escalation** | ascending arpeggio, ~60–80ms/note, major steps, climbing pitch+volume per link |
| **Reverse/reflect** | crystalline FM bell ping, 7–9kHz shimmer, staccato 100–150ms, slight downward tail bend |
| **Fever activate** | celebratory bitcrushed voice-style shout + ascending fanfare (C5-E5-G5), 300–400ms |
| **Bomb** | downward FM sweep 1.5kHz→300Hz over 400–600ms + pink-noise wipe, longer tail |
| **Boss spawn** | low ~80Hz rumble under the 1s white-flash |
| **Coin / item** | bright plink (sine ~1kHz, ~80ms) + sparkle tail |
| **Win / lose** | win = ascending major run; lose = descending minor; both brief (2–5s) |
| **Voice chirps** | high, cute, giggly, bitcrushed, 200–500Hz, <50ms attack, short reverb |

**Mix:** music is the floor; projectiles ~20–30dB above, explosions ~10–15dB; short 0.2–0.5s reverb tail; pan projectiles by screen x.

---

## 12. Fidelity vs originality — the copyright line

The repo is **public and publicly hosted**: **evoke the feel, never copy an ADK asset.**

**Do (evoke):** the kawaii-cute-over-frantic tone; bright candy palette; color-doubling look; **gameplay-functional conventions** (color-coded zako tiers, sender-colored fireballs, fever-yellow flash, boss white-spawn-flash, `!!` warnings, split-screen + divider, charge gauge 1/2/MAX, heart meter — these are rules/affordances, not copyrightable art); upbeat major-pentatonic chiptune; our own characters/font/happy-star motif.

**Don't (never):** reproduce/trace any ADK sprite, the original logo/title typeface, character designs, boss creatures, background art; rip/sample original music or voice; reuse original character names or one-to-one renames.

**Distancing baked in:** Stella's broom underslung not hand-held; Komet (goggles + stardust) has no original counterpart; Lumen's translucent wings + bioluminescent abdomen; boss/extra creatures are generic plush "cute predators." **When unsure:** if an element can't be derived from a documented *mechanic*, design it fresh. The goal is *"this feels like that kind of game,"* never *"this is that game's art."*
