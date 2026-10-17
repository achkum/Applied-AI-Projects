import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {PrivateOwnerSubscriptionView} from '../../../../../packages/contracts/generated/types.gen';
import {catalogs} from '@subtrack/i18n';
import {customCategoryLabel} from '@subtrack/contracts/subscription-category';
import {money} from '../../../../../packages/money/src/money';
import {recurringCost} from '../../../../../packages/money/src/recurring-cost';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {BillingIcon} from './BillingIcon';
import {NativeProductButton,NativeProductCard,NativeProductLabel} from './NativeProductUI';

/** Shared sheet body only; callers own native Modal, focus and session lifetime. */
export function NativeSubscriptionDetailContent({item,onClose,onManage,actions,headingRef,metadataFields=[],history}:{
 item:PrivateOwnerSubscriptionView;onClose:()=>void;onManage?:()=>void;actions?:React.ReactNode;headingRef?:React.Ref<Text>;metadataFields?:readonly (readonly [string,string])[];history?:React.ReactNode;
}){
 const {t,locale}=useI18n(),{theme,isDark}=useTheme();
 const color=(key:string)=>getColorByTheme(theme,isDark,key);
 const text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
 const strong={...text,fontFamily:theme.typography.fontFamily['ui.medium']};
 const category=Object.prototype.hasOwnProperty.call(catalogs[locale].onboarding.ownerSubscriptions.category,item.categoryCode)?t(`onboarding.ownerSubscriptions.category.${item.categoryCode}`):customCategoryLabel(item.categoryCode)??t('onboarding.ownerSubscriptions.categoryFallback');
 const name=item.customName??item.merchantName??category,cadence=t(`onboarding.ownerSubscriptions.cadence.${item.cadence}`);
 const formatted=(minor:bigint)=>formatMinorUnits(minor,item.currency,{locale,display:'code'}).replace(/[\u00a0\u202f]/g,' ');
 const price=formatted(BigInt(item.expectedAmountMinor)),cost=recurringCost(money(BigInt(item.expectedAmountMinor),item.currency),item.cadence);
 const fields=[
  [t('nativeProductDetails.nextRenewal'),item.nextChargeDate??t('onboarding.manualSubscription.placeholder')],
  [t('nativeProductDetails.annualCost'),cost?formatted(cost.annual.minorUnits):t('onboarding.manualSubscription.placeholder')],
  [t('nativeProductDetails.category'),category],
  [t('nativeProductDetails.schedule'),cadence],
  [t('nativeProductDetails.status'),t(`onboarding.ownerSubscriptions.status.${item.status}`)],
  ...metadataFields,
 ];
 return <View style={styles.body}>
  <View style={styles.header}>
   <View style={[styles.provider,{backgroundColor:color('bg.raised'),borderRadius:theme.radius.pill}]}><Text style={{...strong,fontSize:theme.typography.fontSize.lg}}>{Array.from(item.merchantName??name)[0]?.toLocaleUpperCase(locale)}</Text></View>
   <View style={styles.grow}><Text ref={headingRef} accessibilityRole="header" style={{...text,fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize.xl}}>{name}</Text><NativeProductLabel>{t(item.source==='MANUAL'?'onboarding.billingMonth.manual':'onboarding.billingMonth.detected')}</NativeProductLabel></View>
   <Pressable testID="native-subscription-detail-close" accessibilityRole="button" accessibilityLabel={t('actions.close')} onPress={onClose} style={styles.close}><BillingIcon name="close" size={20} color={color('ink.secondary')}/></Pressable>
  </View>
  <View accessible accessibilityLabel={`${price} · ${cadence}`} style={styles.price}>
   <Text style={{...text,fontFamily:theme.typography.fontFamily['display.extraBold'],fontSize:theme.typography.fontSize.detail,fontVariant:['tabular-nums'],flexShrink:1}}>{price.replace(item.currency,'').trim()}</Text>
   <NativeProductLabel>{item.currency} · {cadence}</NativeProductLabel>
  </View>
  <NativeProductCard style={styles.facts}>{fields.map(([label,value],index)=><View key={label} style={[styles.fact,index>0?styles.divider:null,{borderColor:color('line.hairline')}]}><Text style={{...text,color:color('ink.secondary'),flexShrink:1}}>{label}</Text><Text style={[strong,styles.value]}>{value}</Text></View>)}</NativeProductCard>
  {history}
  {actions}
  {onManage?<NativeProductButton label={t('onboarding.billingMonth.manage')} onPress={onManage} variant="quiet"/>:null}
 </View>;
}
const styles=StyleSheet.create({body:{gap:16},header:{flexDirection:'row',alignItems:'center',gap:14},provider:{width:52,height:52,alignItems:'center',justifyContent:'center'},grow:{flex:1,minWidth:0,gap:2},close:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center',alignSelf:'flex-start'},price:{flexDirection:'row',alignItems:'baseline',flexWrap:'wrap',gap:8,marginTop:4},facts:{gap:0},fact:{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline',gap:12,paddingVertical:12},divider:{borderTopWidth:1},value:{textAlign:'right',flexShrink:1}});
