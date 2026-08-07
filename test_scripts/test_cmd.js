const { Telegraf } = require('telegraf');
require('dotenv').config();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.use((ctx, next) => {
  console.log('Received message:', ctx.message?.text);
  console.log('ctx.me is:', ctx.me);
  console.log('bot.botInfo is:', bot.botInfo);
  return next();
});

bot.command('group_info', (ctx) => {
  console.log('Command matched!');
});

bot.launch().then(() => {
  console.log('Bot launched. Send a command to test.');
  setTimeout(() => process.exit(0), 10000);
});
