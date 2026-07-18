/**
 * GAME MANAGER
 * ────────────
 * One FloatChessGame session per Discord channel. Owns the glue
 * between: the human's submitted move, Pennywise's AI-picked move,
 * the engine's resolution, and simple win/loss/draw stats persisted
 * to a JSON file (swap for a real DB later without touching callers —
 * everything goes through loadStats/saveStats).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { FloatChessGame } = require('../../float-chess-engine.js');
const pennywiseAI = require('./pennywiseAI.js');
const violetAI = require('./violetAI.js');

const STATS_PATH = path.join(__dirname, '..', 'data', 'stats.json');

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveStats(stats) {
  fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true });
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
}

function recordResult(userId, result) {
  // result: 'win' | 'loss' | 'draw' (from the human player's perspective)
  const stats = loadStats();
  if (!stats[userId]) stats[userId] = { wins: 0, losses: 0, draws: 0 };
  if (result === 'win') stats[userId].wins += 1;
  else if (result === 'loss') stats[userId].losses += 1;
  else stats[userId].draws += 1;
  saveStats(stats);
  return stats[userId];
}

function getStats(userId) {
  const stats = loadStats();
  return stats[userId] || { wins: 0, losses: 0, draws: 0 };
}

// channelId -> { game, mode, playerName, playerUserId, humanColor }
const sessions = new Map();

const HUMAN_COLOR = 'w';
const PENNYWISE_COLOR = 'b';
const VIOLET_COLOR = 'w'; // in exhibition mode, Violet plays white

/**
 * mode: 'vs-pennywise' — a human plays white against Pennywise (black, AI).
 *       'exhibition'    — fully autonomous: Violet (white, AI) vs Pennywise (black, AI).
 * humanInfo is ignored in exhibition mode.
 */
function startNewGame(channelId, mode, humanInfo) {
  const game = new FloatChessGame();
  const session = { game, mode };
  if (mode === 'vs-pennywise') {
    session.playerName = humanInfo.playerName;
    session.playerUserId = humanInfo.playerUserId;
    session.humanColor = HUMAN_COLOR;
  }
  sessions.set(channelId, session);
  return game;
}

function getSession(channelId) {
  return sessions.get(channelId) || null;
}

function endSession(channelId) {
  sessions.delete(channelId);
}

/**
 * Submits the human's move, immediately has Pennywise pick a reply
 * (based on the same pre-turn board — true simultaneity, neither side
 * sees the other's choice first), and lets the engine resolve.
 *
 * Returns { ok: true, events, humanMove, pennywiseMove, gameStatus } or
 * { ok: false, reason } if the session/move submission itself was invalid
 * (this is about SUBMISSION validity, e.g. "no game running" — actual
 * chess-move illegality still resolves normally as an `illegalMove` event,
 * per the engine's Step 1, so the human still gets to see what went wrong).
 */
function submitHumanMoveAndResolve(channelId, move) {
  const session = sessions.get(channelId);
  if (!session) return { ok: false, reason: 'no-active-game' };
  if (session.mode !== 'vs-pennywise') return { ok: false, reason: 'wrong-mode-use-playAutoTurn' };
  const { game } = session;
  if (game.status !== 'active') return { ok: false, reason: 'game-over' };

  const pennywiseMove = pennywiseAI.chooseMove(game, PENNYWISE_COLOR);
  if (!pennywiseMove) return { ok: false, reason: 'pennywise-has-no-legal-move' };

  const humanResult = game.submitMove(HUMAN_COLOR, move);
  if (!humanResult.accepted) return { ok: false, reason: humanResult.reason };

  const pennywiseResult = game.submitMove(PENNYWISE_COLOR, pennywiseMove);
  if (!pennywiseResult.accepted) {
    // Shouldn't normally happen (Pennywise always moves right after the
    // human), but guard against double-submission races just in case.
    return { ok: false, reason: pennywiseResult.reason };
  }

  const events = game.lastEvents;

  // Record stats once the game actually ends.
  if (game.status === 'checkmate-w') recordResult(session.playerUserId, 'loss');
  else if (game.status === 'checkmate-b') recordResult(session.playerUserId, 'win');
  else if (game.status === 'stalemate' || game.status === 'draw') recordResult(session.playerUserId, 'draw');

  return {
    ok: true,
    events,
    humanMove: move,
    pennywiseMove,
    gameStatus: { turn: game.turn, status: game.status },
  };
}

/**
 * Plays one turn of an exhibition match (both sides AI-controlled).
 * No stats are recorded — there's no human player in this mode.
 * Returns { ok, events, violetMove, pennywiseMove, gameStatus }.
 */
function playAutoTurn(channelId) {
  const session = sessions.get(channelId);
  if (!session) return { ok: false, reason: 'no-active-game' };
  if (session.mode !== 'exhibition') return { ok: false, reason: 'wrong-mode-use-submitHumanMoveAndResolve' };
  const { game } = session;
  if (game.status !== 'active') return { ok: false, reason: 'game-over' };

  const violetMove = violetAI.chooseMove(game, VIOLET_COLOR);
  const pennywiseMove = pennywiseAI.chooseMove(game, PENNYWISE_COLOR);
  if (!violetMove || !pennywiseMove) return { ok: false, reason: 'no-legal-move-available' };

  const violetResult = game.submitMove(VIOLET_COLOR, violetMove);
  if (!violetResult.accepted) return { ok: false, reason: violetResult.reason };
  const pennywiseResult = game.submitMove(PENNYWISE_COLOR, pennywiseMove);
  if (!pennywiseResult.accepted) return { ok: false, reason: pennywiseResult.reason };

  return {
    ok: true,
    events: game.lastEvents,
    violetMove,
    pennywiseMove,
    gameStatus: { turn: game.turn, status: game.status },
  };
}

function resign(channelId) {
  const session = sessions.get(channelId);
  if (!session) return { ok: false, reason: 'no-active-game' };
  if (session.mode !== 'vs-pennywise') return { ok: false, reason: 'exhibition-matches-cannot-be-resigned-by-a-spectator' };
  session.game.status = 'resigned-w';
  recordResult(session.playerUserId, 'loss');
  return { ok: true };
}

module.exports = {
  startNewGame,
  getSession,
  endSession,
  submitHumanMoveAndResolve,
  playAutoTurn,
  resign,
  getStats,
  HUMAN_COLOR,
  PENNYWISE_COLOR,
  VIOLET_COLOR,
};
