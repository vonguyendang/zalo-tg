import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function resolvePath(envVal: string | undefined, defaultRelative: string): string {
  const raw = envVal ?? defaultRelative;
  // Already absolute → use as-is, otherwise resolve from project root
  return path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
}

function envFlag(key: string, defaultValue = false): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export const config: {
  telegram: {
    token: string;
    groupId: number;
    localServer: string | null;
    proxy?: string;
  };
  zalo: {
    credentialsDir: string;
    skipMutedGroups: boolean;
    historySyncCount: number;
    historySyncDelayMs: number;
    historyAutoSync: boolean;
    /** uid → tên tùy chỉnh cho từng tài khoản Zalo, ví dụ: { "12345": "Cá nhân" } */
    accountAliases: Record<string, string>;
  };
  dataDir: string;
} = {
  telegram: {
    token:       requireEnv('TG_TOKEN'),
    groupId:     Number(requireEnv('TG_GROUP_ID')),
    proxy:       process.env.TG_PROXY,
    /** URL của local Bot API server, ví dụ: http://localhost:8081.
     *  Chỉ dùng khi LOCAL_BOT_API=1 và TG_LOCAL_SERVER được set.
     *  Nếu không → dùng official api.telegram.org. */
    localServer: envFlag('LOCAL_BOT_API')
      ? (process.env.TG_LOCAL_SERVER?.replace(/\/$/, '') || null)
      : null,
  },
  zalo: {
    credentialsDir: resolvePath(process.env.ZALO_CREDENTIALS_DIR, 'sessions'),
    skipMutedGroups: envFlag('ZALO_SKIP_MUTED_GROUPS'),
    /** Số tin nhắn lịch sử tối đa mỗi lần sync (0 = tắt). Default: 1000 */
    historySyncCount: Number(process.env.ZALO_HISTORY_SYNC_COUNT ?? '1000'),
    /** Delay (ms) giữa mỗi tin khi sync lịch sử. Default: 3000ms */
    historySyncDelayMs: Number(process.env.ZALO_HISTORY_SYNC_DELAY_MS ?? '3000'),
    /** Tự động sync lịch sử khi tạo topic nhóm mới. Default: false */
    historyAutoSync: envFlag('ZALO_HISTORY_AUTO_SYNC'),
    /**
     * Tên hiển thị tùy chỉnh cho từng tài khoản Zalo.
     * Set biến môi trường ZALO_ACCOUNT_ALIASES dạng JSON:
     * ZALO_ACCOUNT_ALIASES={"1508995969111268915":"Cá nhân","702441706054047534":"Kinh doanh"}
     */
    accountAliases: (() => {
      try {
        return JSON.parse(process.env.ZALO_ACCOUNT_ALIASES ?? '{}');
      } catch {
        return {};
      }
    })(),
  },
  dataDir: resolvePath(process.env.DATA_DIR, 'data'),
} as const;
