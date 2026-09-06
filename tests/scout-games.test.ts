import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCOUT_GAMES,
  SCOUT_GAME_LABELS,
  scoutGameLabel,
} from '../lib/scout-games.ts';

void test('Scout Board games have stable canonical values and visible labels', () => {
  assert.deepEqual(SCOUT_GAMES, ['pokemon', 'one_piece', 'riftbound']);
  assert.deepEqual(SCOUT_GAME_LABELS, {
    pokemon: 'Pokémon',
    one_piece: 'One Piece TCG',
    riftbound: 'Riftbound',
  });
  for (const game of SCOUT_GAMES)
    assert.equal(scoutGameLabel(game), SCOUT_GAME_LABELS[game]);
});
