import { Telegraf } from 'telegraf';
const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
  telegram: { apiRoot: 'http://localhost:8081' }
});
bot.telegram.sendDocument(-1003968219458, 'file:///tmp/zalo-tg/test.jpg', { message_thread_id: 11 })
  .then(res => console.log("Success:", res.message_id))
  .catch(err => console.log("Error:", err.message));
