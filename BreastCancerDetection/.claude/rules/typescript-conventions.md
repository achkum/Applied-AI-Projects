# TypeScript / Frontend Conventions

Project: Next.js 14 (App Router) + Tailwind CSS frontend for the histopathology CDSS.

## Versions and tooling

- Node 20+.
- Use `pnpm` (not npm or yarn). Lockfile is `pnpm-lock.yaml`.
- TypeScript strict mode on (`"strict": true` in `tsconfig.json`).
- Linter: `eslint` with the Next.js config. Run `pnpm lint`.
- Formatter: Prettier (configured via eslint).

## Code style

- TypeScript everywhere. No JS files except config (`next.config.mjs` etc.).
- Prefer `type` over `interface` unless extending external interfaces. Pick one and be consistent within the project — we use `type`.
- Named exports for components. Default export only for Next.js page/layout files (it's required there).
- Avoid `any`. Use `unknown` with a type guard if the shape isn't known.
- No barrel files (`index.ts` that re-exports). Import from the actual file path.

## File organization

```
frontend/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Landing page
│   ├── analyze/
│   │   └── page.tsx        # Main analysis view
│   └── layout.tsx
├── components/             # Reusable UI components
│   ├── UploadSlide.tsx
│   ├── PredictionCard.tsx
│   ├── HeatmapToggle.tsx
│   ├── ChatPanel.tsx
│   └── Disclaimer.tsx
├── lib/
│   ├── api.ts              # REST + SSE client
│   └── types.ts            # Shared types
└── public/
    └── examples/           # Preset demo slides (PNG)
```

## React patterns

- Functional components only. No class components.
- Use React hooks (`useState`, `useEffect`, `useRef`). For shared state, lift to nearest common parent — don't reach for Context or a state library for this project.
- Server components by default; mark client components with `'use client'` only when needed (event handlers, hooks).
- Don't fetch in components if the data could come from a server component.

## Styling

- Tailwind utility classes only. No CSS modules, no inline `style={}`, no styled-components.
- Use semantic Tailwind classes (`text-slate-700`, `bg-blue-50`). Avoid arbitrary values like `text-[#3a3a3a]` unless absolutely needed.
- Medical palette: off-white background (`bg-slate-50`), navy primary (`text-blue-900`, `bg-blue-900`), muted green accent (`text-emerald-600`, `bg-emerald-50`). Avoid bright or playful colors — this is clinical software.
- Spacing scale: stick to Tailwind defaults. No custom spacing tokens.

## API client

- All backend calls go through `lib/api.ts`. Do not call `fetch` inline in components.
- Base URL from `NEXT_PUBLIC_API_URL` env var.
- For SSE (chat endpoint): use the Vercel AI SDK's streaming hooks. Do not roll your own SSE parser.

## Forms and file uploads

- Use uncontrolled inputs with `useRef` for simple cases (image upload).
- For controlled inputs, `useState`.
- Do not pull in `react-hook-form` or `formik` — this app's forms are too simple to justify either.

## Testing

- `jest` + `@testing-library/react` for component tests.
- Tests live next to the component: `Component.tsx` + `Component.test.tsx`.
- Test user-visible behavior, not implementation details.

## Accessibility

- All interactive elements must be keyboard accessible.
- Image uploads need an associated `<label>`.
- Color is never the only signal — the confidence bar has a numeric label, the heatmap toggle has descriptive text.

## Don't

- No `localStorage` or `sessionStorage` for anything PHI-adjacent.
- No `dangerouslySetInnerHTML`.
- No third-party tracking or analytics in v1.
- No custom font loading; system fonts via Tailwind.
