import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirebaseAuth } from './firebaseAuth';
export function googleSignInUnavailableReason(): string | null { return null; }
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(getFirebaseAuth(), provider);
}
export async function signOutGoogle() { /* Firebase ends the app session; leave the browser's Google account intact. */ }
