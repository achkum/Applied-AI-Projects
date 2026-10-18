import React, {useState} from 'react';
import {Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';
import {billingMonthCalendarDates, currentBillingMonth, shiftBillingMonth} from '@/api/privateMobileBillingMonth';
import {NativeProductButton} from './NativeProductUI';
import {BillingIcon} from './BillingIcon';

/** Calendar-only local dates: no UTC conversion or free-form date parsing. */
export function NativeDatePicker({value, onChange, label, disabled = false, optional = true, testID, compact = false,compactLabel}: {
  value: string; onChange: (date: string) => void; label: string; disabled?: boolean; optional?: boolean; testID?: string; compact?:boolean;compactLabel?:string;
}) {
  const {t, locale} = useI18n(), {theme, isDark} = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const [open, setOpen] = useState(false), [month, setMonth] = useState(() => currentBillingMonth(new Date()));
  const text = {color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md};
  const first = new Date(0); first.setHours(12, 0, 0, 0); first.setFullYear(month.year, month.month - 1, 1);
  const monthLabel = new Intl.DateTimeFormat(locale === 'sv' ? 'sv-SE' : 'en-SE', {month:'long', year:'numeric'}).format(first);
  const dates = billingMonthCalendarDates(month), offset = (first.getDay() + 6) % 7;
  const weekday = new Intl.DateTimeFormat(locale === 'sv' ? 'sv-SE' : 'en-SE', {weekday:'short'});
  const weekdays = Array.from({length:7}, (_, index) => weekday.format(new Date(2026, 0, 5 + index, 12)));
  function fieldValue() {
    if (!value) return t(optional ? 'onboarding.datePicker.clear' : 'onboarding.datePicker.choose');
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) return value;
    const year = parseInt(parts[1]!, 10), month = parseInt(parts[2]!, 10), day = parseInt(parts[3]!, 10);
    const date = new Date(0); date.setHours(12, 0, 0, 0); date.setFullYear(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return value;
    return new Intl.DateTimeFormat(locale === 'sv' ? 'sv-SE' : 'en-SE', {dateStyle:'long'}).format(date);
  }
  const choose = (date: string) => {onChange(date); setOpen(false);};
  function show() {
    if (disabled) return;
    Keyboard.dismiss();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setMonth({year:parseInt(value.slice(0,4),10),month:parseInt(value.slice(5,7),10)});
    else setMonth(currentBillingMonth(new Date()));
    setOpen(true);
  }
  return <View style={[styles.field,compact&&compactLabel?styles.labelField:null]}>
    {!compact?<Text style={text}>{label}</Text>:null}
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={compact&&compactLabel?compactLabel:label} accessibilityHint={compact&&compactLabel?label:undefined} accessibilityValue={{text:fieldValue()}} accessibilityState={{disabled, expanded:open}} disabled={disabled} onPress={show}
      style={[styles.input, {backgroundColor:color(compact&&compactLabel?'bg.surface':'bg.raised'), borderColor:color('line.hairline'), borderRadius:theme.radius.card},compact&&compactLabel?styles.labelTrigger:null]}>
      {compact&&compactLabel?<Text accessibilityRole="header" style={{...text,fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize.price,flexShrink:1,textAlign:'center'}}>{compactLabel}</Text>:<>{!compact?<Text style={[text, {flex:1}]}>{value || t('onboarding.datePicker.choose')}</Text>:null}<BillingIcon name="calendar" color={color('action.accent')}/></>}
    </Pressable>
    {open && !disabled?<Modal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
      <View style={[styles.scrim, {backgroundColor:color('sheet.scrim')}]}>
        <Pressable testID="native-date-picker-scrim" accessible={false} onPress={()=>setOpen(false)} style={StyleSheet.absoluteFillObject}/>
        <SafeAreaView accessibilityViewIsModal onAccessibilityEscape={()=>setOpen(false)} style={[styles.sheet, {backgroundColor:color('bg.surface'), borderTopLeftRadius:theme.radius.card, borderTopRightRadius:theme.radius.card}]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={[text, {fontFamily:theme.typography.fontFamily.display}]}>{label}</Text>
            <View style={styles.navigation}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.billingMonth.previous')} disabled={month.year===1 && month.month===1} onPress={() => setMonth(prior=>shiftBillingMonth(prior,-1))} style={styles.arrow}><BillingIcon name="previous" color={color('action.accent')}/></Pressable>
              <Text testID="native-date-picker-month" accessibilityRole="header" style={[text,styles.title]}>{monthLabel}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.billingMonth.next')} disabled={month.year===9999 && month.month===12} onPress={() => setMonth(prior=>shiftBillingMonth(prior,1))} style={styles.arrow}><BillingIcon name="next" color={color('action.accent')}/></Pressable>
            </View>
            <View style={styles.grid}>{weekdays.map((name,index)=><Text key={index} style={[text,styles.weekday]}>{name}</Text>)}</View>
            <View style={styles.grid}>
              {Array.from({length:offset},(_,index)=><View key={`blank-${index}`} style={styles.day}/>)}
              {dates.map(date=><Pressable key={date} testID={`native-date-${date}`} accessibilityRole="button" accessibilityLabel={date} accessibilityState={{selected:value===date}} onPress={()=>choose(date)}
                style={[styles.day,{borderRadius:theme.radius.pill,backgroundColor:color(value===date?'action.accent':'bg.surface')}]}>
                <Text style={[text,{color:color(value===date?'ink.on-accent':'ink.primary')}]}>{parseInt(date.slice(8),10)}</Text>
              </Pressable>)}
            </View>
            <View style={styles.navigation}><NativeProductButton label={t('onboarding.datePicker.today')} onPress={()=>{const today=new Date();choose(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`);}}/>
              {optional?<NativeProductButton label={t('onboarding.datePicker.clear')} onPress={()=>choose('')}/>:null}</View>
            <NativeProductButton label={t('actions.close')} onPress={()=>setOpen(false)}/>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>:null}
  </View>;
}
const styles=StyleSheet.create({field:{gap:8},labelField:{flexShrink:1},labelTrigger:{minHeight:44,padding:0,borderWidth:0,justifyContent:'center'},input:{minHeight:48,padding:14,borderWidth:1,flexDirection:'row',alignItems:'center',gap:12},scrim:{flex:1,justifyContent:'flex-end'},sheet:{maxHeight:'90%'},content:{padding:20,gap:16},navigation:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},arrow:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},title:{flex:1,textAlign:'center'},grid:{flexDirection:'row',flexWrap:'wrap'},weekday:{width:'14.2857%',textAlign:'center'},day:{width:'14.2857%',minHeight:48,alignItems:'center',justifyContent:'center'}});
