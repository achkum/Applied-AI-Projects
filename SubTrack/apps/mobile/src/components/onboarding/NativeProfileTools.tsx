import React,{useCallback,useRef,useState} from 'react';
import {Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect,useRouter} from 'expo-router';
import {useNativeSession} from '@/state/NativeSession';
import * as privateBank from '@/api/privateMobileBank';
import type {PrivateMobileBankSummary} from '@subtrack/contracts/private-mobile-bank';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {BillingIcon} from '../billing/BillingIcon';
import {NativeProductButton,NativeProductCard,NativeProductHeading} from '../billing/NativeProductUI';
import {NativeProductNav} from '../billing/NativeProductNav';
import type {NativeFeatureSession} from './NativePersonalScreen';

export function NativeProfileSettingsLink({label,accessibilityLabel,icon,onPress,disabled=false,testID}:{label:string;accessibilityLabel?:string;icon:'shield'|'help'|'bank';onPress:()=>void;disabled?:boolean;testID:string}){
 const {theme,isDark}=useTheme(),color=(key:string)=>getColorByTheme(theme,isDark,key);
 return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel??label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={styles.link}>
  <View testID={`${testID}-icon`} style={[styles.icon,{backgroundColor:color('bg.raised')}]}><BillingIcon name={icon} size={18} color={color('ink.secondary')}/></View>
  <Text style={{flex:1,color:color('ink.primary'),fontFamily:theme.typography.fontFamily['ui.medium'],fontSize:theme.typography.fontSize.md}}>{label}</Text><BillingIcon name="next" size={18} color={color('ink.secondary')}/>
 </Pressable>;
}
function ToolsFrame({title,active,children,refresh}:{title:string;active:boolean;children:React.ReactNode;refresh?:React.ReactElement<React.ComponentProps<typeof RefreshControl>>}){
 const {theme,isDark}=useTheme(),{t}=useI18n(),router=useRouter(),color=(key:string)=>getColorByTheme(theme,isDark,key);
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView testID="native-profile-tools-scroll" contentContainerStyle={styles.content} refreshControl={refresh}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.productNav.profile')} onPress={()=>router.replace('/personal-profile')} style={styles.back}><BillingIcon name="previous" size={20} color={color('action.accent')}/><Text style={{color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.sm}}>{t('onboarding.productNav.profile')}</Text></Pressable>
  <NativeProductHeading title={title}/>{children}
 </ScrollView>{active?<NativeProductNav active="profile"/>:null}</SafeAreaView>;
}
/** Read-only owner summary. All destructive actions remain in the accepted bank confirmation/readback flow. */
export function NativePrivacyScreen({useSession=useNativeSession,api=privateBank}:{useSession?:()=>NativeFeatureSession;api?:Pick<typeof privateBank,'readNativeBank'>}={}){
 const session=useSession(),current=useRef(session);current.current=session;
 const router=useRouter(),{t,locale}=useI18n(),{theme,isDark}=useTheme(),color=(key:string)=>getColorByTheme(theme,isDark,key),copy=(key:string)=>t(`nativeProfileTools.${key}`);
 const [connections,setConnections]=useState<readonly PrivateMobileBankSummary[]>([]),[state,setState]=useState<'idle'|'loading'|'ready'|'setup'|'error'>('idle');
 const generation=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null),read=api.readNativeBank;
 const clear=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;setConnections([]);setState('idle');},[]);
 const load=useCallback(async()=>{
  if(!focused.current||current.current.phase!=='active'||request.current)return;
  const ticket=++generation.current,controller=new AbortController();request.current=controller;setState('loading');setConnections([]);
  try{
   const result=await current.current.run(async(token,signal)=>{
    const abort=()=>controller.abort();if(signal.aborted)abort();signal.addEventListener('abort',abort,{once:true});
    try{return await read(token,controller.signal);}catch(error){if(controller.signal.aborted&&ticket!==generation.current)return null;throw error;}finally{signal.removeEventListener('abort',abort);}
   });
   if(ticket!==generation.current||!focused.current||current.current.phase!=='active'||result===null)return;
   if(result.kind==='ready'){setConnections(result.connections);setState('ready');}else setState('setup');
  }catch{if(ticket===generation.current&&focused.current){setConnections([]);setState('error');}}
  finally{if(ticket===generation.current)request.current=null;}
 },[read]);
 useFocusEffect(useCallback(()=>{focused.current=true;clear();if(session.phase==='active')void load();return()=>{focused.current=false;clear();};},[session.phase,clear,load]));
 const text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md},secondary={...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm};
 const active=session.phase==='active';
 return <ToolsFrame title={copy('privacy')} active={active} {...(active?{refresh:<RefreshControl refreshing={state==='loading'} onRefresh={()=>{void load();}} tintColor={color('action.accent')}/>}:{})}>
  {active?<>
   <NativeProductHeading level="section" title={copy('bankData')}/>
   {state==='loading'?<Text accessibilityLiveRegion="polite" style={secondary}>{t('onboarding.nativeBank.loading')}</Text>:null}
   {state==='ready'&&connections.length===0?<NativeProductCard><Text style={secondary}>{copy('noBankData')}</Text></NativeProductCard>:null}
   {state==='ready'?connections.map((connection,index)=><NativeProductCard key={connection.connectionId}>
    <View style={styles.fact}><Text accessibilityRole="header" style={text}>{t('onboarding.nativeBank.generation',{number:index+1})}</Text><Text style={{...secondary,color:color(connection.status==='ACTIVE'?'status.positive':'ink.secondary')}}>{t(`onboarding.nativeBank.${connection.status==='ACTIVE'?'active':'revoked'}`)}</Text></View>
    <View style={styles.fact}><Text style={secondary}>{t('onboarding.nativeBank.accounts')}</Text><Text style={text}>{connection.accountCount}</Text></View>
    <View style={styles.fact}><Text style={secondary}>{t('onboarding.nativeBank.transactions')}</Text><Text style={text}>{connection.transactionCount}</Text></View>
    <Text style={secondary}>{t('onboarding.nativeBank.lastSync',{date:connection.lastSyncAt===null?t('onboarding.nativeBank.never'):new Intl.DateTimeFormat(locale==='sv'?'sv-SE':'en-SE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(connection.lastSyncAt))})}</Text>
   </NativeProductCard>):null}
   {state==='setup'?<Text accessibilityRole="alert" style={text}>{t('onboarding.nativeBank.setup')}</Text>:null}
   {state==='error'?<><Text accessibilityRole="alert" style={text}>{copy('bankUnavailable')}</Text><NativeProductButton label={copy('retry')} onPress={()=>{void load();}} compact/></>:null}
   {state==='ready'?<NativeProductButton testID="native-privacy-bank-data" label={copy('manageBankData')} onPress={()=>router.push('/personal-bank')} compact/>:null}
  </>:<Text style={secondary}>{copy('signIn')}</Text>}
 </ToolsFrame>;
}
export function NativeHelpScreen({useSession=useNativeSession}:{useSession?:()=>NativeFeatureSession}={}){
 const session=useSession(),router=useRouter(),{t}=useI18n(),{theme,isDark}=useTheme(),color=(key:string)=>getColorByTheme(theme,isDark,key),copy=(key:string)=>t(`nativeProfileTools.${key}`),[expanded,setExpanded]=useState<string|null>(null);
 const text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const links=[['banks','openBanks','/personal-bank'],['review','openReview','/personal-detections'],['family','openFamily','/personal-household'],['upcoming','openUpcoming','/personal-home']] as const;
 return <ToolsFrame title={copy('help')} active={session.phase==='active'}>
  <NativeProductCard style={{gap:0,paddingVertical:0}}>{(['detection','tracking','family'] as const).map((key,index)=><View key={key} style={index?{borderTopWidth:1,borderColor:color('line.hairline')}:undefined}>
   <Pressable testID={`native-help-${key}`} accessibilityRole="button" accessibilityLabel={copy(`${key}Question`)} accessibilityState={{expanded:expanded===key}} onPress={()=>setExpanded(value=>value===key?null:key)} style={styles.link}><Text style={{...text,flex:1}}>{copy(`${key}Question`)}</Text><BillingIcon name={expanded===key?'close':'next'} size={18} color={color('ink.secondary')}/></Pressable>
   {expanded===key?<Text style={{...text,color:color('ink.secondary'),fontSize:theme.typography.fontSize.sm,paddingBottom:16}}>{copy(`${key}Answer`)}</Text>:null}
  </View>)}</NativeProductCard>
  {session.phase==='active'?<><NativeProductHeading level="section" title={copy('shortcuts')}/><NativeProductCard style={{gap:0,paddingVertical:0}}>{links.map(([id,label,path],index)=><View key={id} style={index?{borderTopWidth:1,borderColor:color('line.hairline')}:undefined}><Pressable testID={`native-help-open-${id}`} accessibilityRole="button" accessibilityLabel={copy(label)} onPress={()=>router.push(path)} style={styles.link}><Text style={{...text,flex:1}}>{copy(label)}</Text><BillingIcon name="next" size={18} color={color('ink.secondary')}/></Pressable></View>)}</NativeProductCard></>:null}
 </ToolsFrame>;
}
const styles=StyleSheet.create({content:{flexGrow:1,padding:20,gap:16,paddingBottom:32},back:{minHeight:44,flexDirection:'row',alignItems:'center',gap:4,alignSelf:'flex-start'},link:{minHeight:56,flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12},icon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},fact:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}});
