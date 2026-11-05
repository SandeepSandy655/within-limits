type ServerAddressOptions = {
  configuredUrl?: string;
  development: boolean;
  platform: string;
  metroHost?: string | null;
  browserHostname?: string;
  physicalDevice?: boolean;
  allowLocalBackend?: boolean;
};

export function isLocalBackendHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local') || value === '::1' || value === '::') return true;
  if (/^(fc|fd|fe80:)/i.test(value) && value.includes(':')) return true;
  const parts = value.split('.').map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return [0, 10, 127].includes(parts[0]) || (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
  }
  return !value.includes('.') && !value.includes(':');
}

export function validateBackendAddress(value: string, allowLocal = false): string {
  const text = value.trim();
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('Enter a complete backend address, such as http://192.168.1.20:5000.'); }
  if (!['http:', 'https:'].includes(url.protocol) || /[\u0000-\u0020]/.test(text)) throw new Error('Use an HTTP or HTTPS backend address.');
  if (url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
    throw new Error('Use only the server address and port. Leave off /api, passwords and query parameters.');
  }
  if (url.protocol === 'http:' && (!allowLocal || !isLocalBackendHost(url.hostname))) {
    throw new Error('HTTP is allowed only for a local backend in a Wi-Fi test build. Use HTTPS for a hosted backend.');
  }
  if (!allowLocal && isLocalBackendHost(url.hostname)) throw new Error('Release builds need a public HTTPS backend address.');
  return url.origin;
}

export function resolveServerAddress(options: ServerAddressOptions): string {
  const configured = options.configuredUrl?.trim().replace(/\/+$/, '');
  if (configured) return validateBackendAddress(configured, options.development || options.allowLocalBackend);
  // A standalone APK has no Metro host. Never silently send API requests to the phone itself.
  if (!options.development) return '';

  let hostname = 'localhost';
  if (options.development) {
    if (options.platform === 'web' && options.browserHostname) {
      hostname = options.browserHostname;
    } else if (options.metroHost) {
      try {
        const host = options.metroHost;
        hostname = new URL(host.includes('://') ? host : `http://${host}`).hostname;
      } catch { /* Fall back to the local development server. */ }
    }
    if (options.platform === 'android' && options.physicalDevice === false &&
        ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
      hostname = '10.0.2.2';
    }
  }
  // Keep IPv6 hosts bracketed when adding the API port.
  if (hostname.includes(':') && !hostname.startsWith('[')) hostname = `[${hostname}]`;
  return `http://${hostname}:5000`;
}
