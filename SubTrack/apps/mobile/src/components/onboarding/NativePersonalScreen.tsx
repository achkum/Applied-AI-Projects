import {NativeSessionExit,sessionExitFeedback} from './NativeSessionExit';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { ProfileView, PrivateOwnerSubscriptionView } from '../../../../../packages/contracts/generated/types.gen';
import { isCanonicalDisplayName, parseProfilePatch } from '@subtrack/contracts/profile';
import { parsePrivateMobileManualEdit } from '@subtrack/contracts/private-mobile';
import { parsePrivateManualCreate } from '@subtrack/contracts/private-onboarding';
import {customCategoryLabel} from '@subtrack/contracts/subscription-category';
import type {SandboxHouseholdView} from '@subtrack/contracts/sandbox-household';
import {memberAccentForId} from '@subtrack/ui-tokens/member-accent';
import { useNativeSession } from '@/state/NativeSession';
import * as privateApi from '@/api/privateMobileApi';
import { parsePositiveSekInput, formatMinorUnits, nativeSekDraft } from '@/api/privateMobileMoney';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { catalogs } from '@subtrack/i18n';
import { readAllOwnerSubscriptions, projectOwnerSubscriptions } from '@/api/privateMobileSubscriptionList';
import { BillingIcon } from '../billing/BillingIcon';
import { NativeProductButton, NativeProductCard, NativeProductHeading, NativeProductSegmentedControl } from '../billing/NativeProductUI';
import { NativeProductNav, nativeProductRoutes, type NativeProductDestination } from '../billing/NativeProductNav';
import {NativeDatePicker} from '../billing/NativeDatePicker';
import {NativeCategoryField} from './NativeCategoryField';
import {NativeProfileSettingsLink} from './NativeProfileTools';
import {NativeSubscriptionDetail} from '../billing/NativeSubscriptionDetail';
import type {NativeAnalyticsReader} from '@/api/nativeAnalyticsReader';
import {add,money,type Money} from '../../../../../packages/money/src/money';
import {recurringCost} from '../../../../../packages/money/src/recurring-cost';
import {useReducedMotion} from '@/hooks/useReducedMotion';

export type NativeFeatureSession = Pick<ReturnType<typeof useNativeSession>, 'phase' | 'login' | 'refresh' | 'logout' | 'run'>;
export type NativePersonalApi = Pick<typeof privateApi, 'readNativeProfile' | 'saveNativeProfile' | 'readNativeMode' | 'chooseNativeJustMe' | 'readNativeSubscriptions' | 'createNativeSubscription' | 'editNativeSubscription' | 'updateNativeSubscriptionStatus'>;
const systemNow=()=>new Date();

