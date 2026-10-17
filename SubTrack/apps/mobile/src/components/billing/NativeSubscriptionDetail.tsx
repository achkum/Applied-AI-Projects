import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
import Svg,{Circle,Polygon,Polyline} from 'react-native-svg';
import type {NativeAnalyticsReader} from '@/api/nativeAnalyticsReader';
import type {AnalyticsCharge} from '@/api/nativeAnalyticsProjection';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import {useNativeAnalytics} from '../insights/useNativeAnalytics';
import {NativeSubscriptionDetailContent} from './NativeSubscriptionDetailContent';
import {NativeProductCard,NativeProductLabel} from './NativeProductUI';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import {allocateEvenly,money,multiply,subtract,type Money} from '../../../../../packages/money/src/money';
import {chartPercent} from '../../../../../packages/money/src/recurring-cost';

const clock=()=>new Date();
type DetailProps=Omit<React.ComponentProps<typeof NativeSubscriptionDetailContent>,'metadataFields'|'history'>;
type Props=DetailProps&{session:NativeFeatureSession;reader?:NativeAnalyticsReader|undefined;now?:()=>Date};

/** Mounted only by the open sheet. The parent's exact item remains the primary display authority. */
export function NativeSubscriptionDetail({session,reader,now=clock,...detail}:Props){
 if(session.phase!=='active')return null;
 return reader?<AuthorizedDetail key={`${detail.item.id}:${detail.item.revision}`} session={session} reader={reader} now={now} detail={detail}/>:<NativeSubscriptionDetailContent {...detail}/>;
}
function AuthorizedDetail({session,reader,now,detail}:{session:NativeFeatureSession;reader:NativeAnalyticsReader;now:()=>Date;detail:DetailProps}){
 const {value,state}=useNativeAnalytics(session,reader,now),{t,locale}=useI18n();
 const match=value?.subscriptions.find(row=>row.id===detail.item.id&&row.revision===detail.item.revision&&['ACTIVE','PAUSED','CANCELLED','ARCHIVED'].includes(row.status));
 const ready=session.phase==='active'&&state==='ready'&&Boolean(match),fields:[string,string][]=[];
 const household=ready?value?.household:undefined,assignment=household?.assignments.find(row=>row.subscriptionId===detail.item.id);
 const format=(amount:Money)=>formatMinorUnits(amount.minorUnits,amount.currency,{locale,display:'code'});
 if(household&&assignment){
  const payer=household.members.find(member=>member.id===assignment.payerMemberId),users=household.members.filter(member=>assignment.memberIds.includes(member.id));
  fields.push([t('onboarding.nativeHousehold.payerLabel'),payer?.displayName??t('onboarding.nativeHousehold.payerUnknown')]);
  fields.push([t('onboarding.nativeHousehold.usersLabel'),users.map(member=>member.displayName).join(', ')||t('onboarding.manualSubscription.placeholder')]);
  if(users.length>1){const amounts=allocateEvenly(money(BigInt(detail.item.expectedAmountMinor),detail.item.currency),users.length).sort((a,b)=>a.minorUnits<b.minorUnits?-1:a.minorUnits>b.minorUnits?1:0),minimum=amounts[0]!,maximum=amounts[amounts.length-1]!;fields.push([t('nativeProductDetails.perPerson'),minimum.minorUnits===maximum.minorUnits?format(minimum):`${format(minimum)}–${format(maximum)}`]);}
 }
 const charges=ready&&value?.historyAvailable?value.attributedCharges.filter(row=>row.subscriptionId===detail.item.id&&row.currency===detail.item.currency).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(-6):[];
 return <NativeSubscriptionDetailContent {...detail} metadataFields={fields} history={charges.length?<DetailChargeHistory charges={charges} truncated={value?.historyTruncated===true}/>:null}/>;
}
function DetailChargeHistory({charges,truncated}:{charges:readonly AnalyticsCharge[];truncated:boolean}){
 const {t,locale}=useI18n(),{theme,isDark}=useTheme(),amounts=charges.map(row=>multiply(money(BigInt(row.amountMinor),row.currency),-1n));
 const minimum=amounts.reduce((a,b)=>a.minorUnits<b.minorUnits?a:b),maximum=amounts.reduce((a,b)=>a.minorUnits>b.minorUnits?a:b),span=subtract(maximum,minimum);
 const x=(index:number)=>4+index*292/Math.max(1,charges.length-1),y=(amount:Money)=>span.minorUnits===0n?20:35-chartPercent(subtract(amount,minimum),span)*.29;
 const points=amounts.map((amount,index)=>`${x(index)},${y(amount)}`).join(' '),last=charges.length-1,color=getColorByTheme(theme,isDark,'action.accent');
 const formatted=(amount:Money)=>formatMinorUnits(amount.minorUnits,amount.currency,{locale,display:'code'});
 const label=charges.map((row,index)=>`${row.date}, ${formatted(amounts[index]!)}`).join('; ');
 return <NativeProductCard><View testID="native-subscription-charge-history" accessible accessibilityLabel={`${t('nativeProductDetails.chargeHistory')}. ${label}`} style={styles.history}>
  <NativeProductLabel>{t('nativeProductDetails.chargeHistory')}</NativeProductLabel>
  <Svg width="100%" height={40} viewBox="0 0 300 40" accessible={false}><Polygon points={`${x(0)},40 ${points} ${x(last)},40`} fill={color} fillOpacity={.16}/><Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round"/><Circle cx={x(last)} cy={y(amounts[last]!)} r={3.5} fill={color}/></Svg>
  <View style={styles.range}><NativeProductLabel>{`${charges[0]!.date} – ${charges[last]!.date}`}</NativeProductLabel><Text style={{color:getColorByTheme(theme,isDark,'ink.primary'),fontFamily:theme.typography.fontFamily['ui.semibold'],fontSize:theme.typography.fontSize.sm,fontVariant:['tabular-nums']}}>{formatted(amounts[last]!)}</Text></View>
 </View>{truncated?<NativeProductLabel>{t('nativeAnalytics.historyLimited')}</NativeProductLabel>:null}</NativeProductCard>;
}
const styles=StyleSheet.create({history:{gap:10},range:{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:8}});
