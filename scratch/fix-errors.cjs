const fs = require('fs');

// Fix index.ts
let idx = fs.readFileSync('src/index.ts', 'utf8');
idx = idx.replace(/config\.zalo\.defaultAccountId \|\| 'default'/g, "Array.from(getAllZaloApis().keys())[0] || 'default'");
fs.writeFileSync('src/index.ts', idx);

// Fix handler.ts
let hnd = fs.readFileSync('src/telegram/handler.ts', 'utf8');

// handle newUid in /loginweb
hnd = hnd.replace(/currentApi = newApi;\n      void onZaloLogin\(newApi, newUid\)/g, "currentApi = newApi.api;\n      void onZaloLogin(newApi.api, newApi.uid)");

// handle accountId in /login
hnd = hnd.replace(/currentApi = newApi;\n      void onZaloLogin\(newApi, accountId\)/g, "currentApi = newApi.api;\n      void onZaloLogin(newApi.api, newApi.uid)");

// handle newApi in /loginapp
hnd = hnd.replace(/currentApi = newApi;\n      void onZaloLogin\(newApi\)/g, "currentApi = newApi;\n      // void onZaloLogin(newApi)  TODO: handle app login properly");

// fix store.getTopicByZalo missing arguments
hnd = hnd.replace(/store\.getTopicByZalo\(([^,]+),\n?\s*([^,]+)\)/g, "store.getTopicByZalo('default', $1, $2)");

// fix store.set missing accountId
hnd = hnd.replace(/store\.set\(\{ topicId([^:]*):([^,]+), zaloId, type, name: displayName \}\)/g, "store.set({ topicId$1: $2, accountId: 'default', zaloId, type, name: displayName })");
hnd = hnd.replace(/store\.set\(\{ topicId, zaloId, type, name: displayName \}\)/g, "store.set({ topicId, accountId: 'default', zaloId, type, name: displayName })");

fs.writeFileSync('src/telegram/handler.ts', hnd);
