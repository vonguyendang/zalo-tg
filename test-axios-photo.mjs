import axios from 'axios';
import { config } from './src/config.js';
import FormData from 'form-data';
import { createReadStream } from 'fs';

async function test() {
  console.log("Sending photo with axios...");
  try {
    const form = new FormData();
    form.append('chat_id', config.telegram.groupId);
    form.append('photo', createReadStream('test-qr.png'));
    
    await axios.post(`https://api.telegram.org/bot${config.telegram.botToken}/sendPhoto`, form, {
      headers: form.getHeaders(),
      timeout: 15000
    });
    console.log("Sent successfully with axios!");
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
