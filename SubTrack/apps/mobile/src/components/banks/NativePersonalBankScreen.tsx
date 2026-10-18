import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,findNodeHandle,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
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
import {BillingIcon} from '../billing/BillingIcon';
import {NativeProductHeading,NativeProductCard} from '../billing/NativeProductUI';

export function NativePersonalBankScreen({useSession=useNativeSession,api=privateBank,sandbox=false}:{useSession?:()=>NativeFeatureSession;api?:Pick<typeof privateBank,'readNativeBank'|'mutateNativeBank'|'bankRequestKey'>;sandbox?:boolean}={}){
 const {readNativeBank,mutateNativeBank,bankRequestKey}=api;
 const session=useSession(),router=useRouter(),{t,locale}=useI18n(),{theme,isDark}=useTheme();
 const current=useRef(session);current.current=session;const generation=useRef(0),feedback=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null);
 const [connections,setConnections]=useState<readonly PrivateMobileBankSummary[]>([]),[state,setState]=useState<'idle'|'loading'|'ready'|'setup-required'|'error'>('idle'),[message,setMessage]=useState('');
 const [purge,setPurge]=useState<string|null>(null),[options,setOptions]=useState<string|null>(null),confirmation=useRef<Text|null>(null);
 const verification=useRef<symbol|null>(null);
 useEffect(()=>()=>{feedback.current++;verification.current=null;},[]);
 const invalidate=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;setConnections([]);setPurge(null);setOptions(null);},[]);
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
  return()=>{if(current.current.phase===session.phase)verification.current=null;feedback.current++;focused.current=false;invalidate();setState('idle');};
 },[session.phase,invalidate,execute]));
 const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const secondary={...text,fontSize:theme.typography.fontSize.sm,color:color('ink.secondary')},strong={...text,fontFamily:theme.typography.fontFamily['ui.semibold']};
 const copy=(key:string,values?:Record<string,string|number>)=>t(`onboarding.nativeBank.${key}`,values);
 const busy=state==='loading';
 const button=(label:string,onPress:()=>void,disabled=busy,testID?:string,visible=label,primary=false,expanded?:boolean)=><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,...(expanded===undefined?{}:{expanded})}} disabled={disabled} onPress={onPress} style={[styles.control,{backgroundColor:primary?color('action.accent'):'transparent',borderRadius:12,opacity:disabled?0.5:1}]}><Text style={{...strong,color:color(primary?'ink.on-accent':'action.accent'),fontSize:theme.typography.fontSize.sm,flexShrink:1}}>{visible}</Text></Pressable>;
 const active=connections.some(connection=>connection.status==='ACTIVE');
 function choosePurge(id:string){const ticket=generation.current;setPurge(id);requestAnimationFrame(()=>{if(ticket!==generation.current||current.current.phase!=='active'||!focused.current)return;const handle=confirmation.current&&findNodeHandle(confirmation.current);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);});}
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView testID="native-bank-scroll" contentContainerStyle={styles.content} refreshControl={session.phase==='active'?<RefreshControl refreshing={busy} onRefresh={()=>{void execute();}} tintColor={color('action.accent')}/>:undefined}>
  <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel={copy('manage')} onPress={()=>router.replace('/personal')} style={styles.back}><BillingIcon name="previous" color={color('action.accent')} size={20}/><Text style={{...text,fontSize:theme.typography.fontSize.sm}}>{copy('manage')}</Text></Pressable>{session.phase==='active'?<Text style={secondary}>{copy('demo')}</Text>:null}</View>
  <NativeProductHeading title={copy('title')} testID="native-bank-title" level="section"/>
  {message?<Text accessibilityRole="alert" style={text}>{copy(message)}</Text>:null}
  {session.phase==='active'?<>
   {busy?<Text accessibilityLiveRegion="polite" style={secondary}>{copy('loading')}</Text>:null}
   {state==='setup-required'?<Text accessibilityRole="alert" style={text}>{copy('setup')}</Text>:null}
   {state==='ready'?<>
    {connections.length===0?<NativeProductCard><BankIcon color={color('action.accent')}/><Text style={secondary}>{copy('empty')}</Text>{button(copy('connect'),()=>{void execute({operation:'connect',institutionId:'synthetic-demo-v1'});},busy,'native-bank-connect',copy('connect'),true)}</NativeProductCard>:null}
    {connections.map((connection,index)=><NativeProductCard key={connection.connectionId}>
     <View style={styles.summary}><BankIcon color={color('action.accent')}/><View style={styles.grow}><Text accessibilityRole="header" style={strong}>{copy('generation',{number:index+1})}</Text><Text style={{...secondary,color:color(connection.status==='ACTIVE'?'status.positive':'ink.secondary')}}>{copy(connection.status==='ACTIVE'?'active':'revoked')}</Text></View>{connection.status==='ACTIVE'?button(copy('sync'),()=>{void execute({operation:'sync',connectionId:connection.connectionId});},busy,`native-bank-sync-${index}`):null}{button(copy('options'),()=>{setPurge(null);setOptions(prior=>prior===connection.connectionId?null:connection.connectionId);},busy,`native-bank-options-${index}`,copy('options'),false,options===connection.connectionId)}</View>
     <View style={styles.facts}><View style={styles.fact}><Text style={secondary}>{copy('accounts')}</Text><Text style={strong}>{connection.accountCount}</Text></View><View style={styles.fact}><Text style={secondary}>{copy('transactions')}</Text><Text style={strong}>{connection.transactionCount}</Text></View></View>
     <Text style={secondary}>{copy('lastSync',{date:connection.lastSyncAt===null?copy('never'):new Intl.DateTimeFormat(locale==='sv'?'sv-SE':'en-SE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(connection.lastSyncAt))})}</Text>
     {options===connection.connectionId?<View style={[styles.options,{borderColor:color('line.hairline')}] }>
      {purge===connection.connectionId?<><Text ref={confirmation} accessibilityRole="alert" style={strong}>{copy('purgeWarning')}</Text><View style={styles.actions}>{button(copy('confirmPurge'),()=>{void execute({operation:'disconnect',connectionId:connection.connectionId,purge:true});})}{button(copy('cancelPurge'),()=>setPurge(null))}</View></>:<>
       {connection.status==='ACTIVE'&&!sandbox?button(copy('disconnect'),()=>{void execute({operation:'disconnect',connectionId:connection.connectionId,purge:false});}):null}
       {button(copy('purge'),()=>choosePurge(connection.connectionId))}
      </>}
     </View>:null}
    </NativeProductCard>)}
    {!active&&connections.length>0?button(copy('connect'),()=>{void execute({operation:'connect',institutionId:'synthetic-demo-v1'});},busy,'native-bank-connect',copy('connect'),true):null}
    {active?button(t('onboarding.nativeDetection.open'),()=>router.push('/personal-detections'),busy,'native-bank-review',copy('reviewShort'),true):null}
   </>:null}
   {state==='error'?button(copy('refresh'),()=>{void execute();}):null}
  </>:<>{button(t('onboarding.nativePersonal.verify'),()=>{const attempt=Symbol('verification');verification.current=attempt;setMessage('');void session.login().catch(()=>{if(verification.current===attempt&&focused.current&&(current.current.phase==='verification-required'||current.current.phase==='busy'))setMessage('unavailable');}).finally(()=>{if(verification.current===attempt)verification.current=null;});},session.phase!=='verification-required')}</>}
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({content:{flexGrow:1,padding:20,gap:16,paddingBottom:32},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},back:{flexDirection:'row',alignItems:'center',minHeight:44,gap:4,alignSelf:'flex-start'},summary:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},grow:{flex:1,minWidth:100,gap:2},facts:{flexDirection:'row',gap:24},fact:{flexDirection:'row',alignItems:'baseline',gap:8},control:{minHeight:44,paddingHorizontal:10,paddingVertical:8,justifyContent:'center',alignSelf:'flex-start'},options:{borderTopWidth:1,paddingTop:8,gap:8},actions:{flexDirection:'row',flexWrap:'wrap',gap:8}});
