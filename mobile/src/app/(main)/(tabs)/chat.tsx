import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { AppIcon } from '@/components/AppIcon';
import { SectionSwitch, groupSections } from '@/components/AppNavigation';
import { Button, EmptyState, ErrorNotice, KeyboardFrame, Page, colors, ui } from '@/components/ui';
import { useDevice } from '@/providers/DeviceProvider';
import { ApiError } from '@/services/api';
import { getChatMessages, markChatRead, sendChatMessage, type ChatGroup, type ChatMessage } from '@/services/chatService';
import { mergeChatMessages } from '@/services/chatMessages';

export default function ChatScreen() {
  const device = useDevice();
  const connected = device.connections.some((link) => link.status === 'accepted');
  if (!device.connectionsReady) return <Page><ActivityIndicator accessibilityLabel="Loading your group" color={colors.green} /></Page>;
  if (!connected) return <Page><SectionSwitch selected="chat" items={groupSections} />
    <EmptyState icon="chat" title="Your group chat starts here" description="The host and approved members share one conversation. Connect to your group to start talking.">
      <Button title="Connect to your group" icon="pair" onPress={() => router.navigate('/invite')} />
    </EmptyState></Page>;
  return <ConnectedChat key={`${device.profile?.deviceId}:${device.chat.group?.membershipKey || 'loading'}`} />;
}

