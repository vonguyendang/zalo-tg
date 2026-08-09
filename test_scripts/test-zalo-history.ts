import { Zalo } from 'zca-js';
import fs from 'fs';

async function main() {
  const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
  const zalo = new Zalo({ logging: false });
  const api = (await zalo.login(credentials)) as any;
  
  const groupId = "3330306390409405173";
  console.log("Testing with groupId:", groupId);

  // 1. Get first batch
  console.log("\n--- Batch 1 ---");
  const batch1 = await api.getGroupChatHistory(groupId, 10);
  console.log("Returned count:", batch1?.groupMsgs?.length);
  if (!batch1 || !batch1.groupMsgs || batch1.groupMsgs.length === 0) return;
  
  const firstMsgId1 = batch1.groupMsgs[0].msgId;
  const lastMsgId1 = batch1.groupMsgs[batch1.groupMsgs.length - 1].msgId;
  console.log("Batch 1 first msgId:", firstMsgId1, "last msgId:", lastMsgId1);

  // 2. Try to get second batch
  console.log("\n--- Batch 2 (Custom Request) ---");
  const oldestMsgId = lastMsgId1;
  
  const ctx = api.ctx;
  const utils = api.utils;
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/history`);
  
  const params = {
      grid: groupId,
      count: 10,
      msgId: oldestMsgId
  };
  const encryptedParams = utils.encodeAES(JSON.stringify(params));
  const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
      method: "GET",
  });
  
  const result = utils.resolve(response, (res: any) => {
      let data = res.data;
      if (typeof data === "string") {
          data = JSON.parse(data);
      }
      return data;
  });

  console.log("Batch 2 returned count:", result?.groupMsgs?.length);
  if (result && result.groupMsgs && result.groupMsgs.length > 0) {
    console.log("Batch 2 first msgId:", result.groupMsgs[0].msgId);
    console.log("Batch 2 last msgId:", result.groupMsgs[result.groupMsgs.length - 1].msgId);
    const overlap = result.groupMsgs.find((m: any) => m.msgId === lastMsgId1);
    console.log("Overlap with oldest message from Batch 1:", !!overlap);
  }
}

main().catch(console.error);
