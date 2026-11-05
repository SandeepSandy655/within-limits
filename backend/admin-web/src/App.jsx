import { useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import Dashboard, { adminRequest } from "./Dashboard";
import Brand from "./Brand";
import { backendUrl } from "./backendUrl.js";

async function createAuth() {
  const response = await fetch(backendUrl("/api/auth/config"), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || "Sign-in is unavailable. Please try again shortly.");
  const name = `within-limits-admin-${data.firebase.projectId}`;
  const app = getApps().find((item) => item.name === name) || initializeApp(data.firebase, name);
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}
export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    let auth;
    try {
      auth = await createAuth();
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const data = await adminRequest(credential.user);
      setPassword(""); setSession({ auth, user: credential.user, data });
    } catch (failure) {
      if (auth) await signOut(auth).catch(() => {});
      setError(failure.message);
    } finally { setBusy(false); }
  }
  async function resetPassword() {
    if (!email.trim()) { setError("Enter your email address first."); return; }
    setBusy(true); setError(""); setMessage("");
    try { const auth = await createAuth(); await sendPasswordResetEmail(auth, email.trim()); setMessage("If that admin account exists, a password reset email has been sent."); }
    catch (failure) {
      if (["auth/user-not-found", "auth/invalid-credential"].includes(failure.code)) setMessage("If that admin account exists, a password reset email has been sent.");
      else setError(failure.message);
    } finally { setBusy(false); }
  }
  if (session) return <Dashboard user={session.user} initialData={session.data} onSignOut={() => { void signOut(session.auth); setSession(null); setPassword(""); }}/>;
  return <main className="access-shell"><section className="access-card"><Brand/><h1>Admin sign in</h1><p className="muted">Manage routes, groups, and checkpoint activity.</p><form onSubmit={login}><label>Email<input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}/></label><label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}/></label><button className="primary-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button><button className="text-button" type="button" onClick={() => void resetPassword()} disabled={busy}>Reset password</button><p className="error-message" role="alert">{error}</p><p className="success-message" role="status">{message}</p></form><p className="access-footnote">Use the admin account assigned to you.</p></section></main>;
}
