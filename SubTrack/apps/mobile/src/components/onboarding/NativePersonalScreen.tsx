import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { ProfileView, PrivateOwnerSubscriptionView } from '../../../../../packages/contracts/generated/types.gen';
import { parseProfilePatch } from '@subtrack/contracts/profile';
import { parsePrivateMobileManualEdit } from '@subtrack/contracts/private-mobile';
import { parsePrivateManualCreate } from '@subtrack/contracts/private-onboarding';
import { useNativeSession } from '@/state/NativeSession';
import * as privateApi from '@/api/privateMobileApi';
import { SandboxNotice } from './SandboxEntry';
import { parsePositiveSekInput, formatMinorUnits, nativeSekDraft } from '@/api/privateMobileMoney';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { catalogs } from '@subtrack/i18n';
import { readAllOwnerSubscriptions, projectOwnerSubscriptions } from '@/api/privateMobileSubscriptionList';
import { BillingIcon } from '../billing/BillingIcon';

export type NativeFeatureSession = Pick<ReturnType<typeof useNativeSession>, 'phase' | 'login' | 'refresh' | 'logout' | 'run'>;
export type NativePersonalApi = Pick<typeof privateApi, 'readNativeProfile' | 'saveNativeProfile' | 'readNativeMode' | 'chooseNativeJustMe' | 'readNativeSubscriptions' | 'createNativeSubscription' | 'editNativeSubscription' | 'updateNativeSubscriptionStatus'>;
export function NativePersonalScreen({ useSession = useNativeSession, api = privateApi, sandbox = false, inactiveContent }: {
  useSession?: () => NativeFeatureSession; api?: NativePersonalApi; sandbox?: boolean; inactiveContent?: React.ReactNode;
} = {}) {
  const session = useSession(); const router = useRouter(); const { t, locale, setLocale } = useI18n(); const { theme, isDark, setMode: setThemeMode } = useTheme();
  const { readNativeProfile, saveNativeProfile, readNativeMode, chooseNativeJustMe, createNativeSubscription, editNativeSubscription, updateNativeSubscriptionStatus } = api;
  const readNativeSubscriptions: NativePersonalApi['readNativeSubscriptions'] = async (...args) => {
    const page = await api.readNativeSubscriptions(...args);
    if (sandbox && page.items.some(row => row.source !== 'MANUAL' || row.currency !== 'SEK' || !row.alwaysPrivate)) throw new Error('Sandbox rows unavailable');
    return page;
  };
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const [profile, setProfile] = useState<ProfileView | null>(null); const [mode, setMode] = useState<'just-me' | null>(null);
  const [items, setItems] = useState<PrivateOwnerSubscriptionView[]>([]); const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const request = useRef<AbortController | null>(null);
  const [message, setMessage] = useState(''); const [adding, setAdding] = useState(false); const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(''); const [language, setLanguage] = useState<'sv' | 'en'>(locale);
  const [profileTheme, setProfileTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [editing, setEditing] = useState<PrivateOwnerSubscriptionView | null>(null);
  const [reviewBlocked, setReviewBlocked] = useState(false);
  const [review, setReview] = useState<PrivateOwnerSubscriptionView | null>(null);
  const [draft, setDraft] = useState({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' });
  const generation = useRef(0); const pending = useRef(false);
  const feedbackGeneration = useRef(0);
  const currentPhase = useRef(session.phase); currentPhase.current = session.phase;
  const currentLoad = useRef(load); currentLoad.current = load;
  const focusCleanup = useRef<() => void>(() => undefined);
  focusCleanup.current = () => {
    feedbackGeneration.current++; generation.current++; pending.current = false;
    clear(); setLoading(false); setMessage('');
  };
  useEffect(() => () => { feedbackGeneration.current++; }, []);
  async function applyPreferences(current: ProfileView, ticket: number) {
    if (ticket !== generation.current) return;
    await setLocale(current.language);
    if (ticket !== generation.current) return;
    await setThemeMode(current.theme);
  }
  function clear() { setProfile(null); setMode(null); setItems([]); setQuery('');request.current?.abort();request.current=null; setAdding(false); setEditing(null); setReview(null); setReviewBlocked(false); setName(''); setEmoji(''); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); }
  async function load() {
    if (pending.current || session.phase !== 'active') return;
    const ticket = ++generation.current; pending.current = true; setLoading(true); setMessage('');
    try {
      const result = await runOwned(async (token, signal) => {
        const profile = await readNativeProfile(token, signal); const mode = await readNativeMode(token, signal);
        const page = profile.profileComplete && mode.mode === 'just-me' ? await rereadLoaded(token, signal) : null;
        return { profile, mode: mode.mode, page };
      });
      if (ticket !== generation.current) return;
      await applyPreferences(result.profile, ticket);
      if (ticket !== generation.current) return;
      setProfile(result.profile); setName(result.profile.displayName ?? ''); setEmoji(result.profile.avatarEmoji ?? '');
      setLanguage(result.profile.language); setProfileTheme(result.profile.theme); setMode(result.mode); setItems(result.page?.items ?? []);
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
    return () => { generation.current++;pending.current=false;request.current?.abort();request.current=null; };
  }, [session.phase]);
  useFocusEffect(useCallback(() => {
    if (currentPhase.current === 'active') void currentLoad.current();
    return () => focusCleanup.current();
  }, []));
  async function action(operation: (token: string, signal: AbortSignal) => Promise<(ticket: number) => void | Promise<void>>) {
    if (pending.current || session.phase !== 'active') return;
    const ticket = ++generation.current; pending.current = true; setLoading(true); setMessage('');
    try { const commit = await runOwned(operation); if (ticket !== generation.current) return; await commit(ticket); }
    catch { if (ticket === generation.current) { clear(); setMessage('unavailable'); } }
    finally { if (ticket === generation.current) { pending.current = false; setLoading(false); } }
  }
  async function runOwned<T>(operation: (token: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); request.current = controller;
    try { const result = await session.run(async (token, authoritySignal) => {
      const abort = () => controller.abort(); if (authoritySignal.aborted) abort();
      authoritySignal.addEventListener('abort', abort, { once: true });
      try { return {kind:'ready' as const,value:await operation(token, controller.signal)}; }
      catch(error) { if(controller.signal.aborted && !authoritySignal.aborted)return {kind:'obsolete' as const};throw error; }
      finally { authoritySignal.removeEventListener('abort', abort); }
    });if(result.kind==='obsolete')throw new Error('Abandoned view');return result.value;
    } finally { if (request.current === controller) request.current = null; }
  }
  async function rereadLoaded(token: string, signal: AbortSignal) {
    return readAllOwnerSubscriptions(cursor => cursor === undefined ? readNativeSubscriptions(token, signal) : readNativeSubscriptions(token, signal, cursor), signal);
  }
  const categoryLabel = (code: string) => Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category, code)
    ? t(`onboarding.ownerSubscriptions.category.${code}`) : t('onboarding.ownerSubscriptions.categoryFallback');
  const projection = projectOwnerSubscriptions(items, query, { categories: catalogs[locale].onboarding.ownerSubscriptions.category, categoryFallback: t('onboarding.ownerSubscriptions.categoryFallback'), unnamed: t('onboarding.ownerSubscriptions.categoryFallback') });
  const text = { color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md };
  const input = [styles.input, text, { backgroundColor: color('bg.raised'), borderColor: color('line.hairline'), borderRadius: theme.radius.card }];
  const button = (label: string, onPress: () => void, disabled = loading, selected?: boolean) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress}
    style={[styles.button, { backgroundColor: color('bg.raised'), borderColor: color(selected ? 'action.accent' : 'line.hairline'), borderRadius: theme.radius.card }]}><Text style={text}>{label}</Text></Pressable>;
  const field = (label: string, value: string, onChangeText: (value: string) => void, decimal = false) => <View key={label} style={styles.field}>
    <Text style={text}>{label}</Text><TextInput accessibilityLabel={label} value={value} editable={!loading} onChangeText={onChangeText}
      autoCorrect={false} autoCapitalize="none" keyboardType={decimal ? 'decimal-pad' : 'default'} style={input} /></View>;
  return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView style={{ backgroundColor: color('bg.canvas') }} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={[text, { fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize['2xl'] }]}>{t('onboarding.nativePersonal.title')}</Text>
    {sandbox ? <SandboxNotice /> : <Text style={text}>{t('onboarding.nativePersonal.demo')}</Text>}
    {session.phase === 'storage-error' ? <Text accessibilityRole="alert" style={text}>{t('onboarding.nativePersonal.storageError')}</Text> : null}
    {message ? <Text accessibilityRole="alert" style={text}>{t(message.startsWith('edit.') ? `onboarding.nativeSubscriptionEdit.${message.slice(5)}` : `onboarding.nativePersonal.${message}`)}</Text> : null}
    {session.phase !== 'active' ? sandbox ? inactiveContent : <>
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
        if (current.mode !== 'just-me') throw new Error('mode'); const page = await rereadLoaded(token, signal);
        return () => { setMode(current.mode); setItems(page.items);  };
      }); }) : null}
      {profile?.profileComplete && mode === 'just-me' ? <>
        {button(t('onboarding.billingMonth.open'), () => router.push('/personal-billing-month'))}
        {sandbox ? null : button(t('onboarding.nativeDetection.open'), () => router.push('/personal-detections'))}
        {sandbox ? null : button(t('onboarding.nativeBank.open'), () => router.push('/personal-bank'))}
        {button(t('onboarding.nativeRenewals.open'), () => router.push('/personal-home'))}
        {items.length === 0 && !loading ? <Text style={text}>{t('onboarding.ownerSubscriptions.empty')}</Text> : null}
        <View style={styles.search}>
          <Text style={text}>{t('onboarding.ownerSubscriptionList.search')}</Text>
          <View style={styles.searchControls}><TextInput accessibilityLabel={t('onboarding.ownerSubscriptionList.search')} value={query}
            editable={!loading} maxLength={160} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" style={[input,styles.searchInput]} />
            {query ? <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.ownerSubscriptionList.clear')} disabled={loading}
              accessibilityState={{disabled:loading}} onPress={()=>setQuery('')} style={styles.clearSearch}><BillingIcon name="close" color={color('action.accent')}/></Pressable> : null}</View>
        </View>
        {!loading && items.length>0 && projection.filteredCount===0 ? <Text accessibilityLiveRegion="polite" style={text}>{t('onboarding.ownerSubscriptionList.noMatch')}</Text> : null}
        {!loading ? projection.groups.map(group=><View key={group.categoryCode??'fallback'} style={[styles.group,{backgroundColor:color('bg.surface'),borderColor:color('line.hairline'),borderRadius:theme.radius.card}]}>
          <Text accessibilityRole="header" style={[text,{fontFamily:theme.typography.fontFamily['ui.semibold']}]}>{group.label}</Text>
          {group.totals.length>0 ? <View style={styles.subtotals}><Text style={[text,{color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}]}>{t('onboarding.ownerSubscriptionList.expectedSubtotal')}</Text>
            {group.totals.map(total=><Text key={total.amount.currency+':'+total.cadence} style={[text,styles.amount]}>{t(`onboarding.ownerSubscriptions.cadence.${total.cadence}`)} · {formatMinorUnits(total.amount.minorUnits,total.amount.currency,{locale,display:'code'})}</Text>)}</View> : null}
        {group.items.map(item => <View key={item.id} style={styles.field}><Text style={text}>{item.customName ?? item.merchantName ?? t('onboarding.ownerSubscriptions.categoryFallback')}</Text>
          <Text style={text}>{Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category, item.categoryCode)
            ? t(`onboarding.ownerSubscriptions.category.${item.categoryCode}`) : t('onboarding.ownerSubscriptions.categoryFallback')} · {t(`onboarding.ownerSubscriptions.status.${item.status}`)}</Text>
          <Text style={text}>{t('onboarding.manualSubscription.expectedAmount')}: {formatMinorUnits(BigInt(item.expectedAmountMinor), item.currency, { locale, display: 'code' })}</Text>
          {!sandbox && item.source === 'DETECTED' ? <><Text style={text}>{t('onboarding.nativeDetection.detected')}</Text>{button(t('onboarding.nativeDetection.open'), () => router.push('/personal-detections'))}</> : null}
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
                  return () => { setItems(page.items);
                    setMessage('conflict' in result ? 'edit.conflict' : current?.status === result.status ? 'edit.statusSaved' : 'readbackUnavailable'); };
                });
              }))}
          </> : null}</View>)}
        </View>) : null}
        {button(t('onboarding.manualSubscription.title'), () => { setEditing(null); setReview(null); setReviewBlocked(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); setAdding(true); })}
        {adding ? <>
          {review ? <><Text style={text}>{review.customName} · {categoryLabel(review.categoryCode)} · {t(`onboarding.ownerSubscriptions.cadence.${review.cadence}`)} · {formatMinorUnits(BigInt(review.expectedAmountMinor), review.currency, {locale, display:'code'})} · {review.nextChargeDate ?? t('onboarding.manualSubscription.placeholder')} · {t(`onboarding.ownerSubscriptions.status.${review.status}`)}</Text>
            {button(t('onboarding.nativeSubscriptionEdit.review'), () => { setEditing(review); setReview(null); setReviewBlocked(false); setMessage(''); })}</> : null}
          {reviewBlocked && editing ? button(t('onboarding.nativeSubscriptionEdit.review'), () => {
            const selected = editing; void action(async (token, signal) => { const page = await rereadLoaded(token, signal); const current = page.items.find(row => row.id === selected.id);
              return () => { setItems(page.items);  setReview(current ?? null); setReviewBlocked(!current); setMessage(current ? 'edit.conflict' : 'readbackUnavailable'); }; });
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
                return () => { setItems(page.items);
                  if ('conflict' in result || !current || current.revision !== result.revision) {
                    setReview(current ?? null); setReviewBlocked(!current); setMessage(current ? 'edit.conflict' : 'readbackUnavailable');
                  } else { setAdding(false); setEditing(null); setReview(null); setReviewBlocked(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); setMessage('edit.saved'); }
                }; }); return;
            }
            void action(async (token, signal) => { const result = await createNativeSubscription(body, token, signal); const page = await rereadLoaded(token, signal);
              return () => { setItems(page.items);
                setAdding(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' });
                setMessage(page.items.some(item => item.id === result.id) ? 'saved' : 'readbackUnavailable'); }; });
          }, loading || Boolean(review) || reviewBlocked)}
          {button(t('onboarding.manualSubscription.cancel'), () => { setAdding(false); setEditing(null); setReview(null); setReviewBlocked(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); })}
        </> : null}
        {button(t('onboarding.nativePersonal.reload'), () => { void load(); })}
      </> : null}
    </>}
    {button(t('onboarding.nativePersonal.logout'), () => { const ticket = ++feedbackGeneration.current; generation.current++; pending.current = false; setLoading(false); clear(); setMessage('');
      void session.logout().then(ack => { if (ticket === feedbackGeneration.current) setMessage(ack ? 'logoutConfirmed' : 'logoutLocal'); })
        .catch(() => { if (ticket === feedbackGeneration.current) setMessage('storageError'); }); }, false)}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, padding: 20, gap: 16 }, field: { gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  search:{gap:8},searchControls:{flexDirection:'row',alignItems:'center',gap:8},searchInput:{flex:1,minWidth:0},clearSearch:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},group:{padding:16,gap:16,borderWidth:1},subtotals:{gap:4},amount:{textAlign:'right',fontVariant:['tabular-nums'],flexShrink:1},
  input: { borderWidth: 1, padding: 12, minHeight: 48 }, button: { borderWidth: 1, borderRadius:18, padding: 12, minHeight: 48, justifyContent: 'center' } });
