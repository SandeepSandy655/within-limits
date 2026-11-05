import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { onIdTokenChanged, reload, signOut, type User } from 'firebase/auth';
import { AppState } from 'react-native';
import { authError, getFirebaseAuth, initializeFirebaseAuth, isEmailVerificationRequired } from '../services/firebaseAuth';
import { signOutGoogle } from '../services/googleSignIn';

const AuthContext = createContext<{
  user: User | null; verified: boolean; verificationRequired: boolean; canAccessApp: boolean; loading: boolean; error: string;
  retry: () => void; checkVerification: () => Promise<boolean>; logout: () => Promise<void>;
}>({ user: null, verified: false, verificationRequired: true, canAccessApp: false, loading: true, error: '', retry: () => {}, checkVerification: async () => false, logout: async () => {} });

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [verified, setVerified] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const verificationCheck = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    let active = true;
    let remove: (() => void) | undefined;
    initializeFirebaseAuth().then((auth) => {
      if (!active) return;
      setVerificationRequired(isEmailVerificationRequired());
      remove = onIdTokenChanged(auth, (next) => {
        setUser(next); setVerified(next?.emailVerified === true); setLoading(false);
      });
    }).catch((e) => { if (active) { setError(authError(e)); setLoading(false); } });
    return () => { active = false; remove?.(); };
  }, [attempt]);

  const checkVerification = useCallback(async () => {
    if (verificationCheck.current) return verificationCheck.current;
    const current = getFirebaseAuth().currentUser;
    if (!current) return false;
    if (!isEmailVerificationRequired()) return current.emailVerified;
    const pending = (async () => {
      await reload(current);
      if (getFirebaseAuth().currentUser !== current) return false;
      if (current.emailVerified) await current.getIdToken(true);
      if (getFirebaseAuth().currentUser !== current) return false;
      setUser(current); setVerified(current.emailVerified);
      return current.emailVerified;
    })();
    verificationCheck.current = pending;
    try { return await pending; } finally { verificationCheck.current = null; }
  }, []);
  useEffect(() => {
    if (!verificationRequired || !user || verified) return;
    const check = () => { void checkVerification().catch(() => {}); };
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    // Also handles verification on another device or in a browser tab while this screen stays open.
    const timer = setInterval(() => { if (AppState.currentState === 'active') check(); }, 5000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [verificationRequired, user, verified, checkVerification]);

  async function logout() { try { await signOutGoogle(); } finally { await signOut(getFirebaseAuth()); } }
  const canAccessApp = !!user && (!verificationRequired || verified);
  return <AuthContext.Provider value={{ user, verified, verificationRequired, canAccessApp, loading, error, retry: () => { setLoading(true); setError(''); setAttempt((n) => n + 1); }, checkVerification, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
