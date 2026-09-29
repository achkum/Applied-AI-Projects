'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme-provider';

export default function Home() {
  const t = useTranslations('navigation');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme, mounted } = useTheme();

  const switchLocale = (newLocale: string) => {
    const newPathname = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPathname);
  };

  if (!mounted) return null;

  return (
    <div style={{ padding: '2rem' }}>
      <h1>{t('home')}</h1>

      <div style={{ marginTop: '2rem' }}>
        <fieldset
          style={{
            padding: '1rem',
            border: `1px solid var(--line-hairline)`,
            borderRadius: '8px',
            marginBottom: '1rem',
          }}
        >
          <legend>Språk / Language</legend>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <button
              onClick={() => switchLocale('sv')}
              aria-pressed={locale === 'sv'}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor:
                  locale === 'sv'
                    ? 'var(--aurora-violet)'
                    : 'var(--bg-raised)',
                color:
                  locale === 'sv'
                    ? 'var(--bg-canvas)'
                    : 'var(--ink-primary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Svenska
            </button>
            <button
              onClick={() => switchLocale('en')}
              aria-pressed={locale === 'en'}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor:
                  locale === 'en'
                    ? 'var(--aurora-violet)'
                    : 'var(--bg-raised)',
                color:
                  locale === 'en'
                    ? 'var(--bg-canvas)'
                    : 'var(--ink-primary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              English
            </button>
          </div>
        </fieldset>

        <fieldset
          style={{
            padding: '1rem',
            border: `1px solid var(--line-hairline)`,
            borderRadius: '8px',
          }}
        >
          <legend>Tema / Theme</legend>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <button
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor:
                  theme === 'light'
                    ? 'var(--aurora-violet)'
                    : 'var(--bg-raised)',
                color:
                  theme === 'light'
                    ? 'var(--bg-canvas)'
                    : 'var(--ink-primary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor:
                  theme === 'dark'
                    ? 'var(--aurora-violet)'
                    : 'var(--bg-raised)',
                color:
                  theme === 'dark'
                    ? 'var(--bg-canvas)'
                    : 'var(--ink-primary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Dark
            </button>
            <button
              onClick={() => setTheme('system')}
              aria-pressed={theme === 'system'}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor:
                  theme === 'system'
                    ? 'var(--aurora-violet)'
                    : 'var(--bg-raised)',
                color:
                  theme === 'system'
                    ? 'var(--bg-canvas)'
                    : 'var(--ink-primary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              System
            </button>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
