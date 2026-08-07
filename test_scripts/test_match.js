const { Telegraf } = require('telegraf');

const bot = new Telegraf('dummy');
bot.botInfo = { username: 'zalo_to_telegram_bot' };

const ctx = {
  me: 'zalo_to_telegram_bot',
  message: {
    text: '/group_info@zalo_to_telegram_bot',
    entities: [{ type: 'bot_command', offset: 0, length: 32 }]
  }
};

const cmdEntity = ctx.message.entities[0];
const len = cmdEntity.length;
const text = ctx.message.text;
const [cmdPart, to] = text.slice(0, len).split('@');

console.log('cmdPart:', cmdPart);
console.log('to:', to);
console.log('Match?', to && to.toLowerCase() !== ctx.me.toLowerCase() ? 'NO' : 'YES');
