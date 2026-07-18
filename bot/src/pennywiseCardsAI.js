/**
 * PENNYWISE CARDS AI
 * ──────────────────
 * Chooses which card Pennywise plays each round. Simple, in-character
 * heuristic (favors high cards to press an aggressive lead, holds low
 * cards back when he already has the RP edge) — swap for something
 * smarter later without touching callers.
 */

'use strict';

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function rankOf(card) {
  return RANK_VALUE[card.slice(0, -1)];
}

/**
 * @param {FloatCardsGame} game
 * @param {'w'|'b'} side - which side Pennywise is playing this game
 * @returns {string|null} the chosen card, or null if hand is empty
 */
function chooseMove(game, side) {
  const hand = game.handFor(side);
  if (!hand.length) return null;

  const sorted = [...hand].sort((a, b) => rankOf(b) - rankOf(a));
  const rpMine = side === 'w' ? game.rp.w : game.rp.b;
  const rpTheirs = side === 'w' ? game.rp.b : game.rp.w;

  // Behind on RP: throw the highest card, force a swing.
  if (rpMine < rpTheirs) return sorted[0];

  // Ahead on RP: play conservatively, keep the big cards in reserve.
  if (rpMine > rpTheirs) return sorted[sorted.length - 1];

  // Even: play the middle of the hand.
  return sorted[Math.floor(sorted.length / 2)];
}

module.exports = { chooseMove };
