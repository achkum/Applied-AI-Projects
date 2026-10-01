/**
 * sv/en copy for the ST-026 signature components (RollingNumber,
 * ScopeSwitcher, ReceiptCard).
 *
 * `packages/i18n/catalogs/**` is outside this task's `allowed_paths`
 * (`SubTrack/apps/mobile/**` only), so these keys live locally and are
 * merged into `I18n.translations` in `I18nContext` rather than edited into
 * the shared catalogs. See ST-026 Progress notes: recommend promoting these
 * into `packages/i18n` in a follow-up task with access to that package.
 * Where an existing shared key already covers the copy (e.g. `scope.personal`,
 * `navigation.household`), components reuse it instead of duplicating it here.
 */
export const en = {
  rollingNumber: {
    period: {
      monthly: 'Monthly',
      annual: 'Annual',
    },
    loading: 'Loading total',
    unavailable: 'Total unavailable',
  },
  scopeSwitcher: {
    selectedAnnouncement: '%{scope} selected',
  },
  receiptCard: {
    category: 'Category',
    cadence: {
      monthly: 'Billed monthly',
      annual: 'Billed annually',
    },
    priceHistory: 'Price history',
    priceIncrease: 'Price increased to %{amount}',
    noHistory: 'No price history yet',
    unavailable: 'Price unavailable',
  },
};

export const sv: typeof en = {
  rollingNumber: {
    period: {
      monthly: 'Månadsvis',
      annual: 'Årsvis',
    },
    loading: 'Laddar totalsumma',
    unavailable: 'Totalsumma inte tillgänglig',
  },
  scopeSwitcher: {
    selectedAnnouncement: '%{scope} vald',
  },
  receiptCard: {
    category: 'Kategori',
    cadence: {
      monthly: 'Debiteras månadsvis',
      annual: 'Debiteras årsvis',
    },
    priceHistory: 'Prishistorik',
    priceIncrease: 'Priset höjdes till %{amount}',
    noHistory: 'Ingen prishistorik än',
    unavailable: 'Pris inte tillgängligt',
  },
};
