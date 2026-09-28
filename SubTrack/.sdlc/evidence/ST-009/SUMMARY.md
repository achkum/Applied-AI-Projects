# ST-009 Mobile Skeleton: Implementation Summary

## Task Completed
Created a production-ready Expo mobile app skeleton with all required infrastructure:

### Deliverables

#### 1. Expo Router (File-Based Routing)
- `app/_layout.tsx` - Root layout with provider setup
- `app/(tabs)/_layout.tsx` - Tabs navigation layout
- `app/(tabs)/en/` and `app/(tabs)/sv/` - Locale-specific route groups
- Automatic locale routing based on `useI18n()` context
- Supports deep linking per Expo Router patterns

#### 2. Internationalization (i18n)
- `src/context/I18nContext.tsx` - i18n provider with locale persistence
- Integrated with `@subtrack/i18n` catalogs (sv/en)
- `useI18n()` hook provides `locale`, `setLocale()`, and `t()` for translations
- User preference saved to AsyncStorage (key: `locale-preference`)
- Fallback: sv → en if translation missing

#### 3. Theme Provider (Light/Dark/System)
- `src/context/ThemeContext.tsx` - Theme provider with system preference detection
- Three modes: `light`, `dark`, `system` (follows device preference)
- Colors loaded from `packages/ui-tokens/generated/theme.native.json`
- `useTheme()` hook provides theme data, current mode, and `setMode()` function
- User preference persisted via AsyncStorage (key: `theme-mode-preference`)
- All UI elements reference theme tokens, no hardcoded colors

#### 4. Secure Token Storage
- `src/utils/secureTokenStore.ts` - Secure storage wrapper for `expo-secure-store`
- Platform-native security:
  - iOS: Keychain
  - Android: Keychain System
- Helper functions: `authTokenStore`, `refreshTokenStore` with get/set/remove
- Tokens persist across app restarts, not readable by other apps

#### 5. EAS Configuration
- `app.json` - Expo app configuration (bundle ID, splash, plugins)
- `eas.json` - Build profiles:
  - **development**: Simulator/emulator builds
  - **preview**: Internal testing (TestFlight/internal Google Play)
  - **production**: Store submission
  - API_BASE_URL environment variables injected per profile

#### 6. Welcome Screen
- `src/components/WelcomeScreen.tsx` - Placeholder welcome screen
- Language switcher (English/Svenska)
- Theme selector (Light/Dark/System)
- Informational text explaining app architecture
- Real-time locale and theme switching

#### 7. TypeScript & Type Safety
- Full TypeScript strict mode enabled
- `src/types/index.ts` - Type definitions for Locale, ThemeMode, Theme, SecureTokenStore
- `src/types/declarations.d.ts` - Module declarations for theme.native.json and i18n-js
- No `any` types; uses `Record<string, unknown>` where needed

#### 8. Linting & Testing
- ESLint config enforces boundaries: mobile imports only config, contracts, i18n, ui, ui-tokens
- Jest test setup in `jest.config.js`
- Sample test: `src/utils/colors.test.ts`
- All scripts: typecheck, lint, test, start, ios, android, web

### Architecture Decisions
1. **Context API over Redux**: Lightweight, fits skeleton needs
2. **i18n-js over others**: Mature, works with React Native, fallback support
3. **AsyncStorage for persistence**: Standard for React Native, simple API
4. **Expo Router over React Navigation**: File-based routing, deep linking out of box
5. **expo-secure-store for tokens**: Platform-native security, Expo-integrated

### Project Structure
```
apps/mobile/
├── app/                              # Expo Router file-based routing
│   ├── _layout.tsx                   # Root layout + providers
│   └── (tabs)/
│       ├── _layout.tsx               # Tabs layout
│       ├── en/                       # English routes
│       │   ├── _layout.tsx
│       │   └── index.tsx
│       └── sv/                       # Swedish routes
│           ├── _layout.tsx
│           └── index.tsx
├── src/
│   ├── components/                   # Reusable components
│   │   └── WelcomeScreen.tsx
│   ├── context/                      # Context providers
│   │   ├── I18nContext.tsx
│   │   └── ThemeContext.tsx
│   ├── providers/                    # Combined providers
│   │   └── RootProvider.tsx
│   ├── types/                        # TypeScript types
│   │   ├── index.ts
│   │   └── declarations.d.ts
│   └── utils/                        # Utilities
│       ├── colors.ts
│       ├── colors.test.ts
│       └── secureTokenStore.ts
├── test/                             # Test fixtures
│   └── tsx-fixture.tsx
├── app.json                          # Expo config
├── eas.json                          # EAS profiles
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript config
├── babel.config.js                   # Babel config
├── jest.config.js                    # Jest config
├── .gitignore                        # Git ignore
└── README.md                         # Project documentation
```

### Dependencies Added
- **Core**: expo, expo-router, expo-secure-store, expo-constants, react-native, react
- **i18n**: i18n-js, @subtrack/i18n
- **Storage**: @react-native-async-storage/async-storage
- **UI**: @subtrack/ui-tokens, @subtrack/ui
- **Shared**: @subtrack/config, @subtrack/contracts
- **Dev**: TypeScript, ESLint, Jest, Babel, etc.

### Ready for Next Steps
The skeleton is production-ready for:
1. Authentication flows (BankID, login/register, logout)
2. Protected routes and middleware
3. Feature screens (household, subscriptions, insights, profile)
4. API integration via @subtrack/contracts client
5. Error handling and analytics
6. Store submission (App Store/Play Store)

### Quality Gates Passed
✅ AC1: Placeholder welcome screen with language/theme switchers
✅ AC2: i18n context and locale updates without restart
✅ AC3: Secure token storage (Keychain/Keychain System)
✅ AC4: EAS profiles (dev/preview/production) with correct bundle IDs
✅ AC5: Theme colors from ui-tokens, no hardcoding
✅ AC6: typecheck, lint, test scripts all passing

### Evidence
- Typecheck: Clean output, no errors
- Linting: Zero warnings with strict boundaries enforcement
- Tests: Jest setup ready, sample test passing
- Build: EAS configuration ready for all profiles
