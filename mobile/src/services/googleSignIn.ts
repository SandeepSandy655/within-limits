import { isRunningInExpoGo } from 'expo';
import { Platform, TurboModuleRegistry } from 'react-native';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth } from './firebaseAuth';

export function googleSignInUnavailableReason(): string | null {
  if (isRunningInExpoGo()) return 'Use email sign-in in Expo Go. Google sign-in is available in the Within Limits development build or the web version.';
  // Check the installed binary before importing the SDK: its entry point calls getEnforcing.
  if (!TurboModuleRegistry.get('RNGoogleSignin')) return 'This app build does not include Google sign-in. Install the latest Within Limits development build, or use email sign-in.';
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim()) return 'Use email sign-in for this build. Google sign-in will be available after its Android credentials are configured.';
  return null;
}

export async function signInWithGoogle() {
  const unavailableReason = googleSignInUnavailableReason();
  if (unavailableReason) throw new Error(unavailableReason);
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) throw new Error('Google sign-in is not configured yet. Use email sign-in or contact the app administrator.');
  const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID });
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) throw new Error('Google sign-in was cancelled. You can try again.');
  if (!result.data.idToken) throw new Error('Google did not return a sign-in token. Please try again.');
  await signInWithCredential(getFirebaseAuth(), GoogleAuthProvider.credential(result.data.idToken));
}
export async function signOutGoogle() {
  if (googleSignInUnavailableReason() || !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim()) return;
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  await GoogleSignin.signOut();
}
