const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

code = code.replace(
  "import { getZaloApi, resetZaloApi, StaleCredentialsError, triggerQRLogin } from './zalo/client.js';",
  "import { getAllZaloApis, initAllZaloApis, StaleCredentialsError, triggerQRLogin, clearCredentials, getZaloApi } from './zalo/client.js';\nimport type { ZaloAPI } from './zalo/types.js';"
);

code = code.replace(
  "let _setZaloApi: ((api: Awaited<ReturnType<typeof getZaloApi>>) => void) | null = null;",
  "let _setZaloApi: ((api: ZaloAPI) => void) | null = null;"
);

code = code.replace(
  "async function pruneLeftGroupTopics(api: Awaited<ReturnType<typeof getZaloApi>>): Promise<void> {",
  "async function pruneLeftGroupTopics(api: ZaloAPI): Promise<void> {"
);

code = code.replace(
  "async function startZalo(\n  api: Awaited<ReturnType<typeof getZaloApi>>,\n  isReconnect = false,\n): Promise<void> {",
  "async function startZalo(\n  api: ZaloAPI,\n  accountId: string,\n  accountName: string,\n  isReconnect = false,\n): Promise<void> {"
);

code = code.replace(
  "await setupZaloHandler(api);",
  "await setupZaloHandler(api, accountId, accountName);"
);

code = code.replace(
  "const n = await syncGroupHistory(api, g.zaloId, g.topicId, {",
  "const n = await syncGroupHistory(api, accountId, g.zaloId, g.topicId, {"
);

code = code.replace(
  "resetZaloApi();\n          const newApi = await getZaloApi();\n          _setZaloApi?.(newApi);\n          await startZalo(newApi, true);",
  "// Handle reconnect properly for the specific API\n          const newApi = getZaloApi(accountId);\n          if (newApi) await startZalo(newApi, accountId, accountName, true);"
);

code = code.replace(
  "const setZaloApi = setupTelegramHandler(null, async (newApi) => {\n    await startZalo(newApi, true);\n  });\n  _setZaloApi = setZaloApi;",
  "const setZaloApi = setupTelegramHandler(async (newApi, accountId) => {\n    await startZalo(newApi, accountId, accountId, false);\n  });\n  _setZaloApi = setZaloApi;"
);

code = code.replace(
  "getZaloApi()\n      .then(async (api) => {\n        setZaloApi(api);   // ← inject into Telegram handler so TG→Zalo works\n        await startZalo(api);\n        \n        // Gửi thông báo khởi động lên Telegram\n        await tgBot.telegram.sendMessage(\n          config.telegram.groupId,\n          '🚀 <b>Zalo ↔ Telegram Bridge</b> đã khởi động và kết nối thành công!',\n          { parse_mode: 'HTML' }\n        ).catch(() => undefined);\n      })",
  `initAllZaloApis()
      .then(async ({apis, expired}) => {
        if (apis.size > 0) {
          for (const [accountId, api] of apis.entries()) {
            await startZalo(api, accountId, accountId);
          }
          await tgBot.telegram.sendMessage(
            config.telegram.groupId,
            \`🚀 <b>Zalo ↔ Telegram Bridge</b> đã khởi động và kết nối thành công \${apis.size} tài khoản!\`,
            { parse_mode: 'HTML' }
          ).catch(() => undefined);
        } else {
          await tgBot.telegram.sendMessage(
            config.telegram.groupId,
            '⚠️ Chưa đăng nhập Zalo. Gửi <b>/login</b> để đăng nhập.',
            { parse_mode: 'HTML' }
          ).catch(() => undefined);
        }
        
        for (const accountId of expired) {
          await tgBot.telegram.sendMessage(
            config.telegram.groupId,
            \`🔄 Session Zalo của tài khoản \${accountId} đã hết hạn. Hãy dùng /login để quét mã mới.\`,
          ).catch(() => undefined);
        }
      })`
);

code = code.replace(
  "      .catch(async (err: unknown) => {\n        if (err instanceof StaleCredentialsError) {\n          console.warn('[Boot] Zalo auto-login failed: session hết hạn. Tự động mở QR login...');\n          tgBot.telegram\n            .sendMessage(\n              config.telegram.groupId,\n              '🔄 Session Zalo đã hết hạn. Đang tự động tạo mã QR để đăng nhập lại...',\n            )\n            .catch(() => undefined);\n          // Trigger auto QR login\n          try {\n            const { createReadStream } = await import('fs');\n            const newApi = await triggerQRLogin({\n              onQRReady: async (imagePath) => {\n                await tgBot.telegram.sendPhoto(\n                  config.telegram.groupId,\n                  { source: createReadStream(imagePath) },\n                  {\n                    caption: '📱 Mở ứng dụng <b>Zalo</b> → Cài đặt → Quét mã QR để đăng nhập lại.',\n                    parse_mode: 'HTML',\n                  },\n                ).catch(() => undefined);\n              },\n              onExpired: async () => {\n                tgBot.telegram.sendMessage(config.telegram.groupId, '⏰ QR hết hạn, đang tạo mã mới...').catch(() => undefined);\n              },\n              onScanned: async (displayName) => {\n                tgBot.telegram.sendMessage(\n                  config.telegram.groupId,\n                  `✅ Đã quét! Chờ xác nhận từ <b>\${displayName}</b>...`,\n                  { parse_mode: 'HTML' },\n                ).catch(() => undefined);\n              },\n              onDeclined: async () => {\n                tgBot.telegram.sendMessage(config.telegram.groupId, '❌ Đăng nhập bị từ chối trên điện thoại.').catch(() => undefined);\n              },\n              onSuccess: async () => {\n                tgBot.telegram.sendMessage(config.telegram.groupId, '🎉 Đăng nhập Zalo thành công! Bridge đang hoạt động.').catch(() => undefined);\n              },\n            });\n            setZaloApi(newApi);\n            await startZalo(newApi);\n          } catch (qrErr: unknown) {\n            console.error('[Boot] Auto QR login failed:', qrErr);\n            tgBot.telegram\n              .sendMessage(\n                config.telegram.groupId,\n                '❌ Đăng nhập QR tự động thất bại. Hãy dùng <b>/login</b> để thử lại.',\n                { parse_mode: 'HTML' },\n              )\n              .catch(() => undefined);\n          }\n          return;\n        }\n        console.warn('[Boot] Zalo auto-login failed:', err);\n        tgBot.telegram\n          .sendMessage(\n            config.telegram.groupId,\n            '⚠️ Chưa đăng nhập Zalo. Gửi <b>/login</b> để đăng nhập.',\n            { parse_mode: 'HTML' },\n          )\n          .catch(() => undefined);\n      });",
  "      .catch(async (err: unknown) => { console.error(err); });"
);

code = code.replace(
  "try { const api = await getZaloApi(); api.listener.stop(); } catch { /* ignore */ }",
  "try { for (const api of getAllZaloApis().values()) { api.listener.stop(); } } catch { /* ignore */ }"
);

fs.writeFileSync('src/index.ts', code);
console.log('Refactored src/index.ts');
