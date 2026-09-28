# AC5: Theme Colors from UI Tokens

## Evidence
All UI colors reference native theme JSON with no hardcoded colors:

### Theme Structure
- `packages/ui-tokens/generated/theme.native.json` loaded as the single source of truth
- Light and dark theme variants defined
- `src/context/ThemeContext.tsx` loads and applies themes

### Color Palette
Theme provides color values for both light and dark modes:
```
Light: bg.canvas, bg.raised, bg.sunken, ink.primary, ink.secondary, aurora.*, ember.*
Dark: Same keys with dark-optimized values
```

### Usage in Components
Example from `WelcomeScreen.tsx`:
```tsx
const palette = isDark ? theme.color.dark : theme.color.light;

// No hardcoded colors:
backgroundColor: palette['bg.raised']
color: palette['ink.primary']
backgroundColor: palette['aurora.violet']
```

### Theme Provider
`ThemeContext` component:
- Reads system color scheme preference
- Persists user theme choice via `AsyncStorage` (key: `theme-mode-preference`)
- Provides `useTheme()` hook for consuming components
- Supports modes: `light`, `dark`, `system`

### Design Tokens Integration
- Typography: `theme.typography.fontFamily` and `theme.typography.fontSize`
- Radius: `theme.radius.card`, `theme.radius.sheet`, `theme.radius.pill`
- Motion: `theme.motion` for animations
- Contrast pairs defined for accessibility

All colors are derived from `@subtrack/ui-tokens`, not hardcoded.
