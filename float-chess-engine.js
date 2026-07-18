/**
 * FLOAT CHESS ENGINE
 * ──────────────────
 * A standalone, dependency-free rules engine for the "Sewers & Shadows"
 * duet chess variant. This module knows nothing about Discord, Pennywise,
 * or dialogue — it only tracks board state and emits structured EVENTS
 * that a presentation layer (the bot) can turn into flavor text.
 *
 * Design principle: two moves are submitted per turn (one per color) and
 * resolved SIMULTANEOUSLY, following the resolution order specified in
 * the design doc:
 *   1. Legality check
 *   2. Destination check   (feeding frenzy / crossing streams / ghost move)
 *   3. Capture check
 *   4. Special piece rules  (queen dance-off, rook sewer slide,
 *                            bishop mirror shift, knight float jump,
 *                            pawn red balloon, modified en passant/castling)
 *   5. Check / checkmate / stalemate
 *
 * Usage:
 *   const game = new FloatChessGame();
 *   game.submitMove('w', { from: 'e2', to: 'e4' });
 *   game.submitMove('b', { from: 'e7', to: 'e5' });
 *   // once both are in, the turn resolves automatically and
 *   // game.lastEvents holds what happened.
 *
 * NOTE ON RULES AMBIGUITY (flagged for the design team, not silently
 * resolved): a few abilities in the source doc are geometrically or
 * logically underspecified. Each is called out inline with a comment
 * starting "DESIGN CALL:" showing the interpretation this engine uses.
 * Those are the spots to double-check against what you actually want
 * before this ships.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Constants & basic helpers
// ─────────────────────────────────────────────────────────────

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const OTHER = { w: 'b', b: 'w' };

let PIECE_ID_COUNTER = 1;
function nextId() { return PIECE_ID_COUNTER++; }

/** Convert 'e4' -> { r: 4, c: 4 } (0-indexed, r=0 is rank 1 / white's back rank) */
function toRC(square) {
  const file = square[0].toLowerCase();
  const rank = parseInt(square.slice(1), 10);
  return { r: rank - 1, c: FILES.indexOf(file) };
}

/** Convert { r, c } -> 'e4' */
function toAlg(rc) {
  return FILES[rc.c] + (rc.r + 1);
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

function sameSquare(a, b) {
  return a.r === b.r && a.c === b.c;
}

/** Compact string key of board+color-to-move, used for threefold-repetition
 * detection. Intentionally ignores reserves/trails — the doc's repetition
 * rule is about the position (piece placement), not incidental state. */
function positionKey(board) {
  let s = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      s += p ? p.color + p.type : '.';
    }
  }
  return s;
}

// ─────────────────────────────────────────────────────────────
// Board setup
// ─────────────────────────────────────────────────────────────

/**
 * Builds the standard starting position.
 * Each occupied cell: { id, type: 'K'|'Q'|'R'|'B'|'N'|'P', color: 'w'|'b',
 *                        hasMoved: bool, usedSpecial: bool (per-piece once
 *                        abilities: knight float jump, bishop mirror shift) }
 */
function initialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

  for (let c = 0; c < 8; c++) {
    board[0][c] = mkPiece(backRank[c], 'w');
    board[1][c] = mkPiece('P', 'w');
    board[6][c] = mkPiece('P', 'b');
    board[7][c] = mkPiece(backRank[c], 'b');
  }
  return board;
}

function mkPiece(type, color) {
  return { id: nextId(), type, color, hasMoved: false, usedSpecial: false };
}

// ─────────────────────────────────────────────────────────────
// Standard piece movement (pseudo-legal, ignores simultaneous
// interactions — those are layered on top in FloatChessGame)
// ─────────────────────────────────────────────────────────────

const SLIDE_DIRS = {
  R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  Q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

const KNIGHT_OFFSETS = [
  [1, 2], [2, 1], [-1, 2], [-2, 1],
  [1, -2], [2, -1], [-1, -2], [-2, -1],
];

const KING_OFFSETS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Pseudo-legal destination squares for a piece at (r,c), not accounting
 * for whether the move leaves the mover's own king in check (that's
 * handled by isLegalMove / kingSafe below), and not accounting for
 * special abilities (float jump, mirror shift, red balloon, sewer
 * slide, castling) — those are additional legal options layered on.
 */
function pseudoLegalMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];

  if (piece.type === 'R' || piece.type === 'B' || piece.type === 'Q') {
    for (const [dr, dc] of SLIDE_DIRS[piece.type]) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const occ = board[nr][nc];
        if (!occ) {
          moves.push({ r: nr, c: nc });
        } else {
          if (occ.color !== piece.color) moves.push({ r: nr, c: nc });
          break;
        }
        nr += dr; nc += dc;
      }
    }
  } else if (piece.type === 'N') {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const occ = board[nr][nc];
      if (!occ || occ.color !== piece.color) moves.push({ r: nr, c: nc });
    }
  } else if (piece.type === 'K') {
    for (const [dr, dc] of KING_OFFSETS) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const occ = board[nr][nc];
      if (!occ || occ.color !== piece.color) moves.push({ r: nr, c: nc });
    }
  } else if (piece.type === 'P') {
    const dir = piece.color === 'w' ? 1 : -1;
    const startRank = piece.color === 'w' ? 1 : 6;
    // forward one
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ r: r + dir, c });
      // forward two from start rank
      if (r === startRank && !board[r + 2 * dir][c]) {
        moves.push({ r: r + 2 * dir, c, doubleStep: true });
      }
    }
    // captures
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const occ = board[nr][nc];
      if (occ && occ.color !== piece.color) moves.push({ r: nr, c: nc, capture: true });
    }
  }
  return moves;
}

/** Is `square` attacked by any piece of color `byColor`? */
function isSquareAttacked(board, square, byColor) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== byColor) continue;
      const moves = pseudoLegalMoves(board, r, c);
      // Pawns attack diagonally even onto empty squares, which
      // pseudoLegalMoves only lists as a move when there's a capture
      // target present — for attack-detection we need the diagonal
      // squares regardless of occupancy.
      if (p.type === 'P') {
        const dir = p.color === 'w' ? 1 : -1;
        for (const dc of [-1, 1]) {
          const nr = r + dir, nc = c + dc;
          if (inBounds(nr, nc) && nr === square.r && nc === square.c) return true;
        }
        continue;
      }
      if (moves.some(m => m.r === square.r && m.c === square.c)) return true;
    }
  }
  return false;
}

/** Find all king locations for a color (normally one, but color-swap
 * via Crossing the Streams can create more than one — see DESIGN CALL
 * in FloatChessGame.checkStatus). */
function findKings(board, color) {
  const kings = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'K' && p.color === color) kings.push({ r, c });
    }
  }
  return kings;
}

function isColorInCheck(board, color) {
  const kings = findKings(board, color);
  if (kings.length === 0) return false; // shouldn't happen mid-game
  return kings.some(k => isSquareAttacked(board, k, OTHER[color]));
}

/**
 * True legality: a pseudo-legal move that doesn't leave the mover's
 * own king (any of them, if more than one) in check.
 */
function moveIsSafe(board, from, to) {
  const test = cloneBoard(board);
  test[to.r][to.c] = test[from.r][from.c];
  test[from.r][from.c] = null;
  const color = board[from.r][from.c].color;
  return !isColorInCheck(test, color);
}

// ─────────────────────────────────────────────────────────────
// FloatChessGame
// ─────────────────────────────────────────────────────────────

