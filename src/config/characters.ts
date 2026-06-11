/**
 * Original characters (copyright-safe). Visual identity only for now —
 * per-character stats/attacks are a Phase 4 feature (see PROJECT_PLAN.md).
 */
export interface CharacterDef {
  name: string;
  /** Main body color */
  color: number;
  /** Accent / trail color */
  accent: number;
}

export const CHARACTERS: CharacterDef[] = [
  { name: 'Stella', color: 0xff6fb7, accent: 0xffd1e8 }, // pink star witch
  { name: 'Komet', color: 0x4fd2ff, accent: 0xc9f2ff }, // cyan comet kid
  { name: 'Lumen', color: 0xffd75e, accent: 0xfff3c4 }, // golden firefly sprite
];
