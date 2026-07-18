/**
 * CARD GAME MANAGER
 * ─────────────────
 * One FloatCardsGame session per Discord channel, same pattern as
 * gameManager.js. Two modes:
 *   'vs-pennywise' — a human plays 'w' against Pennywise ('b', AI)
 *   'exhibition'   — fully autonomous: Violet ('w', AI) vs Pennywise
 *                    ('b', AI)
 */

'use strict';

const { FloatCardsGame } = require('../float-cards-engine.js');
const pennywiseCardsAI = require('./pennywiseCardsAI.js');
const violetAI = require('./violetAI.js'); // reuse Violet's existing chess AI module if it also
                                            // exports a generic chooseHighValueCard; otherwise
                                            // add a small violetCardsAI.js mirroring pennywiseCardsAI.js

const HUMAN_SIDE = 'w';
const PENNYWISE_SIDE = 'b';
const VIOLET_SIDE = 'w'; // exhibition mode: Violet plays 'w'

// channelId -> { game, mode, playerName, playerUserId }
const cardSessions = new Map();

function startNewCardGame(channelId, mode, humanInfo) {
  const game = new FloatCardsGame();
  const session = { game, mode };
  if (mode === 'vs-pennywise') {
    session.playerName = humanInfo.playerName;
    session.playerUserId = humanInfo.playerUserId;
  }
  cardSessions.set(channelId, session);
  return game;
}

function getCardSession(channelId) {
  return cardSessions.get(channelId) || null;
}

function endCardSession(channelId) {
  cardSessions.delete(channelId);
}

/**
 * Submits the human's card, has Pennywise pick his reply off the
 * same pre-round hands (true simultaneity), and resolves the round.
 */
function submitHumanCardAndResolve(channelId, card) {
  const session = cardSessions.get(channelId);
  if (!session) return { ok: false, reason: 'no-active-game' };
  if (session.mode !== 'vs-pennywise') return { ok: false, reason: 'wrong-mode-use-playAutoCardTurn' };
  const { game } = session;
  if (game.status !== 'active') return { ok: false, reason: 'game-over' };

  const pennywiseCard = pennywiseCardsAI.chooseMove(game, PENNYWISE_SIDE);
  if (!pennywiseCard) return { ok: false, reason: 'pennywise-has-no-cards-left' };

  const humanResult = game.submitMove(HUMAN_SIDE, card);
  if (!humanResult.accepted) return { ok: false, reason: humanResult.reason };

  const pennywiseResult = game.submitMove(PENNYWISE_SIDE, pennywiseCard);
  if (!pennywiseResult.accepted) return { ok: false, reason: pennywiseResult.reason };

  return {
    ok: true,
    events: game.lastEvents,
    humanCard: card,
    pennywiseCard,
    gameStatus: { status: game.status, rp: game.rp },
  };
}

/**
 * Plays one round of an exhibition match (both sides AI-controlled).
 */
function playAutoCardTurn(channelId) {
  const session = cardSessions.get(channelId);
  if (!session) return { ok: false, reason: 'no-active-game' };
  if (session.mode !== 'exhibition') return { ok: false, reason: 'wrong-mode-use-submitHumanCardAndResolve' };
  const { game } = session;
  if (game.status !== 'active') return { ok: false, reason: 'game-over' };

  // NOTE: violetAI.chooseMove here is a placeholder call — if violetAI.js
  // is chess-specific, add a small violetCardsAI.js (same shape as
  // pennywiseCardsAI.js) and swap this line to use that instead.
  const violetCard = violetAI.chooseMove ? violetAI.chooseMove(game, VIOLET_SIDE) : null;
  const pennywiseCard = pennywiseCardsAI.chooseMove(game, PENNYWISE_SIDE);
  if (!violetCard || !pennywiseCard) return { ok: false, reason: 'no-cards-available' };

  const violetResult = game.submitMove(VIOLET_SIDE, violetCard);
  if (!violetResult.accepted) return { ok: false, reason: violetResult.reason };
  const pennywiseResult = game.submitMove(PENNYWISE_SIDE, pennywiseCard);
  if (!pennywiseResult.accepted) return { ok: false, reason: pennywiseResult.reason };

  return {
    ok: true,
    events: game.lastEvents,
    violetCard,
    pennywiseCard,
    gameStatus: { status: game.status, rp: game.rp },
  };
}

module.exports = {
  startNewCardGame,
  getCardSession,
  endCardSession,
  submitHumanCardAndResolve,
  playAutoCardTurn,
  HUMAN_SIDE,
  PENNYWISE_SIDE,
  VIOLET_SIDE,
};
