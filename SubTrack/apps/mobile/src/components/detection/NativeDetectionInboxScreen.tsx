import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Platform,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useRouter} from 'expo-router';
import {useNativeSession} from '@/state/NativeSession';
import * as privateDetection from '@/api/privateMobileDetection';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import {type DetectionIntent,type PrivateMobileDetectionCandidate,type PrivateMobileDetectionReviewResult} from '@/api/privateMobileDetection';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {catalogs} from '@subtrack/i18n';
import {BillingIcon} from '../billing/BillingIcon';
import {NativeProductHeading,NativeProductCard} from '../billing/NativeProductUI';

export function NativeDetectionInboxScreen({useSession=useNativeSession,api=privateDetection}:{useSession?:()=>NativeFeatureSession;api?:Pick<typeof privateDetection,'readNativeDetections'|'readDetectionOwnerRows'|'mutateNativeDetection'|'detectionRequestKey'>}={}){
 const {readNativeDetections,readDetectionOwnerRows,mutateNativeDetection,detectionRequestKey}=api;
 const session=useSession(),router=useRouter(),{t,locale}=useI18n(),{theme,isDark}=useTheme();const current=useRef(session);current.current=session;
 const generation=useRef(0),feedback=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null),pages=useRef(1),cursorHistory=useRef(new Set<string>());
 const [why,setWhy]=useState<string|null>(null);const scroll=useRef<ScrollView>(null);
 const [items,setItems]=useState<readonly PrivateMobileDetectionCandidate[]>([]),[cursor,setCursor]=useState<string|null>(null),[receipt,setReceipt]=useState<PrivateMobileDetectionReviewResult|null>(null),[state,setState]=useState<'idle'|'loading'|'ready'|'setup-required'|'error'>('idle'),[message,setMessage]=useState('');
 const invalidate=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;setItems([]);setCursor(null);setReceipt(null);setWhy(null);pages.current=1;cursorHistory.current.clear();},[]);
 const verification=useRef<symbol|null>(null);
 useEffect(()=>()=>{feedback.current++;verification.current=null;},[]);
 const execute=useCallback(async(intent?:DetectionIntent,more?:string)=>{
  if(!focused.current||current.current.phase!=='active'||request.current)return;
  const ticket=++generation.current,notice=++feedback.current,controller=new AbortController();request.current=controller;setState('loading');setMessage('');
  const priorItems=items,priorPages=pages.current;if(intent)setReceipt(null);
  try{const result=await current.current.run(async(token,signal)=>{
   const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});let sent=false;
   const fence=()=>{if(controller.signal.aborted||signal.aborted||ticket!==generation.current||!focused.current||current.current.phase!=='active')throw new Error('obsolete');};
   try{
    fence();
    let response:Awaited<ReturnType<typeof mutateNativeDetection>>|undefined;
    if(intent){const key=await detectionRequestKey();fence();sent=true;response=await mutateNativeDetection(intent,key,token,controller.signal);fence();}
    const rows:PrivateMobileDetectionCandidate[]=[],ids=new Set<string>(),cursors=new Set<string>();let next:string|null=null,at=more,setup=false;
    const limit=intent?.operation==='scan'||more?1:priorPages;
    for(let index=0;index<limit;index++){
     const page=await readNativeDetections(token,controller.signal,at);fence();if(page.kind==='setup-required'){setup=true;break;}
     for(const item of page.items){if(ids.has(item.id)||(more&&priorItems.some(prior=>prior.id===item.id)))throw new Error('page');ids.add(item.id);rows.push(item);}
     next=page.nextCursor;if(next===null)break;if(next===at||cursors.has(next)||(more&&cursorHistory.current.has(next)))throw new Error('page');cursors.add(next);at=next;
    }
    let acknowledged=true;
    if(intent&&!setup){const owner=await readDetectionOwnerRows(token,controller.signal);fence();if(response&&!('conflict'in response)&&'candidateId'in response){const found=owner.find(row=>row.id===response.candidateId);acknowledged=found?.source==='DETECTED'&&found.status===response.status&&found.revision===response.revision;if(response.status==='DETECTED'?!rows.some(row=>row.id===response.candidateId&&row.revision===response.revision):rows.some(row=>row.id===response.candidateId))acknowledged=false;}}
    fence();return {rows,next,setup,response,acknowledged,cursors};
   }catch(error){if(!sent&&controller.signal.aborted&&ticket!==generation.current)return null;throw error;}finally{signal.removeEventListener('abort',abort);}
  });
  if(result===null||ticket!==generation.current||!focused.current||current.current.phase!=='active')return;
  if(result.setup){setItems([]);setCursor(null);setReceipt(null);setState('setup-required');return;}
  setItems(more?[...priorItems,...result.rows]:result.rows);setCursor(result.next);pages.current=more?priorPages+1:intent?.operation==='scan'?1:priorPages;
  if(!more)cursorHistory.current.clear();for(const value of result.cursors)cursorHistory.current.add(value);if(more)cursorHistory.current.add(more);setState('ready');
  if(result.response){scroll.current?.scrollTo({y:0,animated:false});if('conflict'in result.response)setMessage(result.response.conflict==='UNDO_EXPIRED'?'expired':'conflict');else if(!result.acknowledged)setMessage('readback');else{setMessage(intent?.operation==='scan'?'scanned':intent?.operation==='undo'?'undone':'reviewed');if('undoUntil'in result.response&&result.response.undoUntil!==null)setReceipt(result.response);}}
  }catch{if(notice===feedback.current){setItems([]);setCursor(null);setReceipt(null);setState('error');setMessage(intent?'uncertain':'unavailable');}}
  finally{if(ticket===generation.current)request.current=null;}
 },[items,readNativeDetections,readDetectionOwnerRows,mutateNativeDetection,detectionRequestKey]);
 // The callback uses refs for authority; changing page contents must not trigger a focus reload.
 const executeRef=useRef(execute);executeRef.current=execute;
 useFocusEffect(useCallback(()=>{focused.current=true;invalidate();setState('idle');if(session.phase==='active'){feedback.current++;void executeRef.current();}return()=>{if(current.current.phase===session.phase)verification.current=null;feedback.current++;focused.current=false;invalidate();setState('idle');};},[session.phase,invalidate]));
 const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md},strong={...text,fontFamily:theme.typography.fontFamily['ui.semibold']},secondary={...text,fontSize:theme.typography.fontSize.sm,color:color('ink.secondary')};
 const copy=(key:string,values?:Record<string,string|number>)=>t(`onboarding.nativeDetection.${key}`,values),busy=state==='loading';
 const announced=useRef<number|null>(null);
 const announcement=message==='reviewed'?`${copy('reviewed')}${receipt?` ${copy('undo')}`:''}`:message==='undone'?copy('undone'):null;
 useEffect(()=>{
  if(Platform.OS!=='ios'||state!=='ready'||!announcement)return;
  const ticket=generation.current,notice=feedback.current;
  if(announced.current===ticket)return;
  const frame=requestAnimationFrame(()=>{
   if(ticket!==generation.current||notice!==feedback.current||!focused.current||current.current.phase!=='active'||announced.current===ticket)return;
   announced.current=ticket;AccessibilityInfo.announceForAccessibility(announcement);
  });
  return()=>cancelAnimationFrame(frame);
 },[announcement,state]);

 const button=(label:string,onPress:()=>void,disabled=busy,testID?:string,expanded?:boolean,visible=label,primary=false)=><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,...(expanded===undefined?{}:{expanded})}} disabled={disabled} onPress={onPress} style={[styles.control,{backgroundColor:primary?color('action.accent'):'transparent',borderRadius:12,opacity:disabled?0.5:1}]}><Text style={{...strong,fontSize:theme.typography.fontSize.sm,color:color(primary?'ink.on-accent':'action.accent'),flexShrink:1}}>{visible}</Text></Pressable>;
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView testID="native-detection-scroll" ref={scroll} contentContainerStyle={styles.content} refreshControl={session.phase==='active'?<RefreshControl refreshing={busy} onRefresh={()=>{void execute();}} tintColor={color('action.accent')}/>:undefined}>
  <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={copy('manage')} onPress={()=>router.replace('/personal')} style={styles.back}><BillingIcon name="previous" color={color('action.accent')} size={20}/><Text style={{...text,fontSize:theme.typography.fontSize.sm}}>{t('onboarding.nativeBank.manage')}</Text></Pressable>{session.phase==='active'?<Text style={secondary}>{copy('demo')}</Text>:null}</View>
  <NativeProductHeading title={copy('title')} testID="native-detection-title" level="section" trailing={session.phase==='active'&&state==='ready'?button(copy('scan'),()=>{void execute({operation:'scan'});},busy,'native-detection-scan',undefined,copy('scanShort')):undefined}/>
  {message?<Text accessibilityRole="alert" style={text}>{copy(message)}</Text>:null}
  {session.phase==='active'?<>
   {state==='setup-required'?<Text accessibilityRole="alert" style={text}>{copy('setup')}</Text>:null}
   {state==='ready'?<>
    {receipt?<View style={[styles.undo,{backgroundColor:color('bg.raised'),borderRadius:12}]}><Text style={[secondary,styles.grow]}>{copy('deadline',{date:receipt.undoUntil!})}</Text>{button(copy('undo'),()=>{void execute({operation:'undo',receiptId:receipt.receiptId,candidateId:receipt.candidateId});},busy,'native-detection-undo')}</View>:null}
    {items.length===0?<NativeProductCard><Text style={secondary}>{copy('empty')}</Text>{button(t('onboarding.nativeBank.open'),()=>router.push('/personal-bank'))}</NativeProductCard>:null}
    {items.length>0?<NativeProductCard style={styles.list}>{items.map((item,index)=><View key={item.id} style={[styles.candidate,{borderTopColor:color('line.hairline'),borderTopWidth:index===0?0:1}]}>
     <View style={styles.row}><View style={[styles.avatar,{backgroundColor:color('bg.raised'),borderRadius:theme.radius.pill}]}><Text style={strong}>{item.displayName.slice(0,1)}</Text></View><View style={styles.grow}><Text accessibilityRole="header" style={strong}>{item.displayName}</Text><Text style={secondary}>{Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category,item.categoryCode)?t(`onboarding.ownerSubscriptions.category.${item.categoryCode}`):t('onboarding.ownerSubscriptions.categoryFallback')} · {t(`onboarding.ownerSubscriptions.cadence.${item.cadence}`)}</Text></View><Text style={{...strong,fontVariant:['tabular-nums'],textAlign:'right',flexShrink:1}}>{formatMinorUnits(BigInt(item.expectedAmountMinor),item.currency,{locale,display:'code'})}</Text></View>
     <View style={styles.reviewMeta}><Text style={secondary}>{copy('confidence',{percent:Math.round(item.confidence*100)})}</Text>{button(copy('why'),()=>setWhy(prior=>prior===item.id?null:item.id),busy,`native-detection-why-${item.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,why===item.id)}</View>
     {why===item.id?<View style={styles.reasons}>{item.reasons.map(reason=><Text key={reason} style={secondary}>{copy(`reasons.${reason}`)}</Text>)}</View>:null}
     <View style={styles.actions}>{button(copy('confirm',{name:item.displayName}),()=>{void execute({operation:'confirm',candidateId:item.id,expectedRevision:item.revision});},busy,`native-detection-confirm-${item.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,undefined,copy('confirmShort'),true)}{button(copy('reject',{name:item.displayName}),()=>{void execute({operation:'reject',candidateId:item.id,expectedRevision:item.revision});},busy,`native-detection-reject-${item.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,undefined,copy('rejectShort'))}</View>
    </View>)}</NativeProductCard>:null}
    {cursor?button(copy('more'),()=>{void execute(undefined,cursor);}):null}
   </>:null}
   {state==='error'?button(copy('refresh'),()=>{void execute();}):null}
  </>:<>{button(t('onboarding.nativePersonal.verify'),()=>{const attempt=Symbol('verification');verification.current=attempt;setMessage('');void session.login().catch(()=>{if(verification.current===attempt&&focused.current&&(current.current.phase==='verification-required'||current.current.phase==='busy'))setMessage('unavailable');}).finally(()=>{if(verification.current===attempt)verification.current=null;});},session.phase!=='verification-required')}</>}
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({content:{padding:20,gap:16,paddingBottom:32},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},back:{flexDirection:'row',alignItems:'center',minHeight:44,gap:4,alignSelf:'flex-start'},grow:{flex:1,minWidth:0},list:{paddingVertical:0,gap:0},candidate:{paddingVertical:12,gap:4},row:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:38,height:38,alignItems:'center',justifyContent:'center'},control:{minHeight:44,paddingHorizontal:12,paddingVertical:8,justifyContent:'center',alignSelf:'flex-start'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingLeft:48},reviewMeta:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingLeft:48},reasons:{paddingLeft:48,gap:4},undo:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,padding:12}});
