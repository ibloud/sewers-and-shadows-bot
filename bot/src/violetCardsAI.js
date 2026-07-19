/**
 * VIOLET CARDS AI
 * ───────────────
 * Chooses which card Violet plays each round. Mirrors
 * pennywiseCardsAI.js's shape exactly (same function signature,
 * same simple RP-based heuristic) so cardGameManager.js can call
 * either side identically. This is deliberately separate from
 * violetAI.js, which is chess-only (works on a board[r][c] grid,
 * not a hand of cards) — calling that one from the card game was
 * the bug that crashed the exhibition loop.
 */

'use strict';

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function rankOf(card) {
  return RANK_VALUE[card.slice(0, -1)];
}

/**
 * @param {FloatCardsGame} game
 * @param {'w'|'b'} side - which side Violet is playing this game
 * @returns {string|null} the chosen card, or null if hand is empty
 */
function chooseMove(game, side) {
  const hand = game.handFor(side);
  if (!hand.length) return null;

  const sorted = [...hand].sort((a, b) => rankOf(b) - rankOf(a));
  const rpMine = side === 'w' ? game.rp.w : game.rp.b;
  const rpTheirs = side === 'w' ? game.rp.b : game.rp.w;

  // Violet is clinical and calculated: behind on RP, she presses with
  // her strongest card to correct the balance fast.
  if (rpMine < rpTheirs) return sorted[0];

  // Ahead on RP: she plays it safe, conserving her best cards.
  if (rpMine > rpTheirs) return sorted[sorted.length - 1];

  // Even: she plays the middle of her hand.
  return sorted[Math.floor(sorted.length / 2)];
}

module.exports = { chooseMove };
