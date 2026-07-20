let gameInProgress = false;
let lastGameEndTime = 0;
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const TIMER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function setGameInProgress(value) {
  gameInProgress = value;
  if (!value) lastGameEndTime = Date.now();
}

function canStartGame() {
  return !gameInProgress && (Date.now() - lastGameEndTime > COOLDOWN_MS);
}

function initGameTriggers(client, startExhibitionMatch, voiceChannelId) {
  setInterval(() => {
    if (!gameInProgress) startExhibitionMatch();
  }, TIMER_INTERVAL_MS);

  client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.channelId === voiceChannelId && canStartGame()) {
      startExhibitionMatch();
    }
  });
}

module.exports = { initGameTriggers, setGameInProgress };
