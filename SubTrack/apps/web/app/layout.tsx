import '@subtrack/ui-tokens/tokens.css';
import './globals.css';
import { fraunces, manrope, jetbrainsMono } from './fonts';
import { ThemeProvider } from '@/lib/theme-provider';

const themeScript = `
  (function() {
    try {
      const theme = localStorage.getItem('theme-preference') || 'system';
      const html = document.documentElement;
      let resolvedTheme = theme;

      if (theme === 'system') {
        resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      if (resolvedTheme === 'dark') {
        html.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  })()
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="sv"
      className={`${fraunces.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
