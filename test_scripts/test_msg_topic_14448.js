import { Telegraf } from 'telegraf';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
bot.telegram.sendMessage(-1003968219458, "Test message to Topic 14448 (Đăng from Quăn's view)", { message_thread_id: 14448 }).then(console.log).catch(console.error);
