import { Telegraf } from 'telegraf';
import fs from 'node:fs';

const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
  telegram: { apiRoot: 'http://localhost:8081' }
});
const groupId = -1003968219458;
const topicId = 30;

async function run() {
  try {
    fs.writeFileSync('test_photo.jpg', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
    const res = await bot.telegram.sendPhoto(groupId, { source: 'test_photo.jpg' }, { message_thread_id: topicId, caption: 'Test photo' });
    console.log("Success! Message ID:", res.message_id);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
