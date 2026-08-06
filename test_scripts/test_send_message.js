import { Telegraf } from 'telegraf';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
bot.telegram.sendMessage(-1003968219458, "Ping", { message_thread_id: 11 })
  .then(res => console.log("Success:", res.message_id))
  .catch(err => console.log("Error:", err.message));
