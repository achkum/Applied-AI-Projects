# SubTrack Mobile

Expo-based mobile application for SubTrack, built with TypeScript, Expo Router, and integrated with shared design tokens and internationalization.

## Project Structure

```
apps/mobile/
├── app/                          # Expo Router file-based routing
│   ├── (tabs)/                   # Tab-based layout
│   │   ├── en/                   # English locale route
│   │   └── sv/                   # Swedish locale route
│   ├── _layout.tsx               # Root layout with providers
│   └── ...
├── src/
│   ├── components/               # Reusable React Native components
│   ├── context/                  # React Context providers (Theme, i18n)
│   ├── hooks/                    # Custom React hooks
│   ├── providers/                # Combined provider setup
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
├── app.json                      # Expo configuration
├── eas.json                      # EAS Build profiles (dev/preview/production)
└── package.json
```

## Features

### File-Based Routing

Uses Expo Router for automatic routing based on file structure. Supports locale-based route prefixes:
- `/en/*` routes for English
- `/sv/*` routes for Swedish

### Internationalization (i18n)

- Configured with `i18n-js` and `@subtrack/i18n`
- Supports English (en) and Swedish (sv)
- Catalogs defined in `packages/i18n/catalogs/`
- User locale preference persisted via AsyncStorage

### Theme System

- Light and dark theme support with system preference detection
- Theme colors loaded from `packages/ui-tokens/generated/theme.native.json`
- User theme preference persisted via AsyncStorage
- All UI elements reference shared design tokens (no hardcoded colors)

### Secure Token Storage

- Uses `expo-secure-store` for secure storage of authentication tokens
- Tokens stored in:
  - iOS: Keychain
  - Android: Keychain System
- Helper functions: `authTokenStore` and `refreshTokenStore`

### Build Profiles (EAS)

Configured in `eas.json` with three build profiles:

| Profile | Distribution | Use Case |
|---------|--------------|----------|
| `development` | Internal | Local development on simulators/emulators |
| `preview` | Internal | Milestone gates, internal testing (TestFlight/internal Google Play) |
| `production` | Store | Public App Store/Play Store submission |

## Getting Started

### Prerequisites

- Node.js v18+
- pnpm
- Expo CLI: `npm install -g eas-cli`
- iOS: Xcode (for iOS simulator)
- Android: Android Studio (for emulator)

### Installation

```bash
cd apps/mobile
pnpm install
```

### Development

```bash
# Start Expo development server
pnpm start

# Run on iOS simulator
pnpm ios

# Run on Android emulator
pnpm android

# Run on web
pnpm web
```

### Building

```bash
# Development build (simulator/emulator)
eas build --platform ios --profile development
eas build --platform android --profile development

# Preview build (internal testing)
eas build --platform ios --profile preview
eas build --platform android --profile preview

# Production build (store submission)
eas build --platform ios --profile production
eas build --platform android --profile production
```

### Testing

```bash
# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## ESLint Boundaries

Mobile app can import from:
- `config`
- `contracts` (API client)
- `i18n`
- `ui`
- `ui-tokens`

Cannot import from:
- `api`, `domain`, `money`, `llm-gateway`, `catalog`, `synthetic`

## Environment Variables

Configure per build profile in `eas.json`:

```json
"env": {
  "API_BASE_URL": "https://staging.subtrack.local"
}
```

See `.env.example` for available options.

## Acceptance Criteria Status

- AC1: Placeholder welcome screen with language/theme switchers ✓
- AC2: i18n locale context and content language updates ✓
- AC3: Secure token storage via expo-secure-store ✓
- AC4: EAS profiles (dev/preview/production) configured ✓
- AC5: Theme colors from ui-tokens with no hardcoding ✓
- AC6: typecheck, lint, and test scripts passing ✓

## Architecture Decisions

- **Expo Router**: Provides file-based routing with automatic deep linking
- **Context API**: Lightweight state management for theme and locale
- **i18n-js**: Well-maintained i18n library with fallback support
- **expo-secure-store**: Platform-native secure storage for tokens
- **AsyncStorage**: User preference persistence

## Next Steps

1. Wire up API client from `@subtrack/contracts`
2. Implement authentication flows (login/register/BankID)
3. Add protected routes
4. Implement main app screens (household, subscriptions, etc.)
5. Add error boundaries and analytics
