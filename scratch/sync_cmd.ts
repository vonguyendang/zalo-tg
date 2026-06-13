import { config } from '../src/config.js';
import { tgBot, BOT_COMMANDS } from '../src/telegram/bot.js';

async function run() {
  try {
    const res = await tgBot.telegram.setMyCommands(BOT_COMMANDS);
    console.log("Commands synced successfully:", res);
  } catch (e) {
    console.error("Error syncing commands:", e);
  }
}
run();
