import React, {useState} from 'react';
import {Keyboard, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {catalogs} from '@subtrack/i18n';
import {createCustomCategory, customCategoryLabel} from '@subtrack/contracts/subscription-category';
import {useI18n} from '@/context/I18nContext';
import {useTheme} from '@/context/ThemeContext';
import {getColorByTheme} from '@/utils/colors';

export function NativeCategoryField({value, onChange, disabled = false}: {value:string;onChange:(code:string)=>void;disabled?:boolean}) {
  const {locale,t}=useI18n(),{theme,isDark}=useTheme();
  const categories:Readonly<Record<string,string>>=catalogs[locale].onboarding.ownerSubscriptions.category;
  const current=customCategoryLabel(value)??categories[value]??'';
  const [query,setQuery]=useState<string|null>(null),[focused,setFocused]=useState(false);
  const entered=query??current;
  const fold=(label:string)=>label.normalize('NFKC').toLocaleLowerCase(locale);
  const matches=Object.entries(categories).filter(([,label])=>!entered||fold(label).includes(fold(entered))).slice(0,5);
  let custom:string|null=null;
  if (entered && !Object.values(categories).some(label=>fold(label)===fold(entered))) {try {custom=createCustomCategory(entered);} catch {/* Invalid text remains editable; Save validates it. */}}
  const color=(key:string)=>getColorByTheme(theme,isDark,key),text={color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui,fontSize:theme.typography.fontSize.md};
  function select(code:string){Keyboard.dismiss();onChange(code);setQuery(null);setFocused(false);}
  function change(text:string){setQuery(text);setFocused(true);const exact=Object.entries(categories).find(([,label])=>fold(label)===fold(text));
    if(exact)onChange(exact[0]);else {try{onChange(createCustomCategory(text));}catch{onChange('');}}
  }
  return <View style={styles.field}>
    <Text style={text}>{t('onboarding.manualSubscription.category')}</Text>
    <TextInput testID="native-subscription-category" accessibilityLabel={t('onboarding.manualSubscription.category')} value={entered}
      placeholder={t('onboarding.categoryPicker.search')} placeholderTextColor={color('ink.secondary')} editable={!disabled} maxLength={80}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChangeText={change} autoCorrect={false}
      style={[styles.input,text,{backgroundColor:color('bg.raised'),borderColor:color('line.hairline'),borderRadius:theme.radius.card}]}/>
    {focused&&!disabled?<View style={[styles.suggestions,{borderColor:color('line.hairline'),borderRadius:theme.radius.card,backgroundColor:color('bg.surface')}]}>
      {matches.map(([code,label])=><Pressable key={code} accessibilityRole="button" accessibilityLabel={label} onPress={()=>select(code)} style={styles.option}><Text style={text}>{label}</Text></Pressable>)}
      {custom?<Pressable accessibilityRole="button" onPress={()=>select(custom!)} style={styles.option}><Text style={text}>{t('onboarding.categoryPicker.use',{name:entered.trim()})}</Text></Pressable>:null}
    </View>:null}
  </View>;
}
const styles=StyleSheet.create({field:{gap:8},input:{minHeight:48,borderWidth:1,padding:14},suggestions:{borderWidth:1,overflow:'hidden'},option:{minHeight:48,padding:12,justifyContent:'center'}});
