// Hybrid trigger system for exhibition matches (chess and cards).
// Each game type gets its own state so one doesn't block the other.

const COOLDOWN_MS = 15 * 60 * 1000;      // 15 minutes after a game ends
const TIMER_INTERVAL_MS = 30 * 60 * 1000; // check every 30 minutes

function makeTracker() {
  return { inProgress: false, lastEndTime: 0 };
}

const chessState = makeTracker();
const cardState = makeTracker();

function setGameInProgress(type, value) {
  const state = type === 'cards' ? cardState : chessState;
  state.inProgress = value;
  if (!value) state.lastEndTime = Date.now();
}

function canStartGame(type) {
  const state = type === 'cards' ? cardState : chessState;
  return !state.inProgress && (Date.now() - state.lastEndTime > COOLDOWN_MS);
}

/**
 * @param client        discord.js Client (already logged in / ready)
 * @param chessChannelId    channel ID where chess exhibition runs
 * @param cardChannelId      channel ID where card exhibition runs
 * @param startChessExhibition  fn(channel, channelId) => starts chess loop
 * @param startCardExhibition   fn(channel, channelId) => starts card loop
 */
function initGameTriggers(client, chessChannelId, cardChannelId, startChessExhibition, startCardExhibition) {
  function tryStart(type, channelId, starter) {
    if (!canStartGame(type)) return;
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error(`gameTrigger: channel ${channelId} not found for ${type}`);
      return;
    }
    starter(channel, channelId);
  }

  setInterval(() => {
    tryStart('chess', chessChannelId, startChessExhibition);
    tryStart('cards', cardChannelId, startCardExhibition);
  }, TIMER_INTERVAL_MS);

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (!newState.channelId) return;
    tryStart('chess', chessChannelId, startChessExhibition);
    tryStart('cards', cardChannelId, startCardExhibition);
  });
}

module.exports = { initGameTriggers, setGameInProgress };
