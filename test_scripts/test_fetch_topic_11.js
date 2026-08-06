import fetch from 'node-fetch';
async function run() {
  const token = process.env.BOT_TOKEN;
  const groupId = -1003968219458;
  const topicId = 11;
  const url = `http://localhost:8081/bot${token}/getUpdates?allowed_updates=["message"]`;
  const res = await fetch(url);
  const data = await res.json();
  const msgs = data.result.filter(u => u.message && u.message.chat.id === groupId && u.message.message_thread_id === topicId);
  console.log("Recent messages in Topic 11:", JSON.stringify(msgs.slice(-5), null, 2));
}
run();