type ManualDraft = { customName: string; categoryCode: string; cadence: string; amount: string; date: string };
type ManualValidationMessage = 'invalidName' | 'invalidCategory' | 'invalidCadence' | 'invalidAmount' | 'invalidDate';
export function validateManualDraft(draft: ManualDraft, locale: 'sv' | 'en'):
  { body: ReturnType<typeof parsePrivateManualCreate>; error: null } | { body: null; error: ManualValidationMessage } {
  const valid = { customName: 'Valid', categoryCode: 'OTHER_SUBSCRIPTION', cadence: 'MONTHLY' as const, expectedAmountMinor: '1', nextChargeDate: null };
  const checks: readonly [ManualValidationMessage, () => void][] = [
    ['invalidName', () => { parsePrivateManualCreate({ ...valid, customName: draft.customName }); }],
    ['invalidCategory', () => { parsePrivateManualCreate({ ...valid, categoryCode: draft.categoryCode }); }],
    ['invalidCadence', () => { parsePrivateManualCreate({ ...valid, cadence: draft.cadence }); }],
  ];
  for (const [error, check] of checks) { try { check(); } catch { return { body: null, error }; } }

  let expectedAmountMinor: string;
  try { expectedAmountMinor = parsePositiveSekInput(draft.amount, locale).toString(); }
  catch { return { body: null, error: 'invalidAmount' }; }
  try { parsePrivateManualCreate({ ...valid, expectedAmountMinor }); }
  catch { return { body: null, error: 'invalidAmount' }; }

  try { parsePrivateManualCreate({ ...valid, nextChargeDate: draft.date || null }); }
  catch { return { body: null, error: 'invalidDate' }; }

  try {
    return { body: parsePrivateManualCreate({ customName: draft.customName, categoryCode: draft.categoryCode, cadence: draft.cadence,
      expectedAmountMinor, nextChargeDate: draft.date || null }), error: null };
  } catch { return { body: null, error: 'invalidDate' }; }
}
export function NativePersonalScreen({ useSession = useNativeSession, api = privateApi, sandbox = false, inactiveContent, onSetupComplete, page:initialPage = 'subscriptions',detailReader,readHousehold,now=systemNow }: {
  useSession?: () => NativeFeatureSession; api?: NativePersonalApi; sandbox?: boolean; inactiveContent?: React.ReactNode; onSetupComplete?: (reason: 'load' | 'mutation') => void; page?:'subscriptions'|'profile';detailReader?:NativeAnalyticsReader;readHousehold?:(token:string,signal:AbortSignal)=>Promise<SandboxHouseholdView>;now?:()=>Date;
} = {}) {
  const session = useSession(); const router = useRouter(); const { t, locale, setLocale } = useI18n(); const { theme, isDark, setMode: setThemeMode } = useTheme();
  const reducedMotion=useReducedMotion();
  const [page,setPage]=useState(initialPage);
  React.useEffect(()=>setPage(initialPage),[initialPage]);
  const { readNativeProfile, saveNativeProfile, readNativeMode, chooseNativeJustMe, createNativeSubscription, editNativeSubscription, updateNativeSubscriptionStatus } = api;
  const readNativeSubscriptions: NativePersonalApi['readNativeSubscriptions'] = async (...args) => {
    const page = await api.readNativeSubscriptions(...args);
    if (sandbox && page.items.some(row => row.currency !== 'SEK' || !row.alwaysPrivate)) throw new Error('Sandbox rows unavailable');
    return page;
  };
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const [profile, setProfile] = useState<ProfileView | null>(null); const [mode, setMode] = useState<'just-me' | null>(null);
  const [household,setHousehold]=useState<SandboxHouseholdView['household']>(null);
  const [items, setItems] = useState<PrivateOwnerSubscriptionView[]>([]); const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter,setCategoryFilter]=useState<string|null>(null);
  const [expandedRow,setExpandedRow]=useState<string|null>(null);
  const detailHeading=useRef<Text|null>(null),rowNodes=useRef(new Map<string,View>());
  const restoreDetail=useRef<{id:string;ticket:number}|null>(null),currentDetail=useRef(expandedRow);currentDetail.current=expandedRow;
  const request = useRef<AbortController | null>(null);
  const [message, setMessage] = useState(''); const [adding, setAdding] = useState(false); const [name, setName] = useState('');
  const [editingProfile,setEditingProfile]=useState(false);
  const [emoji, setEmoji] = useState(''); const [language, setLanguage] = useState<'sv' | 'en'>(locale);
  const [profileTheme, setProfileTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [editing, setEditing] = useState<PrivateOwnerSubscriptionView | null>(null);
  const [reviewBlocked, setReviewBlocked] = useState(false);
  const [review, setReview] = useState<PrivateOwnerSubscriptionView | null>(null);
  const [draft, setDraft] = useState({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' });
  const generation = useRef(0); const pending = useRef(false);
  const setupCompletionNotified = useRef(false);
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
  function clear() { setPage(initialPage); setProfile(null);setHousehold(null); setMode(null); setItems([]); setQuery('');setCategoryFilter(null);setExpandedRow(null);request.current?.abort();request.current=null; setAdding(false); setEditingProfile(false); setEditing(null); setReview(null); setReviewBlocked(false); setName(''); setEmoji(''); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); }
  async function load() {
    if (pending.current || session.phase !== 'active') return;
    const ticket = ++generation.current; pending.current = true; setLoading(true); setMessage('');
    try {
      const result = await runOwned(async (token, signal) => {
        const profile = await readNativeProfile(token, signal); const mode = await readNativeMode(token, signal);
        const page = profile.profileComplete && mode.mode === 'just-me' ? await rereadLoaded(token, signal) : null;
        // Inject only the current authenticated owner's household adapter. Production never falls back to sandbox.
        const household=profile.profileComplete&&mode.mode==='just-me'&&readHousehold?await readHousehold(token,signal):null;
        return { profile, mode: mode.mode, page,household:household?.household??null };
      }, true);
      if (ticket !== generation.current) return;
      await applyPreferences(result.profile, ticket);
      if (ticket !== generation.current) return;
      setProfile(result.profile);setHousehold(result.household); setName(result.profile.displayName ?? ''); setEmoji(result.profile.avatarEmoji ?? '');
      setLanguage(result.profile.language); setProfileTheme(result.profile.theme); setMode(result.mode); setItems(result.page?.items ?? []);
      if (result.profile.profileComplete && result.mode === 'just-me' && result.page && onSetupComplete && !setupCompletionNotified.current) {
        setupCompletionNotified.current = true; onSetupComplete('load');
      }
    } catch { if (ticket === generation.current) { clear(); setMessage('unavailable'); } }
    finally { if (ticket === generation.current) { pending.current = false; setLoading(false); } }
  }
  useEffect(() => {
    if (session.phase !== 'active') setupCompletionNotified.current = false;
    if (session.phase === 'active') feedbackGeneration.current++;
    generation.current++; pending.current = false; clear(); setLoading(false);
    // Phase effects may run after the current operation's rejection callback.
    // Preserve owned lifecycle feedback; new user intents clear it synchronously.
    if (session.phase === 'active') setMessage('');
    else if (session.phase !== 'busy') setMessage(previous =>
      ['unavailable', 'storageError', 'logoutConfirmed', 'logoutLocal', 'verificationCancelled', 'sessionCleared'].includes(previous) ? previous : '');
    if (session.phase === 'active') void load();
    return () => { generation.current++;pending.current=false;request.current?.abort();request.current=null; };
  }, [session.phase]);
  useFocusEffect(useCallback(() => {
    if (currentPhase.current === 'active') void currentLoad.current();
    return () => focusCleanup.current();
  }, []));
  async function action(operation: (token: string, signal: AbortSignal) => Promise<(ticket: number) => void | Promise<void>>, readOnly = false) {
    if (pending.current || session.phase !== 'active') return;
    if (!readOnly) Keyboard.dismiss();
    const ticket = ++generation.current; pending.current = true; setLoading(true); setMessage('');
    try { const commit = await runOwned(operation, readOnly); if (ticket !== generation.current) return; await commit(ticket); }
    catch { if (ticket === generation.current) { clear(); setMessage('unavailable'); } }
    finally { if (ticket === generation.current) { pending.current = false; setLoading(false); } }
  }
  async function runOwned<T>(operation: (token: string, signal: AbortSignal) => Promise<T>, readOnly = false): Promise<T> {
    const controller = new AbortController(); request.current = controller;
    try { const result = await session.run(async (token, authoritySignal) => {
      const abort = () => controller.abort(); if (authoritySignal.aborted) abort();
      authoritySignal.addEventListener('abort', abort, { once: true });
      try { return {kind:'ready' as const,value:await operation(token, controller.signal)}; }
      catch(error) { if(readOnly && controller.signal.aborted && !authoritySignal.aborted)return {kind:'obsolete' as const};throw error; }
      finally { authoritySignal.removeEventListener('abort', abort); }
    });if(result.kind==='obsolete')throw new Error('Abandoned view');return result.value;
    } finally { if (request.current === controller) request.current = null; }
  }
  async function rereadLoaded(token: string, signal: AbortSignal) {
    return readAllOwnerSubscriptions(cursor => cursor === undefined ? readNativeSubscriptions(token, signal) : readNativeSubscriptions(token, signal, cursor), signal);
  }
  const categoryLabel = (code: string) => Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category, code)
    ? t(`onboarding.ownerSubscriptions.category.${code}`) : customCategoryLabel(code) ?? t('onboarding.ownerSubscriptions.categoryFallback');
  const allGroups = projectOwnerSubscriptions(items, '', { categories: catalogs[locale].onboarding.ownerSubscriptions.category, categoryFallback: t('onboarding.ownerSubscriptions.categoryFallback'), unnamed: t('onboarding.ownerSubscriptions.categoryFallback') }).groups;
  const projection = projectOwnerSubscriptions(categoryFilter===null?items:items.filter(item=>item.categoryCode===categoryFilter), query, { categories: catalogs[locale].onboarding.ownerSubscriptions.category, categoryFallback: t('onboarding.ownerSubscriptions.categoryFallback'), unnamed: t('onboarding.ownerSubscriptions.categoryFallback') });
  const ready = profile?.profileComplete && mode === 'just-me';
  const setup = Boolean(profile && !profile.profileComplete);
  const text = { color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md };
  const householdAdmin=household?.members.find(member=>member.role==='ADMIN');
  const avatarSlot=householdAdmin?theme.memberAccent?.slots[memberAccentForId(householdAdmin.id)]:undefined;
  const input = [styles.input, text, { backgroundColor: color('bg.raised'), borderColor: color('line.hairline'), borderRadius: theme.radius.card }];
  const button = (label: string, onPress: () => void, disabled = loading, selected?: boolean, primary = false, testID?: string) => <NativeProductButton {...(testID?{testID}:{})} key={label} label={label}
    variant={primary ? 'primary' : 'secondary'} selected={Boolean(selected)} disabled={disabled} onPress={onPress} />;
  const field = (label: string, value: string, onChangeText: (value: string) => void, decimal = false, testID?: string) => <View key={label} style={styles.field}>
    <Text style={text}>{label}</Text><TextInput testID={testID} accessibilityLabel={label} value={value} editable={!loading} onChangeText={onChangeText}
      autoCorrect={false} autoCapitalize="none" keyboardType={decimal ? 'decimal-pad' : 'default'} style={input} /></View>;
  const navigate = (destination: NativeProductDestination) => {
    if(destination==='profile'||destination==='manage'){setPage(destination==='profile'?'profile':'subscriptions');setEditingProfile(false);setAdding(false);setEditing(null);setReview(null);setReviewBlocked(false);}
    router.replace(nativeProductRoutes[destination]);
  };
  function savePreference(patch:{language?:'en'|'sv';theme?:'system'|'light'|'dark'}){
    if(!profile||loading)return;
    const validated=parseProfilePatch(patch);
    void action(async(token,signal)=>{await saveNativeProfile(validated,token,signal);const current=await readNativeProfile(token,signal);
      return async ticket=>{await applyPreferences(current,ticket);if(ticket!==generation.current)return;
        setProfile(current);setLanguage(current.language);setProfileTheme(current.theme);setMessage(patch.language&&current.language!==patch.language||patch.theme&&current.theme!==patch.theme?'preferenceReadbackUnavailable':'profileSaved');};});
  }
  function beginProfileEdit(){
    if(!profile?.profileComplete||loading||pending.current||session.phase!=='active')return;
    setName(profile.displayName??'');setEmoji(profile.avatarEmoji??'');setEditingProfile(true);setMessage('');
  }
  function cancelProfileEdit(){
    if(loading||pending.current)return;
    setName(profile?.displayName??'');setEmoji(profile?.avatarEmoji??'');setEditingProfile(false);setMessage('');
  }
  function submitProfile(){
    const displayName=name.trim().normalize('NFC');
    if(!isCanonicalDisplayName(displayName)){setMessage('invalidProfileName');return;}
    let patch;try{patch=parseProfilePatch({displayName,avatarEmoji:emoji||null});}catch{setMessage('invalidProfileEmoji');return;}
    const completedEdit=editingProfile;
    void action(async(token,signal)=>{await saveNativeProfile(patch,token,signal);const current=await readNativeProfile(token,signal);
      return async ticket=>{await applyPreferences(current,ticket);if(ticket!==generation.current)return;
        setProfile(current);setLanguage(current.language);setProfileTheme(current.theme);
        if(completedEdit&&(!current.profileComplete||current.displayName!==displayName||current.avatarEmoji!==patch.avatarEmoji)){setMessage('profileReadbackUnavailable');return;}
        setName(current.displayName??'');setEmoji(current.avatarEmoji??'');setEditingProfile(false);setMessage('profileSaved');};});
  }
  const profileEditor=<NativeProductCard>
    {field(t('onboarding.nativePersonal.name'),name,setName,false,'native-profile-name')}
    <Text style={text}>{t('onboarding.nativePersonal.emoji')}</Text>
    <View style={styles.actions}>{(['','🙂','😀','😎','🌟','🌿','🐱','🦊','🦉'] as const).map(value=>button(value||t('onboarding.nativePersonal.noEmoji'),()=>setEmoji(value),loading,emoji===value,false,value==='🙂'?'native-profile-avatar-smile':undefined))}</View>
    {button(t(editingProfile?'onboarding.profile.save':'onboarding.nativePersonal.saveProfile'),submitProfile,loading,undefined,true,'native-profile-save')}
    {editingProfile?button(t('onboarding.nativeHousehold.cancel'),cancelProfileEdit,loading,undefined,false,'native-profile-cancel'):null}
  </NativeProductCard>;
  const detailItem=ready&&!adding&&page==='subscriptions'&&session.phase==='active'?items.find(item=>item.id===expandedRow)??null:null;
  const restoreDetailFocus=()=>{const pendingFocus=restoreDetail.current;restoreDetail.current=null;if(!pendingFocus||pendingFocus.ticket!==generation.current||currentPhase.current!=='active'||currentDetail.current!==null)return;const node=rowNodes.current.get(pendingFocus.id),handle=node&&findNodeHandle(node);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);};
  const closeDetail=()=>{restoreDetail.current=expandedRow?{id:expandedRow,ticket:generation.current}:null;setExpandedRow(null);if(Platform.OS!=='ios')requestAnimationFrame(restoreDetailFocus);};
  const beginAdd=()=>{setExpandedRow(null);setEditing(null);setReview(null);setReviewBlocked(false);setDraft({customName:'',categoryCode:'',cadence:'MONTHLY',amount:'',date:''});setAdding(true);};
  const detailAction=(label:string,onPress:()=>void)=><NativeProductButton compact key={label} label={label} onPress={onPress} disabled={loading} style={styles.detailAction}/>;
  const renderActions=(item:PrivateOwnerSubscriptionView)=><View testID="native-subscription-detail-actions" style={styles.detailActions}>
    {item.source === 'DETECTED'&&item.status==='DETECTED' ? <>{detailAction(t('onboarding.nativeDetection.open'),()=>router.push('/personal-detections'))}</> : null}
          {(item.source === 'MANUAL'||sandbox&&item.source==='DETECTED'&&['ACTIVE','PAUSED','CANCELLED','ARCHIVED'].includes(item.status)) && item.currency === 'SEK' && item.cadence !== 'CUSTOM' ? <>
            {detailAction(t('onboarding.nativeSubscriptionEdit.edit'), () => {
              let amount; try { amount = nativeSekDraft(item.expectedAmountMinor, locale); } catch { setMessage('invalid'); return; }
              setExpandedRow(null);setEditing(item); setReview(null); setReviewBlocked(false); setAdding(true); setMessage('');
              setDraft({ customName: item.customName ?? '', categoryCode: item.categoryCode, cadence: item.cadence, amount, date: item.nextChargeDate ?? '' });
            })}
            {(['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED'] as const).filter(target =>
              item.status === 'ACTIVE' ? target !== 'ACTIVE' : item.status === 'PAUSED' ? target !== 'PAUSED' : item.status === 'CANCELLED' ? target === 'ARCHIVED' : false).map(target =>
              detailAction(t(`onboarding.nativeSubscriptionEdit.${target === 'ACTIVE' ? 'resume' : target === 'PAUSED' ? 'pause' : target === 'CANCELLED' ? 'cancelled' : 'archive'}`), () => {
                void action(async (token, signal) => {
                  const result = await updateNativeSubscriptionStatus({ id: item.id, status: target }, token, signal);
                  if (!('conflict' in result) && result.id !== item.id) throw new Error('result');
                  const page = await rereadLoaded(token, signal); const current = page.items.find(row => row.id === item.id);
                  return () => { setItems(page.items);
                    setMessage('conflict' in result ? 'edit.conflict' : current?.status === result.status ? 'edit.statusSaved' : 'readbackUnavailable'); };
                });
              }))}
          </> : null}</View>;
  function monthlyTotals(rows:readonly PrivateOwnerSubscriptionView[]){
    const totals=new Map<string,Money|null>();
    for(const item of rows){if(item.status!=='ACTIVE')continue;const amount=recurringCost(money(BigInt(item.expectedAmountMinor),item.currency),item.cadence)?.monthly??null;
      totals.set(item.currency,amount===null||totals.get(item.currency)===null?null:add(totals.get(item.currency)??money(0n,item.currency),amount));}
    return [...totals].sort(([left],[right])=>left.localeCompare(right)).map(([currency,amount])=>({currency,amount}));
  }
  const shownTotals=monthlyTotals(projection.groups.flatMap(group=>group.items));
  const plannedUse=(item:PrivateOwnerSubscriptionView)=>{
    // These are this owner's saved plan allocations, never transaction visibility.
    const assignment=household?.assignments.find(value=>value.subscriptionId===item.id);
    if(!household||!assignment?.memberIds.length)return null;
    const members=assignment.memberIds.map(id=>household.members.find(member=>member.id===id));
    if(members.some(member=>member===undefined))return null;
    return members.length===1?t('nativeProductDetails.plannedUseOne',{name:members[0]!.displayName}):t('nativeProductDetails.plannedUseMany',{count:members.length});
  };
  const compactDate=(value:string)=>{
    const date=new Date(`${value}T00:00:00Z`),today=now(),todayDate=new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())),days=Math.round((date.getTime()-todayDate.getTime())/86400000);
    if(days===0)return t('onboarding.datePicker.today');if(days===1)return t('nativeProductDetails.tomorrow');if(days===-1)return t('nativeProductDetails.yesterday');
    return new Intl.DateTimeFormat(locale==='sv'?'sv-SE':'en-GB',{day:'numeric',month:'short',...(date.getUTCFullYear()===today.getFullYear()?{}:{year:'numeric'}),timeZone:'UTC'}).format(date);
  };
  const categoryChip=(label:string,category:string|null)=>{const selected=categoryFilter===category;return <Pressable key={category??'all'} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled:loading}} disabled={loading} onPress={()=>setCategoryFilter(category)} style={styles.chipTouch}><View style={[styles.categoryChip,{borderColor:color(selected?'ink.primary':'line.hairline'),backgroundColor:color(selected?'ink.primary':'bg.canvas'),borderRadius:theme.radius.pill}]}><Text style={{...text,fontSize:theme.typography.fontSize.sm,fontFamily:theme.typography.fontFamily['ui.medium'],color:color(selected?'bg.canvas':'ink.secondary')}}>{label}</Text></View></Pressable>;};
  return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView testID="native-personal-scroll" accessibilityElementsHidden={Boolean(detailItem)} importantForAccessibility={detailItem?'no-hide-descendants':'auto'} refreshControl={ready&&!adding&&!editingProfile?<RefreshControl refreshing={loading} onRefresh={()=>{void load();}} tintColor={color('action.accent')}/>:undefined} style={{ backgroundColor: color('bg.canvas') }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
    {...(Platform.OS==='ios'?{automaticallyAdjustKeyboardInsets:true,keyboardDismissMode:'interactive' as const}:{})}>
    {ready&&page==='profile'?null:<NativeProductHeading testID="native-personal-title" eyebrow={ready&&page==='subscriptions'&&!adding&&!loading?t('nativeProductDetails.activeCount',{count:items.filter(item=>item.status==='ACTIVE').length}):undefined} title={session.phase!=='active'?t('onboarding.nativePersonal.loginTitle'):setup?t('onboarding.profile.title'):ready?t('onboarding.productNav.manage'):t('onboarding.mode.title')} trailing={ready&&page==='subscriptions'&&!adding?<Pressable testID="native-add-subscription" accessibilityRole="button" accessibilityLabel={t('onboarding.manualSubscription.title')} disabled={loading} onPress={beginAdd} style={styles.iconButton}><BillingIcon name="add" color={color('action.accent')}/></Pressable>:undefined} />}
    {session.phase === 'storage-error' ? <Text accessibilityRole="alert" style={text}>{t('onboarding.nativePersonal.storageError')}</Text> : null}
    {message && !detailItem && !(message==='storageError' && session.phase==='storage-error') ? <Text accessibilityRole="alert" style={text}>{t(message.startsWith('edit.') ? `onboarding.nativeSubscriptionEdit.${message.slice(5)}` : message.startsWith('manualSubscription.') ? `onboarding.${message}` : `onboarding.nativePersonal.${message}`)}</Text> : null}
    {session.phase !== 'active' ? sandbox ? inactiveContent : <>
      {button(t('onboarding.nativePersonal.verify'), () => { const ticket = ++feedbackGeneration.current; setMessage(''); void session.login().catch(() => {
        if (ticket === feedbackGeneration.current) setMessage('unavailable');
      }); }, session.phase !== 'verification-required',undefined,false,'native-personal-login')}
      {button(t('onboarding.nativePersonal.register'), () => { feedbackGeneration.current++; router.replace('/register'); }, session.phase !== 'verification-required')}
    </> : <>
      {loading ? <Text accessibilityLiveRegion="polite" style={text}>{t('onboarding.nativePersonal.loading')}</Text> : null}
      {profile && !profile.profileComplete ? profileEditor : null}
      {profile?.profileComplete && mode !== 'just-me' ? button(t('onboarding.mode.choose'), () => { void action(async (token, signal) => {
        await chooseNativeJustMe(token, signal); const current = await readNativeMode(token, signal);
        if (current.mode !== 'just-me') throw new Error('mode'); const page = await rereadLoaded(token, signal);
        return () => { setMode(current.mode); setItems(page.items); if (onSetupComplete && !setupCompletionNotified.current) { setupCompletionNotified.current = true; onSetupComplete('mutation'); } };
      }); }, loading, undefined, true) : null}
      {profile?.profileComplete && mode !== 'just-me' ? button(t('onboarding.mode.household'), () => {void action(async(token,signal)=>{
        await chooseNativeJustMe(token,signal);const current=await readNativeMode(token,signal);if(current.mode!=='just-me')throw new Error('mode');
        return ()=>{setMode(current.mode);router.replace('/personal-household');};
      });},loading) : null}
      {profile?.profileComplete && mode === 'just-me' ? <>
        {!adding && page==='profile' ? <>
        <View style={[styles.subscriptionRow,styles.profileHeader]}><View style={[styles.avatar,{width:52,height:52,backgroundColor:avatarSlot?(isDark?avatarSlot.dark:avatarSlot.light):color('bg.raised'),borderRadius:theme.radius.pill}]}><Text style={{...text,color:avatarSlot?color('ink.on-accent'):color('ink.primary'),fontFamily:theme.typography.fontFamily['ui.semibold'],fontSize:theme.typography.fontSize[profile.avatarEmoji?'xl':'md']}}>{profile.avatarEmoji??Array.from(profile.displayName??'')[0]?.toLocaleUpperCase(locale)}</Text></View><View style={styles.profileIdentity}><Text accessibilityRole="header" testID="native-personal-title" style={{...text,fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize.profileTitle}}>{household?.name??profile.displayName??t('onboarding.productNav.profile')}</Text>{household?<Text style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}}>{profile.displayName}{householdAdmin?` · ${t('onboarding.nativeHousehold.admin')}`:''}</Text>:null}</View><Pressable testID="native-profile-edit" accessibilityRole="button" accessibilityLabel={t('onboarding.nativePersonal.editProfile')} accessibilityState={{expanded:editingProfile,disabled:loading||editingProfile}} disabled={loading||editingProfile} onPress={beginProfileEdit} style={styles.iconButton}><Text style={{...text,color:color('action.accent'),fontSize:theme.typography.fontSize.sm}}>{t('onboarding.nativeHousehold.edit')}</Text></Pressable></View>
        {editingProfile?profileEditor:<>
        <NativeProductHeading level="section" title={t('nativeProductDetails.settings')}/><NativeProductCard style={{gap:0,paddingVertical:0}}>
        <View style={styles.settingRow}><View style={styles.settingLabel}><View style={[styles.settingIcon,{backgroundColor:color('bg.raised')}]}><BillingIcon name="theme" size={18} color={color('ink.secondary')}/></View><Text style={text}>{t('onboarding.nativePersonal.theme')}</Text></View>
        <NativeProductSegmentedControl label={t('onboarding.nativePersonal.theme')} value={profileTheme} disabled={loading} onSelect={value=>{if(profileTheme!==value)savePreference({theme:value});}} options={(['system','light','dark'] as const).map(value=>({value,label:t(value==='system'?'nativeProductDetails.auto':`preferences.themes.${value}`),testID:`native-profile-theme-${value}`}))}/></View>
        <View style={[styles.settingRow,styles.settingDivider,{borderColor:color('line.hairline')}]}><View style={styles.settingLabel}><View style={[styles.settingIcon,{backgroundColor:color('bg.raised')}]}><BillingIcon name="globe" size={18} color={color('ink.secondary')}/></View><Text style={text}>{t('onboarding.nativePersonal.language')}</Text></View>
        <NativeProductSegmentedControl label={t('onboarding.nativePersonal.language')} value={language} disabled={loading} onSelect={value=>{if(language!==value)savePreference({language:value});}} options={(['sv','en'] as const).map(value=>({value,label:t(value==='sv'?'nativeProductDetails.languageSwedish':'nativeProductDetails.languageEnglish'),testID:`native-profile-language-${value}`}))}/></View>
        <View style={[styles.settingDivider,{borderColor:color('line.hairline')}]}><NativeProfileSettingsLink label={t('nativeProfileTools.privacy')} icon="shield" testID="native-profile-privacy" disabled={loading} onPress={()=>router.push('/personal-privacy')}/></View>
        </NativeProductCard><NativeProductHeading level="section" title={t('onboarding.nativeBank.open')}/><NativeProductCard style={{paddingVertical:0}}><NativeProfileSettingsLink label={t('onboarding.nativeBank.title')} accessibilityLabel={t('onboarding.nativeBank.open')} icon="bank" testID="native-profile-bank" disabled={loading} onPress={()=>router.push('/personal-bank')}/></NativeProductCard>
        <NativeProductHeading level="section" title={t('nativeProfileTools.support')}/><NativeProductCard style={{paddingVertical:0}}><NativeProfileSettingsLink label={t('nativeProfileTools.help')} icon="help" testID="native-profile-help" disabled={loading} onPress={()=>router.push('/personal-help')}/></NativeProductCard></>}
        </> : null}
        {!adding && page==='subscriptions' ? <View style={styles.field}>
        {items.length === 0 && !loading ? <Text style={text}>{t('onboarding.ownerSubscriptions.empty')}</Text> : null}
        <View style={styles.search}>
          <View style={[styles.searchControls,{backgroundColor:color('bg.surface'),borderRadius:14}]}><BillingIcon name="search" size={18} color={color('ink.secondary')}/><TextInput placeholder={t('onboarding.ownerSubscriptionList.search')} placeholderTextColor={color('ink.secondary')} accessibilityLabel={t('onboarding.ownerSubscriptionList.search')} value={query}
            editable={!loading} maxLength={160} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" style={[text,styles.searchInput]} />
            {query ? <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.ownerSubscriptionList.clear')} disabled={loading}
              accessibilityState={{disabled:loading}} onPress={()=>setQuery('')} style={styles.clearSearch}><BillingIcon name="close" color={color('action.accent')}/></Pressable> : null}</View>
        </View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions} accessibilityLabel={t('onboarding.manualSubscription.category')}>
          {categoryChip(t('nativeProductDetails.allCategories'),null)}
          {allGroups.filter(group=>group.categoryCode!==null).map(group=>categoryChip(group.label,group.categoryCode))}
        </ScrollView>
        {!loading && items.length>0 && projection.filteredCount===0 ? <Text accessibilityLiveRegion="polite" style={text}>{t('onboarding.ownerSubscriptionList.noMatch')}</Text> : null}
        {projection.groups.map(group=><View key={group.categoryCode??'fallback'} style={styles.group}>
          <View style={styles.groupHeading}><Text accessibilityRole="header" style={[text,{fontSize:theme.typography.fontSize.groupTitle,fontFamily:theme.typography.fontFamily.display}]}>{group.label}</Text>
          {monthlyTotals(group.items).length>0 ? <View style={styles.subtotals}>
            {monthlyTotals(group.items).map(total=><Text key={total.currency} testID={`native-category-monthly-${group.categoryCode??'fallback'}-${total.currency}`} style={[text,styles.amount,{fontSize:theme.typography.fontSize.sm,color:color('ink.secondary')}]}>{total.amount?formatMinorUnits(total.amount.minorUnits,total.currency,{locale,display:'code'}):t('nativeProductDetails.unknown')}{total.amount?` ${t('nativeAnalytics.perMonth')}`:''}</Text>)}</View> : null}</View>
        <View style={[styles.list,{backgroundColor:color('bg.surface'),borderRadius:theme.radius.card}]}>{group.items.map((item,index) => <View key={item.id} style={[index>0?styles.rowDivider:null,{borderColor:color('line.hairline')}]}>
          <Pressable ref={node=>{if(node)rowNodes.current.set(item.id,node);else rowNodes.current.delete(item.id);}} testID={`native-subscription-row-${item.id}`} accessibilityRole="button" accessibilityLabel={item.customName??item.merchantName??categoryLabel(item.categoryCode)} accessibilityState={{expanded:expandedRow===item.id,disabled:loading}} accessibilityValue={{text:[formatMinorUnits(BigInt(item.expectedAmountMinor),item.currency,{locale,display:'code'}),t(`onboarding.ownerSubscriptions.cadence.${item.cadence}`),t(`onboarding.ownerSubscriptions.status.${item.status}`),item.alwaysPrivate?t('onboarding.billingMonth.private'):'',plannedUse(item),item.nextChargeDate??''].filter(Boolean).join(' · ')}} disabled={loading} onPress={()=>setExpandedRow(item.id)} style={styles.subscriptionRow}>
            <View style={[styles.avatar,{backgroundColor:color('bg.raised'),borderRadius:theme.radius.pill}]}><Text style={{...text,fontFamily:theme.typography.fontFamily['ui.semibold']}}>{(item.customName??item.merchantName??group.label).slice(0,1)}</Text></View>
            <View style={styles.subscriptionName}><Text numberOfLines={1} ellipsizeMode="tail" style={{...text,fontFamily:theme.typography.fontFamily['ui.medium']}}>{item.customName??item.merchantName??group.label}</Text><Text testID={`native-subscription-use-${item.id}`} numberOfLines={1} style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}}>{plannedUse(item)??t(`onboarding.ownerSubscriptions.cadence.${item.cadence}`)}{item.alwaysPrivate?` · ${t('onboarding.billingMonth.private')}`:''}{item.status==='ACTIVE'?'':` · ${t(`onboarding.ownerSubscriptions.status.${item.status}`)}`}</Text></View>
            <View style={styles.rowEnd}><Text testID={`native-subscription-amount-${item.id}`} style={[text,styles.amount,{fontFamily:theme.typography.fontFamily['ui.semibold']}]}>{formatMinorUnits(BigInt(item.expectedAmountMinor), item.currency, { locale, display: 'code' })}</Text>{item.nextChargeDate?<Text accessibilityLabel={item.nextChargeDate} style={{...text,fontSize:theme.typography.fontSize.sm,color:color('ink.secondary')}}>{compactDate(item.nextChargeDate)}</Text>:null}</View>
          </Pressable>
</View>)}</View>
        </View>)}
        {shownTotals.map(total=><View key={total.currency} style={[styles.total,{backgroundColor:color('bg.raised')}]}><Text style={{...text,fontSize:theme.typography.fontSize.sm,color:color('ink.secondary')}}>{t('nativeProductDetails.shownTotal')}</Text><Text style={[text,styles.amount,{fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize.listTotal}]}>{total.amount?formatMinorUnits(total.amount.minorUnits,total.currency,{locale,display:'code'}):t('nativeProductDetails.unknown')}{total.amount?` ${t('nativeAnalytics.perMonth')}`:''}</Text></View>)}
        {message==='unavailable'?button(t('onboarding.nativePersonal.reload'),()=>{void load();}):null}
        </View> : null}
        {adding ? <NativeProductCard>
          {review ? <><Text style={text}>{review.customName} · {categoryLabel(review.categoryCode)} · {t(`onboarding.ownerSubscriptions.cadence.${review.cadence}`)} · {formatMinorUnits(BigInt(review.expectedAmountMinor), review.currency, {locale, display:'code'})} · {review.nextChargeDate ?? t('nativeProductDetails.notSet')} · {t(`onboarding.ownerSubscriptions.status.${review.status}`)}</Text>
            {button(t('onboarding.nativeSubscriptionEdit.review'), () => { setEditing(review); setReview(null); setReviewBlocked(false); setMessage(''); })}</> : null}
          {reviewBlocked && editing ? button(t('onboarding.nativeSubscriptionEdit.review'), () => {
            const selected = editing; void action(async (token, signal) => { const page = await rereadLoaded(token, signal); const current = page.items.find(row => row.id === selected.id);
              return () => { setItems(page.items);  setReview(current ?? null); setReviewBlocked(!current); setMessage(current ? 'edit.conflict' : 'readbackUnavailable'); }; }, true);
          }) : null}
          {field(t('onboarding.manualSubscription.name'), draft.customName, value => setDraft(prior => ({ ...prior, customName: value })), false, 'native-subscription-name')}
          <NativeCategoryField value={draft.categoryCode} onChange={categoryCode=>setDraft(prior=>({...prior,categoryCode}))} disabled={loading}/>
          <Text style={text}>{t('onboarding.manualSubscription.cadence')}</Text><ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const).map(code =>
            button(t(`onboarding.ownerSubscriptions.cadence.${code}`), () => setDraft(prior => ({ ...prior, cadence: code })), loading, draft.cadence === code))}</ScrollView>
          {field(t('onboarding.nativePersonal.amount'), draft.amount, value => setDraft(prior => ({ ...prior, amount: value })), true, 'native-subscription-amount')}
          <NativeDatePicker label={t('onboarding.nativePersonal.date')} value={draft.date} onChange={date=>setDraft(prior=>({...prior,date}))} disabled={loading} testID="native-subscription-date"/>
          {button(t(editing ? 'onboarding.nativeSubscriptionEdit.save' : 'onboarding.manualSubscription.save'), () => {
            if (review || reviewBlocked) return;
            const validated = validateManualDraft(draft, locale);
            if (validated.error) { setMessage(`manualSubscription.${validated.error}`); return; }
            const body = validated.body;
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
          }, loading || Boolean(review) || reviewBlocked,undefined,true)}
          {button(t('onboarding.manualSubscription.cancel'), () => { setAdding(false); setEditing(null); setReview(null); setReviewBlocked(false); setDraft({ customName: '', categoryCode: '', cadence: 'MONTHLY', amount: '', date: '' }); })}
        </NativeProductCard> : null}
      </> : null}
    </>}
    {session.phase!=='active'||profile?.profileComplete&&page==='profile'?<NativeSessionExit phase={session.phase} onExit={() => { const exitPhase=session.phase; const ticket = ++feedbackGeneration.current; generation.current++; pending.current = false; setLoading(false); clear(); setMessage('');
      void session.logout().then(ack => { if (ticket === feedbackGeneration.current) setMessage(sessionExitFeedback(exitPhase,ack)); })
        .catch(() => { if (ticket === feedbackGeneration.current) setMessage('storageError'); }); }}/>:null}
  </ScrollView><View accessibilityElementsHidden={Boolean(detailItem)} importantForAccessibility={detailItem?'no-hide-descendants':'auto'}>{ready ? <NativeProductNav active={page==='profile'?'profile':'manage'} onNavigate={navigate} /> : null}</View>
    <Modal visible={Boolean(detailItem)} transparent animationType={reducedMotion?'none':'slide'} onRequestClose={closeDetail} onDismiss={restoreDetailFocus} onShow={()=>{const handle=detailHeading.current&&findNodeHandle(detailHeading.current);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);}}>
      <View style={[styles.scrim,{backgroundColor:color('sheet.scrim')}]}><Pressable testID="native-subscription-detail-scrim" accessible={false} onPress={closeDetail} style={StyleSheet.absoluteFillObject}/><SafeAreaView accessibilityViewIsModal onAccessibilityEscape={closeDetail} style={[styles.sheet,{backgroundColor:color('bg.canvas'),borderTopLeftRadius:theme.radius.sheet,borderTopRightRadius:theme.radius.sheet}]}><ScrollView contentContainerStyle={styles.content}><View accessible={false} style={[styles.grip,{backgroundColor:color('line.hairline')}]} />{detailItem?<NativeSubscriptionDetail session={session} reader={detailReader} item={detailItem} headingRef={detailHeading} onClose={closeDetail} actions={<>{renderActions(detailItem)}{message?<Text accessibilityRole="alert" style={text}>{t(message.startsWith('edit.')?`onboarding.nativeSubscriptionEdit.${message.slice(5)}`:`onboarding.nativePersonal.${message}`)}</Text>:null}</>}/>:null}</ScrollView></SafeAreaView></View>
    </Modal></SafeAreaView>;
}
const styles = StyleSheet.create({detailActions:{flexDirection:'row',flexWrap:'wrap',gap:8},detailAction:{flexGrow:1,flexBasis:'45%',alignSelf:'stretch'},chipTouch:{minHeight:44,justifyContent:'center'},categoryChip:{minHeight:34,paddingHorizontal:14,paddingVertical:6,borderWidth:1,justifyContent:'center'}, content: { flexGrow: 1, paddingHorizontal:20,paddingTop:18,paddingBottom:32,gap:16 }, field: { gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },settingIcon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},profileHeader:{minHeight:52,paddingVertical:0,gap:14},profileIdentity:{flex:1,minWidth:0},settingRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12,paddingVertical:9},settingLabel:{flexDirection:'row',alignItems:'center',gap:10,flexGrow:1},settingDivider:{borderTopWidth:1},
  subscriptionRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,paddingVertical:12},subscriptionName:{flex:1,minWidth:0,gap:4},avatar:{width:38,height:38,alignItems:'center',justifyContent:'center'},
  search:{gap:8},searchControls:{flexDirection:'row',alignItems:'center',gap:10,paddingLeft:14},searchInput:{flex:1,minWidth:0,minHeight:46,paddingVertical:10,paddingRight:14},clearSearch:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},group:{gap:10,marginTop:16},groupHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},list:{paddingHorizontal:16},rowDivider:{borderTopWidth:1},rowEnd:{alignItems:'flex-end',gap:4,flexShrink:1},total:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',gap:12,borderRadius:14,paddingVertical:14,paddingHorizontal:16,marginTop:10},chips:{flexDirection:'row',gap:6},iconButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},scrim:{flex:1,justifyContent:'flex-end'},sheet:{maxHeight:'92%'},subtotals:{gap:4},amount:{textAlign:'right',fontVariant:['tabular-nums'],flexShrink:1},
  grip:{alignSelf:'center',width:36,height:4,borderRadius:2},input: { borderWidth: 1, padding: 12, minHeight: 44 }, button: { borderWidth: 1, borderRadius:12, padding: 12, minHeight: 44, justifyContent: 'center' } });
