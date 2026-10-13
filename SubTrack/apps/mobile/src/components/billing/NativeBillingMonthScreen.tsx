import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,findNodeHandle,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useRouter} from 'expo-router';
import {useNativeSession} from '@/state/NativeSession';
import {currentBillingMonth,shiftBillingMonth,readBillingMonth,type BillingMonth,type BillingProjection} from '@/api/privateMobileBillingMonth';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import type {PrivateOwnerSubscriptionView} from '../../../../../packages/contracts/generated/types.gen';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {catalogs} from '@subtrack/i18n';
import {BillingIcon} from './BillingIcon';
export function NativeBillingMonthScreen({now=()=>new Date()}:{now?:()=>Date}){
 const session=useNativeSession(),router=useRouter(),{t,locale}=useI18n(),{theme,isDark,mode,setMode}=useTheme();
 const current=useRef(session);current.current=session;const [month,setMonth]=useState<BillingMonth>(()=>currentBillingMonth(now()));const chosen=useRef(month);chosen.current=month;
 const generation=useRef(0),feedback=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null);
 const [projection,setProjection]=useState<BillingProjection|null>(null),[state,setState]=useState<'idle'|'loading'|'ready'|'setup-required'|'error'>('idle'),[message,setMessage]=useState('');
 const [day,setDay]=useState<string|null>(null),[detail,setDetail]=useState<PrivateOwnerSubscriptionView|null>(null);
 const heading=useRef<Text|null>(null),rowRefs=useRef(new Map<string,View>());
 useEffect(()=>()=>{feedback.current++;},[]);
 const invalidate=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;rowRefs.current.clear();setDetail(null);setDay(null);},[]);
 const load=useCallback(async()=>{
  if(!focused.current||current.current.phase!=='active')return;invalidate();const notice=++feedback.current,ticket=generation.current,controller=new AbortController();request.current=controller;setProjection(null);setState('loading');setMessage('');
  try{const result=await current.current.run(async(token,signal)=>{const abort=()=>controller.abort();if(signal.aborted)controller.abort();signal.addEventListener('abort',abort,{once:true});
   try{return await readBillingMonth(token,controller.signal,chosen.current);}catch(error){if(controller.signal.aborted&&ticket!==generation.current)return {kind:'obsolete'} as const;throw error;}finally{signal.removeEventListener('abort',abort);}
  });if(ticket!==generation.current||!focused.current||result.kind==='obsolete')return;
   if(result.kind==='ready'){setProjection(result.projection);setDay(result.projection.days[0]?.date??null);setState('ready');}else setState('setup-required');
  }catch{if(notice===feedback.current){setProjection(null);setState('error');setMessage('unavailable');}}
  finally{if(ticket===generation.current)request.current=null;}
 },[invalidate]);
 useFocusEffect(useCallback(()=>{focused.current=true;invalidate();setProjection(null);setState('idle');if(session.phase==='active'){feedback.current++;void load();}return()=>{if(current.current.phase==='active')feedback.current++;focused.current=false;invalidate();setProjection(null);setState('idle');};},[session.phase,invalidate,load]));
 const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const strong={...text,fontFamily:theme.typography.fontFamily['ui.semibold']};const display={...text,fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize['2xl']};
 const category=(code:string)=>Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category,code)?t(`onboarding.ownerSubscriptions.category.${code}`):t('onboarding.ownerSubscriptions.categoryFallback');
 const button=(label:string,name:React.ComponentProps<typeof BillingIcon>['name'],onPress:()=>void,disabled=false,compact=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.control,{borderColor:color('line.hairline'),backgroundColor:color('bg.surface'),opacity:disabled?0.5:1}]}><BillingIcon name={name} color={color('action.accent')}/>{compact?null:<Text style={{...text,fontFamily:theme.typography.fontFamily['ui.medium'],flexShrink:1}}>{label}</Text>}</Pressable>;
 const titleDate=new Date(0);titleDate.setFullYear(month.year,month.month-1,1);const title=new Intl.DateTimeFormat(locale==='sv'?'sv-SE':'en-SE',{month:'long',year:'numeric'}).format(titleDate);
 function navigate(direction:-1|1){const next=shiftBillingMonth(month,direction);chosen.current=next;setMonth(next);void load();}
 function closeDetail(){const id=detail?.id,ticket=generation.current;setDetail(null);requestAnimationFrame(()=>{if(ticket!==generation.current||!id)return;const node=rowRefs.current.get(id);const handle=node&&findNodeHandle(node);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);});}
 const formatted=(minor:bigint,currency:string)=>formatMinorUnits(minor,currency,{locale,display:'code'}).replace(/[\u00a0\u202f]/g,' ');
 const selected=projection?.days.find(value=>value.date===day);
 const detailVisible=session.phase==='active'&&detail!==null;
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}>
  <View style={styles.full} accessibilityElementsHidden={detailVisible} importantForAccessibility={detailVisible?'no-hide-descendants':'auto'}>
  <ScrollView contentContainerStyle={styles.content}>
   <View style={styles.header}><View style={styles.grow}><Text style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}}>{t('scope.personal')}</Text><Text accessibilityRole="header" style={display}>{t('onboarding.billingMonth.title')}</Text></View><BillingIcon name="calendar" color={color('action.accent')}/></View>
   <View style={styles.monthNav}>{button(t('onboarding.billingMonth.previous'),'previous',()=>navigate(-1),month.year===1&&month.month===1,true)}<Text accessibilityRole="header" style={{...display,fontSize:theme.typography.fontSize.lg,flexShrink:1,textAlign:'center'}}>{title}</Text>{button(t('onboarding.billingMonth.next'),'next',()=>navigate(1),month.year===9999&&month.month===12,true)}</View>
   <Text style={{...text,color:color('ink.secondary')}}>{t('onboarding.billingMonth.expected')}</Text>
   {message?<Text accessibilityRole="alert" style={text}>{t(`onboarding.nativePersonal.${message}`)}</Text>:null}
   {session.phase==='active'?<>
    {state==='loading'?<Text accessibilityLiveRegion="polite" style={text}>{t('onboarding.nativePersonal.loading')}</Text>:null}
    {state==='setup-required'?<Text accessibilityRole="alert" style={text}>{t('onboarding.nativeRenewals.setup')}</Text>:null}
    {state==='ready'&&projection?<>
     {projection.days.length===0?<Text style={text}>{t('onboarding.billingMonth.empty')}</Text>:<>
      <Text style={{...text,color:color('ink.secondary')}}>{t('onboarding.billingMonth.subtotal')}</Text>
      {projection.totals.map(total=><Text key={total.currency} style={{...display,fontFamily:theme.typography.fontFamily['display.extraBold'],fontSize:formatted(total.minorUnits,total.currency).length>18?theme.typography.fontSize['2xl']:theme.typography.fontSize.total,fontVariant:['tabular-nums'],textAlign:'right'}}>{formatted(total.minorUnits,total.currency)}</Text>)}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ribbon}>{projection.days.map(value=><Pressable key={value.date} accessibilityRole="button" accessibilityLabel={t('onboarding.billingMonth.day',{date:value.date})} accessibilityState={{selected:day===value.date}} onPress={()=>{setDay(value.date);setDetail(null);}} style={[styles.day,{backgroundColor:color(day===value.date?'action.accent':'bg.surface'),borderColor:color('line.hairline')}]}><Text style={{...strong,color:color(day===value.date?'ink.on-accent':'ink.primary')}}>{value.date.slice(8)}</Text><Text style={{...text,color:color(day===value.date?'ink.on-accent':'ink.secondary'),fontSize:theme.typography.fontSize.xs}}>{value.items.length}</Text></Pressable>)}</ScrollView>
      {selected?<View style={[styles.card,{backgroundColor:color('bg.surface'),borderRadius:theme.radius.card}]}><Text accessibilityRole="header" style={{...display,fontSize:theme.typography.fontSize.lg}}>{selected.date}</Text>{selected.items.map(item=><Pressable key={item.id} ref={node=>{if(node)rowRefs.current.set(item.id,node);else rowRefs.current.delete(item.id);}} accessibilityRole="button" accessibilityLabel={t('onboarding.billingMonth.details',{name:item.customName??item.merchantName??category(item.categoryCode)})} onPress={()=>setDetail(item)} style={[styles.row,{borderTopColor:color('line.hairline')}]}><View style={styles.grow}><Text style={strong}>{item.customName??item.merchantName??category(item.categoryCode)}</Text><Text style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}}>{category(item.categoryCode)}</Text></View><Text style={{...strong,fontVariant:['tabular-nums'],textAlign:'right',flexShrink:1}}>{formatted(BigInt(item.expectedAmountMinor),item.currency)}</Text></Pressable>)}</View>:null}
     </>}
    </>:null}
    {button(t('onboarding.billingMonth.refresh'),'refresh',()=>{void load();},state==='loading')}
   </>:<><Text style={text}>{t('onboarding.nativePersonal.restart')}</Text>{button(t('onboarding.nativePersonal.verify'),'calendar',()=>{const ticket=++feedback.current;setMessage('');void session.login().catch(()=>{if(ticket===feedback.current)setMessage('unavailable');});},session.phase==='busy')}</>}
   {button(t('onboarding.billingMonth.manage'),'manage',()=>router.replace('/personal'))}
   {button(t('onboarding.nativeRenewals.open'),'calendar',()=>router.replace('/personal-home'))}
   <View style={styles.theme}>{(['light','dark','system'] as const).map(value=><Pressable key={value} accessibilityRole="button" accessibilityLabel={t(`preferences.themes.${value}`)} accessibilityState={{selected:mode===value}} onPress={()=>{void setMode(value);}} style={styles.themeControl}><Text style={{...text,color:color(mode===value?'action.text':'ink.secondary'),fontFamily:theme.typography.fontFamily['ui.medium']}}>{t(`preferences.themes.${value}`)}</Text></Pressable>)}</View>
   {button(t('onboarding.nativePersonal.logout'),'logout',()=>{const ticket=++feedback.current;invalidate();setProjection(null);setState('idle');setMessage('');void session.logout().then(ack=>{if(ticket===feedback.current)setMessage(ack?'logoutConfirmed':'logoutLocal');}).catch(()=>{if(ticket===feedback.current)setMessage('storageError');});})}
  </ScrollView></View>
  <Modal visible={detailVisible} transparent animationType="none" onRequestClose={closeDetail} onShow={()=>{const handle=heading.current&&findNodeHandle(heading.current);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);}}>
   <View style={[styles.scrim,{backgroundColor:color('sheet.scrim')}]}><SafeAreaView accessibilityViewIsModal style={[styles.sheet,{backgroundColor:color('bg.surface'),borderTopLeftRadius:theme.radius.card,borderTopRightRadius:theme.radius.card}]}>
    <ScrollView contentContainerStyle={styles.content}>{session.phase==='active'&&detail?<>
     <Text ref={heading} accessibilityRole="header" style={{...display,fontFamily:theme.typography.fontFamily['display.bold']}}>{detail.customName??detail.merchantName??category(detail.categoryCode)}</Text>
     <Text style={{...display,fontSize:theme.typography.fontSize.detail,fontVariant:['tabular-nums']}}>{formatted(BigInt(detail.expectedAmountMinor),detail.currency)}</Text>
     <Text style={text}>{t('onboarding.billingMonth.expected')}</Text><Text style={text}>{category(detail.categoryCode)} · {t(`onboarding.ownerSubscriptions.cadence.${detail.cadence}`)}</Text>
     <Text style={text}>{t('onboarding.billingMonth.savedDate',{date:detail.nextChargeDate!})}</Text><Text style={text}>{t(`onboarding.ownerSubscriptions.status.${detail.status}`)}</Text>
     <Text style={text}>{t(detail.source==='MANUAL'?'onboarding.billingMonth.manual':'onboarding.billingMonth.detected')}</Text><Text style={text}>{t(detail.alwaysPrivate?'onboarding.billingMonth.private':'onboarding.billingMonth.owner')}</Text>
     {button(t('onboarding.billingMonth.manage'),'manage',()=>{closeDetail();router.replace('/personal');})}
    </>:null}{button(t('actions.close'),'close',closeDetail)}</ScrollView>
   </SafeAreaView></View>
  </Modal>
 </SafeAreaView>;
}
const styles=StyleSheet.create({full:{flex:1},content:{padding:20,gap:16,paddingBottom:32},header:{flexDirection:'row',alignItems:'center',gap:12},grow:{flex:1,minWidth:0},monthNav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},control:{minHeight:48,padding:12,borderWidth:1,borderRadius:18,flexDirection:'row',alignItems:'center',gap:8,flexShrink:1},ribbon:{gap:8},day:{minWidth:48,minHeight:64,padding:12,borderWidth:1,borderRadius:18,alignItems:'center',gap:4},card:{padding:16,gap:12},row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,paddingVertical:16,borderTopWidth:1},theme:{flexDirection:'row',flexWrap:'wrap',gap:8},themeControl:{minWidth:48,minHeight:48,padding:12},scrim:{flex:1,justifyContent:'flex-end'},sheet:{maxHeight:'85%'}});
