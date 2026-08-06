import { execSync } from 'child_process';
import { config } from './src/config.js';

try {
  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendPhoto`;
  console.log("URL:", url);
  execSync(`curl -s -X POST "${url}" -F chat_id="${config.telegram.groupId}" -F photo="@test-qr.png"`, { stdio: 'inherit' });
} catch (e) {
  console.error("Error");
}
