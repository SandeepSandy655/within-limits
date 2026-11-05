/** Only return to this app's verification screen; never forward an arbitrary callback URL. */
export function verificationAppReturn(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    const app = url.protocol === 'withinlimits:' && url.hostname === 'sign-in' && ['', '/'].includes(url.pathname);
    const expo = ['exp:', 'exps:'].includes(url.protocol) && !!url.hostname && url.pathname === '/--/sign-in';
    if (!app && !expo) return null;
    url.search = '';
    url.searchParams.set('verification', 'complete');
    return url.toString();
  } catch { return null; }
}

export function verificationContinueUrl(options: {
  configuredUrl?: string; webOrigin?: string; metroHost?: string | null; appReturnUrl?: string;
}): string | undefined {
  const base = options.configuredUrl?.trim() ||
    (options.webOrigin ? new URL('/sign-in', options.webOrigin).toString() :
      options.metroHost ? `http://${options.metroHost}/sign-in` : undefined);
  if (!base) return undefined;
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('The email return page must use an HTTP or HTTPS URL.');
  }
  url.hash = '';
  url.search = '';
  url.searchParams.set('verification', 'complete');
  const appReturn = verificationAppReturn(options.appReturnUrl);
  if (appReturn) url.searchParams.set('appReturn', appReturn);
  return url.toString();
}
