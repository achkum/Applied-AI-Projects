import React,{useEffect} from 'react';
import {observeStartupStage} from '@/utils/privateRuntimeEnrollmentDiagnostic';
import { ScrollView, StyleSheet, View } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import {useOnboarding} from '@/state/OnboardingAdapter';
import { WelcomeActions } from '@/components/onboarding/WelcomeActions';

export default function WelcomeRoute() {
  const router = useRouter();
  useEffect(()=>{observeStartupStage('welcome-committed');},[]);
  const onboarding=useOnboarding();
  useEffect(()=>{if(onboarding.sessionPhase==='active')router.replace({pathname:'/personal',params:{setup:'1'}});},[onboarding.sessionPhase,router]);
  const { t } = useI18n();
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
          onCreateAccount={() => {onboarding.reset();router.push('/register');}}
          onLogIn={() => {onboarding.reset();router.push({ pathname: '/register', params: { mode: 'login' } });}}
        />
      </View>
    </ScrollView></SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
});
