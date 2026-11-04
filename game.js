'use strict';
(() => {
const factories={"bot/float-chess-engine.js": function(require,module,exports){
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
  positionKey,
};

},
"bot/src/pennywiseAI.js": function(require,module,exports){
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

function scoreMove(board, color, move, lastMove) {
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

  // Light anti-repeat — NOT Violet's deliberate case-file avoidance.
  // Pennywise just has a passing distaste for repeating his own last
  // move OR walking straight back where he came from — covers both
  // the "crossing streams" bounce (proposed move never actually
  // happens, board looks unchanged) and genuine back-and-forth
  // shuffling. A much smaller penalty than Violet's, so his existing
  // jitter still does most of the real work of keeping him
  // unpredictable, in keeping with "chaotic," not "methodical."
  if (lastMove && lastMove[move.piece.id]) {
    const last = lastMove[move.piece.id];
    const isExactRepeat = last.from.r === move.from.r && last.from.c === move.from.c &&
      last.to.r === move.to.r && last.to.c === move.to.c;
    const isReversal = last.from.r === move.to.r && last.from.c === move.to.c &&
      last.to.r === move.from.r && last.to.c === move.from.c;
    if (isExactRepeat || isReversal) {
      score -= 40;
    }
  }

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

  game.aiLastMove = game.aiLastMove || {};

  let best = legalMoves[0];
  let bestScore = -Infinity;
  for (const m of legalMoves) {
    const s = scoreMove(game.board, color, m, game.aiLastMove) + Math.random() * 0.3; // small jitter so play isn't robotically deterministic
    if (s > bestScore) { bestScore = s; best = m; }
  }

  game.aiLastMove[best.piece.id] = { from: { r: best.from.r, c: best.from.c }, to: { r: best.to.r, c: best.to.c } };

  const move = { from: toAlg(best.from), to: toAlg(best.to) };

  // Auto-queen on promotion — Pennywise doesn't do underpromotion for flavor.
  const lastRank = color === 'w' ? 7 : 0;
  if (best.piece.type === 'P' && best.to.r === lastRank) {
    move.promotion = 'Q';
  }

  return move;
}

module.exports = { chooseMove, enumerateLegalMoves, scoreMove };

},
"browser/session.js": function(require,module,exports){
'use strict';
const { FloatChessGame, toAlg, toRC } = require('../bot/float-chess-engine.js');
const { enumerateLegalMoves, scoreMove } = require('../bot/src/pennywiseAI.js');
const BUILD = 'derry-cards-review-3';
const SPECIALS = ['', 'mirrorShift', 'floatJump', 'sewerSlide', 'redBalloon', 'castleK', 'castleQ'];
const PROMOTIONS = ['Q', 'R', 'B', 'N'];
const moveKey = m => [m.from, m.to, m.special || '', m.promotion || ''].join(':');
function validShape(move) {
  return move && /^[a-h][1-8]$/.test(move.from) && /^[a-h][1-8]$/.test(move.to)
    && SPECIALS.includes(move.special || '') && (!move.promotion || PROMOTIONS.includes(move.promotion));
}
// One narrow adapter to the existing engine's validator; no duplicate rules.
// Simultaneous en passant is not offered before an opponent has committed.
function validate(game, color, move) {
  if (!validShape(move)) return { legal: false, reason: 'Use squares a1–h8 and a listed ability/promotion.' };
  if (game.status !== 'active') return { legal: false, reason: 'This match has finished. Replay or restart.' };
  return game._validateMove(color, move);
}
function legalActions(game, color = 'w', source) {
  if (game.status !== 'active') return [];
  const actions = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = game.board[r][c], from = toAlg({ r, c });
    if (!piece || piece.color !== color || (source && source !== from)) continue;
    for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) {
      const to = toAlg({ r: tr, c: tc });
      for (const special of SPECIALS) {
        // Only ask the engine about abilities belonging to this piece type.
        const types = { mirrorShift: 'B', floatJump: 'N', sewerSlide: 'R', redBalloon: 'P', castleK: 'K', castleQ: 'K' };
        if (special && types[special] !== piece.type) continue;
        const promotions = piece.type === 'P' && (tr === 0 || tr === 7) ? PROMOTIONS : [null];
        for (const promotion of promotions) {
          const move = { from, to, ...(special ? { special } : {}), ...(promotion ? { promotion } : {}) };
          if (validate(game, color, move).legal) actions.push(move);
        }
      }
    }
  }
  return actions;
}
function chooseOpponent(game) {
  // Reuse the historical evaluator, filtering through full engine legality
  // (the original enumerator does not account for slowed pieces).
  const candidates = enumerateLegalMoves(game.board, 'b').filter(m =>
    validate(game, 'b', { from: toAlg(m.from), to: toAlg(m.to) }).legal);
  candidates.sort((a, b) => scoreMove(game.board, 'b', b, game.aiLastMove) - scoreMove(game.board, 'b', a, game.aiLastMove)
    || moveKey({ from: toAlg(a.from), to: toAlg(a.to) }).localeCompare(moveKey({ from: toAlg(b.from), to: toAlg(b.to) })));
  const best = candidates[0];
  if (!best) return legalActions(game, 'b')[0] || null;
  const move = { from: toAlg(best.from), to: toAlg(best.to) };
  if (best.piece.type === 'P' && best.to.r === 0) move.promotion = 'Q';
  return move;
}
function narrate(events) {
  return events.length ? events.map(e => e.type.replace(/([A-Z])/g, ' $1').toLowerCase()).join('; ') + '.' : 'Both moves resolved.';
}
const clone = value => structuredClone(value);
class Match {
  constructor() { this.restart(); }
  restart() {
    this.game = new FloatChessGame();
    this.history = [];
    this.snapshots = [clone(this.game.toJSON())];
    // Commit from the pre-turn board before accepting the human's selection.
    this.opponent = chooseOpponent(this.game);
    this.completed = false;
  }
  play(move) {
    if (this.completed) return { ok: false, reason: 'Match finished. Replay or restart.' };
    const result = validate(this.game, 'w', move);
    if (!result.legal) return { ok: false, reason: result.reason };
    if (!this.opponent) return { ok: false, reason: 'Opponent has no supported legal action. Restart or report a finding.' };
    // A transaction preserves the match if resolution throws. Narration is outside it.
    const backup = clone(this.game);
    const opponent = clone(this.opponent), human = clone(move), turn = this.game.turn;
    try {
      const a = this.game.submitMove('w', human);
      const b = this.game.submitMove('b', opponent);
      if (!a.accepted || !b.accepted) throw new Error('Engine rejected a submission.');
    } catch {
      this.game = Object.assign(new FloatChessGame(), backup);
      return { ok: false, reason: 'Resolution failed; the previous position is preserved. Report a finding or retry.' };
    }
    const events = clone(this.game.lastEvents);
    this.history.push({ turn, human, opponent, events, status: this.game.status });
    this.snapshots.push(clone(this.game.toJSON()));
    this.completed = this.game.status !== 'active';
    this.opponent = this.completed ? null : chooseOpponent(this.game);
    return { ok: true, events: clone(events) };
  }
  finish() { this.completed = true; } // Presentation/session end; never claims an engine win.
  summary() {
    return { build: BUILD, rules: 'Float Chess engine at 8140e08b92240eeaf53485964348d91547f97bc9',
      mode: 'Violet (player, white) vs Pennywise (black), heuristic opponent',
      status: this.game.status === 'active' && this.completed ? 'Ended by visitor; no winner declared' : this.game.status,
      publication: 'Local preview only; no identity, signature or publication', turns: clone(this.history) };
  }
}
module.exports = { Match, legalActions, validate, chooseOpponent, narrate, BUILD, moveKey };

},
"bot/float-cards-engine.js": function(require,module,exports){
/**
 * FLOAT CARDS ENGINE
 * ──────────────────
 * A simple duel-style card game (standard 52-card deck, no jokers).
 * Each side draws a hand; each round both sides commit one card
 * face-down, then both flip. Higher rank wins the round and deals
 * 1 RP damage to the loser. Ties deal no damage. Game ends when a
 * side's RP hits 0, or both hands are empty (winner = higher RP).
 *
 * Mirrors FloatChessGame's shape so gameManager-style code can drive
 * it the same way: constructor, .status, .turn, .submitMove(), .lastEvents.
 */

'use strict';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function freshDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push(`${r}${s}`);
  }
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function rankOf(card) {
  const rank = card.slice(0, -1);
  return RANK_VALUE[rank];
}

