import { Zalo } from 'zca-js';
import fs from 'fs';

(async () => {
  const creds = JSON.parse(fs.readFileSync('sessions/credentials_1508995969111268915.json'));
  const api = new Zalo(creds);
  await api.login();
  api.listener.start();
  
  api.listener.on('message', (msg) => {
    console.log('[MESSAGE]', msg.data.groupId || msg.data.uidFrom, msg.data.content);
  });
  
  console.log('Listening for 30s...');
  setTimeout(() => {
    console.log('Done');
    process.exit(0);
  }, 30000);
})();
