import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,findNodeHandle,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useRouter} from 'expo-router';
import {useNativeSession} from '@/state/NativeSession';
import {billingMonthCalendarDates,currentBillingMonth,shiftBillingMonth,readBillingMonth,type BillingMonth,type BillingProjection} from '@/api/privateMobileBillingMonth';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import type {PrivateOwnerSubscriptionView} from '../../../../../packages/contracts/generated/types.gen';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {catalogs} from '@subtrack/i18n';
import {BillingIcon} from './BillingIcon';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import {NativeProductNav, nativeProductRoutes, type NativeProductDestination} from './NativeProductNav';
import {NativeProductHeading} from './NativeProductUI';
import {NativeDatePicker} from './NativeDatePicker';
import {NativeHomeOverview} from '../insights/NativeHomeOverview';
import type {NativeAnalyticsReader} from '@/api/nativeAnalyticsReader';
import {customCategoryLabel} from '@subtrack/contracts/subscription-category';
import {money} from '../../../../../packages/money/src/money';
import {recurringCost} from '../../../../../packages/money/src/recurring-cost';
export function NativeBillingMonthScreen({now=()=>new Date(),useSession=useNativeSession,readProjection=readBillingMonth,sandbox=false,inactiveContent,overviewReader}:{now?:()=>Date;useSession?:()=>NativeFeatureSession;readProjection?:typeof readBillingMonth;sandbox?:boolean;inactiveContent?:React.ReactNode;overviewReader?:NativeAnalyticsReader}){
 const session=useSession(),router=useRouter(),{t,locale}=useI18n(),{theme,isDark}=useTheme();
 const current=useRef(session);current.current=session;const [month,setMonth]=useState<BillingMonth>(()=>currentBillingMonth(now()));const chosen=useRef(month);chosen.current=month;
 const generation=useRef(0),feedback=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null);
 const [projection,setProjection]=useState<BillingProjection|null>(null),[state,setState]=useState<'idle'|'loading'|'ready'|'setup-required'|'error'>('idle'),[message,setMessage]=useState('');
 const [day,setDay]=useState<string|null>(null),[detail,setDetail]=useState<PrivateOwnerSubscriptionView|null>(null);
 const requestedDay=useRef<string|null>(null);
 const heading=useRef<Text|null>(null),rowRefs=useRef(new Map<string,View>());
 const ribbon=useRef<ScrollView|null>(null),ribbonLayouts=useRef(new Map<string,{x:number;width:number}>()),ribbonViewport=useRef(0),ribbonContent=useRef(0),ribbonOffset=useRef(0);
 const ribbonSelection=useRef<{date:string;month:string;ticket:number}|null>(null);
 const monthKey=(value:BillingMonth)=>`${value.year}-${String(value.month).padStart(2,'0')}`;
 function revealSelectedRibbonDay(){
  const selection=ribbonSelection.current;
  if(!selection||selection.ticket!==generation.current||selection.month!==monthKey(chosen.current))return;
  const item=ribbonLayouts.current.get(selection.date),viewport=ribbonViewport.current,content=ribbonContent.current;
  if(!item||viewport<=0||content<=viewport)return;
  const current=ribbonOffset.current,max=Math.max(0,content-viewport);let next=current;
  if(item.x<current)next=item.x;else if(item.x+item.width>current+viewport)next=item.x+item.width-viewport;
  next=Math.max(0,Math.min(max,next));
  if(Math.abs(next-current)>0.5){ribbon.current?.scrollTo({x:next,y:0,animated:false});ribbonOffset.current=next;}
 }
 useEffect(()=>()=>{feedback.current++;},[]);
 const invalidate=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;rowRefs.current.clear();ribbonLayouts.current.clear();ribbonViewport.current=0;ribbonContent.current=0;ribbonOffset.current=0;ribbonSelection.current=null;setDetail(null);setDay(null);},[]);
 const load=useCallback(async()=>{
  if(!focused.current||current.current.phase!=='active')return;invalidate();const notice=++feedback.current,ticket=generation.current,controller=new AbortController();request.current=controller;setProjection(null);setState('loading');setMessage('');
  try{const result=await current.current.run(async(token,signal)=>{const abort=()=>controller.abort();if(signal.aborted)controller.abort();signal.addEventListener('abort',abort,{once:true});
   try{const value=await readProjection(token,controller.signal,chosen.current);if(sandbox&&value.kind==='ready'&&(value.projection.undatedDetections.some(row=>row.currency!=='SEK'||!row.alwaysPrivate)||value.projection.days.some(day=>day.items.some(row=>row.currency!=='SEK'||!row.alwaysPrivate))))throw new Error('Sandbox projection unavailable');return value;}catch(error){if(controller.signal.aborted&&ticket!==generation.current)return {kind:'obsolete'} as const;throw error;}finally{signal.removeEventListener('abort',abort);}
  });if(ticket!==generation.current||!focused.current||result.kind==='obsolete')return;
   if(result.kind==='ready'){const selectedDate=requestedDay.current?.startsWith(monthKey(result.projection.month))?requestedDay.current:result.projection.days[0]?.date??billingMonthCalendarDates(result.projection.month)[0]??null;requestedDay.current=null;ribbonSelection.current=selectedDate?{date:selectedDate,month:monthKey(result.projection.month),ticket}:null;setProjection(result.projection);setDay(selectedDate);setState('ready');}else setState('setup-required');
  }catch{if(notice===feedback.current){setProjection(null);setState('error');setMessage('unavailable');}}
  finally{if(ticket===generation.current)request.current=null;}
 },[invalidate]);
 useFocusEffect(useCallback(()=>{focused.current=true;invalidate();setProjection(null);setState('idle');if(session.phase==='active'){feedback.current++;void load();}return()=>{if(current.current.phase==='active')feedback.current++;focused.current=false;invalidate();setProjection(null);setState('idle');};},[session.phase,invalidate,load]));
 const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const strong={...text,fontFamily:theme.typography.fontFamily['ui.semibold']};const display={...text,fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize['2xl']};
 const category=(code:string)=>Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category,code)?t(`onboarding.ownerSubscriptions.category.${code}`):customCategoryLabel(code)??t('onboarding.ownerSubscriptions.categoryFallback');
 const button=(label:string,name:React.ComponentProps<typeof BillingIcon>['name'],onPress:()=>void,disabled=false,compact=false,showLabel=!compact)=><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.control,compact?styles.compactControl:null,{borderColor:color('line.hairline'),backgroundColor:color('bg.surface'),opacity:disabled?0.5:1}]}><BillingIcon name={name} color={color('action.accent')} size={compact?20:24}/>{showLabel?<Text style={{...text,fontFamily:theme.typography.fontFamily['ui.medium'],flexShrink:1}}>{label}</Text>:null}</Pressable>;
 const titleDate=new Date(0);titleDate.setFullYear(month.year,month.month-1,1);const title=new Intl.DateTimeFormat(locale==='sv'?'sv-SE':'en-SE',{month:'long',year:'numeric'}).format(titleDate);
 function navigate(direction:-1|1){const next=shiftBillingMonth(month,direction);chosen.current=next;setMonth(next);void load();}
 function closeDetail(){const id=detail?.id,ticket=generation.current;setDetail(null);requestAnimationFrame(()=>{if(ticket!==generation.current||!id)return;const node=rowRefs.current.get(id);const handle=node&&findNodeHandle(node);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);});}
 const formatted=(minor:bigint,currency:string)=>formatMinorUnits(minor,currency,{locale,display:'code'}).replace(/[\u00a0\u202f]/g,' ');
 const selected=projection?.days.find(value=>value.date===day);
 const calendarDates=projection?billingMonthCalendarDates(projection.month):[];
 const ribbonTicket=generation.current,projectionMonthKey=projection?monthKey(projection.month):'';
 const detailVisible=session.phase==='active'&&detail!==null;
 const detailCost=detail?recurringCost(money(BigInt(detail.expectedAmountMinor),detail.currency),detail.cadence):null;
 const today=now(),weekEnd=new Date(today);weekEnd.setDate(today.getDate()+6);
 const localDay=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 const weekDays=projection?.days.filter(value=>value.date>=localDay(today)&&value.date<=localDay(weekEnd))??[];
 const navigateTab=(destination:NativeProductDestination)=>router.replace(nativeProductRoutes[destination]);
 const billingContent=<>
   {session.phase==='active'?<View style={styles.monthNav}>{button(t('onboarding.billingMonth.previous'),'previous',()=>navigate(-1),month.year===1&&month.month===1,true)}<Text accessibilityRole="header" style={{...display,fontSize:theme.typography.fontSize.lg,flexShrink:1,textAlign:'center'}}>{title}</Text>{button(t('onboarding.billingMonth.next'),'next',()=>navigate(1),month.year===9999&&month.month===12,true)}</View>:null}
   {message?<Text accessibilityRole="alert" style={text}>{t(`onboarding.nativePersonal.${message}`)}</Text>:null}
   {session.phase==='active'?<>
    {state==='loading'?<Text accessibilityLiveRegion="polite" style={text}>{t('onboarding.nativePersonal.loading')}</Text>:null}
    {state==='setup-required'?<Text accessibilityRole="alert" style={text}>{t('onboarding.nativeRenewals.setup')}</Text>:null}
    {state==='ready'&&projection?<>
     {projection.days.length===0?<Text style={text}>{t('onboarding.billingMonth.empty')}</Text>:!overviewReader?<>
      <Text style={{...text,color:color('ink.secondary')}}>{t('onboarding.billingMonth.subtotal')}</Text>
      {projection.totals.map(total=><Text key={total.currency} style={{...display,fontFamily:theme.typography.fontFamily['display.extraBold'],fontSize:formatted(total.minorUnits,total.currency).length>18?theme.typography.fontSize['2xl']:theme.typography.fontSize.total,fontVariant:['tabular-nums'],textAlign:'right'}}>{formatted(total.minorUnits,total.currency)}</Text>)}
     </>:null}
     <ScrollView testID="native-month-ribbon" ref={ribbon} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ribbon} onLayout={event=>{if(ribbonTicket!==generation.current||projectionMonthKey!==monthKey(chosen.current))return;ribbonViewport.current=event.nativeEvent.layout.width;revealSelectedRibbonDay();}} onContentSizeChange={width=>{if(ribbonTicket!==generation.current||projectionMonthKey!==monthKey(chosen.current))return;ribbonContent.current=width;revealSelectedRibbonDay();}} onScroll={event=>{if(ribbonTicket===generation.current&&projectionMonthKey===monthKey(chosen.current))ribbonOffset.current=event.nativeEvent.contentOffset.x;}} scrollEventThrottle={16}>{calendarDates.map(date=>{const value=projection.days.find(group=>group.date===date);return <Pressable key={date} onLayout={event=>{if(ribbonTicket!==generation.current||projectionMonthKey!==monthKey(chosen.current))return;ribbonLayouts.current.set(date,{x:event.nativeEvent.layout.x,width:event.nativeEvent.layout.width});revealSelectedRibbonDay();}} accessibilityRole="button" accessibilityLabel={t('onboarding.billingMonth.day',{date})} accessibilityState={{selected:day===date}} onPress={()=>{ribbonSelection.current={date,month:projectionMonthKey,ticket:ribbonTicket};setDay(date);setDetail(null);revealSelectedRibbonDay();}} style={styles.day}><View accessible={false} style={[styles.billingBar,{height:value?.items.length?Math.min(64,24+value.items.length*12):2,width:value?.items.length?12:4,backgroundColor:color(day===date?'action.accent':'line.hairline'),borderRadius:theme.radius.pill}]} /><Text style={{...strong,color:color(day===date?'action.accent':'ink.secondary'),fontSize:theme.typography.fontSize.xs}}>{date.slice(8)}</Text></Pressable>;})}</ScrollView>
     {overviewReader&&weekDays.length?<View style={styles.week}><Text accessibilityRole="header" style={strong}>{t('nativeProductDetails.thisWeek')}</Text>{weekDays.flatMap(value=>value.items.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={t('onboarding.billingMonth.details',{name:item.customName??item.merchantName??category(item.categoryCode)})} onPress={()=>setDetail(item)} style={[styles.row,{borderTopColor:color('line.hairline')}]}><Text accessibilityLabel={value.date} style={{...strong,color:color('action.accent')}}>{value.date.slice(8)}</Text><View style={styles.grow}><Text style={strong}>{item.customName??item.merchantName??category(item.categoryCode)}</Text><Text style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}}>{category(item.categoryCode)}</Text></View><Text style={strong}>{formatted(BigInt(item.expectedAmountMinor),item.currency)}</Text></Pressable>))}</View>:null}
     {day&&selected&&(!overviewReader||!weekDays.some(value=>value.date===day))?<View style={[styles.card,{backgroundColor:color('bg.surface'),borderRadius:theme.radius.card}]}><Text accessibilityRole="header" style={{...display,fontSize:theme.typography.fontSize.lg}}>{day}</Text>{selected.items.map(item=><Pressable key={item.id} ref={node=>{if(node)rowRefs.current.set(item.id,node);else rowRefs.current.delete(item.id);}} accessibilityRole="button" accessibilityLabel={t('onboarding.billingMonth.details',{name:item.customName??item.merchantName??category(item.categoryCode)})} onPress={()=>setDetail(item)} style={[styles.row,{borderTopColor:color('line.hairline')}]}><View style={styles.grow}><Text style={strong}>{item.customName??item.merchantName??category(item.categoryCode)}</Text><Text style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm}}>{category(item.categoryCode)}</Text></View><Text style={{...strong,fontVariant:['tabular-nums'],textAlign:'right',flexShrink:1}}>{formatted(BigInt(item.expectedAmountMinor),item.currency)}</Text></Pressable>)}</View>:null}
     {projection.undatedDetections?.length?<View style={[styles.card,{backgroundColor:color('bg.surface'),borderRadius:theme.radius.card}]}><Text accessibilityRole="header" style={strong}>{t('onboarding.nativeDetection.undatedTitle')}</Text><Text style={{...text,color:color('ink.secondary')}}>{t('onboarding.nativeDetection.undatedDescription')}</Text>{projection.undatedDetections.map(item=><View key={item.id}><Text style={strong}>{item.customName??item.merchantName??category(item.categoryCode)}</Text><Text style={text}>{formatted(BigInt(item.expectedAmountMinor),item.currency)}</Text></View>)}{button(t('onboarding.nativeDetection.open'),'manage',()=>router.push('/personal-detections'))}</View>:null}
    </>:null}
    {button(t('onboarding.billingMonth.refresh'),'refresh',()=>{void load();},state==='loading',true,true)}
    {button(t('onboarding.productNav.upcoming'),'next',()=>router.push('/personal-home'))}
   </>:sandbox?inactiveContent:<>{button(t('onboarding.nativePersonal.verify'),'calendar',()=>{const ticket=++feedback.current;setMessage('');void session.login().catch(()=>{if(ticket===feedback.current)setMessage('unavailable');});},session.phase!=='verification-required')}</>}
 </>;
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}>
  <View style={styles.full} accessibilityElementsHidden={detailVisible} importantForAccessibility={detailVisible?'no-hide-descendants':'auto'}>
  <ScrollView contentContainerStyle={styles.content}>
   <NativeProductHeading title={t(overviewReader?'onboarding.productNav.home':'onboarding.billingMonth.title')} trailing={session.phase==='active'?<NativeDatePicker compact optional={false} testID="native-home-calendar" label={t('onboarding.datePicker.choose')} value={day??''} onChange={date=>{requestedDay.current=date;const next={year:parseInt(date.slice(0,4),10),month:parseInt(date.slice(5,7),10)};if(monthKey(next)!==monthKey(chosen.current)){chosen.current=next;setMonth(next);void load();}else{setDay(date);setDetail(null);ribbonSelection.current={date,month:monthKey(chosen.current),ticket:generation.current};revealSelectedRibbonDay();}}}/>:null} />
   {session.phase==='active'&&overviewReader?<NativeHomeOverview session={session} reader={overviewReader}>{billingContent}</NativeHomeOverview>:billingContent}
  </ScrollView>{session.phase==='active'?<NativeProductNav active="month" onNavigate={navigateTab}/>:null}</View>
  <Modal visible={detailVisible} transparent animationType="none" onRequestClose={closeDetail} onShow={()=>{const handle=heading.current&&findNodeHandle(heading.current);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);}}>
   <View style={[styles.scrim,{backgroundColor:color('sheet.scrim')}]}><SafeAreaView accessibilityViewIsModal style={[styles.sheet,{backgroundColor:color('bg.surface'),borderTopLeftRadius:theme.radius.card,borderTopRightRadius:theme.radius.card}]}>
    <ScrollView contentContainerStyle={styles.content}>{session.phase==='active'&&detail?<>
     <Text ref={heading} accessibilityRole="header" style={{...display,fontFamily:theme.typography.fontFamily['display.bold']}}>{detail.customName??detail.merchantName??category(detail.categoryCode)}</Text>
     <Text style={{...display,fontSize:theme.typography.fontSize.detail,fontVariant:['tabular-nums']}}>{formatted(BigInt(detail.expectedAmountMinor),detail.currency)}</Text>
     <View style={[styles.card,{backgroundColor:color('bg.raised'),borderRadius:theme.radius.card}]}>{[[t('nativeProductDetails.nextRenewal'),detail.nextChargeDate??t('onboarding.manualSubscription.placeholder')],[t('nativeProductDetails.annualCost'),detailCost?formatted(detailCost.annual.minorUnits,detail.currency):t('onboarding.manualSubscription.placeholder')],[t('nativeProductDetails.category'),category(detail.categoryCode)],[t('nativeProductDetails.schedule'),t(`onboarding.ownerSubscriptions.cadence.${detail.cadence}`)],[t('nativeProductDetails.status'),t(`onboarding.ownerSubscriptions.status.${detail.status}`)]].map(([label,value])=><View key={label} style={styles.detailRow}><Text style={{...text,color:color('ink.secondary')}}>{label}</Text><Text style={[strong,styles.detailValue]}>{value}</Text></View>)}</View>
     <Text style={text}>{t(detail.source==='MANUAL'?'onboarding.billingMonth.manual':'onboarding.billingMonth.detected')}</Text>
     {button(t('onboarding.billingMonth.manage'),'manage',()=>{closeDetail();router.replace('/personal');})}
    </>:null}{button(t('actions.close'),'close',closeDetail)}</ScrollView>
   </SafeAreaView></View>
  </Modal>
 </SafeAreaView>;
}
const styles=StyleSheet.create({full:{flex:1},content:{padding:20,gap:16,paddingBottom:32},header:{flexDirection:'row',alignItems:'center',gap:12},grow:{flex:1,minWidth:0},monthNav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},control:{minHeight:48,padding:12,borderWidth:1,borderRadius:18,flexDirection:'row',alignItems:'center',gap:8,flexShrink:1},compactControl:{alignSelf:'flex-start'},ribbon:{gap:0,alignItems:'flex-end'},day:{minWidth:48,minHeight:96,paddingVertical:8,alignItems:'center',justifyContent:'flex-end',gap:10},billingBar:{minHeight:2},week:{gap:8},detailRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},detailValue:{textAlign:'right',flexShrink:1},card:{padding:16,gap:12},row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64,paddingVertical:16,borderTopWidth:1},scrim:{flex:1,justifyContent:'flex-end'},sheet:{maxHeight:'85%'}});
