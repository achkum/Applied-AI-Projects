# AC2: Internationalization (i18n)

## Evidence
Implemented i18n using `i18n-js` library with catalogs from `@subtrack/i18n`:

### Implementation
- `src/context/I18nContext.tsx` - I18n context provider
- Catalog loading: `sv.json` and `en.json` from `packages/i18n/catalogs/`
- Locale persistence via `AsyncStorage`
- Context hook: `useI18n()` for accessing current locale and translation function

### Catalogs Available
From `@subtrack/i18n`:
- English (`en.json`): navigation, actions, scope translations
- Swedish (`sv.json`): Swedish translations for all keys

### Functionality
- Locale context provides current locale and `setLocale()` function
- Translation function `t(key)` resolves keys from loaded catalogs
- Language switcher updates locale without app restart
- User preference persists across sessions via AsyncStorage key `locale-preference`

### Example Usage
```tsx
const { locale, setLocale, t } = useI18n();
// locale = 'en' or 'sv'
// setLocale('sv') - switch to Swedish
// t('navigation.home') - retrieve translated string
```
