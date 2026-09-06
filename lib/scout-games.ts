export const SCOUT_GAMES = ['pokemon', 'one_piece', 'riftbound'] as const;

export type ScoutGame = (typeof SCOUT_GAMES)[number];

export const SCOUT_GAME_LABELS = {
  pokemon: 'Pokémon',
  one_piece: 'One Piece TCG',
  riftbound: 'Riftbound',
} as const satisfies Record<ScoutGame, string>;

export function scoutGameLabel(game: ScoutGame): string {
  return SCOUT_GAME_LABELS[game];
}
