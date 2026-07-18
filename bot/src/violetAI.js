/**
 * VIOLET AI — move selection
 * ──────────────────────────
 * Same architecture and same scope-limits as pennywiseAI.js (see that
 * file's header for why move-picking and dialogue are kept separate).
 * The evaluator itself is intentionally different in character:
 * Violet plays more cautiously than Pennywise's pure-greedy evaluator —
 * she checks whether a move would leave her own piece capturable next
 * turn (a one-ply lookahead on safety, not just material grab) and
 * she has less randomness in her move selection. This is meant to
 * read as "methodical" rather than "flashy," matching her voice —
 * it is still just a heuristic, not a strong chess engine.
 */

'use strict';

const {
  toRC,
  toAlg,
  pseudoLegalMoves,
  moveIsSafe,
  isColorInCheck,
  isSquareAttacked,
} = require('../../float-chess-engine.js');

const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

const CENTER_BONUS = (r, c) => {
  const dr = Math.abs(3.5 - r), dc = Math.abs(3.5 - c);
  return (3.5 - Math.max(dr, dc)) * 0.05;
};

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
  if (target) score += PIECE_VALUE[target.type] * 10;
  score += CENTER_BONUS(move.to.r, move.to.c);

  const scratch = applyMoveToScratchBoard(board, move.from, move.to);
  const otherColor = color === 'w' ? 'b' : 'w';
  if (isColorInCheck(scratch, otherColor)) score += 2;

  // DESIGN CALL — the trait that actually differentiates Violet from
  // a pure greedy evaluator: after making the move, would the moved
  // piece now sit on a square the opponent attacks? If so, treat that
  // as a real cost, roughly the value of the piece she's exposing
  // (minus a small allowance for cases where it's a fair trade —
  // this is still a 1-ply heuristic, not a real exchange evaluator,
  // so it won't catch every tactic, just the obvious hangs).
  if (isSquareAttacked(scratch, move.to, otherColor)) {
    score -= PIECE_VALUE[move.piece.type] * 8;
  }

  return score;
}

/**
 * Picks Violet's move for this turn. Same contract as
 * pennywiseAI.chooseMove: looks only at the pre-turn board, so
 * neither side has an information advantage.
 */
function chooseMove(game, color) {
  const legalMoves = enumerateLegalMoves(game.board, color);
  if (legalMoves.length === 0) return null;

  let best = legalMoves[0];
  let bestScore = -Infinity;
  for (const m of legalMoves) {
    // Smaller jitter than Pennywise's evaluator — reads as more
    // deliberate, less chaotic, in keeping with her character.
    const s = scoreMove(game.board, color, m) + Math.random() * 0.1;
    if (s > bestScore) { bestScore = s; best = m; }
  }

  const move = { from: toAlg(best.from), to: toAlg(best.to) };

  const lastRank = color === 'w' ? 7 : 0;
  if (best.piece.type === 'P' && best.to.r === lastRank) {
    move.promotion = 'Q';
  }

  return move;
}

module.exports = { chooseMove, enumerateLegalMoves, scoreMove };
