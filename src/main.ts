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
  // Self-centered view: solo build is seat 0 (YOU centre, the 2 AI flank). In netplay
  // each client passes its own seat. Sim is seat-symmetric — this is presentation only.
  const renderer = new Renderer(cfg, 0);
  await renderer.init(document.getElementById('app')!);

  const sfx = new Sfx();
  const keyboard = new KeyboardController();
  let controllers: Controller[] = [];
  let sim: SimState | null = null;
  let screen: Screen = 'title';
  let last = performance.now();
  let acc = 0;
  renderer.showTitle();
  sfx.setScene('title');

  function newMatch(): void {
    const seed = Date.now() >>> 0; // render-side seeding is fine; the sim itself stays deterministic
    sim = createSim(cfg, seed);
    controllers = [
      keyboard,
      new AiController(cfg, 'normal', seed ^ 0xaaaa1111),
      new AiController(cfg, 'normal', seed ^ 0x5555eeee),
    ];
    screen = 'playing';
    acc = 0; // don't fast-forward whatever real time passed on the menu
    renderer.hideOverlay();
    sfx.setScene('battle');
  }

  function endMatch(): void {
    screen = 'gameover';
    renderer.showGameOver(sim!.winner);
    sfx.setScene('gameover');
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    sfx.unlock();
    if (e.code === 'KeyM') sfx.toggleMute();
    if (e.code === 'Enter' && screen !== 'playing') newMatch();
  });

  // DEV-only manual stepping hook. Headless preview pages are `document.hidden`, which
  // pauses requestAnimationFrame and freezes the rAF-driven loop — so verification tools
  // drive ticks directly through this instead. No effect on the real (visible) game.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: unknown }).__game = {
      start: newMatch,
      /** Match where ALL seats are AI-driven — for representative capture footage. */
      startAllAi: (): void => {
        newMatch();
        controllers[0] = new AiController(cfg, 'normal', 0x1337c0de);
      },
      /** Re-point the self-centered view at a different seat (verify the lane mapping). */
      setLocalSeat: (seat: number): void => renderer.setLocalSeat(seat),
      step(n = 1): void {
        if (!sim || screen !== 'playing') return;
        for (let i = 0; i < n; i++) {
          const inputs = controllers.map((c, seat) => c.getInput(sim!, seat));
          tickSim(sim!, inputs, cfg);
          sfx.handle(sim!.events);
          renderer.applyEvents(sim!.events, sim!);
          renderer.tickVisuals();
          if (sim!.phase === 'over') {
            endMatch();
            break;
          }
        }
        renderer.draw(sim!);
        renderer.render();
      },
      get sim(): SimState | null {
        return sim;
      },
    };
  }

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
        renderer.tickVisuals();
        if (sim.phase === 'over') {
          endMatch();
          break;
        }
      }
      renderer.draw(sim);
    } else if (sim) {
      renderer.draw(sim);
    }
    renderer.render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

void start();
