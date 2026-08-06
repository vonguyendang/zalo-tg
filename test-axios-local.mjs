import 'dotenv/config';
import axios from 'axios';
import { config } from './src/config.js';
import FormData from 'form-data';
import { createReadStream } from 'fs';

async function test() {
  try {
    const apiRoot = config.telegram.localServer || 'https://api.telegram.org';
    const form = new FormData();
    form.append('chat_id', config.telegram.groupId);
    form.append('photo', createReadStream('test-qr.png'));
    
    console.log("Sending to", apiRoot);
    await axios.post(`${apiRoot}/bot${config.telegram.token}/sendPhoto`, form, {
      headers: form.getHeaders(),
      timeout: 15000
    });
    console.log("Sent successfully with axios!");
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
