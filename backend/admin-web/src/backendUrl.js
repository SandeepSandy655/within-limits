export function backendUrl(path, origin = import.meta.env?.VITE_API_BASE_URL || "") {
  if (!origin) return path;
  const url = new URL(origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Configure the backend origin without a path or credentials.');
  }
  if (typeof location !== 'undefined' && location.protocol === 'https:' && url.protocol !== 'https:') {
    throw new Error('This hosted admin needs an HTTPS backend address.');
  }
  return `${url.origin}${path}`;
}
