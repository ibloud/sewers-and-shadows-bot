/**
 * PERSONA ENGINE (factory)
 * ────────────────────────
 * Shared plumbing for any character's narration layer: loads a system
 * prompt file, calls the Anthropic API, and turns engine events into
 * plain-English context. Character-specific voice lives entirely in
 * the system prompt file each persona module points at — this file
 * has no character knowledge of its own.
 *
 * Usage:
 *   const { createPersona } = require('./personaEngine.js');
 *   module.exports = createPersona({
 *     systemPromptPath: path.join(__dirname, '..', 'config', 'x-system-prompt.md'),
 *   });
 */

'use strict';

const fs = require('fs');

const MODEL = 'claude-sonnet-4-6'; // per Anthropic API guidance: always this model string

function describeEvent(e) {
  switch (e.type) {
    case 'illegalMove': return `${e.color}'s submitted move was illegal (${e.reason}) and was forfeited this turn.`;
    case 'feedingFrenzy': return `FEEDING FRENZY: both pieces landed on ${e.square} and floated (removed).`;
    case 'reserveSteal': return `Bonus effect: ${e.by} stole a captured ${e.piece.type} from ${e.from}'s reserves.`;
    case 'crossingStreams': return `CROSSING THE STREAMS: pieces on ${e.squares.join(' and ')} swapped colors.`;
    case 'kingColorSwap': return `A King changed color complex during Crossing the Streams — a rare, unstable moment.`;
    case 'ghostMove': return `Ghost move: ${e.color} moved into a square the opponent had just vacated (${e.square}).`;
    case 'capture': return `${e.color} captured a ${e.capturedType}${e.enPassant ? ' via en passant' : ''} on ${e.square}.`;
    case 'danceOff': return `DANCE OFF: two Queens captured each other and both were removed on ${e.square}.`;
    case 'specialUsed': return `${e.color} used their ${e.piece} special ability: ${e.ability}.`;
    case 'slowed': return `A piece was slowed after crossing a sewer trail on ${e.square}.`;
    case 'balloonDistraction': return `A piece crossed a red balloon trail on ${e.square} — its next move should be revealed to the opponent one turn early.`;
    case 'promotion': return `${e.color}'s pawn promoted to ${e.into} on ${e.square}.`;
    case 'castleFailed': return `${e.color}'s castle attempt failed — the opponent's move crossed the King's path, so only the Rook committed.`;
    case 'check': return `${e.color} is in check.`;
    case 'doubleCheck': return `Both Kings are in check simultaneously.`;
    case 'checkmate': return `CHECKMATE. ${e.color} has no legal escape. Game over.`;
    case 'doubleDrowning': return `DOUBLE DROWNING: both Kings floated at once. The game ends in stalemate.`;
    case 'stalemate': return `Stalemate — the side to move has no legal moves and isn't in check.`;
    case 'threefoldRepetition': return `The same position has repeated three times. The game is a draw.`;
    case 'drawOffer': return `Fifty turns have passed without a capture or special ability. A draw is available.`;
    default: return `Event: ${e.type}`;
  }
}

function createPersona({ systemPromptPath }) {
  const systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');

  async function callClaude(userMessage) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — see .env.example');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Anthropic API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
    return textBlocks.join('\n').trim();
  }

  /**
   * Narrates a resolved turn from THIS persona's point of view.
   *
   * @param {object} opts
   * @param {Array}  opts.events        - events from FloatChessGame.lastEvents
   * @param {object} opts.selfMove      - this persona's own move, as submitted
   * @param {object} opts.opponentMove  - the opponent's move, as submitted
   * @param {string} opts.opponentName  - who to address/react to — a human
   *                                      player's display name, OR another
   *                                      persona's name for AI-vs-AI exhibition banter
   * @param {object} opts.gameStatus    - { turn, status } snapshot
   */
  async function narrateTurn({ events, selfMove, opponentMove, opponentName, gameStatus }) {
    const eventSummary = events.length
      ? events.map(describeEvent).join('\n')
      : 'Both moves resolved with no special interaction — a quiet turn.';

    const userMessage = [
      `Opponent: ${opponentName}`,
      `Their move: ${opponentMove.from} -> ${opponentMove.to}${opponentMove.special ? ` (${opponentMove.special})` : ''}`,
      `Your move: ${selfMove.from} -> ${selfMove.to}${selfMove.special ? ` (${selfMove.special})` : ''}`,
      `Turn number: ${gameStatus.turn}`,
      `Game status: ${gameStatus.status}`,
      ``,
      `What happened this turn:`,
      eventSummary,
      ``,
      `Narrate this turn in character, addressing ${opponentName}. Announce both moves, react to whichever event above is most dramatically interesting, and stay within your tone guardrails. Keep it to 2-4 lines per your format rules.`,
    ].join('\n');

    return callClaude(userMessage);
  }

  /**
   * Free-form in-character conversation when no game is active.
   */
  async function converse({ playerName, message, recentHistory }) {
    const userMessage = [
      `Speaker: ${playerName}`,
      recentHistory && recentHistory.length
        ? `Recent channel context:\n${recentHistory.join('\n')}`
        : null,
      ``,
      `They say: "${message}"`,
      ``,
      `Respond in character. No game is currently active — use your CONVERSATION MODE rules.`,
    ].filter(Boolean).join('\n');

    return callClaude(userMessage);
  }

  return { narrateTurn, converse, describeEvent };
}

module.exports = { createPersona, describeEvent };
