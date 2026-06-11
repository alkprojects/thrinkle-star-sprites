# Thrinkle Star Sprites

A three-player browser homage to the Neo Geo classic **Twinkle Star Sprites** (ADK, 1996) — the competitive cute-'em-up where chaining enemy explosions hurls attacks into your opponents' fields, shooting down incoming attacks reflects them back, and reflection wars escalate until someone's screen is a wall of fire.

This version asks: what if there were **three** of you?

- 🎮 **Play: https://thrinkle-star-sprites.pages.dev**
- 🧠 Original-game mechanics reference: [docs/GAME_MECHANICS.md](docs/GAME_MECHANICS.md)
- 🔀 What changes with 3 players: [docs/ADAPTATION.md](docs/ADAPTATION.md)

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # simulation tests
npm run build    # typecheck + production build
npm run deploy   # deploy to Cloudflare Pages
```

The game simulation (`src/sim/`) is pure and deterministic — fixed 60Hz tick, seeded RNG — with rendering (PixiJS) layered on top. All gameplay tuning lives in [src/config/balance.ts](src/config/balance.ts).

## Legal

This is an unaffiliated fan tribute. All art, audio, names, and code are original; no assets from the original game are used. Twinkle Star Sprites is the property of SNK (ADK).
