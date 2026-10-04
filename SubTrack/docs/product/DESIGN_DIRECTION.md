# Design Direction — "Precision" (Production-Grade Fintech)

> Founder decision 2026-09-28 (ST-163): original Norrsken / orbital concept retired.
> New brief: *production-ready, investor-grade, customer-trusted — like Klarna or Kivra.*
> The design-lead agent owns this document. Further concept changes require founder approval (DECISION_RULES D-07).

---

## 1. The principle

**Trusted clarity over decorative novelty.**

SubTrack handles real money. Users share financial data across their household. The interface must signal competence, privacy, and control — not playfulness or spectacle. Every design decision is evaluated against one question: *does this build or erode trust?*

Reference products: Klarna, Kivra, Revolut (list view), Robinhood (data density), N26. Common traits: flat surfaces, restrained colour, precise typography, data that speaks for itself.

---

## 2. What we retired and why

| Old (Norrsken) | Why retired |
|---|---|
| Orbital canvas animation — subscriptions as planets in orbit | Too decorative, distracting on a financial app; poor accessibility; blocked on Canvas performance on low-end Android |
| Aurora gradients behind body text | WCAG AA failures on lighter themes; heavy GPU cost; felt like a demo, not a product |
| Fraunces display serif for hero numbers | Felt editorial/magazine, not fintech-precise; tabular figures work better in Inter |
| Glassmorphism card overlays | Contrast failures; no structural hierarchy; screams "Dribbble concept" to investors |
| Glowing amber price-increase indicators | Attention-seeking; replaced with tight badge chips |

---

## 3. Visual language

### Surfaces
- **Flat cards, 1px border, no box-shadow.** Shadow is used only for elevated drawers/modals.
- Corner radii: `12px` cards, `8px` rows/inputs, `999px` pills/badges, `8px` icon tiles.
- Three surface levels: `bg-canvas` (page background), `bg-surface` (nav bar, bottom sheets), `bg-card` (content cards, list rows).

### Colour
| Token | Dark | Light | Use |
|---|---|---|---|
| `bg-canvas` | `#0f0f11` | `#f5f5f7` | Page background |
| `bg-surface` | `#18181c` | `#ffffff` | Nav bar, drawer bg |
| `bg-card` | `#222227` | `#ffffff` | Cards, list rows |
| `bg-raised` | `#2a2a30` | `#f0f0f4` | Inset areas, pressed states |
| `border` | `#2e2e38` | `#e2e1ea` | Card/row borders |
| `border-strong` | `#44434f` | `#c5c4d0` | Emphasis borders, bar fills |
| `t1` | `#f2f1f6` | `#13121e` | Primary text |
| `t2` | `#8d8c99` | `#6b6a78` | Secondary text, metadata |
| `t3` | `#5c5b67` | `#9b9aa7` | Labels, section headers |
| `brand` | `#7b6fe8` | `#6358d4` | Single accent — active nav, primary CTA, brand badge |
| `green` | `#29a06b` | `#1a8f5e` | Positive delta, savings, shared |
| `amber` | `#e08a0c` | `#c07800` | Price creep, warnings |
| `red` | `#df4545` | `#c93636` | Destructive, anomalies |

**Single accent rule**: `brand` (desaturated violet) is used for exactly one thing per screen — the active nav item or the primary CTA. Never used as a fill on data bars or avatar backgrounds.

### Typography
- **Font**: Inter Variable (`wght` 400–700) loaded from Google Fonts. No display serif.
- **Numbers**: `font-variant-numeric: tabular-nums` on every monetary value. Letter-spacing `-0.5px` to `-0.8px` on hero amounts.
- **Scale**: 10 / 11 / 12 / 13 / 14 / 15 / 18 / 20 / 28 / 32 / 38 px.
- **Hero total**: 38px / weight 600 / tabular-nums / letter-spacing -0.8px.
- **Currency format**: `1 373 kr` (sv), `SEK 1,373` (en). Never `1373 kr` (no thousands separator).

