const fs = require('fs');
let code = fs.readFileSync('src/zalo/handler.ts', 'utf8');

// 1. setupZaloHandler signature
code = code.replace(
  'export async function setupZaloHandler(api: ZaloAPI): Promise<void> {',
  'export async function setupZaloHandler(api: ZaloAPI, accountId: string, accountName: string): Promise<void> {'
);

// 2. getOrCreateTopic signature
code = code.replace(
  'async function getOrCreateTopic(\n  api: ZaloAPI,\n  zaloId: string,',
  'async function getOrCreateTopic(\n  api: ZaloAPI,\n  accountId: string,\n  accountName: string,\n  zaloId: string,'
);

// 3. _doCreateTopic signature
code = code.replace(
  'async function _doCreateTopic(\n  api: ZaloAPI,\n  zaloId: string,',
  'async function _doCreateTopic(\n  api: ZaloAPI,\n  accountId: string,\n  accountName: string,\n  zaloId: string,'
);

// 4. sendWithTopicRecovery signature
code = code.replace(
  'async function sendWithTopicRecovery<T>(\n  api: ZaloAPI,\n  zaloId: string,',
  'async function sendWithTopicRecovery<T>(\n  api: ZaloAPI,\n  accountId: string,\n  accountName: string,\n  zaloId: string,'
);

// 5. Calls to getOrCreateTopic
code = code.replace(/getOrCreateTopic\(api, zaloId, type, displayName, avatarUrl, true\)/g, 'getOrCreateTopic(api, accountId, accountName, zaloId, type, displayName, avatarUrl, true)');
code = code.replace(/getOrCreateTopic\(api, zaloId, type, displayName, groupAvatarUrl\)/g, 'getOrCreateTopic(api, accountId, accountName, zaloId, type, displayName, groupAvatarUrl)');

// 6. Calls to _doCreateTopic
code = code.replace(/_doCreateTopic\(api, zaloId, type, displayName, avatarUrl\)/g, '_doCreateTopic(api, accountId, accountName, zaloId, type, displayName, avatarUrl)');

// 7. Calls to sendWithTopicRecovery
code = code.replace(/sendWithTopicRecovery\(\n\s+api,\n\s+zaloId/g, 'sendWithTopicRecovery(\n        api,\n        accountId,\n        accountName,\n        zaloId');

// 8. store.getTopicByZalo
code = code.replace(/store\.getTopicByZalo\(zaloId, type\)/g, 'store.getTopicByZalo(accountId, zaloId, type)');
code = code.replace(/store\.getTopicByZalo\(msg\.threadId, msg\.type as 0 \| 1\)/g, 'store.getTopicByZalo(accountId, msg.threadId, msg.type as 0 | 1)');
code = code.replace(/store\.getTopicByZalo\(String\(zaloId\), type\)/g, 'store.getTopicByZalo(accountId, String(zaloId), type)');
code = code.replace(/store\.getTopicByZalo\(groupId, 1 \/\* Group \*\/\)/g, 'store.getTopicByZalo(accountId, groupId, 1 /* Group */)');
code = code.replace(/store\.getTopicByZalo\(groupId, 1\)/g, 'store.getTopicByZalo(accountId, groupId, 1)');

// 9. store.set
code = code.replace(/store\.set\(\{ topicId, zaloId, type, name: displayName \}\)/g, 'store.set({ topicId, accountId, zaloId, type, name: displayName })');
code = code.replace(/store\.set\(\{ topicId: fallbackId, zaloId, type, name: displayName \}\)/g, 'store.set({ topicId: fallbackId, accountId, zaloId, type, name: displayName })');

// 10. syncGroupHistory call
code = code.replace(/syncGroupHistory\(api, zaloId, topicId\)/g, 'syncGroupHistory(api, accountId, zaloId, topicId)');

// 11. Prefix topic names
code = code.replace(
  'const name = topicName(displayName, type);',
  'const name = `[${accountName}] ${topicName(displayName, type)}`;'
);
// Also rename DM topics with prefix
code = code.replace(
  'const nextName = topicName(displayName, ThreadType.User);',
  'const nextName = `[${accountName}] ${topicName(displayName, ThreadType.User)}`;'
);
// Update maybeRenameExistingDmTopic signature and call
code = code.replace(
  'async function maybeRenameExistingDmTopic(\n  topicId: number,\n  zaloId: string,\n  displayName: string,\n)',
  'async function maybeRenameExistingDmTopic(\n  topicId: number,\n  accountId: string,\n  accountName: string,\n  zaloId: string,\n  displayName: string,\n)'
);
code = code.replace(
  'await maybeRenameExistingDmTopic(existing, zaloId, displayName);',
  'await maybeRenameExistingDmTopic(existing, accountId, accountName, zaloId, displayName);'
);

fs.writeFileSync('src/zalo/handler.ts', code);
console.log('Refactored src/zalo/handler.ts');
