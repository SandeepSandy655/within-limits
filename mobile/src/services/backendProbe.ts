import { validateBackendAddress } from './serverAddress';

export async function checkBackendAddress(value: string, expectedProjectId?: string): Promise<string> {
  const address = validateBackendAddress(value, true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const [healthResponse, authResponse] = await Promise.all([
      fetch(`${address}/health`, { signal: controller.signal }),
      fetch(`${address}/api/auth/config`, { signal: controller.signal }),
    ]);
    if (!healthResponse.ok) throw new Error('The backend is reachable, but its database is not ready. Start the backend and PostgreSQL on your laptop.');
    const health = await healthResponse.json();
    if (health.success !== true || health.database !== 'connected') throw new Error('This address is not a ready Within Limits backend.');
    if (!health.capabilities?.includes('group-chat')) throw new Error('Update the backend first: run the start-local-backend script on your laptop.');
    const config = await authResponse.json();
    if (!authResponse.ok || !config.firebase?.projectId || !config.firebase?.apiKey || !config.firebase?.appId) throw new Error('Configure Firebase on the backend before connecting this app.');
    if (expectedProjectId && config.firebase.projectId !== expectedProjectId) throw new Error('This backend uses a different Firebase project. Use the backend configured for this app.');
    return address;
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e instanceof TypeError)) throw new Error('Could not reach your laptop. Check its Wi-Fi address, keep the backend running, and allow port 5000 on your private network.');
    throw e;
  } finally { clearTimeout(timer); }
}
