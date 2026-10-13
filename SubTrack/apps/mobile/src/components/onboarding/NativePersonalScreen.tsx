import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ProfileView, PrivateOwnerSubscriptionView } from '../../../../../packages/contracts/generated/types.gen';
import { parseProfilePatch } from '@subtrack/contracts/profile';
import { parsePrivateMobileManualEdit } from '@subtrack/contracts/private-mobile';
import { parsePrivateManualCreate } from '@subtrack/contracts/private-onboarding';
import { useNativeSession } from '@/state/NativeSession';
import { readNativeProfile, saveNativeProfile, readNativeMode, chooseNativeJustMe, readNativeSubscriptions, createNativeSubscription, editNativeSubscription, updateNativeSubscriptionStatus } from '@/api/privateMobileApi';
import { parsePositiveSekInput, formatMinorUnits, nativeSekDraft } from '@/api/privateMobileMoney';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { catalogs } from '@subtrack/i18n';

export function NativePersonalScreen() {
  const session = useNativeSession(); const router = useRouter(); const { t, locale, setLocale } = useI18n(); const { theme, isDark, setMode: setThemeMode } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const [profile, setProfile] = useState<ProfileView | null>(null); const [mode, setMode] = useState<'just-me' | null>(null);
  const [items, setItems] = useState<PrivateOwnerSubscriptionView[]>([]); const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null); const createdId = useRef('');
  const [message, setMessage] = useState(''); const [adding, setAdding] = useState(false); const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(''); const [language, setLanguage] = useState<'sv' | 'en'>(locale);
  const [profileTheme, setProfileTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [editing, setEditing] = useState<PrivateOwnerSubscriptionView | null>(null);
  const loadedPages = useRef(1); const [reviewBlocked, setReviewBlocked] = useState(false);
  const [review, setReview] = useState<PrivateOwnerSubscriptionView | null>(null);
  const [draft, setDraft] = useState({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' });
  const generation = useRef(0); const pending = useRef(false);
  const feedbackGeneration = useRef(0);
  useEffect(() => () => { feedbackGeneration.current++; }, []);
  async function applyPreferences(current: ProfileView, ticket: number) {
    if (ticket !== generation.current) return;
    await setLocale(current.language);
    if (ticket !== generation.current) return;
    await setThemeMode(current.theme);
  }
  function clear() { setProfile(null); setMode(null); setItems([]); setNextCursor(null); createdId.current = ''; setAdding(false); setEditing(null); setReview(null); setReviewBlocked(false); loadedPages.current = 1; setName(''); setEmoji(''); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); }
  async function load() {
    if (pending.current || session.phase !== 'active') return;
    const ticket = ++generation.current; pending.current = true; setLoading(true); setMessage('');
    try {
      const result = await session.run(async (token, signal) => {
        const profile = await readNativeProfile(token, signal); const mode = await readNativeMode(token, signal);
        const page = profile.profileComplete && mode.mode === 'just-me' ? await readNativeSubscriptions(token, signal) : null;
        return { profile, mode: mode.mode, page };
      });
      if (ticket !== generation.current) return;
      await applyPreferences(result.profile, ticket);
      if (ticket !== generation.current) return;
      loadedPages.current = 1; setProfile(result.profile); setName(result.profile.displayName ?? ''); setEmoji(result.profile.avatarEmoji ?? '');
      setLanguage(result.profile.language); setProfileTheme(result.profile.theme); setMode(result.mode); setItems(result.page?.items ?? []); setNextCursor(result.page?.nextCursor ?? null);
    } catch { if (ticket === generation.current) { clear(); setMessage('unavailable'); } }
    finally { if (ticket === generation.current) { pending.current = false; setLoading(false); } }
  }
  useEffect(() => {
    if (session.phase === 'active') feedbackGeneration.current++;
    generation.current++; pending.current = false; clear(); setLoading(false);
    // Phase effects may run after the current operation's rejection callback.
    // Preserve owned lifecycle feedback; new user intents clear it synchronously.
    if (session.phase === 'active') setMessage('');
    else if (session.phase !== 'busy') setMessage(previous =>
      ['unavailable', 'storageError', 'logoutConfirmed', 'logoutLocal'].includes(previous) ? previous : '');
    if (session.phase === 'active') void load();
    return () => { generation.current++; pending.current = false; };
  }, [session.phase]);
  async function action(operation: (token: string, signal: AbortSignal) => Promise<(ticket: number) => void | Promise<void>>) {
    if (pending.current || session.phase !== 'active') return;
    const ticket = ++generation.current; pending.current = true; setLoading(true); setMessage('');
    try { const commit = await session.run(operation); if (ticket !== generation.current) return; await commit(ticket); }
    catch { if (ticket === generation.current) { clear(); setMessage('unavailable'); } }
    finally { if (ticket === generation.current) { pending.current = false; setLoading(false); } }
  }
  async function rereadLoaded(token: string, signal: AbortSignal) {
    const pages = loadedPages.current; const rows: PrivateOwnerSubscriptionView[] = [];
    const ids = new Set<string>(); const cursors = new Set<string>(); let cursor: string | undefined; let nextCursor: string | null = null;
    for (let index = 0; index < pages; index++) {
      if (signal.aborted) throw new Error('page');
      const page = await readNativeSubscriptions(token, signal, cursor);
      for (const row of page.items) { if (ids.has(row.id)) throw new Error('page'); ids.add(row.id); rows.push(row); }
      nextCursor = page.nextCursor;
      if (nextCursor === null) break;
      if (cursors.has(nextCursor)) throw new Error('page'); cursors.add(nextCursor); cursor = nextCursor;
    }
    return { items: rows, nextCursor };
  }
  const categoryLabel = (code: string) => Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category, code)
    ? t(`onboarding.ownerSubscriptions.category.${code}`) : t('onboarding.ownerSubscriptions.categoryFallback');
  const text = { color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md };
  const input = [styles.input, text, { backgroundColor: color('bg.raised'), borderColor: color('ink.secondary'), borderRadius: theme.radius.card }];
  const button = (label: string, onPress: () => void, disabled = loading, selected?: boolean) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={[styles.button, { backgroundColor: color('bg.raised'), borderColor: color(selected ? 'aurora.violet' : 'ink.secondary'), borderRadius: theme.radius.card }]}><Text style={text}>{label}</Text></Pressable>;
  const field = (label: string, value: string, onChangeText: (value: string) => void, decimal = false) => <View key={label} style={styles.field}>
    <Text style={text}>{label}</Text><TextInput accessibilityLabel={label} value={value} editable={!loading} onChangeText={onChangeText}
      autoCorrect={false} autoCapitalize="none" keyboardType={decimal ? 'decimal-pad' : 'default'} style={input} /></View>;
  return <ScrollView style={{ backgroundColor: color('bg.canvas') }} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={[text, { fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize['2xl'] }]}>{t('onboarding.nativePersonal.title')}</Text>
    <Text style={text}>{t('onboarding.nativePersonal.demo')}</Text>
    {session.phase === 'storage-error' ? <Text accessibilityRole="alert" style={text}>{t('onboarding.nativePersonal.storageError')}</Text> : null}
    {message ? <Text accessibilityRole="alert" style={text}>{t(message.startsWith('edit.') ? `onboarding.nativeSubscriptionEdit.${message.slice(5)}` : `onboarding.nativePersonal.${message}`)}</Text> : null}
    {session.phase !== 'active' ? <>
      <Text style={text}>{t('onboarding.nativePersonal.restart')}</Text>
      {button(t('onboarding.nativePersonal.verify'), () => { const ticket = ++feedbackGeneration.current; setMessage(''); void session.login().catch(() => {
        if (ticket === feedbackGeneration.current) setMessage('unavailable');
      }); }, session.phase === 'busy')}
      {button(t('onboarding.nativePersonal.register'), () => { feedbackGeneration.current++; router.replace('/register'); }, session.phase === 'busy')}
    </> : <>
      {loading ? <Text accessibilityLiveRegion="polite" style={text}>{t('onboarding.nativePersonal.loading')}</Text> : null}
      {profile && !profile.profileComplete ? <>
        <Text accessibilityRole="header" style={text}>{t('onboarding.nativePersonal.profile')}</Text>
        {field(t('onboarding.nativePersonal.name'), name, setName)}{field(t('onboarding.nativePersonal.emoji'), emoji, setEmoji)}
        <Text style={text}>{t('onboarding.nativePersonal.language')}</Text><View style={styles.actions}>{(['sv', 'en'] as const).map(value => button(t(`preferences.languageName.${value}`), () => setLanguage(value), loading, language === value))}</View>
        <Text style={text}>{t('onboarding.nativePersonal.theme')}</Text><View style={styles.actions}>{(['system', 'light', 'dark'] as const).map(value => button(t(`preferences.themes.${value}`), () => setProfileTheme(value), loading, profileTheme === value))}</View>
        {button(t('onboarding.nativePersonal.saveProfile'), () => {
          let patch; try { patch = parseProfilePatch({ displayName: name.trim().normalize('NFC'), avatarEmoji: emoji || null, language, theme: profileTheme }); }
          catch { setMessage('invalid'); return; }
          void action(async (token, signal) => { await saveNativeProfile(patch, token, signal); const current = await readNativeProfile(token, signal);
            return async ticket => { await applyPreferences(current, ticket); if (ticket !== generation.current) return;
              setProfile(current); setName(current.displayName ?? ''); setLanguage(current.language); setProfileTheme(current.theme); setMessage('profileSaved'); }; });
        })}
      </> : null}
      {profile?.profileComplete && mode !== 'just-me' ? button(t('onboarding.mode.choose'), () => { void action(async (token, signal) => {
        await chooseNativeJustMe(token, signal); const current = await readNativeMode(token, signal);
        if (current.mode !== 'just-me') throw new Error('mode'); const page = await readNativeSubscriptions(token, signal);
        return () => { setMode(current.mode); setItems(page.items); setNextCursor(page.nextCursor); };
      }); }) : null}
      {profile?.profileComplete && mode === 'just-me' ? <>
        {items.length === 0 && !loading ? <Text style={text}>{t('onboarding.ownerSubscriptions.empty')}</Text> : null}
        {items.map(item => <View key={item.id} style={styles.field}><Text style={text}>{item.customName ?? item.merchantName ?? t('onboarding.ownerSubscriptions.categoryFallback')}</Text>
          <Text style={text}>{Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category, item.categoryCode)
            ? t(`onboarding.ownerSubscriptions.category.${item.categoryCode}`) : t('onboarding.ownerSubscriptions.categoryFallback')} · {t(`onboarding.ownerSubscriptions.status.${item.status}`)}</Text>
          <Text style={text}>{t('onboarding.manualSubscription.expectedAmount')}: {formatMinorUnits(BigInt(item.expectedAmountMinor), item.currency, { locale, display: 'code' })}</Text>
          {item.source === 'MANUAL' && item.currency === 'SEK' && item.cadence !== 'CUSTOM' ? <>
            {button(t('onboarding.nativeSubscriptionEdit.edit'), () => {
              let amount; try { amount = nativeSekDraft(item.expectedAmountMinor, locale); } catch { setMessage('invalid'); return; }
              setEditing(item); setReview(null); setReviewBlocked(false); setAdding(true); setMessage('');
              setDraft({ customName: item.customName ?? '', categoryCode: item.categoryCode, cadence: item.cadence, amount, date: item.nextChargeDate ?? '' });
            })}
            <Text style={text}>{t('onboarding.nativeSubscriptionEdit.tracking')}</Text>
            {(['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED'] as const).filter(target =>
              item.status === 'ACTIVE' ? target !== 'ACTIVE' : item.status === 'PAUSED' ? target !== 'PAUSED' : item.status === 'CANCELLED' ? target === 'ARCHIVED' : false).map(target =>
              button(t(`onboarding.nativeSubscriptionEdit.${target === 'ACTIVE' ? 'resume' : target === 'PAUSED' ? 'pause' : target === 'CANCELLED' ? 'cancelled' : 'archive'}`), () => {
                void action(async (token, signal) => {
                  const result = await updateNativeSubscriptionStatus({ id: item.id, status: target }, token, signal);
                  if (!('conflict' in result) && result.id !== item.id) throw new Error('result');
                  const page = await rereadLoaded(token, signal); const current = page.items.find(row => row.id === item.id);
                  return () => { setItems(page.items); setNextCursor(page.nextCursor);
                    setMessage('conflict' in result ? 'edit.conflict' : current?.status === result.status ? 'edit.statusSaved' : 'readbackUnavailable'); };
                });
              }))}
          </> : null}</View>)}
        {button(t('onboarding.manualSubscription.title'), () => { setEditing(null); setReview(null); setReviewBlocked(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); setAdding(true); })}
        {adding ? <>
          {review ? <><Text style={text}>{review.customName} · {categoryLabel(review.categoryCode)} · {t(`onboarding.ownerSubscriptions.cadence.${review.cadence}`)} · {formatMinorUnits(BigInt(review.expectedAmountMinor), review.currency, {locale, display:'code'})} · {review.nextChargeDate ?? t('onboarding.manualSubscription.placeholder')} · {t(`onboarding.ownerSubscriptions.status.${review.status}`)}</Text>
            {button(t('onboarding.nativeSubscriptionEdit.review'), () => { setEditing(review); setReview(null); setReviewBlocked(false); setMessage(''); })}</> : null}
          {reviewBlocked && editing ? button(t('onboarding.nativeSubscriptionEdit.review'), () => {
            const selected = editing; void action(async (token, signal) => { const page = await rereadLoaded(token, signal); const current = page.items.find(row => row.id === selected.id);
              return () => { setItems(page.items); setNextCursor(page.nextCursor); setReview(current ?? null); setReviewBlocked(!current); setMessage(current ? 'edit.conflict' : 'readbackUnavailable'); }; });
          }) : null}
          {field(t('onboarding.manualSubscription.name'), draft.customName, value => setDraft(prior => ({ ...prior, customName: value })))}
          <Text style={text}>{t('onboarding.manualSubscription.category')}</Text><View style={styles.actions}>{Object.entries(catalogs[locale].onboarding.ownerSubscriptions.category).map(([code, label]) =>
            button(label, () => setDraft(prior => ({ ...prior, categoryCode: code })), loading, draft.categoryCode === code))}</View>
          <Text style={text}>{draft.categoryCode ? categoryLabel(draft.categoryCode) : t('onboarding.manualSubscription.placeholder')}</Text>
          <Text style={text}>{t('onboarding.manualSubscription.cadence')}</Text><View style={styles.actions}>{(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const).map(code =>
            button(t(`onboarding.ownerSubscriptions.cadence.${code}`), () => setDraft(prior => ({ ...prior, cadence: code })), loading, draft.cadence === code))}</View>
          <Text style={text}>{t(`onboarding.ownerSubscriptions.cadence.${draft.cadence}`)}</Text>
          {field(t('onboarding.nativePersonal.amount'), draft.amount, value => setDraft(prior => ({ ...prior, amount: value })), true)}
          {field(t('onboarding.nativePersonal.date'), draft.date, value => setDraft(prior => ({ ...prior, date: value })))}
          {button(t(editing ? 'onboarding.nativeSubscriptionEdit.save' : 'onboarding.manualSubscription.save'), () => {
            if (review || reviewBlocked) return;
            let body; try { body = parsePrivateManualCreate({ customName: draft.customName, categoryCode: draft.categoryCode, cadence: draft.cadence,
              expectedAmountMinor: parsePositiveSekInput(draft.amount, locale).toString(), nextChargeDate: draft.date || null }); }
            catch { setMessage('invalid'); return; }
            if (editing) {
              const selected = editing; const edit = parsePrivateMobileManualEdit({ ...body, id: selected.id, expectedRevision: selected.revision });
              void action(async (token, signal) => { const result = await editNativeSubscription(edit, token, signal);
                if (!('conflict' in result) && result.id !== selected.id) throw new Error('result');
                const page = await rereadLoaded(token, signal); const current = page.items.find(row => row.id === selected.id);
                return () => { setItems(page.items); setNextCursor(page.nextCursor);
                  if ('conflict' in result || !current || current.revision !== result.revision) {
                    setReview(current ?? null); setReviewBlocked(!current); setMessage(current ? 'edit.conflict' : 'readbackUnavailable');
                  } else { setAdding(false); setEditing(null); setReview(null); setReviewBlocked(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); setMessage('edit.saved'); }
                }; }); return;
            }
            void action(async (token, signal) => { const result = await createNativeSubscription(body, token, signal); const page = await readNativeSubscriptions(token, signal);
              return () => { loadedPages.current = 1; setItems(page.items); setNextCursor(page.nextCursor); createdId.current = page.items.some(item => item.id === result.id) ? '' : result.id;
                setAdding(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' });
                setMessage(page.items.some(item => item.id === result.id) ? 'saved' : 'readbackUnavailable'); }; });
          }, loading || Boolean(review) || reviewBlocked)}
          {button(t('onboarding.manualSubscription.cancel'), () => { setAdding(false); setEditing(null); setReview(null); setReviewBlocked(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); })}
        </> : null}
        {nextCursor ? button(t('onboarding.ownerSubscriptions.loadMore'), () => { const cursor = nextCursor; void action(async (token, signal) => {
          const page = await readNativeSubscriptions(token, signal, cursor); const ids = new Set(items.map(item => item.id));
          if (page.nextCursor === cursor || page.items.some(item => ids.has(item.id))) throw new Error('page');
          return () => { loadedPages.current++; setItems(prior => [...prior, ...page.items]); setNextCursor(page.nextCursor);
            if (createdId.current) { const found = page.items.some(item => item.id === createdId.current); setMessage(found ? 'saved' : 'readbackUnavailable'); if (found) createdId.current = ''; }
          };
        }); }) : null}
        {button(t('onboarding.nativePersonal.reload'), () => { void load(); })}
      </> : null}
    </>}
    {button(t('onboarding.nativePersonal.logout'), () => { const ticket = ++feedbackGeneration.current; generation.current++; pending.current = false; setLoading(false); clear(); setMessage('');
      void session.logout().then(ack => { if (ticket === feedbackGeneration.current) setMessage(ack ? 'logoutConfirmed' : 'logoutLocal'); })
        .catch(() => { if (ticket === feedbackGeneration.current) setMessage('storageError'); }); }, false)}
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, padding: 24, gap: 16 }, field: { gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, padding: 12, minHeight: 48 }, button: { borderWidth: 1, padding: 12, minHeight: 48, justifyContent: 'center' } });