function ConnectedChat() {
  const device = useDevice();
  const deviceId = device.profile?.deviceId;
  const hasConnection = device.connections.some((link) => link.status === 'accepted');
  const { refreshChat, chatRevision, refresh } = device;
  const [group, setGroup] = useState<ChatGroup | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [newMessages, setNewMessages] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);
  const groupRef = useRef<ChatGroup | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const focused = useRef(false);
  const generation = useRef(0);
  const fetching = useRef(false);
  const sendLock = useRef(false);
  const atBottom = useRef(true);
  const shouldScroll = useRef(true);
  const lastRead = useRef('');
  const pending = useRef<{ id: string; body: string; membershipKey: string } | null>(null);

  const readLatest = useCallback(async () => {
    const current = groupRef.current;
    const latest = messagesRef.current.at(-1);
    if (!deviceId || !current || !latest || !focused.current || !atBottom.current || lastRead.current === latest.id) return;
    const token = generation.current;
    lastRead.current = latest.id;
    try { await markChatRead(deviceId, current.membershipKey, latest.id); await refreshChat(); }
    catch { if (generation.current === token && lastRead.current === latest.id) lastRead.current = ''; }
  }, [deviceId, refreshChat]);

  const load = useCallback(async (older = false) => {
    if (!deviceId || !hasConnection || !focused.current || fetching.current || AppState.currentState === 'background') return;
    fetching.current = true;
    const token = generation.current;
    if (older) setLoadingOlder(true);
    try {
      let cursor = older ? messagesRef.current[0]?.id : messagesRef.current.at(-1)?.id;
      let more = false;
      do {
        const result = await getChatMessages(deviceId, cursor ? (older ? 'before' : 'after') : undefined, cursor);
        if (!focused.current || generation.current !== token) return;
        const changed = groupRef.current && groupRef.current.membershipKey !== result.group.membershipKey;
        if (changed) {
          messagesRef.current = []; lastRead.current = ''; pending.current = null; setDraft('');
          // Fetch without the old group's cursor when approval or membership changes.
          const initial = await getChatMessages(deviceId);
          if (!focused.current || generation.current !== token) return;
          groupRef.current = initial.group; setGroup(initial.group);
          messagesRef.current = initial.messages; setMessages(initial.messages); setHasOlder(initial.hasMore);
          shouldScroll.current = true; atBottom.current = true; setNewMessages(false);
          break;
        }
        groupRef.current = result.group; setGroup(result.group);
        if (older || !cursor) setHasOlder(result.hasMore);
        if (!older && result.messages.length) {
          shouldScroll.current = atBottom.current;
          if (!atBottom.current) setNewMessages(true);
        }
        messagesRef.current = mergeChatMessages(messagesRef.current, result.messages);
        setMessages(messagesRef.current);
        const confirmed = pending.current && result.messages.find((message) => message.clientMessageId === pending.current?.id && message.senderId === deviceId);
        if (confirmed) { pending.current = null; setDraft((text) => text.trim() === confirmed.body ? '' : text); }
        more = !older && !!cursor && result.hasMore;
        cursor = messagesRef.current.at(-1)?.id;
      } while (more);
      setError(''); void readLatest();
    } catch (e) {
      if (!focused.current || generation.current !== token) return;
      if (e instanceof ApiError && e.status === 403) {
        groupRef.current = null; messagesRef.current = []; setGroup(null); setMessages([]); setDraft('');
        void refreshChat(); void refresh();
      }
      setError(e instanceof Error ? e.message : 'Could not load messages.');
    } finally {
      fetching.current = false;
      if (generation.current === token) { setLoading(false); setLoadingOlder(false); }
    }
  }, [deviceId, hasConnection, readLatest, refreshChat, refresh]);

  useFocusEffect(useCallback(() => {
    focused.current = true; generation.current++;
    void load();
    const timer = setInterval(() => { void load(); }, 5000);
    const resume = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    return () => { focused.current = false; generation.current++; clearInterval(timer); resume.remove(); };
  }, [load]));
  useEffect(() => { if (focused.current) void load(); }, [chatRevision, device.chat.group?.membershipKey, load]);

  async function send() {
    const text = draft.trim(); const current = groupRef.current;
    if (!text || !deviceId || !current || sendLock.current) return;
    sendLock.current = true; setSending(true); setError('');
    const token = generation.current;
    if (!pending.current || pending.current.body !== text || pending.current.membershipKey !== current.membershipKey) {
      pending.current = { id: Crypto.randomUUID(), body: text, membershipKey: current.membershipKey };
    }
    try {
      const result = await sendChatMessage(deviceId, current.membershipKey, pending.current.id, text);
      if (generation.current !== token) return;
      messagesRef.current = mergeChatMessages(messagesRef.current, [result.message]); setMessages(messagesRef.current);
      setDraft(''); pending.current = null; shouldScroll.current = true; atBottom.current = true; setNewMessages(false);
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false }));
      void readLatest();
    } catch (e) {
      if (generation.current === token) setError(e instanceof Error ? e.message : 'Message not sent. Tap Send to retry your draft.');
      if (e instanceof ApiError && [403, 409].includes(e.status)) { void refreshChat(); void load(); }
    } finally { sendLock.current = false; setSending(false); }
  }

  if (device.connectionsReady && !hasConnection) return <Page><SectionSwitch selected="chat" items={groupSections} />
    <EmptyState icon="chat" title="Your group chat starts here" description="The host and approved members share one conversation. Connect to your group to start talking.">
      <Button title="Connect to your group" icon="pair" onPress={() => router.navigate('/invite')} />
    </EmptyState></Page>;

  return <KeyboardFrame>
    <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, gap: 10 }}>
      <SectionSwitch selected="chat" items={groupSections} />
      <View style={ui.between}><View style={{ flex: 1 }}><Text style={ui.heading}>Together in one chat</Text>
        <Text numberOfLines={2} style={ui.small}>{group?.members.map((member) => `${member.deviceName}${member.deviceId === deviceId ? ' (you)' : member.isHost ? ' (host)' : ''}`).join(' · ') || 'Loading your connected group…'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh chat" onPress={() => void load()} style={{ padding: 12 }}><AppIcon name="refresh" color={colors.green} /></Pressable>
      </View>
      <ErrorNotice message={error || device.chatError} />
    </View>
    {loading && <ActivityIndicator accessibilityLabel="Loading messages" color={colors.green} style={{ padding: 16 }} />}
    <FlatList ref={list} data={messages} keyExtractor={(message) => message.id} style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={{ padding: 20, gap: 12, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 }}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      ListHeaderComponent={hasOlder ? <Button title="Load earlier messages" secondary busy={loadingOlder} onPress={() => { atBottom.current = false; shouldScroll.current = false; void load(true); }} /> : undefined}
      ListEmptyComponent={!loading && !error ? <Text style={[ui.subtitle, { textAlign: 'center', padding: 24 }]}>Say hello to your group. Messages are saved here, including while a member is offline.</Text> : undefined}
      onLayout={() => { if (atBottom.current) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false })); }}
      onContentSizeChange={() => { if (shouldScroll.current) { shouldScroll.current = false; list.current?.scrollToEnd({ animated: false }); } }}
      onScroll={({ nativeEvent }) => {
        atBottom.current = nativeEvent.contentSize.height - nativeEvent.contentOffset.y - nativeEvent.layoutMeasurement.height < 70;
        if (atBottom.current) { setNewMessages(false); void readLatest(); }
      }} scrollEventThrottle={100}
      renderItem={({ item }) => {
        const own = item.senderId === deviceId;
        return <View style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 18, padding: 14, gap: 5, backgroundColor: own ? colors.green : colors.white, borderWidth: own ? 0 : 1, borderColor: colors.line }}>
          <Text style={[ui.small, { color: own ? '#D4EFE5' : colors.green, fontWeight: '700' }]}>{own ? 'You' : item.senderName}{item.senderId === group?.hostId ? ' · Host' : ''}</Text>
          <Text selectable style={[ui.body, { color: own ? colors.white : colors.ink }]}>{item.body}</Text>
          <Text style={[ui.small, { color: own ? '#D4EFE5' : colors.muted, alignSelf: 'flex-end', fontSize: 10 }]}>{new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>;
      }} />
    {newMessages && <Pressable accessibilityRole="button" onPress={() => { atBottom.current = true; setNewMessages(false); list.current?.scrollToEnd({ animated: false }); void readLatest(); }} style={{ padding: 10, alignItems: 'center', backgroundColor: colors.mint }}><Text style={{ color: colors.green, fontWeight: '700' }}>New messages ↓</Text></Pressable>}
    <View style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.white }}><View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', padding: 14, gap: 6 }}>
      <View style={[ui.row, { alignItems: 'flex-end' }]}><TextInput accessibilityLabel="Message your group" placeholder="Message your group…" placeholderTextColor={colors.muted}
        multiline maxLength={2000} value={draft} onChangeText={setDraft} editable={!sending && !!group} textAlignVertical="top"
        style={[ui.input, { flex: 1, minHeight: 50, maxHeight: 120, paddingTop: 14, paddingBottom: 14 }]} />
        <Button title="Send" icon="arrow" busy={sending} disabled={!draft.trim() || !group} onPress={() => void send()} />
      </View><Text style={ui.small}>{draft.length}/2000 · Only your approved group can read this chat.</Text>
    </View></View>
  </KeyboardFrame>;
}
