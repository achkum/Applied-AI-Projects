import {NativeSessionExit,sessionExitFeedback} from '../onboarding/NativeSessionExit';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,findNodeHandle,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useRouter} from 'expo-router';
import {useNativeSession} from '@/state/NativeSession';
import * as privateBank from '@/api/privateMobileBank';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import {type BankIntent} from '@/api/privateMobileBank';
import type {PrivateMobileBankSummary} from '@subtrack/contracts/private-mobile-bank';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {BankIcon} from './BankIcon';

export function NativePersonalBankScreen({useSession=useNativeSession,api=privateBank,sandbox=false}:{useSession?:()=>NativeFeatureSession;api?:Pick<typeof privateBank,'readNativeBank'|'mutateNativeBank'|'bankRequestKey'>;sandbox?:boolean}={}){
 const {readNativeBank,mutateNativeBank,bankRequestKey}=api;
 const session=useSession(),router=useRouter(),{t,locale}=useI18n(),{theme,isDark}=useTheme();
 const current=useRef(session);current.current=session;const generation=useRef(0),feedback=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null);
 const [connections,setConnections]=useState<readonly PrivateMobileBankSummary[]>([]),[state,setState]=useState<'idle'|'loading'|'ready'|'setup-required'|'error'>('idle'),[message,setMessage]=useState('');
 const [purge,setPurge]=useState<string|null>(null),confirmation=useRef<Text|null>(null);
 useEffect(()=>()=>{feedback.current++;},[]);
 const invalidate=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;setConnections([]);setPurge(null);},[]);
 const execute=useCallback(async(intent?:BankIntent)=>{
  if(!focused.current||current.current.phase!=='active'||request.current)return;
  invalidate();const ticket=generation.current,notice=++feedback.current,controller=new AbortController();request.current=controller;setState('loading');setMessage('');
  try{
   const result=await current.current.run(async(token,signal)=>{
    const abort=()=>controller.abort();if(signal.aborted)controller.abort();signal.addEventListener('abort',abort,{once:true});
    try{
     let conflict=false;
     if(intent){const key=await bankRequestKey();if(controller.signal.aborted)throw new Error('obsolete');const receipt=await mutateNativeBank(intent,key,token,controller.signal);conflict='conflict' in receipt;}
     const read=await readNativeBank(token,controller.signal);return {read,conflict};
    }catch(error){if(!intent&&controller.signal.aborted&&ticket!==generation.current)return null;throw error;}
    finally{signal.removeEventListener('abort',abort);}
   });
   if(ticket!==generation.current||!focused.current||current.current.phase!=='active'||result===null)return;
   if(result.read.kind==='ready'){
    setConnections(result.read.connections);setState('ready');
    if(intent){const purgeRequested=intent.operation==='disconnect'&&intent.purge;
     setMessage(result.conflict?'conflict':purgeRequested?result.read.connections.some(connection=>connection.connectionId===intent.connectionId)?'conflict':'purged':'updated');}
   }
   else{setState('setup-required');setMessage('');}
  }catch{if(notice===feedback.current){setConnections([]);setPurge(null);setState('error');setMessage(intent?'uncertain':'unavailable');}}
  finally{if(ticket===generation.current)request.current=null;}
 },[invalidate,readNativeBank,mutateNativeBank,bankRequestKey]);
 useFocusEffect(useCallback(()=>{
  focused.current=true;invalidate();setState('idle');if(session.phase==='active'){feedback.current++;void execute();}
  return()=>{if(current.current.phase==='active')feedback.current++;focused.current=false;invalidate();setState('idle');};
 },[session.phase,invalidate,execute]));
 const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const secondary={...text,color:color('ink.secondary')},strong={...text,fontFamily:theme.typography.fontFamily['ui.semibold']},display={...strong,fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize['2xl']};
 const copy=(key:string,values?:Record<string,string|number>)=>t(`onboarding.nativeBank.${key}`,values);
 const busy=state==='loading';
 const button=(label:string,onPress:()=>void,disabled=busy,testID?:string)=><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.control,{backgroundColor:color('bg.raised'),borderColor:color('line.hairline'),borderRadius:theme.radius.card,opacity:disabled?0.5:1}]}><Text style={{...strong,flexShrink:1}}>{label}</Text></Pressable>;
 const active=connections.some(connection=>connection.status==='ACTIVE');
 function choosePurge(id:string){const ticket=generation.current;setPurge(id);requestAnimationFrame(()=>{if(ticket!==generation.current||current.current.phase!=='active'||!focused.current)return;const handle=confirmation.current&&findNodeHandle(confirmation.current);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);});}
 function logout(){const exitPhase=session.phase;const notice=++feedback.current;invalidate();setState('idle');setMessage('');void current.current.logout().then(ack=>{if(notice===feedback.current)setMessage(sessionExitFeedback(exitPhase,ack));}).catch(()=>{if(notice===feedback.current)setMessage('storageError');});}
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView contentContainerStyle={styles.content}>
  <View style={styles.header}><View style={styles.grow}><Text testID="native-bank-title" accessibilityRole="header" style={display}>{copy('title')}</Text></View><BankIcon color={color('action.accent')}/></View>
  {session.phase==='active'?<Text style={secondary}>{copy('demo')}</Text>:null}
  {message?<Text accessibilityRole="alert" style={text}>{['logoutConfirmed','logoutLocal','storageError','verificationCancelled','sessionCleared'].includes(message)?t(`onboarding.nativePersonal.${message}`):copy(message)}</Text>:null}
  {session.phase==='active'?<>
   {busy?<Text accessibilityLiveRegion="polite" style={text}>{copy('loading')}</Text>:null}
   {state==='setup-required'?<Text accessibilityRole="alert" style={text}>{copy('setup')}</Text>:null}
   {state==='ready'?<>
    {connections.length===0?<Text style={secondary}>{copy('empty')}</Text>:null}
    {connections.map((connection,index)=><View key={connection.connectionId} style={[styles.card,{backgroundColor:color('bg.surface'),borderColor:color('line.hairline'),borderRadius:theme.radius.card}]}>
     <Text accessibilityRole="header" style={strong}>{copy('generation',{number:index+1})}</Text>
     <Text style={{...strong,color:color(connection.status==='ACTIVE'?'status.positive':'ink.secondary')}}>{copy(connection.status==='ACTIVE'?'active':'revoked')}</Text>
     {connection.status==='REVOKED'?<Text style={secondary}>{copy('retained')}</Text>:null}
     <View style={[styles.row,{borderColor:color('line.hairline')}]}><Text style={text}>{copy('accounts')}</Text><Text style={strong}>{connection.accountCount}</Text></View>
     <View style={[styles.row,{borderColor:color('line.hairline')}]}><Text style={text}>{copy('transactions')}</Text><Text style={strong}>{connection.transactionCount}</Text></View>
     <Text style={secondary}>{copy('lastSync',{date:connection.lastSyncAt===null?copy('never'):new Intl.DateTimeFormat(locale==='sv'?'sv-SE':'en-SE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(connection.lastSyncAt))})}</Text>
     {connection.status==='ACTIVE'?<>
      {button(copy('sync'),()=>{void execute({operation:'sync',connectionId:connection.connectionId});},busy,`native-bank-sync-${index}`)}
      {!sandbox?button(copy('disconnect'),()=>{void execute({operation:'disconnect',connectionId:connection.connectionId,purge:false});}):null}
     </>:null}
     {purge===connection.connectionId?<View style={styles.confirmation}>
      <Text ref={confirmation} accessibilityRole="alert" style={strong}>{copy('purgeWarning')}</Text>
      {button(copy('confirmPurge'),()=>{void execute({operation:'disconnect',connectionId:connection.connectionId,purge:true});})}
      {button(copy('cancelPurge'),()=>setPurge(null))}
     </View>:button(copy('purge'),()=>choosePurge(connection.connectionId))}
    </View>)}
    {!active?button(copy('connect'),()=>{void execute({operation:'connect',institutionId:'synthetic-demo-v1'});},busy,'native-bank-connect'):null}
   </>:null}
   {active?button(t('onboarding.nativeDetection.open'),()=>router.push('/personal-detections'),busy,'native-bank-review'):null}
   {button(copy('refresh'),()=>{void execute();})}
  </>:<>

   {button(t('onboarding.nativePersonal.verify'),()=>{const notice=++feedback.current;setMessage('');void session.login().catch(()=>{if(notice===feedback.current)setMessage('unavailable');});},session.phase!=='verification-required')}
  </>}
  {session.phase==='active'?button(copy('manage'),()=>router.replace('/personal'),false):null}
  <NativeSessionExit phase={session.phase} onExit={logout}/>
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({content:{flexGrow:1,padding:20,gap:16},header:{flexDirection:'row',alignItems:'center',gap:12},grow:{flex:1,gap:8},card:{padding:18,gap:12,borderWidth:1},row:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:12,borderTopWidth:1,paddingTop:12},control:{minHeight:48,padding:12,borderWidth:1,justifyContent:'center'},confirmation:{gap:12}});
