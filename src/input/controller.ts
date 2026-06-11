import type { SimState, PlayerInput } from '../sim/types';

/** Anything that can occupy a seat — human input device or AI brain. */
export interface Controller {
  getInput(state: SimState, seat: number): PlayerInput;
}

const MOVE_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  fire: ['KeyX', 'Space'],
  bomb: ['KeyZ', 'ShiftLeft', 'ShiftRight'],
  targetToggle: ['KeyT'],
};

export class KeyboardController implements Controller {
  private down = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.down.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  getInput(): PlayerInput {
    const left = this.any(MOVE_KEYS.left);
    const right = this.any(MOVE_KEYS.right);
    const up = this.any(MOVE_KEYS.up);
    const down = this.any(MOVE_KEYS.down);
    return {
      moveX: left && !right ? -1 : right && !left ? 1 : 0,
      moveY: up && !down ? -1 : down && !up ? 1 : 0,
      fire: this.any(MOVE_KEYS.fire),
      bomb: this.any(MOVE_KEYS.bomb),
      targetToggle: this.any(MOVE_KEYS.targetToggle),
    };
  }
}
