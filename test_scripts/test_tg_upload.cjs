const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
const groupId = -1003968219458;
const testFile = '/Users/dangvo/Projects/zalo-tg/test_photo.jpg';

async function test() {
  try {
    console.log('Sending sendMediaGroup with { source } ...');
    await bot.telegram.sendMediaGroup(groupId, [
      { type: 'photo', media: { source: testFile }, caption: 'Test group' },
      { type: 'photo', media: { source: testFile } }
    ]);
    console.log('sendMediaGroup source success!');
  } catch (err) {
    console.log('sendMediaGroup source error:', err);
  }
  process.exit(0);
}
test();
