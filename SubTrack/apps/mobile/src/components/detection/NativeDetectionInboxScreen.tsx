import {NativeSessionExit,sessionExitFeedback} from '../onboarding/NativeSessionExit';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
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

export function NativeDetectionInboxScreen({useSession=useNativeSession,api=privateDetection}:{useSession?:()=>NativeFeatureSession;api?:Pick<typeof privateDetection,'readNativeDetections'|'readDetectionOwnerRows'|'mutateNativeDetection'|'detectionRequestKey'>}={}){
 const {readNativeDetections,readDetectionOwnerRows,mutateNativeDetection,detectionRequestKey}=api;
 const session=useSession(),router=useRouter(),{t,locale}=useI18n(),{theme,isDark}=useTheme();const current=useRef(session);current.current=session;
 const generation=useRef(0),feedback=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null),pages=useRef(1),cursorHistory=useRef(new Set<string>());
 const [why,setWhy]=useState<string|null>(null);const scroll=useRef<ScrollView>(null);
 const [items,setItems]=useState<readonly PrivateMobileDetectionCandidate[]>([]),[cursor,setCursor]=useState<string|null>(null),[receipt,setReceipt]=useState<PrivateMobileDetectionReviewResult|null>(null),[state,setState]=useState<'idle'|'loading'|'ready'|'setup-required'|'error'>('idle'),[message,setMessage]=useState('');
 const invalidate=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;setItems([]);setCursor(null);setReceipt(null);setWhy(null);pages.current=1;cursorHistory.current.clear();},[]);
 useEffect(()=>()=>{feedback.current++;},[]);
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
 useFocusEffect(useCallback(()=>{focused.current=true;invalidate();setState('idle');if(session.phase==='active'){feedback.current++;void executeRef.current();}return()=>{if(current.current.phase==='active')feedback.current++;focused.current=false;invalidate();setState('idle');};},[session.phase,invalidate]));
 const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md},strong={...text,fontFamily:theme.typography.fontFamily['ui.semibold']},secondary={...text,color:color('ink.secondary')};
 const copy=(key:string,values?:Record<string,string|number>)=>t(`onboarding.nativeDetection.${key}`,values),busy=state==='loading';
 const button=(label:string,onPress:()=>void,disabled=busy,testID?:string,expanded?:boolean)=><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,...(expanded===undefined?{}:{expanded})}} disabled={disabled} onPress={onPress} style={[styles.control,{backgroundColor:color('bg.raised'),borderColor:color('line.hairline'),borderRadius:theme.radius.card,opacity:disabled?0.5:1}]}><Text style={strong}>{label}</Text></Pressable>;
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView ref={scroll} contentContainerStyle={styles.content}>
  <View style={styles.header}><View style={styles.grow}><Text testID="native-detection-title" accessibilityRole="header" style={{...strong,fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize['2xl']}}>{copy('title')}</Text></View><BillingIcon name="manage" color={color('action.accent')}/></View>
  {session.phase==='active'?<Text style={secondary}>{copy('demo')}</Text>:null}
  {message?<Text accessibilityRole="alert" style={text}>{['logoutConfirmed','logoutLocal','storageError','verificationCancelled','sessionCleared'].includes(message)?t(`onboarding.nativePersonal.${message}`):copy(message)}</Text>:null}
  {session.phase==='active'?<>
   {busy?<Text accessibilityLiveRegion="polite" style={text}>{copy('loading')}</Text>:null}
   {state==='setup-required'?<Text accessibilityRole="alert" style={text}>{copy('setup')}</Text>:null}
   {state==='ready'?<>
    {button(copy('scan'),()=>{void execute({operation:'scan'});})}
    {receipt?<View style={[styles.card,{backgroundColor:color('bg.surface'),borderColor:color('line.hairline'),borderRadius:theme.radius.card}]}><Text style={secondary}>{copy('deadline',{date:receipt.undoUntil!})}</Text>{button(copy('undo'),()=>{void execute({operation:'undo',receiptId:receipt.receiptId,candidateId:receipt.candidateId});},busy,'native-detection-undo')}</View>:null}
    {items.length===0?<View style={styles.card}><Text style={secondary}>{copy('empty')}</Text>{button(t('onboarding.nativeBank.open'),()=>router.push('/personal-bank'))}</View>:null}
    {items.map(item=><View key={item.id} style={[styles.card,{backgroundColor:color('bg.surface'),borderColor:color('line.hairline'),borderRadius:theme.radius.card}]}>
     <Text accessibilityRole="header" style={strong}>{item.displayName}</Text><Text style={{...strong,fontVariant:['tabular-nums']}}>{formatMinorUnits(BigInt(item.expectedAmountMinor),item.currency,{locale,display:'code'})}</Text>
     <Text style={secondary}>{Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category,item.categoryCode)?t(`onboarding.ownerSubscriptions.category.${item.categoryCode}`):t('onboarding.ownerSubscriptions.categoryFallback')} · {t(`onboarding.ownerSubscriptions.cadence.${item.cadence}`)}</Text>
     <Text style={secondary}>{copy('confidence',{percent:Math.round(item.confidence*100)})}</Text>{button(copy('why'),()=>setWhy(prior=>prior===item.id?null:item.id),busy,`native-detection-why-${item.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,why===item.id)}{why===item.id?item.reasons.map(reason=><Text key={reason} style={secondary}>{copy(`reasons.${reason}`)}</Text>):null}
     {button(copy('confirm',{name:item.displayName}),()=>{void execute({operation:'confirm',candidateId:item.id,expectedRevision:item.revision});},busy,`native-detection-confirm-${item.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`)}
     {button(copy('reject',{name:item.displayName}),()=>{void execute({operation:'reject',candidateId:item.id,expectedRevision:item.revision});},busy,`native-detection-reject-${item.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`)}
    </View>)}
    {cursor?button(copy('more'),()=>{void execute(undefined,cursor);}):null}
   </>:null}
   {button(copy('refresh'),()=>{void execute();})}
  </>:<>{button(t('onboarding.nativePersonal.verify'),()=>{const ticket=++feedback.current;setMessage('');void session.login().catch(()=>{if(ticket===feedback.current)setMessage('unavailable');});},session.phase!=='verification-required')}</>}
  {session.phase==='active'?<>{button(copy('manage'),()=>router.replace('/personal'))}{button(t('onboarding.billingMonth.open'),()=>router.replace('/personal-billing-month'))}</>:null}
  {<NativeSessionExit phase={session.phase} onExit={()=>{const exitPhase=session.phase;const ticket=++feedback.current;invalidate();setState('idle');setMessage('');void session.logout().then(ack=>{if(ticket===feedback.current)setMessage(sessionExitFeedback(exitPhase,ack));}).catch(()=>{if(ticket===feedback.current)setMessage('storageError');});}}/>}
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({content:{padding:20,gap:16,paddingBottom:32},header:{flexDirection:'row',alignItems:'center',gap:12},grow:{flex:1,minWidth:0},card:{padding:16,gap:12,borderWidth:1},control:{minHeight:48,padding:12,borderWidth:1,justifyContent:'center'}});
