import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Keyboard,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from 'expo-router';
import {memberAccentForId} from '@subtrack/ui-tokens/member-accent';
import {isCanonicalDisplayName} from '@subtrack/contracts/profile';
import type {SandboxHouseholdView} from '@subtrack/contracts/sandbox-household';
import type {PrivateOwnerSubscriptionView} from '../../../../../packages/contracts/generated/types.gen';
import {sandboxHouseholdApi,householdRequestId,type SandboxHouseholdApi,type SandboxHouseholdIntent} from '@/api/sandboxHouseholdApi';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {readAllOwnerSubscriptions} from '@/api/privateMobileSubscriptionList';
import {projectHouseholdUsage} from '@/api/householdProjection';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import {chartPercent} from '../../../../../packages/money/src/recurring-cost';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import {NativeProductButton,NativeProductCard,NativeProductHeading,NativeProductLabel} from '../billing/NativeProductUI';
import {NativeProductNav} from '../billing/NativeProductNav';

export function NativeHouseholdScreen({useSession,api=sandboxHouseholdApi,readSubscriptions=sandboxMobileApi.readNativeSubscriptions,inactiveContent}: {
 useSession:()=>NativeFeatureSession;api?:SandboxHouseholdApi;readSubscriptions?:typeof sandboxMobileApi.readNativeSubscriptions;inactiveContent?:React.ReactNode;
}){
 const session=useSession(),{t,locale}=useI18n(),{theme,isDark}=useTheme();
 const copy=(key:string,values?:Record<string,string|number>)=>t(`onboarding.nativeHousehold.${key}`,values);
 const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const strong={...text,fontFamily:theme.typography.fontFamily['ui.semibold']};
 const [view,setView]=useState<SandboxHouseholdView|null>(null),[items,setItems]=useState<readonly PrivateOwnerSubscriptionView[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [householdName,setHouseholdName]=useState(''),[memberName,setMemberName]=useState(''),[edit,setEdit]=useState<string|null>(null),[remove,setRemove]=useState<string|null>(null),[renaming,setRenaming]=useState(false);
 const [selected,setSelected]=useState<string|null>(null),[assign,setAssign]=useState<string|null>(null),[users,setUsers]=useState<readonly string[]>([]),[payer,setPayer]=useState<string|null>(null);
 const current=useRef(session);current.current=session;const generation=useRef(0),focused=useRef(false),request=useRef<AbortController|null>(null);
 const apiRef=useRef(api);apiRef.current=api;const readRef=useRef(readSubscriptions);readRef.current=readSubscriptions;
 const clear=useCallback(()=>{generation.current++;request.current?.abort();request.current=null;setView(null);setItems([]);setEdit(null);setRemove(null);setMemberName('');setHouseholdName('');setRenaming(false);setSelected(null);setAssign(null);setUsers([]);setPayer(null);},[]);
 const execute=useCallback(async(intent?:SandboxHouseholdIntent)=>{
  if(!focused.current||current.current.phase!=='active'||request.current)return;
  if(intent)Keyboard.dismiss();
  const ticket=++generation.current,controller=new AbortController();request.current=controller;setBusy(true);setMessage('');
  try{
   const result=await current.current.run(async(token,signal)=>{
    const abort=()=>controller.abort();if(signal.aborted)abort();signal.addEventListener('abort',abort,{once:true});
    try{if(intent)await apiRef.current.mutate(intent,token,controller.signal);const household=await apiRef.current.read(token,controller.signal);const subscriptions=await readAllOwnerSubscriptions(cursor=>readRef.current(token,controller.signal,cursor),controller.signal);return {household,subscriptions};}
    catch(error){if(!intent&&controller.signal.aborted&&!signal.aborted&&ticket!==generation.current&&current.current.phase==='active')return null;throw error;}
    finally{signal.removeEventListener('abort',abort);}
   });
   if(result===null||ticket!==generation.current||!focused.current||current.current.phase!=='active')return;
   setView(result.household);setItems(result.subscriptions.items);setHouseholdName(result.household.household?.name??'');
   if(intent){setEdit(null);setRemove(null);setMemberName('');setAssign(null);setUsers([]);setPayer(null);setRenaming(false);setMessage('saved');if(intent.operation==='dependant-remove')setSelected(null);}
  }catch{if(ticket===generation.current){setView(null);setItems([]);setMessage(intent?'uncertain':'unavailable');}}
  finally{if(ticket===generation.current){request.current=null;setBusy(false);}}
 },[]);
 useFocusEffect(useCallback(()=>{focused.current=true;clear();setMessage('');setBusy(false);if(session.phase==='active')void execute();return()=>{focused.current=false;clear();};},[session.phase,clear,execute]));
 useEffect(()=>()=>{generation.current++;request.current?.abort();},[]);
 const projection=view?projectHouseholdUsage(view,items):null;
 const household=projection?.household??null;
 const payerTotal=selected===null?projection?.monthly:projection?.members.find(member=>member.id===selected)?.payerMonthly;
 const currency=(minor:bigint)=>formatMinorUnits(minor,'SEK',{locale,display:'code'});
 const accent=(id:string)=>{const slot=theme.memberAccent?.slots[memberAccentForId(id)];return slot?(isDark?slot.dark:slot.light):color('action.accent');};
 const avatar=(id:string,name:string,small=false)=><View style={[small?styles.avatarSmall:styles.avatar,{backgroundColor:accent(id),borderRadius:theme.radius.pill},small?{borderWidth:2,borderColor:color('bg.surface')}:null]}><Text style={{...strong,color:color('ink.on-accent'),fontSize:small?theme.typography.fontSize.xs:theme.typography.fontSize.md}}>{Array.from(name)[0]?.toLocaleUpperCase(locale)}</Text></View>;
 function valid(value:string){const canonical=value.normalize('NFC').trim();if(!isCanonicalDisplayName(canonical)){setMessage('invalidName');return null;}return canonical;}
 function saveHousehold(){const name=valid(householdName);if(name)void execute({operation:view?.household?'household-rename':'household-create',name});}
 async function saveMember(){const displayName=valid(memberName);if(!displayName)return;if(edit){void execute({operation:'dependant-edit',memberId:edit,displayName});return;}if(request.current||busy)return;const ticket=generation.current;setBusy(true);try{const requestId=await householdRequestId();if(ticket===generation.current&&current.current.phase==='active'&&focused.current){setBusy(false);void execute({operation:'dependant-add',requestId,displayName});}}catch{if(ticket===generation.current){setMessage('unavailable');setBusy(false);}}}
 const input=(label:string,value:string,set:(value:string)=>void,testID:string)=><View style={styles.field}><NativeProductLabel>{label}</NativeProductLabel><TextInput testID={testID} accessibilityLabel={label} value={value} editable={!busy} onChangeText={set} maxLength={160} style={[styles.input,text,{backgroundColor:color('bg.raised'),borderColor:color('line.hairline'),borderRadius:theme.radius.card}]}/></View>;
 const btn=(key:string,action:()=>void,primary=false,id?:string)=><NativeProductButton testID={id??`native-household-${key==='add'?'member-add':key}`} label={copy(key)} onPress={action} disabled={busy} variant={primary?'primary':'secondary'}/>;
 return <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
   <NativeProductHeading title={copy('title')} {...(session.phase==='active'&&household?{description:household.name}:{})} testID="native-household-title"/>
   {message?<Text accessibilityRole="alert" style={text}>{copy(message)}</Text>:null}
   {session.phase!=='active'?(inactiveContent??btn('login',()=>{void session.login().catch(()=>setMessage('unavailable'));})):busy&&!view?<Text accessibilityLiveRegion="polite" style={text}>{copy('loading')}</Text>:household&&projection?<>
    <NativeProductCard>
     <View style={styles.avatars}>{household.members.map(member=><View key={member.id} style={styles.avatarOverlap}>{avatar(member.id,member.displayName,true)}</View>)}</View>
     <View style={styles.statRow}><NativeProductLabel>{copy('members')}</NativeProductLabel><Text style={strong}>{household.members.length}</Text></View>
     <View style={styles.statRow}><NativeProductLabel>{copy('subscriptions')}</NativeProductLabel><Text style={strong}>{projection.plans.length}</Text></View>
     <View style={styles.statRow}><NativeProductLabel>{copy('perMonth')}</NativeProductLabel><Text style={strong}>{currency(projection.monthly.minorUnits)}</Text></View>
     <NativeProductLabel>{copy('estimate')}</NativeProductLabel>
     {renaming?<>{input(copy('householdName'),householdName,setHouseholdName,'native-household-name')}{btn('save',saveHousehold,true)}{btn('cancel',()=>setRenaming(false))}</>:btn('rename',()=>setRenaming(true))}
    </NativeProductCard>
    <View style={styles.chips}><NativeProductButton testID="native-household-scope-everyone" label={copy('everyone')} selected={selected===null} onPress={()=>setSelected(null)}/>{household.members.map(member=><NativeProductButton key={member.id} testID={`native-household-scope-${member.id}`} label={member.displayName} selected={selected===member.id} onPress={()=>setSelected(selected===member.id?null:member.id)}/>)}</View>
    <NativeProductHeading title={copy('plannedPayers')}/>
    <NativeProductCard>
     <View testID="native-household-payer-distribution" accessible accessibilityRole="image" accessibilityLabel={copy('plannedPayers')} style={[styles.payerStack,{backgroundColor:color('bg.raised'),borderRadius:theme.radius.pill}]}>
      {payerTotal&&payerTotal.minorUnits>0n?projection.members.filter(member=>(selected===null||selected===member.id)&&member.payerMonthly.minorUnits>0n).map(member=><View key={member.id} testID={`native-household-payer-band-${member.id}`} style={{backgroundColor:accent(member.id),flexGrow:chartPercent(member.payerMonthly,payerTotal),flexBasis:0,height:'100%'}}/>):null}
      {selected===null&&payerTotal&&payerTotal.minorUnits>0n&&projection.unknownPayerMonthly.minorUnits>0n?<View testID="native-household-payer-band-unknown" style={{backgroundColor:color('ink.secondary'),flexGrow:chartPercent(projection.unknownPayerMonthly,payerTotal),flexBasis:0,height:'100%'}}/>:null}
     </View>
     <View style={styles.legend}>{projection.members.filter(member=>selected===null||selected===member.id).map(member=><View key={member.id} style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:accent(member.id),borderRadius:theme.radius.pill}]}/><Text style={[text,styles.grow]}>{member.displayName}</Text><Text style={{...text,color:color('ink.secondary'),fontVariant:['tabular-nums']}}>{currency(member.payerMonthly.minorUnits)}</Text></View>)}{selected===null?<View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:color('ink.secondary'),borderRadius:theme.radius.pill}]}/><Text style={[text,styles.grow]}>{copy('payerUnknown')}</Text><Text style={{...text,color:color('ink.secondary'),fontVariant:['tabular-nums']}}>{currency(projection.unknownPayerMonthly.minorUnits)}</Text></View>:null}</View>
    </NativeProductCard>
    <NativeProductHeading title={copy('monthlyShare')}/>
    <NativeProductCard>{projection.members.filter(member=>selected===null||selected===member.id).map(member=><View key={member.id} style={styles.member}>
     <View style={styles.personRow}>{avatar(member.id,member.displayName)}<View style={styles.grow}><Text style={strong}>{member.displayName}</Text><NativeProductLabel>{copy(member.role==='ADMIN'?'admin':'profileOnly')} · {copy('planCount',{count:member.subscriptionCount})}</NativeProductLabel></View><Text style={strong}>{currency(member.monthly.minorUnits)}</Text></View>
     {member.role==='DEPENDANT'?<View style={styles.chips}><NativeProductButton label={copy('edit')} disabled={busy} onPress={()=>{setEdit(member.id);setMemberName(member.displayName);setRemove(null);}}/><NativeProductButton label={copy('remove')} disabled={busy} onPress={()=>setRemove(member.id)}/></View>:null}
     {remove===member.id?<View style={styles.field}><Text accessibilityRole="alert" style={text}>{copy('removeConfirm',{name:member.displayName})}</Text>{btn('confirmRemove',()=>{void execute({operation:'dependant-remove',memberId:member.id});})}{btn('cancel',()=>setRemove(null))}</View>:null}
    </View>)}</NativeProductCard>
    <NativeProductCard><NativeProductHeading title={copy(edit?'editMember':'addMember')}/>{input(copy('memberName'),memberName,setMemberName,'native-household-member-name')}{btn(edit?'save':'add',()=>{void saveMember();},true)}{edit?btn('cancel',()=>{setEdit(null);setMemberName('');}):null}<NativeProductLabel>{copy('profileOnlyHint')}</NativeProductLabel></NativeProductCard>
    <NativeProductHeading title={copy('sharedSubscriptions')}/>
    {projection.plans.filter(plan=>selected===null||plan.memberIds.includes(selected)).map(plan=><NativeProductCard key={plan.subscription.id}>
     <View style={styles.statRow}><Text style={[strong,styles.grow]}>{plan.subscription.customName??plan.subscription.merchantName??copy('unnamed')}</Text><Text style={strong}>{currency(plan.monthly.minorUnits)}</Text></View>
     <NativeProductLabel>{plan.payerMemberId===null?copy('payerUnknown'):copy('plannedPayer',{name:household.members.find(member=>member.id===plan.payerMemberId)!.displayName})}</NativeProductLabel>
     <Text style={text}>{copy('usedBy',{names:plan.memberIds.map(id=>household.members.find(member=>member.id===id)!.displayName).join(', ')})}</Text>
     {assign===plan.subscription.id?<><NativeProductLabel>{copy('usersLabel')}</NativeProductLabel><View style={styles.chips}>{household.members.map(member=><NativeProductButton key={member.id} testID={`native-household-user-${member.id}`} label={member.displayName} disabled={busy} selected={users.includes(member.id)} onPress={()=>setUsers(users.includes(member.id)?users.filter(id=>id!==member.id):[...users,member.id])}/>)}</View><NativeProductLabel>{copy('payerLabel')}</NativeProductLabel><View style={styles.chips}><NativeProductButton testID="native-household-payer-unknown" label={copy('payerUnknown')} disabled={busy} selected={payer===null} onPress={()=>setPayer(null)}/>{household.members.map(member=><NativeProductButton key={member.id} testID={`native-household-payer-${member.id}`} label={member.displayName} disabled={busy} selected={payer===member.id} onPress={()=>setPayer(member.id)}/>)}</View>{btn('save',()=>{void execute({operation:'household-assign',subscriptionId:plan.subscription.id,memberIds:users,payerMemberId:payer});},true,`native-household-assignment-save-${plan.subscription.id}`)}{btn('cancel',()=>setAssign(null),false,`native-household-assignment-cancel-${plan.subscription.id}`)}</>:btn('chooseMembers',()=>{setAssign(plan.subscription.id);setUsers(plan.memberIds);setPayer(plan.payerMemberId);},false,`native-household-assignment-${plan.subscription.id}`)}
    </NativeProductCard>)}
    {projection.plans.length===0?<Text style={text}>{copy('noSubscriptions')}</Text>:null}
   </>:view?<NativeProductCard>{input(copy('householdName'),householdName,setHouseholdName,'native-household-name')}{btn('create',saveHousehold,true)}</NativeProductCard>:null}
   {session.phase==='active'?btn('refresh',()=>{void execute();}):null}
  </ScrollView>
  {session.phase==='active'?<NativeProductNav active="household"/>:null}
 </SafeAreaView>;
}
const styles=StyleSheet.create({content:{padding:20,gap:16,paddingBottom:28},field:{gap:8},input:{minHeight:52,borderWidth:1,padding:12},statRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},avatars:{flexDirection:'row',flexWrap:'wrap',paddingLeft:6},avatarOverlap:{marginLeft:-6},avatarSmall:{width:30,height:30,alignItems:'center',justifyContent:'center'},avatar:{width:42,height:42,alignItems:'center',justifyContent:'center'},personRow:{flexDirection:'row',alignItems:'center',gap:12},grow:{flex:1,minWidth:0},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},member:{gap:10},payerStack:{height:12,flexDirection:'row',gap:2,overflow:'hidden'},legend:{flexDirection:'row',flexWrap:'wrap',gap:12},legendItem:{flexDirection:'row',alignItems:'center',gap:8,minWidth:140,flexGrow:1,flexBasis:'45%'},legendDot:{height:10,width:10}});
