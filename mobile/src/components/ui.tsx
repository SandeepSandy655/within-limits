import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { AppIcon, type IconName } from './AppIcon';

export const colors = { bg: '#F6F8FB', ink: '#172B3A', muted: '#617180', line: '#E6ECF0', green: '#147D64', lime: '#DDF49B', white: '#FFFFFF', danger: '#B43F4C', amber: '#97621E', mint: '#E4F4ED', blue: '#EAF0FF', purple: '#6868B9', coral: '#FFAA88' };
export const ui = StyleSheet.create({
  page: { flex: 1, minHeight: 0, backgroundColor: colors.bg }, content: { padding: 20, paddingBottom: 32, gap: 18, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1.1 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 22 }, label: { color: colors.muted, fontSize: 10, letterSpacing: 1.8, fontWeight: '800' },
  heading: { fontSize: 20, color: colors.ink, fontWeight: '700' }, body: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, gap: 14 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: '#F8FAFC', color: colors.ink, borderRadius: 14, paddingHorizontal: 16, minHeight: 54, fontSize: 16 },
  button: { minHeight: 50, borderRadius: 14, paddingHorizontal: 17, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, backgroundColor: colors.green },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, secondaryText: { color: colors.ink },
  error: { backgroundColor: '#FFF0ED', borderRadius: 13, padding: 14 }, errorText: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  notice: { backgroundColor: colors.mint, borderRadius: 16, padding: 16, gap: 8 }, small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
});
export function Page({ children }: PropsWithChildren) {
  if (Platform.OS === 'web') return <View style={ui.page}><ScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>{children}</ScrollView></View>;
  return <KeyboardAwareScrollView style={ui.page} bottomOffset={28} extraKeyboardSpace={24}
    keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    showsVerticalScrollIndicator={false} contentContainerStyle={ui.content}>{children}</KeyboardAwareScrollView>;
}
export function KeyboardFrame({ children }: PropsWithChildren) {
  return Platform.OS === 'web' ? <View style={ui.page}>{children}</View>
    : <KeyboardAvoidingView style={ui.page} behavior="padding" automaticOffset>{children}</KeyboardAvoidingView>;
}
export function Button({ title, onPress, busy, disabled, secondary = false, icon }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [ui.button, secondary && ui.secondary, { opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1 }]}>{busy ? <ActivityIndicator color={secondary ? colors.green : colors.white} /> : <>{icon && <AppIcon name={icon} size={18} color={secondary ? colors.ink : colors.white} />}<Text style={[ui.buttonText, secondary && ui.secondaryText]}>{title}</Text></>}</Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 8 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#697B88" {...props} style={[ui.input, props.style]} /></View>;
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? <View accessibilityLiveRegion="polite" style={ui.error}><Text style={ui.errorText}>{message}</Text></View> : null;
}
export function IconButton({ icon, label, onPress, badge = 0 }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 15, backgroundColor: pressed ? colors.line : colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line })}><AppIcon name={icon} />{badge > 0 && <View style={{ position: 'absolute', top: -3, right: -3, backgroundColor: colors.coral, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10, fontWeight: '800', color: colors.ink }}>{badge}</Text></View>}</Pressable>;
}
export function StatusPill({ label, active = false }: { label: string; active?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: active ? colors.mint : '#EDF1F5' }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? colors.green : colors.muted }} /><Text style={{ color: active ? colors.green : colors.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text></View>;
}
export function EmptyState({ icon, title, description, children }: PropsWithChildren<{ icon: IconName; title: string; description: string }>) {
  return <View style={[ui.card, { alignItems: 'center', paddingVertical: 30, gap: 12 }]}><View style={{ padding: 20, borderRadius: 26, backgroundColor: colors.mint }}><AppIcon name={icon} size={32} color={colors.green} /></View><Text style={[ui.heading, { textAlign: 'center' }]}>{title}</Text><Text style={[ui.subtitle, { textAlign: 'center', maxWidth: 290 }]}>{description}</Text>{children && <View style={{ alignSelf: 'stretch', marginTop: 8 }}>{children}</View>}</View>;
}
