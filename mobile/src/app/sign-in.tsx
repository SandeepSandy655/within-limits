import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '../components/AppIcon';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '../providers/AuthProvider';
import { authError, getFirebaseAuth } from '../services/firebaseAuth';
import { googleSignInUnavailableReason, signInWithGoogle } from '../services/googleSignIn';
import { applyEmailVerification, sendVerificationEmail } from '../services/emailVerification';
import { verificationAppReturn } from '../services/authLinks';
import { Button, ErrorNotice, Field, Page, colors, ui } from '../components/ui';
import { CAN_CONFIGURE_BACKEND } from '../services/serverConfig';

export default function SignInScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ mode?: string; oobCode?: string; verification?: string; appReturn?: string }>();
  const mode = typeof params.mode === 'string' ? params.mode : '';
  const actionCode = typeof params.oobCode === 'string' ? params.oobCode : '';
  const verification = typeof params.verification === 'string' ? params.verification : '';
  const callbackKey = JSON.stringify([mode, actionCode, verification]);
  const hasCallback = auth.verificationRequired && !!(mode || actionCode || verification);
  const appReturn = auth.verificationRequired && Platform.OS === 'web' ? verificationAppReturn(typeof params.appReturn === 'string' ? params.appReturn : undefined) : null;
  const googleUnavailable = googleSignInUnavailableReason();
  const callbackJob = useRef<{ key: string; promise: Promise<string> } | null>(null);
  const [callbackResult, setCallbackResult] = useState<{ key: string; message: string; error?: boolean } | null>(null);
  const checkingCallback = hasCallback && callbackResult?.key !== callbackKey;
  const { checkVerification } = auth;
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [signInCooldown, setSignInCooldown] = useState(0);
  useEffect(() => {
    if (!hasCallback || auth.loading || auth.error) return;
    let active = true;
    if (callbackJob.current?.key !== callbackKey) {
      callbackJob.current = { key: callbackKey, promise: (async () => {
        if (mode || actionCode) {
          if (mode !== 'verifyEmail' || !actionCode) throw new Error('This verification link is incomplete. Open the latest verification email.');
          await applyEmailVerification(actionCode);
          await checkVerification();
          return 'Email verified. You can now sign in or return to the app.';
        }
        if (verification !== 'complete') throw new Error('This verification link is not valid. Open the latest verification email.');
        const verified = await checkVerification();
        if (getFirebaseAuth().currentUser && !verified) throw new Error('Your email is not verified yet. Complete verification in your email, then try again.');
        return verified ? 'Email verified. You’re ready to continue.' : 'If you completed verification, sign in below or return to the app to continue.';
      })() };
    }
    void callbackJob.current.promise.then(
      (message) => { if (active) setCallbackResult({ key: callbackKey, message }); },
      (error) => { if (active) setCallbackResult({ key: callbackKey, message: authError(error), error: true }); },
    );
    return () => { active = false; };
  }, [hasCallback, callbackKey, mode, actionCode, verification, auth.loading, auth.error, checkVerification]);
  useEffect(() => {
    if (!cooldown && !signInCooldown) return;
    const timer = setTimeout(() => {
      setCooldown((n) => Math.max(0, n - 1));
      setSignInCooldown((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown, signInCooldown]);
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(authError(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  function submit() {
    // Keyboard submission must respect the same pause as the sign-in button.
    if (!register && signInCooldown > 0) return;
    void run(async () => {
      const address = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address.');
      if (!password) throw new Error('Enter your Within Limits password. Use Forgot password if you need to reset it.');
      if (register && password.length < 8) throw new Error('Use at least 8 characters for your password.');
      if (register && confirm !== password) throw new Error('Your passwords do not match.');
      if (register) {
        const result = await createUserWithEmailAndPassword(getFirebaseAuth(), address, password);
        if (auth.verificationRequired) {
          setCooldown(60);
          setNotice(await sendVerificationEmail(result.user));
        }
      } else {
        try { await signInWithEmailAndPassword(getFirebaseAuth(), address, password); }
        catch (error) {
          // A local pause prevents rapid retries; Firebase controls the actual restriction.
          if ((error as { code?: string })?.code === 'auth/too-many-requests') setSignInCooldown(60);
          throw error;
        }
      }
      setPassword(''); setConfirm('');
    });
  }
  if (auth.loading) return <Page><ActivityIndicator color={colors.green} /><Text style={ui.subtitle}>Getting your account ready…</Text></Page>;
  if (auth.canAccessApp && (!auth.verificationRequired || (!checkingCallback && !callbackResult?.error && !appReturn))) return <Redirect href="/" />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><Page>
    <View style={[ui.between, { marginTop: 6 }]}><View style={ui.row}><View style={[ui.avatar, { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.green }]}><AppIcon name="compass" size={24} color={colors.lime} /></View><Text style={[ui.label, { color: colors.ink }]}>WITHIN LIMITS</Text></View><Text style={ui.small}>Find your people.</Text></View>
    {hasCallback && <View style={ui.card}><Text style={ui.heading}>Email verification</Text>{checkingCallback ? <><ActivityIndicator color={colors.green} /><Text style={ui.body}>Checking your verification link…</Text></> : callbackResult?.error ? <><ErrorNotice message={callbackResult.message} /><Button title="Back to sign in" secondary onPress={() => { setCallbackResult(null); router.replace('/sign-in'); }} /></> : <Text accessibilityLiveRegion="polite" style={ui.body}>{callbackResult?.message}</Text>}
      {appReturn && <><Button title="Return to the app" disabled={checkingCallback} onPress={() => void run(() => Linking.openURL(appReturn))} /><Text style={ui.small}>Keep Expo Go and the development server running when returning to a local app.</Text><ErrorNotice message={error} />{auth.verified && <Button secondary title="Continue in browser" onPress={() => router.replace('/')} />}</>}
    </View>}
    <View style={{ padding: 25, gap: 12, borderRadius: 24, backgroundColor: '#173E4B', overflow: 'hidden' }}><View pointerEvents="none" style={{ position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 25, borderColor: '#254F5B', top: -50, right: -45 }} /><Text style={[ui.label, { color: colors.lime }]}>{auth.user ? 'ONE LAST STEP' : 'SMALL CIRCLE. BIG ADVENTURES.'}</Text><Text style={[ui.title, { color: colors.white, maxWidth: '90%' }]}>{auth.user ? 'Check your inbox.' : register ? 'Every adventure\nstarts together.' : 'Your people.\nAlways closer.'}</Text><Text style={[ui.subtitle, { color: '#C5DAE2' }]}>{auth.user ? `Open the verification link sent to ${auth.user.email}. Then come back to finish setting up your device.` : 'Live locations, effortless invites and a little more peace of mind. Made for groups of four.'}</Text></View>
    {auth.error ? <View style={ui.card}><ErrorNotice message={auth.error} /><Button title="Try again" onPress={auth.retry} /></View> : auth.verified ? <View style={ui.card}><Text style={ui.heading}>Your email is verified</Text><Button title="Continue to Home" disabled={checkingCallback} onPress={() => router.replace('/')} /></View> : auth.user ? <View style={ui.card}>
      <Text style={ui.heading}>Verify your email</Text><Text style={ui.subtitle}>Open the link in your email. We’ll check automatically when you return here.</Text>
      <ErrorNotice message={error} />{notice ? <Text accessibilityLiveRegion="polite" style={ui.body}>{notice}</Text> : null}
      <Button title="I’ve verified my email" busy={busy} onPress={() => void run(async () => { if (!await auth.checkVerification()) throw new Error('Your email is not verified yet. Open the link in your latest verification email, then try again.'); })} />
      <Button secondary title={cooldown ? `Resend in ${cooldown}s` : 'Resend verification email'} disabled={busy || cooldown > 0} onPress={() => void run(async () => { setNotice(await sendVerificationEmail(auth.user!)); setCooldown(60); })} />
      <Button secondary title="Use another account" disabled={busy} onPress={() => void run(auth.logout)} />
    </View> : <View style={ui.card}>
      <View style={[ui.row, { backgroundColor: colors.bg, borderRadius: 14, padding: 4, gap: 4 }]}>{[false, true].map((value) => <Pressable key={String(value)} accessibilityRole="tab" accessibilityState={{ selected: register === value }} disabled={busy} onPress={() => { setRegister(value); setError(''); setNotice(''); }} style={{ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 11, backgroundColor: register === value ? colors.mint : 'transparent' }}><Text style={[ui.body, { fontWeight: '700', color: register === value ? colors.green : colors.muted }]}>{value ? 'Create account' : 'Sign in'}</Text></Pressable>)}</View>
      {googleUnavailable ? <View style={ui.notice}><Text style={ui.body}>{googleUnavailable}</Text></View> : <><Button title="Continue with Google" secondary disabled={busy || checkingCallback} onPress={() => void run(signInWithGoogle)} /><Text style={[ui.small, { textAlign: 'center' }]}>or continue with email</Text></>}
      <Field label="EMAIL ADDRESS" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="you@gmail.com" editable={!busy} />
      <Field label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 8 characters' : 'Your Within Limits password'} editable={!busy} onSubmitEditing={submit} />
      {!register && <Text style={ui.small}>Use the password you created for Within Limits. If you don’t remember it, choose Forgot password below.</Text>}
      <Pressable accessibilityRole="button" onPress={() => setShowPassword((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={ui.body}>{showPassword ? 'Hide password' : 'Show password'}</Text></Pressable>
      {register && <Field label="CONFIRM PASSWORD" value={confirm} onChangeText={setConfirm} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" editable={!busy} onSubmitEditing={submit} />}
      <ErrorNotice message={error} />{notice ? <Text accessibilityLiveRegion="polite" style={ui.body}>{notice}</Text> : null}
      <Button title={register ? (auth.verificationRequired ? 'Create account & verify email' : 'Create account') : signInCooldown ? `Try sign-in again in ${signInCooldown}s` : 'Sign in'} busy={busy} disabled={!register && signInCooldown > 0} onPress={submit} />
      {!register && <Button secondary title={cooldown ? `Request another reset in ${cooldown}s` : 'Forgot password?'} disabled={busy || cooldown > 0} onPress={() => void run(async () => { if (!email.trim()) throw new Error('Enter your email address first.'); setCooldown(60); await sendPasswordResetEmail(getFirebaseAuth(), email.trim()); setNotice('If this email has an account, you’ll receive a password reset link.'); })} />}
    </View>}
    <View style={[ui.row, { alignItems: 'flex-start', paddingHorizontal: 4 }]}><AppIcon name="shield" size={20} color={colors.green} /><Text style={[ui.small, { flex: 1 }]}>Private by choice. Share only with approved connections, and pause whenever you like.</Text></View>
    {CAN_CONFIGURE_BACKEND && <Button title="Connection settings" icon="wifi" secondary onPress={() => router.push('/server-settings')} />}
  </Page></SafeAreaView>;
}