### Motion
- **Tab transitions**: `transform: translateX` slide — 300ms, `cubic-bezier(0.32, 0.72, 0, 1)`. Outgoing screen slides to -28%; incoming slides from +100% to 0.
- **Drawer open/close**: `translateY(100% → 0)`, 280ms same easing.
- **Micro-interactions**: `0.1–0.15s` background transitions on tap/hover.
- **No looping animations**. No aurora animation. Reduced-motion: all transitions disabled.

---

## 4. Component inventory (replaces Norrsken signatures)

| Component | Description | Status |
|---|---|---|
| HeroCard | Member-scoped total with monthly/annual toggle and member filter pills | Prototype done, web/mobile backlog |
| SavingsCard | Potential savings with current vs optimised comparison bars | Prototype done, spec needed |
| StatChipRow | 4-chip horizontal scroll row with semantic colours for key metrics | Prototype done, spec needed |
| InsightCard | Action-oriented card with lead stat number, sub-label, optional mini-chart | Prototype done, spec needed |
| MarketCard | External intelligence card with you-pay vs alternative comparison widget | Prototype done, spec needed |
| SubRow | Subscription list row with icon tile, name, metadata, amount | Prototype done, web/mobile backlog |
| FilterChips | Horizontal scrollable category filter | Prototype done, spec needed |
| MemberPills | Scope switcher pills (household + individual members) | Prototype done, spec needed |
| BottomNav | Single global 5-tab nav with badge support | Prototype done (single nav, slide) |
| DrawerSheet | Bottom sheet for subscription detail — handle, header, price block, detail rows, sparkline, actions | Prototype done |
| SettlementRow | Who owes whom for shared subs | Prototype done |
| ChartBars | 6-month spend trend (CSS-only, no chart library) | Prototype done, spec needed |

Components formerly in the Norrsken set (Orbit, RollingNumber as display serif) are **cancelled**. The Orbit component (ST-025, ST-027) is moved to REJECTED. RollingNumber stays but with Inter Variable, not Fraunces.

---

## 5. Interaction design principles

1. **Every visible element is tappable or explains why it isn't.** Stat chips → Insights. Savings card → Insights. Upcoming rows → subscription drawer. Shared subs in Household → subscription drawer.
2. **Cross-screen links, not dead ends.** Home "See all →" on Upcoming links to Subscriptions. Home "See all →" on Insights links to Insights. Never display a section with no way to reach its full view.
3. **Badges signal actionable state.** The Insights tab badge shows the count of unresolved action-required insights. It clears when the user views the screen.
4. **No modal for navigation.** Tab transitions use slide (left/right based on tab order). Drawers are for detail, not navigation.
5. **Language and theme are settings, not controls.** Moved from a floating control panel into Profile → Settings rows.

---

## 6. Screen inventory

| Screen | Purpose |
|---|---|
| Home (Hem) | Household total, member scope switcher, upcoming renewals, savings summary + stat chips |
| Subscriptions | Searchable, filterable list of all subscriptions; tappable rows open drawer |
| Household | Member overview, settlement summary, shared subscriptions |
| Insights | AI summary, 6 action cards with lead stats, 4 market intelligence cards, 6-month spend chart |
| Profile | Avatar, theme toggle, language toggle, notifications, support |

---

## 7. Prototype

The interactive prototype at `docs/subtrack-prototype.html` is the authoritative design reference for all screen layouts, component shapes, and interaction flows.
It is a single-file browser prototype (no server needed), maintained on branch `st/ST-redesign-prototype`.

Implemented in the prototype:
- All 5 screens with full content
- Single global nav with slide-based tab switching
- Member pill scope switching (household / Batman / Superman / Spiderman / Ironman)
- Monthly/annual period toggle
- Category filter chips
- Subscription drawer (open/close, all 7 subs)
- All home elements tappable with correct cross-screen routing
- Insights tab badge (4 unresolved actions)
- "See all →" links from home sections
- Dark/light theme toggle (via Profile)
- Swedish/English language toggle (via Profile)
- Full i18n (sv + en) for all strings

Not in prototype (real app only):
- Actual bank data via Open Banking / Tink
- Push notifications
- BankID authentication
- Animated number roll on hero total change
