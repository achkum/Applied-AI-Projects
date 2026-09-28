# AC1: Placeholder Welcome Screen

## Evidence
Created `WelcomeScreen.tsx` component displaying placeholder welcome screen with:
- Language switcher (English / Svenska)
- Theme selector (Light / Dark / System)
- Informational text explaining the app's capabilities

## Files
- `apps/mobile/src/components/WelcomeScreen.tsx` - Welcome screen component
- `apps/mobile/app/(tabs)/en/index.tsx` - English route entry point
- `apps/mobile/app/(tabs)/sv/index.tsx` - Swedish route entry point

## Structure
The app uses Expo Router with locale-based routing:
- `/en/*` routes for English content
- `/sv/*` routes for Swedish content
- Automatic locale switching updates the route and UI

Users can toggle language and theme, which updates the display in real-time.