class FloatChessGame {
  constructor() {
    this.board = initialBoard();
    this.reserves = { w: [], b: [] };       // captured pieces, by capturing color
    this.pending = { w: null, b: null };    // moves submitted this turn
    this.turn = 1;

    // Per-player once-per-game abilities
    this.usedSewerSlide = { w: false, b: false };
    this.usedRedBalloon = { w: false, b: false };

    // Which color gets the bonus reserve-steal on a Feeding Frenzy.
    // Per the design doc, that's Pennywise (black). Configurable so
    // the engine isn't hardcoded to one persona.
    this.frenzyBonusColor = 'b';

    // Trail tracking: { square: {r,c}, expiresAfterTurn: number, kind: 'sewer'|'balloon', ownerColor }
    this.trails = [];

    // Slowed pieces (stepped on a sewer trail): Map<pieceId, turnsRemaining>
    this.slowed = new Map();

    // For draw detection
    this.positionHistory = [];
    this.turnsSinceCaptureOrSpecial = 0;

    this.status = 'active'; // 'active' | 'checkmate-w' | 'checkmate-b' | 'stalemate' | 'draw'
    this.lastEvents = [];
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Submit one player's move for the current turn.
   * move: { from: 'e2', to: 'e4', promotion?: 'Q', special?: 'mirrorShift'|'floatJump'|'sewerSlide'|'redBalloon'|'castleK'|'castleQ' }
   * Returns { accepted: bool, reason?: string }. Resolution happens
   * automatically once both colors have a pending move.
   */
  submitMove(color, move) {
    if (this.status !== 'active') return { accepted: false, reason: 'game-over' };
    if (this.pending[color]) return { accepted: false, reason: 'already-submitted' };
    this.pending[color] = { ...move };
    if (this.pending.w && this.pending.b) {
      this.lastEvents = this._resolveTurn();
    }
    return { accepted: true };
  }

  /** Board snapshot as simple algebraic-keyed object, for rendering. */
  toJSON() {
    const squares = {};
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p) squares[toAlg({ r, c })] = { type: p.type, color: p.color };
      }
    }
    return {
      turn: this.turn,
      status: this.status,
      squares,
      reserves: this.reserves,
      trails: this.trails,
    };
  }

  // ── Internal: legality ──────────────────────────────────

  /**
   * Validates a submitted move against current board + declared
   * special ability, WITHOUT considering the other player's
   * simultaneous move (per Step 1: each move is checked independently).
   * Returns { legal: bool, reason?, meta? } where meta carries any
   * extra info the resolver needs (e.g. en-passant target, castle rook move).
   */
  _validateMove(color, move) {
    const from = toRC(move.from);
    const to = toRC(move.to);
    if (!inBounds(from.r, from.c) || !inBounds(to.r, to.c)) {
      return { legal: false, reason: 'off-board' };
    }
    const piece = this.board[from.r][from.c];
    if (!piece) return { legal: false, reason: 'no-piece' };
    if (piece.color !== color) return { legal: false, reason: 'wrong-color' };

    // ── Special ability moves override standard movement ──
    if (move.special === 'floatJump' && piece.type === 'N') {
      return this._validateFloatJump(piece, from, to);
    }
    if (move.special === 'mirrorShift' && piece.type === 'B') {
      return this._validateMirrorShift(piece, from, to);
    }
    if (move.special === 'sewerSlide' && piece.type === 'R') {
      return this._validateSewerSlide(color, piece, from, to);
    }
    if (move.special === 'redBalloon' && piece.type === 'P') {
      return this._validateRedBalloon(color, piece, from, to);
    }
    if (move.special === 'castleK' || move.special === 'castleQ') {
      return this._validateCastle(color, move.special, from, to);
    }

    // Piece is slowed (stepped on a sewer trail last turn) -> cannot move
    if (this.slowed.has(piece.id)) {
      return { legal: false, reason: 'slowed' };
    }

    // ── Standard movement ──
    const options = pseudoLegalMoves(this.board, from.r, from.c);
    const match = options.find(m => m.r === to.r && m.c === to.c);
    if (!match) {
      // Could still be a valid en-passant capture (diagonal onto an
      // empty square) — check that separately.
      if (piece.type === 'P') {
        const epMeta = this._checkEnPassantTarget(color, from, to);
        if (epMeta) return { legal: true, meta: epMeta };
      }
      return { legal: false, reason: 'illegal-shape' };
    }
    if (!moveIsSafe(this.board, from, to)) {
      return { legal: false, reason: 'leaves-king-in-check' };
    }
    return { legal: true, meta: { doubleStep: !!match.doubleStep } };
  }

  /**
   * DESIGN CALL — En Passant, modified for simultaneous play:
   * Because both players move the same turn, "the opponent just
   * double-moved" can only mean *this same turn's* submitted move.
   * We check the OTHER player's pending move to see if it's a pawn
   * double-step landing adjacent to this pawn, same as the doc's
   * "if Pawn A moves 2 squares... and Pawn B captures en passant on
   * the SAME turn" clause.
   */
  _checkEnPassantTarget(color, from, to) {
    const otherColor = OTHER[color];
    const otherMove = this.pending[otherColor];
    if (!otherMove) return null;
    const oFrom = toRC(otherMove.from);
    const oTo = toRC(otherMove.to);
    const otherPiece = this.board[oFrom.r] && this.board[oFrom.r][oFrom.c];
    if (!otherPiece || otherPiece.type !== 'P') return null;
    if (Math.abs(oTo.r - oFrom.r) !== 2) return null; // not a double step
    // The capturing pawn must move diagonally onto the square directly
    // "behind" the double-stepped pawn.
    const dir = color === 'w' ? 1 : -1;
    const behind = { r: oTo.r - dir, c: oTo.c };
    if (to.r === behind.r && to.c === behind.c && Math.abs(to.c - from.c) === 1) {
      return { enPassant: true, capturedSquare: oTo };
    }
    return null;
  }

  /**
   * DESIGN CALL — Float Jump (Knight): the doc says "extending the L
   * one additional square in the same direction" when the normal
   * landing square is blocked by a friendly piece. Interpreted here as
   * extending the LONG leg of the L by one square (e.g. (+2,+1)
   * becomes (+3,+1)), keeping the short leg fixed. Once per knight,
   * per game (tracked via piece.usedSpecial).
   */
  _validateFloatJump(piece, from, to) {
    if (piece.usedSpecial) return { legal: false, reason: 'float-jump-already-used' };
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const blockedR = from.r + dr, blockedC = from.c + dc;
      if (!inBounds(blockedR, blockedC)) continue;
      const blocker = this.board[blockedR][blockedC];
      if (!blocker || blocker.color !== piece.color) continue; // only relevant if blocked by friendly
      // extend the long leg (the one with magnitude 2) by one more
      const longIsRow = Math.abs(dr) === 2;
      const extR = longIsRow ? dr + Math.sign(dr) : dr;
      const extC = longIsRow ? dc : dc + Math.sign(dc);
      const landR = from.r + extR, landC = from.c + extC;
      if (landR === to.r && landC === to.c && inBounds(landR, landC)) {
        const occ = this.board[landR][landC];
        if (occ && occ.color === piece.color) return { legal: false, reason: 'landing-occupied-by-friendly' };
        if (!moveIsSafe(this.board, from, to)) return { legal: false, reason: 'leaves-king-in-check' };
        return { legal: true, meta: { floatJump: true } };
      }
    }
    return { legal: false, reason: 'no-blocked-knight-move-matches' };
  }

  /**
   * DESIGN CALL — Mirror Shift (Bishop): moving diagonally can never
   * change a bishop's square color (that's invariant in standard
   * chess coloring), so "moving diagonally to the nearest square of
   * the opposite color" is geometrically impossible as literally
   * written. The sensible reading that actually changes color
   * complex is a single ORTHOGONAL step (up/down/left/right), since
   * orthogonally-adjacent squares are always the opposite color.
   * Implemented that way — flag this for the design team to confirm.
   */
  _validateMirrorShift(piece, from, to) {
    if (piece.usedSpecial) return { legal: false, reason: 'mirror-shift-already-used' };
    const dr = to.r - from.r, dc = to.c - from.c;
    const isOrthogonalStep = (Math.abs(dr) === 1 && dc === 0) || (dr === 0 && Math.abs(dc) === 1);
    if (!isOrthogonalStep) return { legal: false, reason: 'mirror-shift-must-be-one-orthogonal-step' };
    const occ = this.board[to.r][to.c];
    if (occ) return { legal: false, reason: 'mirror-shift-destination-occupied' };
    if (!moveIsSafe(this.board, from, to)) return { legal: false, reason: 'leaves-king-in-check' };
    return { legal: true, meta: { mirrorShift: true } };
  }

  /**
   * Sewer Slide (Rook): once per PLAYER (not per rook) per game.
   * Moves as a normal rook slide, but marks every square passed
   * through (not the starting square, including the destination)
   * as trailed for one full turn cycle.
   */
  _validateSewerSlide(color, piece, from, to) {
    if (this.usedSewerSlide[color]) return { legal: false, reason: 'sewer-slide-already-used' };
    if (from.r !== to.r && from.c !== to.c) return { legal: false, reason: 'not-a-rook-line' };
    const dr = Math.sign(to.r - from.r), dc = Math.sign(to.c - from.c);
    const path = [];
    let r = from.r + dr, c = from.c + dc;
    while (inBounds(r, c)) {
      if (this.board[r][c]) {
        if (r === to.r && c === to.c && this.board[r][c].color !== color) break; // capture at end ok
        return { legal: false, reason: 'sewer-slide-path-blocked' };
      }
      path.push({ r, c });
      if (r === to.r && c === to.c) break;
      r += dr; c += dc;
    }
    if (!(path.length && path[path.length - 1].r === to.r && path[path.length - 1].c === to.c)) {
      return { legal: false, reason: 'sewer-slide-destination-unreachable' };
    }
    if (!moveIsSafe(this.board, from, to)) return { legal: false, reason: 'leaves-king-in-check' };
    return { legal: true, meta: { sewerSlide: true, trail: path } };
  }

  /**
   * Red Balloon (Pawn): once per PLAYER per game, a pawn may float
   * forward 2 squares regardless of prior movement, leaving a vapor
   * trail. Standard blocking rules still apply (can't jump a piece).
   */
  _validateRedBalloon(color, piece, from, to) {
    if (this.usedRedBalloon[color]) return { legal: false, reason: 'red-balloon-already-used' };
    const dir = color === 'w' ? 1 : -1;
    if (to.c !== from.c || to.r - from.r !== 2 * dir) return { legal: false, reason: 'not-a-two-square-push' };
    const mid = { r: from.r + dir, c: from.c };
    if (this.board[mid.r][mid.c] || this.board[to.r][to.c]) {
      return { legal: false, reason: 'red-balloon-path-blocked' };
    }
    if (!moveIsSafe(this.board, from, to)) return { legal: false, reason: 'leaves-king-in-check' };
    return { legal: true, meta: { redBalloon: true, trail: [mid, to] } };
  }

  /**
   * Castling, modified for simultaneous play: if the king's path
   * crosses a square the opponent is simultaneously moving a piece
   * onto, the castle fails — king stays, rook still moves (per doc,
   * "commitment"). We can only know the opponent's target once both
   * moves are submitted, so castling legality here checks everything
   * EXCEPT that clause; the "fails but rook still moves" behavior is
   * applied during resolution (see _resolveTurn).
   */
  _validateCastle(color, special, from, to) {
    const kingHome = color === 'w' ? { r: 0, c: 4 } : { r: 7, c: 4 };
    if (from.r !== kingHome.r || from.c !== kingHome.c) return { legal: false, reason: 'not-king-home-square' };
    const king = this.board[from.r][from.c];
    if (!king || king.type !== 'K' || king.hasMoved) return { legal: false, reason: 'king-already-moved' };
    const rookCol = special === 'castleK' ? 7 : 0;
    const rook = this.board[from.r][rookCol];
    if (!rook || rook.type !== 'R' || rook.hasMoved) return { legal: false, reason: 'rook-unavailable' };
    const step = special === 'castleK' ? 1 : -1;
    const throughCols = special === 'castleK' ? [5, 6] : [1, 2, 3];
    for (const c of throughCols) {
      if (this.board[from.r][c]) return { legal: false, reason: 'castle-path-blocked' };
    }
    // King must not currently be in check, and must not pass through attacked squares.
    if (isColorInCheck(this.board, color)) return { legal: false, reason: 'cannot-castle-out-of-check' };
    const kingPath = special === 'castleK' ? [5, 6] : [3, 2];
    for (const c of kingPath) {
      if (isSquareAttacked(this.board, { r: from.r, c }, OTHER[color])) {
        return { legal: false, reason: 'castle-through-check' };
      }
    }
    const expectedTo = { r: from.r, c: from.c + step * 2 };
    if (to.r !== expectedTo.r || to.c !== expectedTo.c) return { legal: false, reason: 'castle-destination-mismatch' };
    return {
      legal: true,
      meta: {
        castle: true,
        rookFrom: { r: from.r, c: rookCol },
        rookTo: { r: from.r, c: from.c + step },
        crossedSquares: kingPath.map(c => ({ r: from.r, c })),
      },
    };
  }

  // ── Internal: turn resolution ───────────────────────────

  _resolveTurn() {
    const events = [];
    const colors = ['w', 'b'];
    const validated = {};

    // STEP 1 — Legality check (independent per move)
    for (const color of colors) {
      const move = this.pending[color];
      const result = this._validateMove(color, move);
      validated[color] = result.legal ? { move, ...result } : null;
      if (!result.legal) {
        events.push({ type: 'illegalMove', color, move, reason: result.reason });
      }
    }

    // Snapshot origin squares before anything moves (needed for
    // swap / ghost-move detection in Step 2).
    const origin = {};
    for (const color of colors) {
      if (validated[color]) origin[color] = toRC(validated[color].move.from);
    }

    // Castling special-case: if the opponent's legal move lands on a
    // square the king would cross, the castle fails (king stays,
    // rook still moves per the doc's "commitment" clause).
    for (const color of colors) {
      const v = validated[color];
      if (v && v.meta && v.meta.castle) {
        const other = validated[OTHER[color]];
        if (other) {
          const otherTo = toRC(other.move.to);
          const crossed = v.meta.crossedSquares.some(sq => sq.r === otherTo.r && sq.c === otherTo.c);
          if (crossed) {
            events.push({ type: 'castleFailed', color });
            v.meta.castleFailedKingStays = true;
          }
        }
      }
    }

    // STEP 2 — Destination check (feeding frenzy / crossing streams / ghost move)
    let skipCapture = { w: false, b: false };
    if (validated.w && validated.b && !(validated.w.meta && validated.w.meta.castleFailedKingStays)
        && !(validated.b.meta && validated.b.meta.castleFailedKingStays)) {
      const wTo = toRC(validated.w.move.to);
      const bTo = toRC(validated.b.move.to);
      const wFrom = origin.w, bFrom = origin.b;

      if (sameSquare(wTo, bTo)) {
        // FEEDING FRENZY — both float, plus bonus steal from opponent reserve
        events.push({ type: 'feedingFrenzy', square: toAlg(wTo) });
        this._removePiece(wFrom);
        this._removePiece(bFrom);
        const bonusColor = this.frenzyBonusColor;
        const victimColor = OTHER[bonusColor];
        if (this.reserves[victimColor].length > 0) {
          const stolen = this.reserves[victimColor].pop();
          this.reserves[bonusColor].push(stolen);
          events.push({ type: 'reserveSteal', by: bonusColor, from: victimColor, piece: stolen });
        }
        skipCapture.w = true;
        skipCapture.b = true;
      } else if (sameSquare(wTo, bFrom) && sameSquare(bTo, wFrom)) {
        // CROSSING THE STREAMS — literal swap: both survive, colors flip
        events.push({ type: 'crossingStreams', squares: [toAlg(wFrom), toAlg(bFrom)] });
        const wPiece = this.board[wFrom.r][wFrom.c];
        const bPiece = this.board[bFrom.r][bFrom.c];
        wPiece.color = 'b'; bPiece.color = 'w';
        this.board[wTo.r][wTo.c] = wPiece;
        this.board[bTo.r][bTo.c] = bPiece;
        // Clear original squares — guarded because wTo/bTo can equal
        // the OTHER piece's origin square (the common case), in which
        // case that square was just correctly overwritten above and
        // must not be nulled out again.
        if (!sameSquare(wFrom, bTo)) this.board[wFrom.r][wFrom.c] = null;
        if (!sameSquare(bFrom, wTo)) this.board[bFrom.r][bFrom.c] = null;
        if (wPiece.type === 'K' || bPiece.type === 'K') {
          events.push({ type: 'kingColorSwap', note: 'multi-king edge case — see DESIGN CALL in checkStatus' });
        }
        skipCapture.w = true;
        skipCapture.b = true;
      } else {
        if (sameSquare(wTo, bFrom)) events.push({ type: 'ghostMove', color: 'w', square: toAlg(wTo) });
        if (sameSquare(bTo, wFrom)) events.push({ type: 'ghostMove', color: 'b', square: toAlg(bTo) });
      }
    }

    const captureInfo = {};
    const movingPiece = {};
    for (const color of colors) {
      const v = validated[color];
      if (!v || skipCapture[color]) continue;
      const from = toRC(v.move.from);
      const to = toRC(v.move.to);
      movingPiece[color] = this.board[from.r][from.c];
      const occ = this.board[to.r][to.c]; // board is still pre-turn here
      const otherOrigin = origin[OTHER[color]];
      const isGhostTarget = otherOrigin && sameSquare(to, otherOrigin);
      captureInfo[color] = (occ && occ.color !== color && !isGhostTarget)
        ? { type: occ.type, color: occ.color }
        : null;
    }
    // Clear BOTH origin squares before either destination write. This
    // matters specifically for Ghost Moves: if mover A's destination is
    // mover B's origin square, writing A's piece there before B has had
    // a chance to read "what's at my own origin" would corrupt B's move
    // (B would read A's just-placed piece instead of itself). Clearing
    // origins first, then writing destinations, makes the two moves
    // order-independent.
    for (const color of colors) {
      const v = validated[color];
      if (!v || skipCapture[color]) continue;
      const from = toRC(v.move.from);
      this.board[from.r][from.c] = null;
    }
    for (const color of colors) {
      const v = validated[color];
      if (!v || skipCapture[color]) continue;
      this._applyStandardMove(color, v, events, captureInfo[color], movingPiece[color]);
    }

    // STEP 4 — Special piece rules that depend on the outcome above
    this._applyPostMoveSpecials(events);

    // Trail expiry / slow-effect ticking
    this._tickTrailsAndSlows(events);

    // STEP 5 — Check / checkmate / stalemate
    this._evaluateGameEnd(events);

    // Bookkeeping
    this.pending = { w: null, b: null };
    this.turn += 1;
    return events;
  }

  _removePiece(rc) {
    if (!rc) return;
    this.board[rc.r][rc.c] = null;
  }

  _applyStandardMove(color, validated, events, precomputedCapture, movingPiece) {
    const { move, meta } = validated;
    const from = toRC(move.from);
    const to = toRC(move.to);
    const piece = movingPiece; // origin square has already been cleared by the caller
    if (!piece) return; // already consumed by a prior special case

    // En passant capture
    if (meta && meta.enPassant) {
      this._removePiece(meta.capturedSquare);
      events.push({ type: 'capture', color, capturedType: 'P', enPassant: true, square: toAlg(meta.capturedSquare) });
    }

    // Castling
    if (meta && meta.castle) {
      if (meta.castleFailedKingStays) {
        // King stays home; rook still commits to the move.
        const rook = this.board[meta.rookFrom.r][meta.rookFrom.c];
        this.board[meta.rookTo.r][meta.rookTo.c] = rook;
        this.board[meta.rookFrom.r][meta.rookFrom.c] = null;
        if (rook) rook.hasMoved = true;
        return; // king does not move
      }
      const rook = this.board[meta.rookFrom.r][meta.rookFrom.c];
      this.board[meta.rookTo.r][meta.rookTo.c] = rook;
      this.board[meta.rookFrom.r][meta.rookFrom.c] = null;
      if (rook) rook.hasMoved = true;
    }

    // Standard capture — uses the PRECOMPUTED target (derived from the
    // pre-turn board), not a live read, so processing order can't
    // corrupt the result (see note in _resolveTurn).
    const occ = precomputedCapture;
    if (occ) {
      this.reserves[color].push({ type: occ.type, color: occ.color });
      events.push({ type: 'capture', color, capturedType: occ.type, square: toAlg(to) });

      // DESIGN CALL — Queen Dance-Off: if a queen captures a queen,
      // both are removed regardless of who initiated the capture.
      if (occ.type === 'Q' && piece.type === 'Q') {
        this.board[from.r][from.c] = null;
        this.board[to.r][to.c] = null;
        events.push({ type: 'danceOff', square: toAlg(to) });
        this.turnsSinceCaptureOrSpecial = 0;
        return;
      }
      this.turnsSinceCaptureOrSpecial = 0;
    }

    this.board[to.r][to.c] = piece;
    piece.hasMoved = true;

    // Promotion
    if (piece.type === 'P') {
      const lastRank = piece.color === 'w' ? 7 : 0;
      if (to.r === lastRank) {
        piece.type = (move.promotion || 'Q');
        piece.usedSpecial = false; // promoted piece gets a fresh special, per doc
        events.push({ type: 'promotion', color, square: toAlg(to), into: piece.type });
      }
    }

    // Mark once-per-piece / once-per-player specials as used
    if (meta && meta.floatJump) piece.usedSpecial = true;
    if (meta && meta.mirrorShift) piece.usedSpecial = true;
    if (meta && meta.sewerSlide) {
      this.usedSewerSlide[color] = true;
      for (const sq of meta.trail) {
        this.trails.push({ ...sq, kind: 'sewer', ownerColor: color, expiresAfterTurn: this.turn + 1 });
      }
      events.push({ type: 'specialUsed', color, piece: 'R', ability: 'sewerSlide' });
      this.turnsSinceCaptureOrSpecial = 0;
    }
    if (meta && meta.redBalloon) {
      this.usedRedBalloon[color] = true;
      for (const sq of meta.trail) {
        this.trails.push({ ...sq, kind: 'balloon', ownerColor: color, expiresAfterTurn: this.turn + 1 });
      }
      events.push({ type: 'specialUsed', color, piece: 'P', ability: 'redBalloon' });
      this.turnsSinceCaptureOrSpecial = 0;
    }
    if (meta && meta.floatJump) {
      events.push({ type: 'specialUsed', color, piece: 'N', ability: 'floatJump' });
      this.turnsSinceCaptureOrSpecial = 0;
    }
    if (meta && meta.mirrorShift) {
      events.push({ type: 'specialUsed', color, piece: 'B', ability: 'mirrorShift' });
      this.turnsSinceCaptureOrSpecial = 0;
    }
  }

  _applyPostMoveSpecials(events) {
    // Apply "slowed" status to any piece that landed on an active
    // sewer trail this turn (checked against trails laid BEFORE this
    // turn's moves resolved would need pre-turn trail state; for
    // simplicity we check current trails, which include this turn's
    // own new trail — a piece can't land on its own fresh trail since
    // it's the one that just moved through it, so this is safe).
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (!p) continue;
        const onTrail = this.trails.find(t => t.r === r && t.c === c && t.kind === 'sewer' && t.ownerColor !== p.color);
        if (onTrail && !this.slowed.has(p.id)) {
          this.slowed.set(p.id, 1);
          events.push({ type: 'slowed', square: toAlg({ r, c }) });
        }
        const onBalloon = this.trails.find(t => t.r === r && t.c === c && t.kind === 'balloon' && t.ownerColor !== p.color);
        if (onBalloon) {
          events.push({ type: 'balloonDistraction', color: p.color, square: toAlg({ r, c }), note: 'this piece\'s NEXT move should be revealed to the opponent one turn early' });
        }
      }
    }
  }

  _tickTrailsAndSlows(events) {
    this.trails = this.trails.filter(t => t.expiresAfterTurn >= this.turn);
    for (const [pieceId, remaining] of this.slowed.entries()) {
      if (remaining <= 0) this.slowed.delete(pieceId);
      else this.slowed.set(pieceId, remaining - 1);
    }
    this.turnsSinceCaptureOrSpecial += 1;
    if (this.turnsSinceCaptureOrSpecial >= 50) {
      events.push({ type: 'drawOffer', reason: '50-turn rule' });
    }

    const key = positionKey(this.board);
    this.positionHistory.push(key);
    const occurrences = this.positionHistory.filter(k => k === key).length;
    if (occurrences >= 3) {
      events.push({ type: 'threefoldRepetition' });
      this.status = 'draw';
    }
  }

  /**
   * DESIGN CALL — multi-king checkmate: Crossing the Streams can give
   * a color more than one king. This engine treats a color as
   * checkmated only if EVERY king that color controls is simultaneously
   * in check with no legal response available for that color as a
   * whole. If a color has multiple kings and only some are in check,
   * that's treated as "in check" (must respond) but not checkmate —
   * this is a simplification the design team should sign off on, since
   * "whose move fixes which king" gets genuinely ambiguous with shared
   * control.
   */
  _evaluateGameEnd(events) {
    const wCheck = isColorInCheck(this.board, 'w');
    const bCheck = isColorInCheck(this.board, 'b');

    if (wCheck && bCheck) {
      const wEscape = this._hasAnyLegalMove('w');
      const bEscape = this._hasAnyLegalMove('b');
      if (!wEscape && !bEscape) {
        events.push({ type: 'doubleDrowning' });
        this.status = 'stalemate';
        return;
      }
      events.push({ type: 'doubleCheck' });
      if (!wEscape) { events.push({ type: 'checkmate', color: 'w' }); this.status = 'checkmate-w'; return; }
      if (!bEscape) { events.push({ type: 'checkmate', color: 'b' }); this.status = 'checkmate-b'; return; }
      return;
    }
    if (wCheck) {
      events.push({ type: 'check', color: 'w' });
      if (!this._hasAnyLegalMove('w')) { events.push({ type: 'checkmate', color: 'w' }); this.status = 'checkmate-w'; }
      return;
    }
    if (bCheck) {
      events.push({ type: 'check', color: 'b' });
      if (!this._hasAnyLegalMove('b')) { events.push({ type: 'checkmate', color: 'b' }); this.status = 'checkmate-b'; }
      return;
    }
    if (!this._hasAnyLegalMove('w') || !this._hasAnyLegalMove('b')) {
      events.push({ type: 'stalemate' });
      this.status = 'stalemate';
    }
  }

  /** Brute-force: does `color` have at least one standard legal move? Note:
   * this checks STANDARD moves only, not the once-per-game specials —
   * those are bonus outs, not required for this check, so omitting
   * them only makes checkmate detection slightly conservative (never
   * incorrectly declares checkmate when a special escape exists is not
   * guaranteed — flagged for follow-up if that matters for your rules). */
  _hasAnyLegalMove(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (!p || p.color !== color) continue;
        const moves = pseudoLegalMoves(this.board, r, c);
        for (const m of moves) {
          if (moveIsSafe(this.board, { r, c }, m)) return true;
        }
      }
    }
    return false;
  }
}

module.exports = {
  FloatChessGame,
  toRC,
  toAlg,
  initialBoard,
  pseudoLegalMoves,
  moveIsSafe,
  isColorInCheck,
  isSquareAttacked,
};

