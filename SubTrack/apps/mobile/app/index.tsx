import { Redirect } from 'expo-router';
import { useI18n } from '@/context/I18nContext';

export default function IndexRoute() {
  const { locale } = useI18n();
  return <Redirect href={locale === 'sv' ? '/sv' : '/en'} />;
}