class FloatCardsGame {
  constructor(handSize = 6) {
    const deck = shuffle(freshDeck());
    this.handA = deck.slice(0, handSize);       // 'w' side (human or Violet in exhibition)
    this.handB = deck.slice(handSize, handSize * 2); // 'b' side (Pennywise)
    this.rp = { w: 10, b: 10 };
    this.slab = null;       // last resolved round, for display
    this.status = 'active'; // 'active' | 'won-w' | 'won-b' | 'draw'
    this.turn = 'both';     // both sides commit simultaneously each round
    this.pendingA = null;
    this.pendingB = null;
    this.lastEvents = [];
  }

  handFor(side) {
    return side === 'w' ? this.handA : this.handB;
  }

  /**
   * Commits one side's card for the round. Once both sides have
   * committed, the round resolves automatically.
   * Returns { accepted, reason? }.
   */
  submitMove(side, card) {
    if (this.status !== 'active') return { accepted: false, reason: 'game-over' };
    const hand = this.handFor(side);
    if (!hand.includes(card)) return { accepted: false, reason: 'card-not-in-hand' };

    if (side === 'w') this.pendingA = card;
    else this.pendingB = card;

    if (this.pendingA && this.pendingB) {
      this._resolveRound();
    }
    return { accepted: true };
  }

