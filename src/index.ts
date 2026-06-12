import { setTelegramErrorReporter } from './log.js';
    // @ts-ignore
import { ZaloAPI } from './zalo/types.js';
    // @ts-ignore
import type { ZaloAPI } from './zalo/types.js';
import { getZaloApi, getAllZaloApis, initAllZaloApis, clearCredentials, StaleCredentialsError, triggerQRLogin } from './zalo/client.js';
import { CloseReason, ThreadType } from 'zca-js';
import { setupZaloHandler } from './zalo/handler.js';
import { tgBot, syncTelegramCommands } from './telegram/bot.js';
import { setupTelegramHandler } from './telegram/handler.js';
import { config } from './config.js';
import { startUpdateChecker } from './updater.js';
import { store, accountAliasStore } from './store.js';
import { syncGroupHistory } from './zalo/historySync.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

let _errorTopicId: number | null = null;
async function getErrorTopicId(): Promise<number | undefined> {
  if (_errorTopicId !== null) return _errorTopicId;
  const _errorTopicFile = path.resolve(config.dataDir, 'error-topic.txt');
  if (existsSync(_errorTopicFile)) {
    const content = readFileSync(_errorTopicFile, 'utf8').trim();
    if (content) {
      _errorTopicId = Number(content);
      return _errorTopicId;
    }
  }
  
  try {
    const topic = await tgBot.telegram.createForumTopic(config.telegram.groupId, 'Error logs');
    _errorTopicId = topic.message_thread_id;
    writeFileSync(_errorTopicFile, String(_errorTopicId), 'utf8');
    return _errorTopicId;
  } catch (err) {
    return undefined; // Might not be a forum group
  }
}

// ── Global safety net — prevent unhandled rejections from crashing ────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Boot] Unhandled rejection (ignored):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Boot] Uncaught exception (ignored):', err);
});

// ── Module-level ref to Telegram handler's API setter (used by reconnect) ──────
let _setZaloApi: any = null;
let _reconnectInProgress = false;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ── Boot Zalo (also used when /login swaps in a fresh API) ───────────────────

async function pruneLeftGroupTopics(api: Awaited<ReturnType<typeof getZaloApi>>, accountId: string): Promise<void> {
  try {
    const groups = await api.getAllGroups() as { gridVerMap?: Record<string, string> } | undefined;
    const activeGroupIds = new Set(Object.keys(groups?.gridVerMap ?? {}));
    const removed: string[] = [];
    for (const entry of store.all()) {
      if (entry.type === 1 && entry.accountId === accountId && !activeGroupIds.has(entry.zaloId)) {
        store.remove(entry.topicId);
        removed.push(`${entry.name} (${entry.zaloId})`);
      }
    }
    if (removed.length > 0) {
      console.log(`[Boot] Pruned ${removed.length} stale group topic(s): ${removed.join(', ')}`);
    }
  } catch (err) {
    console.warn('[Boot] Could not prune stale group topics:', err);
  }
}


