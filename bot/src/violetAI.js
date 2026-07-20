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
} = require('../float-chess-engine.js');

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

function scoreMove(board, color, move, lastMove) {
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

  // Anti-repeat — Violet won't propose the literal same move twice in
  // a row, and won't walk a piece straight back where it just came
  // from either. Both patterns show up because of "crossing streams":
  // when two pieces try to swap into each other's current squares
  // simultaneously, the swap bounces and neither piece actually
  // moves — the board is unchanged, so a plain best-move evaluator
  // would propose the exact same collision every turn. And even when
  // a move DOES succeed, two greedy evaluators with nothing else
  // better to do will happily walk the same piece back and forth
  // between the same two squares forever. Checking both the literal
  // repeat and the reversal is what actually breaks the loop.
  if (lastMove && lastMove[move.piece.id]) {
    const last = lastMove[move.piece.id];
    const isExactRepeat = last.from.r === move.from.r && last.from.c === move.from.c &&
      last.to.r === move.to.r && last.to.c === move.to.c;
    const isReversal = last.from.r === move.to.r && last.from.c === move.to.c &&
      last.to.r === move.from.r && last.to.c === move.from.c;
    if (isExactRepeat || isReversal) {
      score -= 100;
    }
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

  game.aiLastMove = game.aiLastMove || {};

  let best = legalMoves[0];
  let bestScore = -Infinity;
  for (const m of legalMoves) {
    // Smaller jitter than Pennywise's evaluator — reads as more
    // deliberate, less chaotic, in keeping with her character.
    const s = scoreMove(game.board, color, m, game.aiLastMove) + Math.random() * 0.1;
    if (s > bestScore) { bestScore = s; best = m; }
  }

  game.aiLastMove[best.piece.id] = { from: { r: best.from.r, c: best.from.c }, to: { r: best.to.r, c: best.to.c } };

  const move = { from: toAlg(best.from), to: toAlg(best.to) };

  const lastRank = color === 'w' ? 7 : 0;
  if (best.piece.type === 'P' && best.to.r === lastRank) {
    move.promotion = 'Q';
  }

  return move;
}

module.exports = { chooseMove, enumerateLegalMoves, scoreMove };
