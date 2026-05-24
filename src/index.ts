import { getZaloApi, resetZaloApi, StaleCredentialsError, triggerQRLogin } from './zalo/client.js';
import { CloseReason, ThreadType } from 'zca-js';
import { setupZaloHandler } from './zalo/handler.js';
import { tgBot, syncTelegramCommands } from './telegram/bot.js';
import { setupTelegramHandler } from './telegram/handler.js';
import { config } from './config.js';
import { startUpdateChecker } from './updater.js';
import { store } from './store.js';

// ── Global safety net — prevent unhandled rejections from crashing ────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Boot] Unhandled rejection (ignored):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Boot] Uncaught exception (ignored):', err);
});

// ── Module-level ref to Telegram handler's API setter (used by reconnect) ──────
let _setZaloApi: ((api: Awaited<ReturnType<typeof getZaloApi>>) => void) | null = null;
let _reconnectInProgress = false;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ── Boot Zalo (also used when /login swaps in a fresh API) ───────────────────

async function pruneLeftGroupTopics(api: Awaited<ReturnType<typeof getZaloApi>>): Promise<void> {
  try {
    const groups = await api.getAllGroups() as { gridVerMap?: Record<string, string> } | undefined;
    const activeGroupIds = new Set(Object.keys(groups?.gridVerMap ?? {}));
    const removed: string[] = [];
    for (const entry of store.all()) {
      if (entry.type === 1 && !activeGroupIds.has(entry.zaloId)) {
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
  api: Awaited<ReturnType<typeof getZaloApi>>,
  isReconnect = false,
): Promise<void> {
  if (!isReconnect) void pruneLeftGroupTopics(api);
  await setupZaloHandler(api);
  if (isReconnect) {
    api.listener.once('connected', () => {
      try {
        // Recover recent gap after disconnect (messages + reactions in both DM/group).
        api.listener.requestOldMessages(ThreadType.User);
        api.listener.requestOldMessages(ThreadType.Group);
        api.listener.requestOldReactions(ThreadType.User);
        api.listener.requestOldReactions(ThreadType.Group);
        console.log('[Boot] Requested catch-up sync after reconnect');
      } catch (err) {
        console.warn('[Boot] Failed to request catch-up sync:', err);
      }
    });
  }
  api.listener.start();
  console.log(`[Boot] Zalo listener ${isReconnect ? 're' : ''}started ✓`);

  const scheduleReconnect = (delayMs: number): void => {
    if (_reconnectTimer || _reconnectInProgress) return;
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      void (async () => {
        if (_reconnectInProgress) return;
        _reconnectInProgress = true;
        try {
          resetZaloApi();
          const newApi = await getZaloApi();
          _setZaloApi?.(newApi);
          await startZalo(newApi, true);
          tgBot.telegram.sendMessage(config.telegram.groupId, '✅ Zalo đã kết nối lại và đang đồng bộ lại tin gần đây.').catch(() => undefined);
          console.log('[Boot] Zalo reconnected ✓');
        } catch (err) {
          console.error('[Boot] Zalo reconnect failed:', err);
          tgBot.telegram.sendMessage(
            config.telegram.groupId,
            '⚠️ Kết nối lại Zalo thất bại. Hãy dùng <b>/login</b> để đăng nhập lại.',
            { parse_mode: 'HTML' },
          ).catch(() => undefined);
        } finally {
          _reconnectInProgress = false;
        }
      })();
    }, delayMs);
  };

  // Auto-reconnect only on closings that are safe to recover automatically.
  api.listener.once('disconnected', (code: CloseReason, reason: string) => {
    if (code === CloseReason.ManualClosure) return;
    if (code === CloseReason.DuplicateConnection) {
      console.warn(`[Boot] Zalo disconnected: duplicate connection (code=${code}, reason=${reason})`);
      tgBot.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Zalo bị ngắt do đăng nhập trùng phiên (duplicate connection). Đóng phiên Zalo Web/PC khác rồi dùng <b>/login</b> nếu cần.',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);
      return;
    }
    if (code === CloseReason.KickConnection) {
      console.warn(`[Boot] Zalo disconnected: kicked connection (code=${code}, reason=${reason})`);
      tgBot.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Zalo đã ngắt phiên bridge (kick connection). Vui lòng đăng nhập lại bằng <b>/login</b>.',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);
      return;
    }
    console.warn(`[Boot] Zalo disconnected (code=${code}, reason=${reason}), reconnecting in 5 s…`);
    tgBot.telegram.sendMessage(
      config.telegram.groupId,
      '⚠️ Zalo bị ngắt kết nối, đang thử kết nối lại…',
    ).catch(() => undefined);
    scheduleReconnect(5_000);
  });
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Zalo ↔ Telegram Bridge  v1.0.0    ║');
  console.log('╚══════════════════════════════════════╝');

  // ── Auto update checker — must register BEFORE setupTelegramHandler ─────────
  // bot.action() is middleware; the catch-all on('callback_query') in handler.ts
  // doesn't call next(), so ua: callbacks must be registered first in the chain.
  startUpdateChecker(tgBot);

  // ── Wire up Telegram handler BEFORE launching the bot ─────────────────────
  // setupTelegramHandler returns a setter to inject the Zalo API after auto-login.
  const setZaloApi = setupTelegramHandler(null, async (newApi) => {
    await startZalo(newApi, true);
  });
  _setZaloApi = setZaloApi;

  // ── Register bot commands for Telegram menu ───────────────────────────────
  tgBot.telegram.setMyCommands([
    { command: 'login',          description: 'Đăng nhập Zalo qua QR code' },
    { command: 'loginweb',       description: 'Đăng nhập Zalo QR (giống /login)' },
    { command: 'loginapp',       description: 'Đăng nhập Zalo qua PC App API' },
    { command: 'search',         description: 'Tìm bạn bè / nhóm Zalo để tạo topic' },
    { command: 'group_info',     description: 'Xem thông tin & thành viên nhóm Zalo hiện tại' },
    { command: 'group_infoall',  description: 'Xem toàn bộ thành viên nhóm Zalo hiện tại' },
    { command: 'addfriend',      description: 'Tìm & kết bạn Zalo theo số điện thoại' },
    { command: 'addgroup',       description: 'Tạo topic cho nhóm Zalo chưa có topic' },
    { command: 'joingroup',      description: 'Tham gia nhóm Zalo qua link' },
    { command: 'leavegroup',     description: 'Rời nhóm Zalo & đóng topic (dùng trong topic nhóm)' },
    { command: 'friendrequests', description: 'Xem lời mời kết bạn & lời mời nhóm' },
    { command: 'topic',          description: 'Quản lý topic: list / info / delete' },
    { command: 'recall',         description: 'Thu hồi tin nhắn (reply vào tin đã gửi)' },
    { command: 'history',        description: 'Đồng bộ lịch sử tin nhắn nhóm vào topic' },
    { command: 'admin',          description: 'Admin panel: trạng thái, cache, tra mapping' },
    { command: 'status',         description: 'Xem trạng thái bridge: uptime, số topic, Zalo' },
    { command: 'update',         description: 'Kiểm tra bản cập nhật mới' },
  ]).catch(() => undefined);

  // ── Start Telegram bot so /login can be received immediately ───────────────
  // NOTE: tgBot.launch() runs the polling loop forever, so we must NOT await it.
  // The second argument callback fires once getMe() + deleteWebhook() succeed.
  tgBot.launch({ allowedUpdates: ['message', 'callback_query', 'message_reaction', 'poll_answer', 'poll'] }, () => {
    console.log('[Boot] Telegram bot started ✓');

    syncTelegramCommands()
      .then(() => console.log('[Boot] Telegram command menu synced ✓'))
      .catch((err: unknown) => console.warn('[Boot] Failed to sync Telegram commands:', err));

    // ── Attempt Zalo login in background ────────────────────────────────────
    // If credentials.json exists → connects automatically and updates currentApi.
    // If session is expired (StaleCredentialsError) → auto QR login via Telegram.
    // If credentials.json missing → notifies user to run /login.
    getZaloApi()
      .then(async (api) => {
        setZaloApi(api);   // ← inject into Telegram handler so TG→Zalo works
        await startZalo(api);
        
        // Gửi thông báo khởi động lên Telegram
        await tgBot.telegram.sendMessage(
          config.telegram.groupId,
          '🚀 <b>Zalo ↔ Telegram Bridge</b> đã khởi động và kết nối thành công!',
          { parse_mode: 'HTML' }
        ).catch(() => undefined);
      })
      .catch(async (err: unknown) => {
        if (err instanceof StaleCredentialsError) {
          console.warn('[Boot] Zalo auto-login failed: session hết hạn. Tự động mở QR login...');
          tgBot.telegram
            .sendMessage(
              config.telegram.groupId,
              '🔄 Session Zalo đã hết hạn. Đang tự động tạo mã QR để đăng nhập lại...',
            )
            .catch(() => undefined);
          // Trigger auto QR login
          try {
            const { createReadStream } = await import('fs');
            const newApi = await triggerQRLogin({
              onQRReady: async (imagePath) => {
                await tgBot.telegram.sendPhoto(
                  config.telegram.groupId,
                  { source: createReadStream(imagePath) },
                  {
                    caption: '📱 Mở ứng dụng <b>Zalo</b> → Cài đặt → Quét mã QR để đăng nhập lại.',
                    parse_mode: 'HTML',
                  },
                ).catch(() => undefined);
              },
              onExpired: async () => {
                tgBot.telegram.sendMessage(config.telegram.groupId, '⏰ QR hết hạn, đang tạo mã mới...').catch(() => undefined);
              },
              onScanned: async (displayName) => {
                tgBot.telegram.sendMessage(
                  config.telegram.groupId,
                  `✅ Đã quét! Chờ xác nhận từ <b>${displayName}</b>...`,
                  { parse_mode: 'HTML' },
                ).catch(() => undefined);
              },
              onDeclined: async () => {
                tgBot.telegram.sendMessage(config.telegram.groupId, '❌ Đăng nhập bị từ chối trên điện thoại.').catch(() => undefined);
              },
              onSuccess: async () => {
                tgBot.telegram.sendMessage(config.telegram.groupId, '🎉 Đăng nhập Zalo thành công! Bridge đang hoạt động.').catch(() => undefined);
              },
            });
            setZaloApi(newApi);
            await startZalo(newApi);
          } catch (qrErr: unknown) {
            console.error('[Boot] Auto QR login failed:', qrErr);
            tgBot.telegram
              .sendMessage(
                config.telegram.groupId,
                '❌ Đăng nhập QR tự động thất bại. Hãy dùng <b>/login</b> để thử lại.',
                { parse_mode: 'HTML' },
              )
              .catch(() => undefined);
          }
          return;
        }
        console.warn('[Boot] Zalo auto-login failed:', err);
        tgBot.telegram
          .sendMessage(
            config.telegram.groupId,
            '⚠️ Chưa đăng nhập Zalo. Gửi <b>/login</b> để đăng nhập.',
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
      });
  });

  console.log('[Boot] Bridge is running 🚀  (Ctrl+C to stop)');

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[Boot] Received ${signal}, shutting down...`);
    
    // Gửi thông báo trước khi tắt (catch lỗi để không block quá trình tắt nếu rớt mạng)
    await tgBot.telegram.sendMessage(
      config.telegram.groupId,
      '🛑 <b>Zalo ↔ Telegram Bridge</b> đã tắt (ngắt kết nối).',
      { parse_mode: 'HTML' }
    ).catch(() => undefined);

    try { const api = await getZaloApi(); api.listener.stop(); } catch { /* ignore */ }
    await tgBot.stop(signal);
    // Wait for debounced persistence (msgStore 1000ms, userCache 2000ms) to flush
    await new Promise(r => setTimeout(r, 2500));
    process.exit(0);
  };

  process.once('SIGINT',  () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('[Boot] Fatal error:', err);
  process.exit(1);
});
