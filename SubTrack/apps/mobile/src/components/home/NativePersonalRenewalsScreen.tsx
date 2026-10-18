import React,{useCallback,useEffect,useRef,useState} from 'react';
import {RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useRouter} from 'expo-router';
import {useNativeSession} from '@/state/NativeSession';
import {readNativeRenewals,type NativeRenewalGroup} from '@/api/privateMobileRenewals';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {catalogs} from '@subtrack/i18n';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import {NativeProductNav, nativeProductRoutes, type NativeProductDestination} from '../billing/NativeProductNav';
import {NativeProductButton,NativeProductHeading} from '../billing/NativeProductUI';
import {customCategoryLabel} from '@subtrack/contracts/subscription-category';
export function NativePersonalRenewalsScreen({now=()=>new Date(),useSession=useNativeSession,readProjection=readNativeRenewals,sandbox=false,inactiveContent}:{now?:()=>Date;useSession?:()=>NativeFeatureSession;readProjection?:typeof readNativeRenewals;sandbox?:boolean;inactiveContent?:React.ReactNode}) {
 const session=useSession(),router=useRouter(),{t,locale}=useI18n(),{theme,isDark}=useTheme();
 const current=useRef(session);current.current=session;const clock=useRef(now);clock.current=now;
 const generation=useRef(0),feedback=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{feedback.current++;},[]);
 const [groups,setGroups]=useState<readonly NativeRenewalGroup[]>([]);
 const [state,setState]=useState<'idle'|'loading'|'ready'|'setup-required'|'error'>('idle');const [message,setMessage]=useState('');
 const invalidate=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;},[]);
 const load=useCallback(async()=>{
  if(!focused.current||current.current.phase!=='active')return;
  invalidate();const notice=++feedback.current;const ticket=generation.current,controller=new AbortController();request.current=controller;setGroups([]);setState('loading');setMessage('');
  try{
   const result=await current.current.run(async(token,authoritySignal)=>{
    const abort=()=>controller.abort();if(authoritySignal.aborted)controller.abort();authoritySignal.addEventListener('abort',abort,{once:true});
    try{const value=await readProjection(token,controller.signal,clock.current());if(sandbox&&value.kind==='ready'&&value.groups.some(group=>group.items.some(row=>row.currency!=='SEK'||!row.alwaysPrivate)))throw new Error('Sandbox projection unavailable');return value;}
    catch(error){if(controller.signal.aborted&&ticket!==generation.current)return {kind:'obsolete'} as const;throw error;}
    finally{authoritySignal.removeEventListener('abort',abort);}
   });
   if(ticket!==generation.current||!focused.current||result.kind==='obsolete')return;
   if(result.kind==='ready'){setGroups(result.groups);setState('ready');}else setState('setup-required');
  }catch{if(notice===feedback.current){setGroups([]);setState('error');setMessage('unavailable');}}
  finally{if(ticket===generation.current)request.current=null;}
 },[invalidate]);
 useFocusEffect(useCallback(()=>{
  focused.current=true;invalidate();setGroups([]);setState('idle');
  if(session.phase==='active'){feedback.current++;void load();}
  return ()=>{focused.current=false;invalidate();setGroups([]);setState('idle');};
 },[session.phase,invalidate,load]));
 const color=(key:string)=>getColorByTheme(theme,isDark,key);
 const text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const button=(label:string,onPress:()=>void,disabled=false)=><NativeProductButton compact label={label} onPress={onPress} disabled={disabled}/>;
 const navigate=(destination:NativeProductDestination)=>router.replace(nativeProductRoutes[destination]);
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView testID="native-renewals-scroll" alwaysBounceVertical contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={session.phase==='active'&&state==='loading'} enabled={session.phase==='active'} onRefresh={()=>{void load();}} tintColor={color('action.accent')}/>}>
  <NativeProductHeading eyebrow={session.phase==='active'?t('onboarding.nativeRenewals.expected'):undefined} title={t('onboarding.nativeRenewals.title')} trailing={session.phase==='active'?button(t('onboarding.productNav.home'),()=>router.replace('/personal-billing-month')):undefined}/>
  {message?<Text accessibilityRole="alert" style={text}>{t(`onboarding.nativePersonal.${message}`)}</Text>:null}
  {session.phase==='active'?<>
   {state==='loading'?<Text accessibilityLiveRegion="polite" style={text}>{t('onboarding.nativePersonal.loading')}</Text>:null}
   {state==='setup-required'?<Text accessibilityRole="alert" style={text}>{t('onboarding.nativeRenewals.setup')}</Text>:null}
   {state==='ready'&&groups.length===0?<View style={[styles.empty,{backgroundColor:color('bg.surface'),borderRadius:theme.radius.card}]}><Text style={{...text,color:color('ink.secondary')}}>{t('onboarding.nativeRenewals.empty')}</Text></View>:null}
   {state==='ready'?groups.map(group=><View key={group.date} style={styles.group}>
    <NativeProductHeading level="section" title={group.date}/>
    <View style={[styles.list,{backgroundColor:color('bg.surface'),borderRadius:theme.radius.card}]}>{group.items.map((item,index)=><View key={item.id} style={[styles.row,index>0?{borderTopWidth:1,borderTopColor:color('line.hairline')}:undefined]}>
     <View style={styles.grow}><Text style={{...text,fontFamily:theme.typography.fontFamily['ui.medium']}}>{item.customName??item.merchantName??t('onboarding.ownerSubscriptions.categoryFallback')}</Text>
     <Text style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}}>{Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category,item.categoryCode)?t(`onboarding.ownerSubscriptions.category.${item.categoryCode}`):customCategoryLabel(item.categoryCode)??t('onboarding.ownerSubscriptions.categoryFallback')}</Text></View>
     <Text style={{...text,fontFamily:theme.typography.fontFamily['ui.semibold'],fontVariant:['tabular-nums'],textAlign:'right',flexShrink:1}}>{formatMinorUnits(BigInt(item.expectedAmountMinor),item.currency,{locale,display:'code'})}</Text>
    </View>)}
    </View>
   </View>):null}
  {state==='error'?button(t('actions.retry'),()=>{void load();}):null}
  </>:sandbox?inactiveContent:<>
   {button(t('onboarding.nativePersonal.verify'),()=>{const ticket=++feedback.current;setMessage('');void session.login().catch(()=>{if(ticket===feedback.current)setMessage('unavailable');});},session.phase!=='verification-required')}
  </>}
 </ScrollView>{session.phase==='active'?<NativeProductNav active="upcoming" onNavigate={navigate}/>:null}</SafeAreaView>;
}
const styles=StyleSheet.create({content:{flexGrow:1,paddingHorizontal:20,paddingTop:18,paddingBottom:32,gap:10},group:{gap:10},list:{paddingHorizontal:16},row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,paddingVertical:12},grow:{flex:1,minWidth:0,gap:2},empty:{padding:16}});
