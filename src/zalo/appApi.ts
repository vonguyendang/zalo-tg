/**
 * appApi.ts
 * ─────────
 * Direct PC App API helper using profile-wpa.zaloapp.com.
 * Used as a faster / potentially less rate-limited alternative to the
 * zca-js web API for fetching group member profiles.
 *
 * Requires data/app-session.json to be present (written by loginApp.ts after
 * a successful /loginapp flow).
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import axios from 'axios';
import { config } from '../config.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROFILE_DOMAIN = 'https://profile-wpa.zaloapp.com';
const API_TYPE       = 30;
const API_VERSION    = 671;
const PC_UA          = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ZaloPC/23.12.1 Chrome/102.0.5005.167 Electron/19.1.9 Safari/537.36';

// ── Session ───────────────────────────────────────────────────────────────────

interface AppSession {
  zpw_enk: string;
  imei:    string;
  cookies: Array<{ name: string; value: string; domain: string }>;
}

let _session: AppSession | null | undefined;  // undefined = not yet loaded

function loadAppSession(): AppSession | null {
  if (_session !== undefined) return _session;
  const p = path.join(path.dirname(config.zalo.credentialsPath), 'app-session.json');
  if (!existsSync(p)) { _session = null; return null; }
  try {
    _session = JSON.parse(readFileSync(p, 'utf8')) as AppSession;
    return _session;
  } catch {
    _session = null;
    return null;
  }
}

/** Call this after a new /loginapp to reload the session from disk. */
export function invalidateAppSession(): void {
  _session = undefined;
}

// ── Crypto (same as loginApp.ts) ──────────────────────────────────────────────

function encodeAes(plaintext: string, zpwEnk: string): string {
  const key    = Buffer.from(zpwEnk, 'base64');
  const iv     = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64');
}

function decodeAes(ciphertext: string, zpwEnk: string): string {
  const key      = Buffer.from(zpwEnk, 'base64');
  const iv       = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const ct       = Buffer.from(decodeURIComponent(ciphertext), 'base64');
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function signKey(endpointName: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params).sort();
  const seed   = 'zsecure' + endpointName + sorted.map(k => String(params[k])).join('');
  return crypto.createHash('md5').update(seed, 'utf8').digest('hex');
}

/** Build query-string params for POST-login PC App API endpoints. */
function apiQueryParams(body: Record<string, unknown>, endpoint: string, zpwEnk: string): Record<string, string> {
  const encrypted = encodeAes(JSON.stringify(body), zpwEnk);
  const p: Record<string, unknown> = {
    params:      encrypted,
    zpw_type:    API_TYPE,
    zpw_ver:     API_VERSION,
  };
  p['signkey'] = signKey(endpoint, p);
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
}

// ── HTTP session ──────────────────────────────────────────────────────────────

function buildCookieHeader(cookies: Array<{ name: string; value: string; domain: string }>, url: string): string {
  const { hostname } = new URL(url);
  return cookies
    .filter(c => hostname.endsWith(c.domain) || hostname === c.domain)
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ── Group member profiles ─────────────────────────────────────────────────────

/**
 * Fetch display names for a list of UIDs using the PC App profile endpoint.
 *
 * Returns a Map<uid, displayName>. Returns null if no app session is available.
 *
 * Endpoint: GET profile-wpa.zaloapp.com/api/social/group/members
 * Uses AES-256-CBC encrypted params + signkey (PC App API pattern).
 */
export async function appGetGroupMembersInfo(uids: string[]): Promise<Map<string, string> | null> {
  const sess = loadAppSession();
  if (!sess) return null;  // no app session available yet

  const BATCH = 50;
  const result = new Map<string, string>();

  for (let i = 0; i < uids.length; i += BATCH) {
    const batch = uids.slice(i, i + BATCH);
    const friendPversionMap = batch.map(u => u.endsWith('_0') ? u : u + '_0');

    const body = { friend_pversion_map: friendPversionMap };
    const qp   = apiQueryParams(body as Record<string, unknown>, 'members', sess.zpw_enk);
    const url  = PROFILE_DOMAIN + '/api/social/group/members';

    try {
      const resp = await axios.get<{ error_code: number; data?: string; error_message?: string }>(url, {
        params:  qp,
        headers: {
          'User-Agent': PC_UA,
          'Cookie':     buildCookieHeader(sess.cookies, url),
          'Accept':     'application/json',
        },
        timeout: 15_000,
      });

      if (resp.data.error_code !== 0) {
        console.warn(`[AppApi] /api/social/group/members error [${resp.data.error_code}]: ${resp.data.error_message ?? ''}`);
        continue;
      }

      // Response data is AES-encrypted
      const raw = resp.data.data;
      if (!raw) continue;

      const decrypted = decodeAes(raw, sess.zpw_enk);
      const parsed = JSON.parse(decrypted) as {
        error_code?: number;
        data?: {
          profiles?: Record<string, { displayName?: string; zaloName?: string }>;
        };
      };

      const profiles = parsed?.data?.profiles ?? {};
      for (const uid of batch) {
        const key = uid.endsWith('_0') ? uid : uid + '_0';
        const p   = profiles[key] ?? profiles[uid];
        const name = p?.displayName?.trim() || p?.zaloName?.trim();
        if (name) result.set(uid, name);
      }
    } catch (err) {
      console.warn(`[AppApi] /api/social/group/members request failed:`, err instanceof Error ? err.message : err);
      // Return whatever we have so far; caller falls back to web API
      break;
    }
  }

  return result;
}
