# AC3: Secure Token Storage

## Evidence
Implemented secure token storage using `expo-secure-store`:

### Implementation
- `src/utils/secureTokenStore.ts` - Secure storage utilities
- Platform-native storage:
  - **iOS**: Stored in Keychain
  - **Android**: Stored in Android Keychain System
- Not readable by other applications

### API
Two helper objects provide convenient access:

```typescript
// Auth token storage
authTokenStore.getToken() // => Promise<string | null>
authTokenStore.setToken(token: string) // => Promise<void>
authTokenStore.removeToken() // => Promise<void>

// Refresh token storage
refreshTokenStore.getToken() // => Promise<string | null>
refreshTokenStore.setToken(token: string) // => Promise<void>
refreshTokenStore.removeToken() // => Promise<void>

// Generic access
secureTokenStore.getToken(key: string)
secureTokenStore.setToken(key: string, token: string)
secureTokenStore.removeToken(key: string)
```

### Token Persistence
Tokens stored via `expo-secure-store` persist across app restarts and are platform-secure:
- iOS: Keychain encryption via device security
- Android: Keychain System encryption via device security

The tokens are not accessible to other applications on the device.

### Integration Ready
The `authTokenStore` and `refreshTokenStore` are ready to be integrated into:
- Login/authentication flows
- Token refresh middleware
- Logout handlers
