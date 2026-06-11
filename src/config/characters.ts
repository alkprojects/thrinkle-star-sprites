/**
 * Original characters (copyright-safe) — visual identity in the Twinkle Star Sprites
 * mold (cute chibi magical-fantasy sprites) WITHOUT copying any ADK asset. Each is a
 * distinct archetype that drives a procedural pixel-art sprite (see render/sprites.ts)
 * and a themed sky background (see render/backgrounds.ts).
 *
 * Per-character gameplay stats/attacks are a later feature (see PROJECT_PLAN.md); this
 * is purely presentation.
 */
export type CharKind = 'witch' | 'comet' | 'firefly';

export interface CharacterDef {
  name: string;
  /** Sprite archetype. */
  kind: CharKind;
  /** Main body / signature color (0xRRGGBB). */
  color: number;
  /** Accent / trail / shot color. */
  accent: number;
  /** Hair / secondary color for the chibi sprite. */
  hair: number;
  /** Sky-theme key for this seat's field background. */
  theme: 'dawn' | 'day' | 'dusk';
}

export const CHARACTERS: CharacterDef[] = [
  // Pink star-witch on a broom — the "Load Ran" baseline archetype.
  { name: 'Stella', kind: 'witch', color: 0xff6fb7, accent: 0xffd1e8, hair: 0xfff0a8, theme: 'dawn' },
  // Cyan comet-kid trailing stardust.
  { name: 'Komet', kind: 'comet', color: 0x4fd2ff, accent: 0xc9f2ff, hair: 0x2a6cff, theme: 'day' },
  // Golden firefly-sprite with glowing wings.
  { name: 'Lumen', kind: 'firefly', color: 0xffd75e, accent: 0xfff3c4, hair: 0xff9e3d, theme: 'dusk' },
];
