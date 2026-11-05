const value = process.env.VITE_API_BASE_URL;
try {
  const url = new URL(value || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname)) throw new Error();
} catch {
  console.error('Set VITE_API_BASE_URL to the reachable HTTPS backend origin before deploying the admin.');
  process.exitCode = 1;
}
