/**
 * DISCORD BOT ENTRYPOINT
 * ──────────────────────
 * Wires slash commands to gameManager (game state) and the two
 * persona modules (dialogue). Requires:
 *   DISCORD_TOKEN, DISCORD_CLIENT_ID, ANTHROPIC_API_KEY
 * in the environment (see ../.env.example).
 *
 * Two modes:
 *   'vs-pennywise' — a human plays white against Pennywise (AI, black).
 *                    Moves submitted via a public /move slash command.
 *                    Because gameManager picks Pennywise's move from the
 *                    pre-turn board BEFORE looking at the human's
 *                    submission at all, public visibility of the human's
 *                    move doesn't break simultaneity in this matchup.
 *   'exhibition'   — fully autonomous: Violet (white, AI) vs Pennywise
 *                    (black, AI). The bot plays itself out turn by turn
 *                    on a timer, narrating both sides, until the game ends
 *                    or someone stops it with /resign.
 *
 * If you ever add genuine human-vs-human duets, switch /move to a
 * DM-based submission flow instead, so opponents can't see each
 * other's pending move.
 */

'use strict';

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
} = require('discord.js');

const gameManager = require('./gameManager.js');
const pennywisePersona = require('./pennywisePersona.js');
const violetPersona = require('./violetPersona.js');
const { RULES_TEXT } = require('./rulesText.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// channelId -> interval handle, for exhibition auto-play loops.
// Lives here (not in gameManager) since it's a Discord-scheduling
// concern, not game state.
const exhibitionLoops = new Map();
const EXHIBITION_TURN_DELAY_MS = 6000;

// ── Slash command definitions ──────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('newgame')
    .setDescription('Start a new Float Chess game in this channel.')
    .addStringOption(o =>
      o.setName('mode')
        .setDescription('Play against Pennywise yourself, or watch Violet vs Pennywise')
        .addChoices(
          { name: 'Play vs Pennywise', value: 'vs-pennywise' },
          { name: 'Exhibition: Violet vs Pennywise (autonomous)', value: 'exhibition' },
        )
    ),

  new SlashCommandBuilder()
    .setName('move')
    .setDescription('Submit your move (vs-pennywise mode only).')
    .addStringOption(o => o.setName('from').setDescription('Origin square, e.g. e2').setRequired(true))
    .addStringOption(o => o.setName('to').setDescription('Destination square, e.g. e4').setRequired(true))
    .addStringOption(o =>
      o.setName('special')
        .setDescription('Declare a special ability for this move')
        .addChoices(
          { name: 'Float Jump (Knight)', value: 'floatJump' },
          { name: 'Mirror Shift (Bishop)', value: 'mirrorShift' },
          { name: 'Sewer Slide (Rook)', value: 'sewerSlide' },
          { name: 'Red Balloon (Pawn)', value: 'redBalloon' },
          { name: 'Castle — kingside', value: 'castleK' },
          { name: 'Castle — queenside', value: 'castleQ' },
        )
    )
    .addStringOption(o =>
      o.setName('promotion')
        .setDescription('Pawn promotion piece (defaults to Queen)')
        .addChoices(
          { name: 'Queen', value: 'Q' }, { name: 'Rook', value: 'R' },
          { name: 'Bishop', value: 'B' }, { name: 'Knight', value: 'N' },
        )
    ),

  new SlashCommandBuilder().setName('rules').setDescription('Display the Float Chess ruleset.'),
  new SlashCommandBuilder().setName('resign').setDescription('Forfeit (vs-pennywise) or stop the show (exhibition).'),
  new SlashCommandBuilder().setName('stats').setDescription('Show your win/loss/draw record.'),
  new SlashCommandBuilder().setName('song').setDescription("Link to Pennywise's source track."),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands }
  );
  console.log('Slash commands registered.');
}

// ── Exhibition auto-play loop ───────────────────────────────

function startExhibitionLoop(channel, channelId) {
  const handle = setInterval(async () => {
    const session = gameManager.getSession(channelId);
    if (!session || session.mode !== 'exhibition' || session.game.status !== 'active') {
      stopExhibitionLoop(channelId);
      return;
    }

    const result = gameManager.playAutoTurn(channelId);
    if (!result.ok) {
      stopExhibitionLoop(channelId);
      await channel.send(`*The board stills.* (Exhibition halted: ${result.reason})`).catch(() => {});
      return;
    }

    try {
      const violetLine = await violetPersona.narrateTurn({
        events: result.events,
        selfMove: result.violetMove,
        opponentMove: result.pennywiseMove,
        opponentName: 'Pennywise',
        gameStatus: result.gameStatus,
      });
      await channel.send(`**Violet:**\n${violetLine}`);

      const pennywiseLine = await pennywisePersona.narrateTurn({
        events: result.events,
        selfMove: result.pennywiseMove,
        opponentMove: result.violetMove,
        opponentName: 'Violet',
        gameStatus: result.gameStatus,
      });
      await channel.send(`**Pennywise:**\n${pennywiseLine}`);
    } catch (err) {
      console.error('Exhibition narration failed:', err);
      await channel.send(`(Narration hiccupped this turn — moves resolved: ${JSON.stringify(result.violetMove)} / ${JSON.stringify(result.pennywiseMove)}.)`).catch(() => {});
    }

    if (result.gameStatus.status !== 'active') {
      stopExhibitionLoop(channelId);
      gameManager.endSession(channelId);
      await channel.send(`*The board goes still.* Exhibition complete — status: **${result.gameStatus.status}**.`);
    }
  }, EXHIBITION_TURN_DELAY_MS);

  exhibitionLoops.set(channelId, handle);
}

