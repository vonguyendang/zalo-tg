const { Telegraf } = require('telegraf');
const fs = require('fs');
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});

const groupId = -1003968219458;

async function test() {
  try {
    const buf = fs.readFileSync('kim_loi.jpg');
    console.log('Sending sendMediaGroup with Buffer ...');
    await bot.telegram.sendMediaGroup(groupId, [
      { type: 'photo', media: { source: buf }, caption: 'Test buffer' },
      { type: 'photo', media: { source: buf } }
    ]);
    console.log('sendMediaGroup Buffer success!');
  } catch (err) {
    console.log('sendMediaGroup Buffer error:', err.message);
  }
}
test();