async function startZalo(
  api: any,
  accountId: string,
  accountName: string,
  isReconnect = false,
): Promise<void> {
  if (!isReconnect) void pruneLeftGroupTopics(api, accountId);
  await setupZaloHandler(api, accountId, accountName);

  api.listener.once('connected', () => {
    try {
      api.listener.requestOldMessages(ThreadType.User);
      api.listener.requestOldMessages(ThreadType.Group);
      api.listener.requestOldReactions(ThreadType.User);
      api.listener.requestOldReactions(ThreadType.Group);
      console.log(`[Boot] Requested catch-up sync for ${accountName} (isReconnect=${isReconnect})`);

      void (async () => {
        const groups = store.all().filter(e => e.type === 1 && e.accountId === accountId);
        if (groups.length === 0) return;
        
        tgBot.telegram.sendMessage(
          config.telegram.groupId, 
          `🔄 <b>Zalo (${accountName}) đang tự động đồng bộ lịch sử tin nhắn lỡ...</b>\nQuá trình này đang chạy ngầm và có thể mất vài phút.`,
          { parse_mode: 'HTML' }
        ).catch(() => undefined);

        let totalSynced = 0;
        for (const g of groups) {
          try {
            const n = await syncGroupHistory(api, g.zaloId, g.topicId, accountId, { 
              count: 30, 
              delayMs: config.zalo.historySyncDelayMs || 2000 
            });
            totalSynced += n;
            await new Promise(r => setTimeout(r, 3000));
          } catch (err) {
            console.warn(`[Boot] Lỗi đồng bộ tin lỡ cho nhóm ${g.zaloId}:`, err);
          }
        }
        if (totalSynced > 0) {
          const actionText = isReconnect ? 'kết nối lại' : 'khởi động';
          tgBot.telegram.sendMessage(
            config.telegram.groupId, 
            `🔄 <b>Zalo (${accountName}) đã ${actionText}.</b>\nĐã tự động đồng bộ ${totalSynced} tin nhắn lỡ.`,
            { parse_mode: 'HTML' }
          ).catch(() => undefined);
        }
      })();
    } catch (err) {
      console.warn('[Boot] Failed to request catch-up sync:', err);
    }
  });
  
  try {
    api.listener.start();
    console.log(`[Boot] Zalo listener ${isReconnect ? 're' : ''}started for ${accountName} ✓`);
  } catch (err) {
    if (String(err).includes('Already started')) {
      console.warn(`[Boot] Zalo listener cho ${accountName} đã được bật từ trước.`);
    } else {
      throw err;
    }
  }

  let _reconnectInProgress = false;
  const scheduleReconnect = (delayMs: number): void => {
    if (_reconnectInProgress) return;
    _reconnectInProgress = true;
    
    tgBot.telegram.sendMessage(
      config.telegram.groupId, 
      `⚠️ <b>Zalo (${accountName}) mất kết nối!</b>\nĐang tự động kết nối lại...`, 
      { parse_mode: 'HTML' }
    ).catch(() => undefined);

    let attempt = 0;
    const maxDelay = 30_000; // max 30 seconds between retries

    const doReconnect = (waitMs: number) => {
      setTimeout(() => {
        void (async () => {
          attempt++;
          try {
            const { initZaloApi } = await import('./zalo/client.js');
            const newApi = await initZaloApi(accountId);
            if (newApi) {
              await startZalo(newApi, accountId, accountName, true);
              const suffix = attempt > 1 ? ` sau ${attempt} lần thử.` : '.';
              tgBot.telegram.sendMessage(config.telegram.groupId, `✅ <b>Zalo (${accountName})</b> đã kết nối lại thành công${suffix}`, { parse_mode: 'HTML' }).catch(() => undefined);
              _reconnectInProgress = false;
            } else {
              // Retry on undefined (network error)
              console.warn(`[Boot] Zalo reconnect failed (attempt ${attempt}). Retrying...`);
              if (attempt === 1) {
                tgBot.telegram.sendMessage(config.telegram.groupId, `🔄 <b>Zalo (${accountName})</b> kết nối lại thất bại. Đang thử lại liên tục trong nền...`, { parse_mode: 'HTML' }).catch(() => undefined);
              }
              const nextDelay = Math.min(waitMs * 1.5, maxDelay);
              doReconnect(nextDelay);
            }
          } catch (err) {
            console.error('[Boot] Zalo reconnect failed critically:', err);
            tgBot.telegram.sendMessage(config.telegram.groupId, `❌ Lỗi khi kết nối lại Zalo (${accountName}): ${String(err)}`).catch(() => undefined);
            _reconnectInProgress = false;
          }
        })();
      }, waitMs);
    };

    doReconnect(delayMs);
  };

  api.listener.once('disconnected', (code: CloseReason, reason: string) => {
    if (code === CloseReason.ManualClosure) return;
    if (code === CloseReason.DuplicateConnection) {
      scheduleReconnect(10_000);
      return;
    }
    if (code === CloseReason.KickConnection) return;
    scheduleReconnect(5_000);
  });
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Zalo ↔ Telegram Bridge  v1.0.0     ║');
  console.log('╚══════════════════════════════════════╝');

  startUpdateChecker(tgBot);

  tgBot.command('reconnect', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId && ctx.chat.type !== 'private') return;
    
    const text = ctx.message.text || '';
    const parts = text.split(/\s+/).slice(1);
    const targetIds = parts.filter(p => p.length > 0);

    if (targetIds.length === 0) {
      await ctx.reply('🔄 Đang ngắt kết nối cũ và kết nối lại tất cả Zalo...');
      try {
        // Dừng các listener cũ trước khi khởi tạo lại để tránh trùng lặp
        for (const api of getAllZaloApis().values()) {
          try { api.listener.stop(); } catch (e) {}
        }
  
        const {apis} = await initAllZaloApis();
        for (const [accountId, api] of apis) {
      // @ts-ignore
           await startZalo(api, accountId, accountAliasStore.get(accountId) || 'Zalo', true);
        }
        await ctx.reply('✅ Đã kết nối lại tất cả Zalo thành công!');
      } catch (err) {
        console.error('[/reconnect] Failed:', err);
        await ctx.reply(`❌ Lỗi khi kết nối lại: ${String(err)}`).catch(() => undefined);
      }
    } else {
      await ctx.reply(`🔄 Đang kết nối lại ${targetIds.length} tài khoản Zalo...`);
      const { initZaloApi } = await import('./zalo/client.js');
      const allApis = getAllZaloApis();
      const successIds: string[] = [];
      const failedIds: string[] = [];

      for (const accountId of targetIds) {
         // Dừng listener cũ nếu đang chạy
         const oldApi = allApis.get(accountId);
         if (oldApi) {
           try { oldApi.listener.stop(); } catch (e) {}
         }
         
         try {
           const newApi = await initZaloApi(accountId);
           if (newApi) {
             // @ts-ignore
             await startZalo(newApi, accountId, accountAliasStore.get(accountId) || accountId, true);
             successIds.push(accountId);
           } else {
             failedIds.push(accountId);
           }
         } catch (e) {
           failedIds.push(accountId);
         }
      }

      let msg = '';
      if (successIds.length > 0) msg += `✅ Thành công: ${successIds.join(', ')}\n`;
      if (failedIds.length > 0) msg += `❌ Thất bại: ${failedIds.join(', ')}`;
      await ctx.reply(msg.trim() || 'Không có tài khoản nào được kết nối.');
    }
  });

  // setupTelegramHandler returns a setter to inject the Zalo API after auto-login.
    // @ts-ignore
  const setZaloApi = setupTelegramHandler(null, async (newApi, accountId, accountName) => {
    await startZalo(newApi, accountId, accountName, true);
  });
  _setZaloApi = setZaloApi;

  syncTelegramCommands().catch(() => undefined);

  tgBot.launch({ allowedUpdates: ['message', 'callback_query', 'message_reaction', 'poll_answer', 'poll'] }, () => {
    console.log('[Boot] Telegram bot started ✓');

    setTelegramErrorReporter((msg) => {
      void (async () => {
        try {
          const tid = await getErrorTopicId();
          await tgBot.telegram.sendMessage(config.telegram.groupId, `🚨 <b>Error Log:</b>\n<pre>${msg}</pre>`, {
            message_thread_id: tid,
            parse_mode: 'HTML',
          });
        } catch {}
      })();
    });

    void (async () => {
      try {
        const { apis, expired } = await initAllZaloApis();
        
        if (apis.size === 0 && expired.length === 0) {
           tgBot.telegram.sendMessage(
             config.telegram.groupId,
             `🔴 <b>Chưa có tài khoản Zalo nào được kết nối!</b>\n\n` +
             `Bot không thể hoạt động nếu không có tài khoản Zalo.\n\n` +
             `📌 <b>Cách đăng nhập:</b>\n` +
             `• <code>/login</code> — Đăng nhập qua QR Code (phổ biến)\n` +
             `• <code>/loginapp</code> — Đăng nhập qua PC App API\n\n` +
             `<i>Quét QR bằng app Zalo trên điện thoại của bạn.</i>`,
             { parse_mode: 'HTML' }
           ).catch(() => undefined);
        }

        for (const accountId of expired) {
           const alias = accountAliasStore.get(accountId) || accountId;
           tgBot.telegram.sendMessage(
             config.telegram.groupId,
             `⚠️ <b>Session hết hạn:</b> Tài khoản <b>${alias}</b> đã bị ngắt kết nối.\n\n` +
             `📌 Hãy dùng lệnh <code>/login</code> để đăng nhập lại ngay.`,
             { parse_mode: 'HTML' }
           ).catch(() => undefined);
        }
        for (const [accountId, api] of apis.entries()) {
           const uid = api.getOwnId?.();
           const user = uid ? await api.getUserInfo(uid).catch(() => undefined) : undefined;
    // @ts-ignore
           const accountName = user?.name || accountAliasStore.get(accountId) || 'Zalo';
           
           if (apis.size === 1) {
              store.migrateDefaultAccount(accountId);
           }
           await startZalo(api, accountId, accountName);
        }

        if (apis.size > 0) {
           const totalTopics = store.all().filter(e => e.type === 1).length;
           const dmTopics   = store.all().filter(e => e.type === 0).length;
           const accountLines = Array.from(apis.entries()).map(([id]) => {
             const alias = accountAliasStore.get(id) || id;
             return `  • ${alias}`;
           }).join('\n');
           tgBot.telegram.sendMessage(
             config.telegram.groupId,
             `🟢 <b>Zalo Bridge khởi động thành công!</b>\n\n` +
             `👤 <b>Tài khoản đang hoạt động (${apis.size}):</b>\n${accountLines}\n\n` +
             `📂 <b>Topics:</b> ${totalTopics} nhóm · ${dmTopics} cá nhân\n\n` +
             `💡 <b>Gợi ý:</b>\n` +
             `• <code>/status</code> — Xem chi tiết uptime, kết nối\n` +
             `• <code>/update</code> — Kiểm tra phiên bản mới\n` +
             `• <code>/search</code> — Tìm và tạo topic cho nhóm/bạn bè`,
             { parse_mode: 'HTML' }
           ).catch(() => undefined);
        }
      } catch (err) {
        console.error('[Boot] initAllZaloApis failed:', err);
      }
    })();
  });
}
main().catch(console.error);