function stopExhibitionLoop(channelId) {
  const handle = exhibitionLoops.get(channelId);
  if (handle) clearInterval(handle);
  exhibitionLoops.delete(channelId);
}

// ── Interaction handling ────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const channelId = interaction.channelId;

  try {
    if (interaction.commandName === 'newgame') {
      const mode = interaction.options.getString('mode') || 'vs-pennywise';

      if (gameManager.getSession(channelId)) {
        await interaction.reply({ content: 'A game is already running in this channel. `/resign` first.', ephemeral: true });
        return;
      }

      if (mode === 'exhibition') {
        gameManager.startNewGame(channelId, 'exhibition');
        await interaction.reply(
          "*Two boards fold into one. Violet takes white without a word. Pennywise takes black without being asked.*\n" +
          "An exhibition match begins — Violet vs Pennywise, fully autonomous. `/resign` to stop it early."
        );
        startExhibitionLoop(interaction.channel, channelId);
        return;
      }

      gameManager.startNewGame(channelId, 'vs-pennywise', {
        playerName: interaction.user.displayName || interaction.user.username,
        playerUserId: interaction.user.id,
      });
      await interaction.reply("*A fresh board rises out of the dark, pieces settling into place.*\n[00:21] \"Fresh board. Fresh blood. Let's float.\"");
      return;
    }

    if (interaction.commandName === 'rules') {
      const embed = new EmbedBuilder()
        .setTitle('Float Chess — Ruleset')
        .setDescription(RULES_TEXT)
        .setColor(0x9b59b6);
      await interaction.reply({
        content: '[01:26] "You want the manual? Fine. But manuals don\'t save you."',
        embeds: [embed],
      });
      return;
    }

    if (interaction.commandName === 'song') {
      await interaction.reply('[01:10] "You want to hear the heartbeat? Here. Don\'t say I never gave you anything."\nhttps://youtu.be/eBwec9gtuCI');
      return;
    }

    if (interaction.commandName === 'stats') {
      const stats = gameManager.getStats(interaction.user.id);
      await interaction.reply(
        `[03:15] "You want receipts? Fine. But numbers are just gravestones with better formatting."\n` +
        `**${interaction.user.displayName || interaction.user.username}** — Wins: ${stats.wins} · Losses: ${stats.losses} · Draws: ${stats.draws}`
      );
      return;
    }

    if (interaction.commandName === 'resign') {
      const session = gameManager.getSession(channelId);
      if (!session) {
        await interaction.reply({ content: 'There is no game running in this channel.', ephemeral: true });
        return;
      }

      if (session.mode === 'exhibition') {
        stopExhibitionLoop(channelId);
        gameManager.endSession(channelId);
        await interaction.reply('*The board folds shut early.* Exhibition stopped.');
        return;
      }

      const result = gameManager.resign(channelId);
      if (!result.ok) {
        await interaction.reply({ content: `Couldn't resign (${result.reason}).`, ephemeral: true });
        return;
      }
      gameManager.endSession(channelId);
      await interaction.reply('[02:10] "Walking away? Respect. The sewer doesn\'t judge. It just waits."');
      return;
    }

    if (interaction.commandName === 'move') {
      const session = gameManager.getSession(channelId);
      if (!session) {
        await interaction.reply({ content: 'No game is running here — try `/newgame` first.', ephemeral: true });
        return;
      }
      if (session.mode !== 'vs-pennywise') {
        await interaction.reply({ content: 'This channel is running an exhibition match — nobody submits moves for that one.', ephemeral: true });
        return;
      }

      await interaction.deferReply(); // engine + LLM call take a moment

      const from = interaction.options.getString('from');
      const to = interaction.options.getString('to');
      const special = interaction.options.getString('special') || undefined;
      const promotion = interaction.options.getString('promotion') || undefined;

      const result = gameManager.submitHumanMoveAndResolve(channelId, { from, to, special, promotion });

      if (!result.ok) {
        await interaction.editReply(`That move couldn't be submitted (${result.reason}). Try again.`);
        return;
      }

      let narration;
      try {
        narration = await pennywisePersona.narrateTurn({
          events: result.events,
          selfMove: result.pennywiseMove,
          opponentMove: result.humanMove,
          opponentName: session.playerName,
          gameStatus: result.gameStatus,
        });
      } catch (err) {
        console.error('Persona narration failed:', err);
        narration = `*The board hums, unreadable for a moment.*\n(Pennywise's dialogue engine hiccupped — moves resolved: ${JSON.stringify(result.humanMove)} / ${JSON.stringify(result.pennywiseMove)}.)`;
      }

      await interaction.editReply(narration);

      if (result.gameStatus.status !== 'active') {
        gameManager.endSession(channelId);
      }
      return;
    }
  } catch (err) {
    console.error('Interaction handling error:', err);
    const payload = { content: 'Something went wrong handling that — check the logs.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
});

// ── Casual chat (no game move, just conversation) ───────────
// Only responds in vs-pennywise channels — during an exhibition
// match there's no single human player for a persona to address,
// so casual chat is left alone there to avoid ambiguity about
// which persona should reply.

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const session = gameManager.getSession(message.channelId);
  if (!session || session.mode !== 'vs-pennywise') return;
  if (message.content.startsWith('/')) return; // slash commands handled above

  if (message.content.trim().toUpperCase() === 'RED BALLOON') {
    await message.reply('[01:26] "Balloon popped. We\'re good. The sewers are just pipes."');
    return;
  }

  try {
    const reply = await pennywisePersona.converse({
      playerName: message.member?.displayName || message.author.username,
      message: message.content,
    });
    await message.reply(reply);
  } catch (err) {
    console.error('Casual conversation failed:', err);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

async function main() {
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
