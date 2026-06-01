const fs = require('fs');
let code = fs.readFileSync('src/telegram/handler.ts', 'utf8');

// 1. Imports
code = code.replace(
  "import { triggerQRLogin } from '../zalo/client.js';",
  "import { triggerQRLogin, getAllZaloApis } from '../zalo/client.js';"
);

// 2. setupTelegramHandler signature
code = code.replace(
  "export function setupTelegramHandler(\n  initialApi: ZaloAPI | null,\n  onZaloLogin: (api: ZaloAPI) => Promise<void>,\n): (api: ZaloAPI) => void {",
  "export function setupTelegramHandler(\n  onZaloLogin: (api: ZaloAPI, accountId: string) => Promise<void>,\n): (api: ZaloAPI) => void {"
);

// 3. Remove currentApi initialization
code = code.replace(
  "  /** Mutable reference so /login can swap in a new API instance. */\n  let currentApi: ZaloAPI | null = initialApi;\n\n  /** Exposed setter so index.ts can inject the auto-logged-in API. */\n  const setCurrentApi = (api: ZaloAPI) => { currentApi = api; };",
  "  /** Exposed setter */\n  const setCurrentApi = (api: ZaloAPI) => { };\n  \n  // Helper to get default API if no topic\n  const getDefaultApi = () => { const apis = Array.from(getAllZaloApis().values()); return apis.length > 0 ? { api: apis[0], accountId: Array.from(getAllZaloApis().keys())[0] } : null; };"
);

// 4. Update handleLoginCommand to pass accountId (uid) to onZaloLogin
code = code.replace(
  "async function handleLoginCommand(\n  chatId: number,\n  threadId: number | undefined,\n  onNewApi: (api: ZaloAPI) => void,\n)",
  "async function handleLoginCommand(\n  chatId: number,\n  threadId: number | undefined,\n  onNewApi: (api: ZaloAPI, accountId: string) => void,\n)"
);
code = code.replace(
  "onNewApi(newApi);",
  "onNewApi(newApi.api, newApi.uid);"
);
// In /loginapp
code = code.replace(
  "const newApi = await triggerAppLogin({",
  "const { api: newApi, uid: newUid } = await triggerAppLogin({" // wait triggerAppLogin returns api and uid? I didn't change triggerAppLogin yet!
);
// I need to change triggerAppLogin later, for now let's assume it returns what triggerQRLogin returns.
code = code.replace(
  "void onZaloLogin(newApi)",
  "void onZaloLogin(newApi, newUid)"
);
// In /login
code = code.replace(
  "void onZaloLogin(newApi)",
  "void onZaloLogin(newApi, accountId)"
);

// 5. Replace currentApi usages
// For /history
code = code.replace(
  "if (!currentApi) {",
  "const api = getAllZaloApis().get(entry.accountId);\n    if (!api) {"
);
code = code.replace(
  "const forwarded = await syncGroupHistory(currentApi, entry.zaloId, topicId, { count, delayMs });",
  "const forwarded = await syncGroupHistory(api, entry.accountId, entry.zaloId, topicId, { count, delayMs });"
);

// For /callgroup fallback
code = code.replace(
  "if (!groupData && currentApi) {",
  "const api = getAllZaloApis().get(entry.accountId);\n      if (!groupData && api) {"
);
code = code.replace(
  "const info = await currentApi.getGroupInfo(entry.zaloId) as {",
  "const info = await api.getGroupInfo(entry.zaloId) as {"
);

// For other commands like /search, /addfriend, etc., we replace `currentApi` with `getDefaultApi()?.api`.
// This is a bit manual, let's just do a regex replace where safe.
code = code.replace(/currentApi/g, "getDefaultApi()?.api");
code = code.replace(/getDefaultApi\(\)\?\.api = newApi;/g, ""); // Remove assignments to currentApi
code = code.replace(/getDefaultApi\(\)\?\.api/g, "(getDefaultApi()?.api)"); // ensure it's safe

// 6. Fix store.getTopicByZalo usage (needs 3 arguments now)
code = code.replace(/store\.getTopicByZalo\(zaloId, type\)/g, "store.getTopicByZalo('default', zaloId, type)"); // I'll fix this later with proper accountId

// 7. Fix store.set usage
code = code.replace(
  /store\.set\(\{ topicId: fallbackId, zaloId, type, name: displayName \}\)/g,
  "store.set({ topicId: fallbackId, accountId: accountId || 'default', zaloId, type, name: displayName })"
);
code = code.replace(
  /store\.set\(\{ topicId, zaloId, type, name: displayName \}\)/g,
  "store.set({ topicId, accountId: accountId || 'default', zaloId, type, name: displayName })"
);

fs.writeFileSync('src/telegram/handler.ts', code);
console.log('Refactored src/telegram/handler.ts partially');
