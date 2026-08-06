import { Telegraf } from 'telegraf';
import fs from 'fs';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
fs.writeFileSync('/tmp/test_photo.jpg', 'fake image data');
console.log("Sending photo...");
bot.telegram.sendPhoto(-1003968219458, 'file:///tmp/test_photo.jpg', { message_thread_id: 11 })
  .then(res => console.log("Success:", res.message_id))
  .catch(err => console.log("Error:", err.message));
