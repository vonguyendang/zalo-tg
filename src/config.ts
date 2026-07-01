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

const groupIdRaw = requireEnv('TG_GROUP_ID');
const groupId = Number(groupIdRaw);
if (Number.isNaN(groupId) || groupId > -1000000000000 || !Number.isSafeInteger(groupId)) {
  console.error(`Missing or invalid TG_GROUP_ID. Must be a negative safe integer for a supergroup (got ${groupIdRaw})`);
  process.exit(1);
}

let localServer = null;
if (envFlag('LOCAL_BOT_API')) {
  localServer = process.env.TG_LOCAL_SERVER?.replace(/\/+$/, '') || null;
  if (!localServer || !/^https?:\/\//.test(localServer)) {
    console.error(`Invalid TG_LOCAL_SERVER for LOCAL_BOT_API mode. Must start with http or https (got ${process.env.TG_LOCAL_SERVER})`);
    process.exit(1);
  }
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
    muteSilentMirror: boolean;
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
    groupId,
    proxy:       process.env.TG_PROXY,
    localServer,
  },
  zalo: {
    credentialsDir: resolvePath(process.env.ZALO_CREDENTIALS_DIR, 'sessions'),
    skipMutedGroups: envFlag('ZALO_SKIP_MUTED_GROUPS', false),
    muteSilentMirror: envFlag('ZALO_MUTE_SILENT', true),
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
