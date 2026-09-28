# EAS Configuration Guide

This document outlines the Expo Application Services (EAS) build and deployment strategy for SubTrack Mobile.

## Profiles

### Development Profile
- **Distribution**: Internal (dev client for simulator/emulator)
- **Android**: Uses `assembleDebug` gradle task
- **iOS**: Builds for simulator
- **Purpose**: Local development testing
- **Command**: `eas build --platform [ios|android] --profile development`

### Preview Profile
- **Distribution**: Internal (ad-hoc for TestFlight, APK for internal Google Play)
- **Environment**: Points to staging API (`https://staging.subtrack.local`)
- **Purpose**: Milestone gates, internal testing, beta review
- **iOS**: Submits to TestFlight internal testing track
- **Android**: Submits to Google Play internal testing track
- **Command**: `eas build --platform [ios|android] --profile preview`

### Production Profile
- **Distribution**: Store (App Store Connect, Google Play)
- **Environment**: Points to production API (`https://api.subtrack.app`)
- **Purpose**: Public release
- **Requires**: Founder approval (D-01) before submission
- **Command**: `eas build --platform [ios|android] --profile production`

## Secrets Management

EAS credentials are stored in `/opt/subtrack/secrets/` and wired by the devops-release agent:

### iOS
- **App Store Connect API Key**: `.p8` file with key id and issuer id
- **Bundle ID**: `se.subtrack.app`
- **Certificates & Provisioning**: Managed automatically by EAS

### Android
- **Service Account Key**: JSON key for Google Play Console
- **Package**: `se.subtrack.app`
- **Keystore**: Managed automatically by EAS

## Submit Configuration

The `submit` section in `eas.json` configures submission to stores:
- **iOS**: Uses App Store Connect API key to submit to App Store
- **Android**: Uses Google Play service account to submit to Play Store

## Environment Variables

Build-time environment variables injected per profile:
- `API_BASE_URL`: Changes based on profile (staging vs production)

Access in app via:
```typescript
import Constants from 'expo-constants';
const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl;
```

## Testing & Beta Distribution

### Internal Testing (before public launch)
- **iOS**: TestFlight internal testing (unlimited internal testers)
- **Android**: Google Play internal testing (up to 100 testers)
- **No App Review required** (internal only)
- **Use**: Milestone gates (M0, M1, etc.)

### External Testing (public beta)
- **iOS**: TestFlight external beta (up to 10,000 testers after review)
- **Android**: Google Play open testing (public, unreviewed)
- **App Review required** (App Store only)
- **Use**: Public beta feedback before App Store launch

## Submission Strategy

1. **Development**: Test locally with `pnpm start` or dev builds
2. **Preview**: Build and test with preview profile for each milestone
3. **Production**: Build production and submit after founder approval

See `docs/ops/APP_STORES.md` for detailed App Store and Google Play setup.

## Troubleshooting

- **Build fails**: Check `eas build` logs and ensure all secrets are configured
- **Submission fails**: Verify credentials in `/opt/subtrack/secrets/` and app metadata in App Store Connect / Google Play Console
- **Wrong API endpoint**: Confirm `eas.json` profile environment variables are set correctly

## References

- [Expo EAS Build Documentation](https://docs.expo.dev/eas/build/)
- [Expo EAS Submit Documentation](https://docs.expo.dev/eas/submit/)
- [APP_STORES.md](../docs/ops/APP_STORES.md) - Bundle IDs and store enrollment details
