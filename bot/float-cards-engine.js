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
