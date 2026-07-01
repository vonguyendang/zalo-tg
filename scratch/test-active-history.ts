import { Zalo } from 'zca-js';
import fs from 'fs';

async function main() {
  const credentials = JSON.parse(fs.readFileSync('./sessions/credentials_1508995969111268915.json', 'utf8'));
  const zalo = new Zalo({ logging: true });
  const api = (await zalo.login(credentials)) as any;
  
  console.log("Logged in successfully!");
  console.log("Group service map:", api.zpwServiceMap.group);
  
  const groupId = "7197691817842572065";
  console.log("Testing with groupId:", groupId);

  try {
    const batch1 = await api.getGroupChatHistory(groupId, 10);
    console.log("Returned count:", batch1?.groupMsgs?.length);
  } catch (err: any) {
    console.error("Failed to fetch history:", err);
    if (err.response) {
      console.log("Response status:", err.response.status);
      console.log("Response headers:", err.response.headers);
      try {
        const text = await err.response.text();
        console.log("Response body:", text);
      } catch (e) {}
    }
  }
}

main().catch(console.error);
