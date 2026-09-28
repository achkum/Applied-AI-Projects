import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { getColorByTheme } from '@/utils/colors';

export function WelcomeScreen() {
  const { mode, setMode, theme, isDark } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const palette = isDark ? theme.color.dark : theme.color.light;

  const handleThemeChange = (newMode: typeof mode) => {
    setMode(newMode);
  };

  const handleLocaleChange = (newLocale: typeof locale) => {
    setLocale(newLocale);
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: palette['bg.canvas'],
      }}
    >
      <ScrollView
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingVertical: 20,
        }}
      >
        <Text
          style={{
            fontSize: theme.typography.fontSize['3xl'],
            fontFamily: theme.typography.fontFamily.display,
            color: palette['ink.primary'],
            marginBottom: 12,
            fontWeight: '600',
          }}
        >
          SubTrack
        </Text>

        <Text
          style={{
            fontSize: theme.typography.fontSize.lg,
            color: palette['ink.secondary'],
            marginBottom: 24,
          }}
        >
          {locale === 'en'
            ? 'Welcome to SubTrack Mobile'
            : 'Välkommen till SubTrack Mobil'}
        </Text>

        <View
          style={{
            marginBottom: 32,
            padding: 16,
            backgroundColor: palette['bg.raised'],
            borderRadius: theme.borderRadius?.md || 8,
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.md,
              fontFamily: theme.typography.fontFamily.ui,
              color: palette['ink.primary'],
              marginBottom: 12,
              fontWeight: '500',
            }}
          >
            {locale === 'en' ? 'Language' : 'Språk'}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => handleLocaleChange('en')}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor:
                  locale === 'en' ? palette['aurora.violet'] : palette['bg.sunken'],
                borderRadius: theme.borderRadius?.md || 8,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color:
                    locale === 'en' ? palette['bg.canvas'] : palette['ink.primary'],
                  fontWeight: '600',
                  fontSize: theme.typography.fontSize.md,
                }}
              >
                English
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleLocaleChange('sv')}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor:
                  locale === 'sv' ? palette['aurora.violet'] : palette['bg.sunken'],
                borderRadius: theme.borderRadius?.md || 8,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color:
                    locale === 'sv' ? palette['bg.canvas'] : palette['ink.primary'],
                  fontWeight: '600',
                  fontSize: theme.typography.fontSize.md,
                }}
              >
                Svenska
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={{
            marginBottom: 32,
            padding: 16,
            backgroundColor: palette['bg.raised'],
            borderRadius: theme.borderRadius?.md || 8,
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.md,
              fontFamily: theme.typography.fontFamily.ui,
              color: palette['ink.primary'],
              marginBottom: 12,
              fontWeight: '500',
            }}
          >
            {locale === 'en' ? 'Theme' : 'Tema'}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => handleThemeChange('light')}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor:
                  mode === 'light' ? palette['aurora.green'] : palette['bg.sunken'],
                borderRadius: theme.borderRadius?.md || 8,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color:
                    mode === 'light' ? palette['bg.canvas'] : palette['ink.primary'],
                  fontWeight: '600',
                  fontSize: theme.typography.fontSize.md,
                }}
              >
                {locale === 'en' ? 'Light' : 'Ljus'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleThemeChange('dark')}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor:
                  mode === 'dark' ? palette['aurora.green'] : palette['bg.sunken'],
                borderRadius: theme.borderRadius?.md || 8,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color:
                    mode === 'dark' ? palette['bg.canvas'] : palette['ink.primary'],
                  fontWeight: '600',
                  fontSize: theme.typography.fontSize.md,
                }}
              >
                {locale === 'en' ? 'Dark' : 'Mörk'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleThemeChange('system')}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor:
                  mode === 'system' ? palette['aurora.green'] : palette['bg.sunken'],
                borderRadius: theme.borderRadius?.md || 8,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color:
                    mode === 'system' ? palette['bg.canvas'] : palette['ink.primary'],
                  fontWeight: '600',
                  fontSize: theme.typography.fontSize.md,
                }}
              >
                {locale === 'en' ? 'System' : 'System'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={{
            padding: 16,
            backgroundColor: palette['bg.raised'],
            borderRadius: theme.borderRadius?.md || 8,
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: palette['ink.secondary'],
              fontFamily: theme.typography.fontFamily.mono,
              lineHeight: theme.typography.lineHeight?.relaxed || 24,
            }}
          >
            {locale === 'en'
              ? 'This is a placeholder welcome screen. The app uses:\n• Expo Router for file-based routing\n• Secure token storage via expo-secure-store\n• i18n support (sv/en) via next-i18n\n• Theme support (light/dark/system) from ui-tokens'
              : 'Det här är en platsmarkörskärm. Appen använder:\n• Expo Router för filbaserad routning\n• Säker tokenlagring via expo-secure-store\n• i18n-stöd (sv/en) via next-i18n\n• Teamastöd (ljus/mörk/system) från ui-tokens'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
