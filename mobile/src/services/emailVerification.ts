import { applyActionCode, checkActionCode, sendEmailVerification, type User } from 'firebase/auth';
import Constants from 'expo-constants';
import { createURL } from 'expo-linking';
import { Platform } from 'react-native';
import { getFirebaseAuth } from './firebaseAuth';
import { verificationContinueUrl } from './authLinks';

export async function sendVerificationEmail(user: User): Promise<string> {
  const url = verificationContinueUrl({
    configuredUrl: process.env.EXPO_PUBLIC_AUTH_RETURN_URL,
    webOrigin: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
    metroHost: __DEV__ && Platform.OS !== 'web' ? Constants.expoConfig?.hostUri : undefined,
    appReturnUrl: Platform.OS !== 'web' ? createURL('sign-in') : undefined,
  });
  try {
    await sendEmailVerification(user, url ? { url, handleCodeInApp: false } : undefined);
  } catch (error) {
    // A new LAN address may not be authorized in Firebase. Verification must still work in Expo Go.
    if ((error as { code?: string }).code !== 'auth/unauthorized-continue-uri') throw error;
    await sendEmailVerification(user);
    return 'Verification email sent. Open the link, then return here; we’ll check automatically.';
  }
  return 'Verification email sent. Check your inbox and spam folder, open the link, then return to the app.';
}

export async function applyEmailVerification(code: string) {
  const auth = getFirebaseAuth();
  const action = await checkActionCode(auth, code);
  if (action.operation !== 'VERIFY_EMAIL') throw new Error('This is not an email verification link. Open the latest verification email.');
  await applyActionCode(auth, code);
}
