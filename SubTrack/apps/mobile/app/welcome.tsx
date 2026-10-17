import React,{useCallback,useEffect,useRef,useState} from 'react';
import {observeStartupStage} from '@/utils/privateRuntimeEnrollmentDiagnostic';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import {useOnboarding} from '@/state/OnboardingAdapter';
import { WelcomeActions } from '@/components/onboarding/WelcomeActions';

export default function WelcomeRoute() {
  const router = useRouter();
  useEffect(()=>{observeStartupStage('welcome-committed');},[]);
  const onboarding=useOnboarding();
  useFocusEffect(useCallback(()=>{if(onboarding.sessionPhase==='active')router.replace({pathname:'/personal',params:{setup:'1'}});},[onboarding.sessionPhase,router]));
  const { t, locale } = useI18n();
  const [failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
  const pending=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  async function login() {
    if(pending.current)return;
    if(onboarding.provider!=='sandbox'){onboarding.reset();router.push({pathname:'/register',params:{mode:'login'}});return;}
    pending.current=true;setBusy(true);setFailed(false);
    try { await onboarding.login(locale); if(mounted.current)router.replace({pathname:'/personal',params:{setup:'1'}}); }
    catch { if(mounted.current)setFailed(true); }
    finally { pending.current=false;if(mounted.current)setBusy(false); }
  }
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  return (
    <SafeAreaView style={{flex:1,backgroundColor:color('bg.canvas')}}><ScrollView
      contentContainerStyle={styles.content}
      style={{ backgroundColor: color('bg.canvas') }}
    >
      <View accessibilityLabel={t('onboarding.welcome.tagline')}>
        <WelcomeActions
          environment={onboarding.provider}
          busy={busy || onboarding.sessionPhase==='busy'}
          onCreateAccount={() => {onboarding.reset();router.push('/register');}}
          onLogIn={() => {void login();}}
        />
        {failed?<Text accessibilityRole="alert" style={{color:color('ink.primary'),fontFamily:theme.typography.fontFamily.ui}}>{t('onboarding.nativePersonal.unavailable')}</Text>:null}
      </View>
    </ScrollView></SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
});
