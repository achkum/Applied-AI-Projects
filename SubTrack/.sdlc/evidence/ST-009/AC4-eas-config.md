# AC4: EAS Build Configuration

## Evidence
Configured EAS (Expo Application Services) with dev/preview/production profiles:

### app.json
- Bundle ID: `se.subtrack.app` (iOS)
- Package: `se.subtrack.app` (Android)
- Expo plugins configured: `expo-router`, `expo-secure-store`

### eas.json
Three build profiles configured:

#### Development Profile
```json
{
  "distribution": "internal",
  "android": {"gradleCommand": ":app:assembleDebug"},
  "ios": {"simulator": true}
}
```
Use for local development with simulator/emulator.

#### Preview Profile
```json
{
  "distribution": "internal",
  "android": {"buildType": "apk"},
  "ios": {"simulator": false},
  "env": {"API_BASE_URL": "https://staging.subtrack.local"}
}
```
For milestone gates and internal testing (TestFlight/Google Play internal track).

#### Production Profile
```json
{
  "distribution": "store",
  "autoIncrement": true,
  "env": {"API_BASE_URL": "https://api.subtrack.app"}
}
```
For public App Store/Play Store submission.

### Commands
```bash
eas build --platform ios --profile development
eas build --platform android --profile development
eas build --platform ios --profile preview
eas build --platform android --profile preview
eas build --platform ios --profile production
eas build --platform android --profile production
```

### Environment Variables
Each profile injects API_BASE_URL for backend API routing.
