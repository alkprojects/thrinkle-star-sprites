import { AiController } from './ai/ai';
import { Sfx } from './audio/sfx';
import { DEFAULT_BALANCE } from './config/balance';
import { KeyboardController, type Controller } from './input/controller';
import { Renderer } from './render/renderer';
import { createSim, tickSim } from './sim/sim';
import type { SimState } from './sim/types';

const cfg = DEFAULT_BALANCE;
const TICK_MS = 1000 / 60;

type Screen = 'title' | 'playing' | 'gameover';

async function start(): Promise<void> {
  const renderer = new Renderer(cfg);
  await renderer.init(document.getElementById('app')!);

  const sfx = new Sfx();
  const keyboard = new KeyboardController();
  let controllers: Controller[] = [];
  let sim: SimState | null = null;
  let screen: Screen = 'title';
  renderer.showTitle();

  function newMatch(): void {
    const seed = Date.now() >>> 0; // render-side seeding is fine; the sim itself stays deterministic
    sim = createSim(cfg, seed);
    controllers = [
      keyboard,
      new AiController(cfg, 'normal', seed ^ 0xaaaa1111),
      new AiController(cfg, 'normal', seed ^ 0x5555eeee),
    ];
    screen = 'playing';
    renderer.hideOverlay();
  }

  window.addEventListener('keydown', (e) => {
    sfx.unlock();
    if (e.code === 'KeyM') sfx.toggleMute();
    if (e.code === 'Enter' && screen !== 'playing') newMatch();
  });

  let last = performance.now();
  let acc = 0;

  function frame(now: number): void {
    acc += now - last;
    last = now;
    acc = Math.min(acc, TICK_MS * 6); // avoid spiral of death after a background tab

    if (screen === 'playing' && sim) {
      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        const inputs = controllers.map((c, seat) => c.getInput(sim!, seat));
        tickSim(sim, inputs, cfg);
        sfx.handle(sim.events);
        renderer.applyEvents(sim.events, sim);
        if (sim.phase === 'over') {
          screen = 'gameover';
          renderer.showGameOver(sim.winner);
          break;
        }
      }
      renderer.draw(sim);
    } else if (sim) {
      renderer.draw(sim);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

void start();