  _resolveRound() {
    const a = this.pendingA;
    const b = this.pendingB;
    this.handA = this.handA.filter(c => c !== a);
    this.handB = this.handB.filter(c => c !== b);

    const events = [];
    const va = rankOf(a);
    const vb = rankOf(b);

    if (va > vb) {
      this.rp.b -= 1;
      events.push({ type: 'roundResult', winner: 'w', a, b, loserRpLeft: this.rp.b });
    } else if (vb > va) {
      this.rp.w -= 1;
      events.push({ type: 'roundResult', winner: 'b', a, b, loserRpLeft: this.rp.w });
    } else {
      events.push({ type: 'roundResult', winner: null, a, b });
    }

    this.slab = { a, b };
    this.pendingA = null;
    this.pendingB = null;

    if (this.rp.w <= 0 && this.rp.b <= 0) this.status = 'draw';
    else if (this.rp.w <= 0) this.status = 'won-b';
    else if (this.rp.b <= 0) this.status = 'won-w';
    else if (this.handA.length === 0 || this.handB.length === 0) {
      if (this.rp.w === this.rp.b) this.status = 'draw';
      else this.status = this.rp.w > this.rp.b ? 'won-w' : 'won-b';
    }

    this.lastEvents = events;
  }
}

module.exports = { FloatCardsGame, RANK_VALUE };

},
"bot/src/pennywiseCardsAI.js": function(require,module,exports){
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

},
"browser/cards-session.js": function(require,module,exports){
'use strict';
const {FloatCardsGame}=require('../bot/float-cards-engine.js');
const {chooseMove}=require('../bot/src/pennywiseCardsAI.js');
class CardsMatch {
 constructor(){this.game=new FloatCardsGame();this.round=1;this.log=[];this.closed=false;this.commit();}
 commit(){if(this.game.status==='active'){const card=chooseMove(this.game,'b');const result=this.game.submitMove('b',card);if(!result.accepted)throw Error('Opponent has no legal card');}}
 play(card,round){
  if(this.closed||this.game.status!=='active'||round!==this.round)return {ok:false,reason:'This round is already closed.'};
  if(!this.game.handFor('w').includes(card))return {ok:false,reason:'Choose a card from Violet’s current hand.'};
  const result=this.game.submitMove('w',card);if(!result.accepted)return {ok:false,reason:result.reason};
  this.log.push({round:this.round,...this.game.slab,winner:this.game.lastEvents[0].winner,rp:{...this.game.rp}});this.round++;
  this.closed=this.game.status!=='active';if(!this.closed)this.commit();
  return {ok:true,status:this.game.status};
 }
 leave(){if(this.closed)return false;this.closed=true;return true;}
}
module.exports={CardsMatch};

}}, cache={};
function load(id){if(cache[id])return cache[id].exports; const module={exports:{}};cache[id]=module;
factories[id](p=>{const parts=id.split('/');parts.pop();for(const part of p.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}return load(parts.join('/'));},module,module.exports);return module.exports;}
window.FloatPreview=load('browser/session.js');window.FloatCardsPreview=load('browser/cards-session.js');
})();
