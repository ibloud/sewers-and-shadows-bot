/**
 * PENNYWISE AI — move selection
 * ─────────────────────────────
 * This is deliberately NOT the same thing as pennywisePersona.js.
 * This module picks a legal move. The persona module writes flavor
 * text about whatever move got picked. Keeping them separate means
 * a bad LLM response never produces an illegal or nonsensical move —
 * the engine only ever receives moves that this module has already
 * checked against the rules.
 *
 * Strategy: a simple 1-ply greedy evaluator (material + a few
 * heuristics), NOT a strong chess engine. The point of this bot is
 * personality and the Float Chess variant's chaos, not competitive
 * strength. If you want a stronger opponent later, this is the file
 * to swap out — everything else (persona, Discord layer, engine)
 * doesn't need to know or care how moves get chosen.
 */

'use strict';

const {
  toRC,
  toAlg,
  pseudoLegalMoves,
  moveIsSafe,
  isColorInCheck,
} = require('../float-chess-engine.js');

const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

// Small positional nudge toward the center, so the bot doesn't play
// like it's only ever grabbing material — purely cosmetic weighting.
const CENTER_BONUS = (r, c) => {
  const dr = Math.abs(3.5 - r), dc = Math.abs(3.5 - c);
  return (3.5 - Math.max(dr, dc)) * 0.05;
};

/**
 * Enumerate every legal standard move for `color` on the given board.
 * Does NOT include the once-per-game specials (float jump, mirror
 * shift, sewer slide, red balloon) — those are chosen separately,
 * occasionally, for flavor (see maybeChooseSpecial below), since
 * they're precious one-time resources and shouldn't be spent by a
 * generic greedy evaluator.
 */
function enumerateLegalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      for (const m of pseudoLegalMoves(board, r, c)) {
        if (moveIsSafe(board, { r, c }, m)) {
          moves.push({ from: { r, c }, to: m, piece });
        }
      }
    }
  }
  return moves;
}

function applyMoveToScratchBoard(board, from, to) {
  const scratch = board.map(row => row.map(cell => (cell ? { ...cell } : null)));
  scratch[to.r][to.c] = scratch[from.r][from.c];
  scratch[from.r][from.c] = null;
  return scratch;
}

function scoreMove(board, color, move) {
  let score = 0;
  const target = board[move.to.r][move.to.c];
  if (target) score += PIECE_VALUE[target.type] * 10; // captures matter most
  score += CENTER_BONUS(move.to.r, move.to.c);

  const scratch = applyMoveToScratchBoard(board, move.from, move.to);
  const otherColor = color === 'w' ? 'b' : 'w';
  if (isColorInCheck(scratch, otherColor)) score += 2; // reward giving check

  // Mild preference for not leaving high-value pieces "hanging" is
  // out of scope for a 1-ply greedy evaluator — flagged as a known
  // limitation, not a bug. A stronger engine would need at least a
  // 2-ply search (see file header) to catch that.

  return score;
}

/**
 * Picks Pennywise's move for this turn. Returns a move object shaped
 * like what FloatChessGame.submitMove expects: { from, to, special?, promotion? }.
 * `game` must not have had its board mutated yet this turn — this
 * looks only at the PRE-turn board, same as the human's move, so
 * neither side has an information advantage (true simultaneity).
 */
function chooseMove(game, color) {
  const legalMoves = enumerateLegalMoves(game.board, color);
  if (legalMoves.length === 0) return null; // no legal move (stalemate/checkmate already being decided elsewhere)

  let best = legalMoves[0];
  let bestScore = -Infinity;
  for (const m of legalMoves) {
    const s = scoreMove(game.board, color, m) + Math.random() * 0.3; // small jitter so play isn't robotically deterministic
    if (s > bestScore) { bestScore = s; best = m; }
  }

  const move = { from: toAlg(best.from), to: toAlg(best.to) };

  // Auto-queen on promotion — Pennywise doesn't do underpromotion for flavor.
  const lastRank = color === 'w' ? 7 : 0;
  if (best.piece.type === 'P' && best.to.r === lastRank) {
    move.promotion = 'Q';
  }

  return move;
}

module.exports = { chooseMove, enumerateLegalMoves, scoreMove };
