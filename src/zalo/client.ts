import { Zalo, LoginQRCallbackEventType } from 'zca-js';
import type { LoginQRCallback } from 'zca-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import fetch from 'node-fetch';
import { createProxyAgent } from '../proxy.js';
import { imageSizeFromFile } from 'image-size/fromFile';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';
import type { ZaloAPI } from './types.js';

// Use os.tmpdir() so it works on Windows (e.g. C:\Users\...\AppData\Local\Temp)
// as well as macOS/Linux (/tmp or /var/folders/...).
const QR_TMP_DIR = path.join(os.tmpdir(), 'zalo-tg');
mkdirSync(QR_TMP_DIR, { recursive: true });
const QR_IMAGE_PATH = path.join(QR_TMP_DIR, 'zalo-qr.png');

// Pool of Zalo API instances
const _apis = new Map<string, ZaloAPI>();

// ── imageMetadataGetter ───────────────────────────────────────────────────────
// Required by zca-js for uploadAttachment (images/GIFs).
const ZALO_OPTIONS = {
  logging:      false,
  checkUpdate:  false,
  selfListen:   true,
  imageMetadataGetter: async (filePath: string) => {
    try {
      const { width, height } = await imageSizeFromFile(filePath);
      const { size } = statSync(filePath);
      return { width: width ?? 0, height: height ?? 0, size };
    } catch {
      return null;
    }
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QRLoginHooks {
  /** Called when a new QR image file is ready at `imagePath`. */
  onQRReady?: (imagePath: string, code: string) => Promise<void>;
  /** Called when the current QR expired and a new one is being generated. */
  onExpired?: () => Promise<void>;
  /** Called when the user scanned the QR on their phone. */
  onScanned?: (displayName: string) => Promise<void>;
  /** Called when the user declined the login on their phone. */
  onDeclined?: () => Promise<void>;
  /** Called after credentials have been saved and login is complete. */
  onSuccess?: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCredentialPath(uid?: string): string {
  if (!existsSync(config.zalo.credentialsDir)) {
    mkdirSync(config.zalo.credentialsDir, { recursive: true });
  }
  if (!uid) {
    return path.join(config.zalo.credentialsDir, `credentials_tmp_${Date.now()}.json`);
  }
  return path.join(config.zalo.credentialsDir, `credentials_${uid}.json`);
}

function saveCredentials(data: { cookie: unknown; imei: string; userAgent: string; proxy?: string }, uid: string): void {
  try {
    const credPath = getCredentialPath(uid);
    // Preserve existing proxy if updating credentials without specifying proxy
    let existingProxy: string | undefined;
    if (existsSync(credPath)) {
      try {
        const oldCreds = JSON.parse(readFileSync(credPath, 'utf8'));
        existingProxy = oldCreds.proxy;
      } catch (e) {
        // ignore
      }
    }
    const proxyToSave = data.proxy !== undefined ? data.proxy : existingProxy;
    const toSave: any = { imei: data.imei, cookie: data.cookie, userAgent: data.userAgent };
    if (proxyToSave) toSave.proxy = proxyToSave;
    
    writeFileSync(credPath, JSON.stringify(toSave, null, 2), 'utf8');
    console.log(`[Zalo] Credentials saved → ${credPath}`);
  } catch (err) {
    console.error('[Zalo] Failed to save credentials:', err);
  }
}

/**
 * Core QR login flow.
 * - Always prints QR to terminal.
 * - Calls optional `hooks` so callers (e.g. Telegram handler) can forward
 *   the QR image or status messages elsewhere.
 */
async function runQRLogin(
  zalo: InstanceType<typeof Zalo>,
  hooks: QRLoginHooks = {},
): Promise<{api: ZaloAPI, uid: string}> {
  let tempCredentials: any = null;

  const callback: LoginQRCallback = (event) => {
    switch (event.type) {

      case LoginQRCallbackEventType.QRCodeGenerated: {
        const { code } = event.data;

        // Save QR image first, then notify hooks
        const savePromise = (event.actions.saveToFile(QR_IMAGE_PATH) as Promise<unknown>)
          .then(async () => {
            // Print to terminal
            await new Promise<void>((res) => {
              qrcode.generate(code, { small: true }, (qrStr) => {
                console.clear();
                console.log('┌─────────────────────────────────────────┐');
                console.log('│      Quét QR bằng ứng dụng Zalo         │');
                console.log('└─────────────────────────────────────────┘\n');
                console.log(qrStr);
                console.log(`(Ảnh QR: ${QR_IMAGE_PATH})\n`);
                res();
              });
            });
            // Notify external hook (e.g. send to Telegram)
            await hooks.onQRReady?.(QR_IMAGE_PATH, code);
          })
          .catch((err: unknown) => console.error('[Zalo] QR hook error:', err));

        void savePromise;
        break;
      }

      case LoginQRCallbackEventType.QRCodeExpired: {
        console.log('\n[Zalo] QR hết hạn, đang tạo mã mới...');
        void hooks.onExpired?.().catch((e: unknown) => console.error(e));
        event.actions.retry();
        break;
      }

      case LoginQRCallbackEventType.QRCodeScanned: {
        const name = event.data.display_name;
        console.log(`\n[Zalo] ✓ Đã quét! Chờ xác nhận từ "${name}"...`);
        void hooks.onScanned?.(name).catch((e: unknown) => console.error(e));
        break;
      }

      case LoginQRCallbackEventType.QRCodeDeclined: {
        console.error('\n[Zalo] Đăng nhập bị từ chối.');
        void hooks.onDeclined?.().catch((e: unknown) => console.error(e));
        event.actions.abort();
        break;
      }

      case LoginQRCallbackEventType.GotLoginInfo: {
        tempCredentials = event.data;
        void hooks.onSuccess?.().catch((e: unknown) => console.error(e));
        break;
      }
    }
  };

  const api = await zalo.loginQR({ qrPath: QR_IMAGE_PATH }, callback);
  if (!api) throw new Error('[Zalo] QR login failed – no API returned.');
  
  const uid = api.getOwnId?.();
  if (!uid) throw new Error('[Zalo] QR login failed – could not get own UID.');
  const loggedInUid = String(uid);
  
  if (tempCredentials) saveCredentials(tempCredentials, loggedInUid);
  
  console.log('\n[Zalo] Đăng nhập thành công ✓');
  return {api: api as ZaloAPI, uid: loggedInUid};
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getZaloApi(accountId: string): ZaloAPI | undefined {
  return _apis.get(accountId);
}

export function getAllZaloApis(): Map<string, ZaloAPI> {
  return _apis;
}

/** Delete stale credentials file for a specific account. */
export function clearCredentials(accountId: string): void {
  try {
    const p = getCredentialPath(accountId);
    if (existsSync(p)) {
      unlinkSync(p);
      console.log(`[Zalo] Đã xoá credentials cũ của ${accountId}.`);
    }
    _apis.delete(accountId);
  } catch (err) {
    console.warn(`[Zalo] Không thể xoá credentials cũ của ${accountId}:`, err);
  }
}

/** Sentinel error thrown when saved credentials are stale — caller should trigger QR re-login. */
export class StaleCredentialsError extends Error {
  public accountId: string;
  constructor(accountId: string, cause: unknown) {
    super(`Credentials Zalo của tài khoản ${accountId} đã hết hạn — cần đăng nhập lại.`);
    this.name = 'StaleCredentialsError';
    this.accountId = accountId;
    this.cause = cause;
  }
}

/** Returns true for errors that indicate an expired/invalid Zalo session. */
function isAuthError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: string };
    // code 600 = zpw_sek bị thiếu/không đúng
    if (e.code === 600) return true;
    if (typeof e.message === 'string') {
      const m = e.message;
      if (m.includes('Đăng nhập thất bại') || m.includes('zpw_sek') || m.includes('loginCookie')) return true;
    }
  }
  return false;
}

export async function initZaloApi(accountId: string): Promise<ZaloAPI | undefined> {
  const credPath = path.join(config.zalo.credentialsDir, `credentials_${accountId}.json`);
  if (!existsSync(credPath)) return undefined;

  // Dọn dẹp API cũ khỏi bộ nhớ trước khi khởi tạo lại để tránh rác và lỗi Already started
  _apis.delete(accountId);

  try {
    const credentials = JSON.parse(readFileSync(credPath, 'utf8'));
    
    const zaloOpts: any = { ...ZALO_OPTIONS };
    if (credentials.proxy) {
      const agent = createProxyAgent(credentials.proxy);
      if (agent) {
        zaloOpts.options = { 
          ...zaloOpts.options, 
          agent,
          polyfill: (url: any, init: any) => fetch(url, { ...init, agent })
        };
        console.log(`[Zalo] Dùng proxy ${credentials.proxy} cho tài khoản ${accountId}`);
      }
    }
    const zalo = new Zalo(zaloOpts);
    
    console.log(`[Zalo] Đang đăng nhập tài khoản ${accountId}...`);
    const api = (await zalo.login(credentials)) as ZaloAPI;
    _apis.set(accountId, api);
    console.log(`[Zalo] Tài khoản ${accountId} đăng nhập thành công ✓`);
    return api;
  } catch (err) {
    if (isAuthError(err)) {
      console.warn(`[Zalo] Session của ${accountId} hết hạn (auth error).`);
      clearCredentials(accountId);
      throw new StaleCredentialsError(accountId, err);
    } else {
      console.error(`[Zalo] Lỗi đăng nhập tài khoản ${accountId}:`, err);
      return undefined;
    }
  }
}

export async function initAllZaloApis(): Promise<{apis: Map<string, ZaloAPI>, expired: string[]}> {
  if (!existsSync(config.zalo.credentialsDir)) {
    mkdirSync(config.zalo.credentialsDir, { recursive: true });
  }

  const files = readdirSync(config.zalo.credentialsDir).filter(f => f.startsWith('credentials_') && f.endsWith('.json'));
  const expired: string[] = [];

  for (const file of files) {
    const match = file.match(/^credentials_(.+)\.json$/);
    if (!match) continue;
    const accountId = match[1];

    try {
      await initZaloApi(accountId);
    } catch (err) {
      if (err instanceof StaleCredentialsError) {
        expired.push(accountId);
      }
    }
  }

  return {apis: _apis, expired};
}

/**
 * Trigger a fresh QR login (e.g. from /login Telegram command).
 * Accepts optional hooks so the caller can forward QR images / status updates.
 */
export async function triggerQRLogin(hooks: QRLoginHooks = {}): Promise<{api: ZaloAPI, uid: string}> {
  const zalo = new Zalo(ZALO_OPTIONS);
  const result = await runQRLogin(zalo, hooks);
  _apis.set(result.uid, result.api);
  return result;
}