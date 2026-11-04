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
