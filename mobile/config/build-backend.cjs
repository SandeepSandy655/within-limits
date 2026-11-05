function backendBuildSettings(env = process.env) {
  const local = env.EXPO_PUBLIC_LOCAL_BACKEND === 'true';
  const building = !!env.EAS_BUILD_PROFILE || env.EAS_BUILD === 'true';
  if (env.EAS_BUILD_PROFILE === 'production' && local) throw new Error('Production builds cannot enable the local Wi-Fi backend.');
  if (building && !local) {
    let url;
    try { url = new URL(env.EXPO_PUBLIC_API_URL || ''); } catch { throw new Error('Set EXPO_PUBLIC_API_URL to your hosted HTTPS backend, or use the preview-local APK profile.'); }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const localHost = host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host === '::1' ||
      /^(0|10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      (/^(fc|fd|fe80:)/.test(host) && host.includes(':')) || (!host.includes('.') && !host.includes(':'));
    if (url.protocol !== 'https:' || localHost || url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
      throw new Error('A hosted build requires a public HTTPS origin without /api, credentials or query parameters. Use preview-local for a laptop backend.');
    }
  }
  return { local, cleartext: local || (!building && env.NODE_ENV !== 'production') };
}
module.exports = { backendBuildSettings };
