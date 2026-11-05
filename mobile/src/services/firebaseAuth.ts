import { getApps, initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { initializeSessionAuth } from './sessionAuth';
import { backendConnectionError, SERVER_URL } from './serverConfig';

let auth: Auth | null = null;
let initializing: Promise<Auth> | null = null;
let initializedServer = '';
let initializingServer = '';
let requireEmailVerification = true;
export function isEmailVerificationRequired(): boolean { return requireEmailVerification; }
export function getFirebaseAuth(): Auth {
  if (!auth) throw new Error('Sign-in is still starting. Please try again.');
  return auth;
}
export function initializeFirebaseAuth(): Promise<Auth> {
  const server = SERVER_URL;
  if (!server) return Promise.reject(new Error('Set your laptop’s backend address in Connection settings to continue.'));
  if (auth && initializedServer === server) return Promise.resolve(auth);
  if (!initializing || initializingServer !== server) {
    initializingServer = server;
    initializing = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${server}/api/auth/config`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.firebase) throw new Error(data.message || 'Sign-in is unavailable. Try again.');
      if (SERVER_URL !== server) throw new Error('The backend address changed. Reconnecting…');
      requireEmailVerification = data.requireEmailVerification !== false;
      const existing = getApps().find((item) => item.name === 'within-limits-mobile');
      if (existing && existing.options.projectId !== data.firebase.projectId) throw new Error('This backend belongs to a different Firebase project.');
      const app = existing || initializeApp(data.firebase, 'within-limits-mobile');
      auth = initializeSessionAuth(app);
      initializedServer = server;
      return auth;
    } catch (error) {
      if (initializingServer === server) initializing = null;
      throw backendConnectionError(error) || error;
    } finally { clearTimeout(timer); }
    })();
  }
  return initializing;
}

export function authError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'This email already has an account. Sign in or reset your password.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/password-does-not-meet-requirements': 'Choose a stronger password that meets the account password policy.',
    'auth/too-many-requests': 'Too many attempts. Firebase has temporarily limited requests. Please wait before trying again; the restriction may last longer than the app’s retry delay.',
    'auth/network-request-failed': 'Unable to connect. Check your internet connection.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can try again.',
    'auth/popup-blocked': 'Allow pop-ups to continue with Google.',
    'auth/account-exists-with-different-credential': 'Sign in with your existing email and password first.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled yet. Contact the app administrator.',
    'auth/unauthorized-domain': 'Google sign-in is not configured for this website yet.',
    'auth/expired-action-code': 'This verification link has expired. Request a new verification email.',
    'auth/invalid-action-code': 'This verification link is invalid or has already been used. If you already verified, sign in or check verification again.',
    'auth/invalid-continue-uri': 'The email return address is not configured correctly. Contact the app administrator.',
    'SIGN_IN_CANCELLED': 'Google sign-in was cancelled. You can try again.',
    'IN_PROGRESS': 'Google sign-in is already open. Finish that sign-in first.',
    'PLAY_SERVICES_NOT_AVAILABLE': 'Update Google Play services on your phone, then try again.',
    '10': 'Google sign-in is not configured for this app build. The app administrator must register its Android signing certificate in Firebase.',
  };
  return (code && messages[code]) || (error instanceof Error ? error.message : 'Something went wrong. Please retry.');
}
