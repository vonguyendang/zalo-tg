const { Telegraf } = require('telegraf');
require('dotenv').config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.launch().then(() => {
  console.log('Bot launched!');
  console.log('bot.botInfo is:', bot.botInfo);
  process.exit(0);
}).catch(err => {
  console.error('Launch failed', err);
  process.exit(1);
});
