import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'http';

export function createProxyAgent(proxyUrl: string): Agent | null {
  try {
    if (!proxyUrl) return null;
    const url = new URL(proxyUrl);
    if (url.protocol.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl);
    } else if (url.protocol.startsWith('http')) {
      return new HttpsProxyAgent(proxyUrl);
    } else {
      console.warn(`[Proxy] Unsupported proxy protocol: ${url.protocol}`);
      return null;
    }
  } catch (err) {
    console.error(`[Proxy] Invalid proxy URL: ${proxyUrl}`, err);
    return null;
  }
}
