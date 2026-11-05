import { getFirebaseAuth, isEmailVerificationRequired } from './firebaseAuth';
import { backendConnectionError, SERVER_URL } from './serverConfig';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in to continue.');
  if (isEmailVerificationRequired() && !user.emailVerified) throw new Error('Verify your email to continue.');
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await user.getIdToken(attempt > 0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${SERVER_URL}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
      });
      if (response.status === 401 && attempt === 0) continue;
      const data = await response.json();
      if (!response.ok || data.success === false) throw new ApiError(data.message || 'Unable to complete your request.', response.status);
      return data as T;
    } catch (error) {
      throw backendConnectionError(error) || error;
    } finally { clearTimeout(timer); }
  }
  throw new Error('Your session expired. Please sign in again.');
}
