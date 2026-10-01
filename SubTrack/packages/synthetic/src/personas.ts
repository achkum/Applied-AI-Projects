/**
 * Five deterministic showcase household personas with ground-truth subscription
 * labels. Used for recurring-detection evaluation (ST-080), app showcases, and
 * integration tests. Amounts are in SEK öre (minor units).
 */

export interface PersonaMember {
  id: string;
  name: string;
}

export interface PersonaSubscription {
  id: string;
  merchantId: string;
  merchantName: string;
  /** Lowercase category slug matching ui-tokens category colors. */
  category: string;
  /** Amount in minor units (öre for SEK). */
  amountMinor: number;
  currency: 'SEK';
  billingCadence: 'MONTHLY' | 'ANNUAL';
  ownerType: 'ME' | 'HOUSEHOLD' | 'MEMBER';
  /** Only present when ownerType = 'MEMBER'. */
  memberId?: string;
  /**
   * Realistic bank-statement descriptor variants. Derived from the merchant
   * name using the mutation patterns in descriptor.ts.
   */
  descriptorVariants: [string, string, string, ...string[]];
  groundTruth: {
    readonly isRecurring: true;
    /** Same as amountMinor — fixtures use stable pricing. */
    normalizedAmountMinor: number;
  };
}

export interface PersonaHousehold {
  id: string;
  displayName: string;
  /** Seed string for deterministic child RNG via createRng(seed). */
  seed: string;
  members: PersonaMember[];
  subscriptions: PersonaSubscription[];
}

// ─── Household 1: solberg ─────────────────────────────────────────────────────
// Emma Solberg — single professional; 4 personal subscriptions.

export const PERSONA_SOLBERG: PersonaHousehold = {
  id: 'household-solberg',
  displayName: 'Emma Solberg',
  seed: 'persona:household-solberg',
  members: [{ id: 'emma', name: 'Emma Solberg' }],
  subscriptions: [
    {
      id: 'solberg-netflix',
      merchantId: 'netflix',
      merchantName: 'Netflix',
      category: 'video-streaming',
      amountMinor: 14900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['NETFLIX', 'Netflix', 'NETFLIX*', 'NETFLIX.COM'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 14900 },
    },
    {
      id: 'solberg-spotify',
      merchantId: 'spotify',
      merchantName: 'Spotify',
      category: 'music-audio',
      amountMinor: 10900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['SPOTIFY', 'Spotify', 'SPOTIFY AB', 'SPOTIFY NORDIC'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 10900 },
    },
    {
      id: 'solberg-icloud',
      merchantId: 'apple-icloud',
      merchantName: 'iCloud',
      category: 'cloud-storage',
      amountMinor: 3900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['APPLE.COM/BILL', 'ICLOUD', 'APPLE ICLOUD', 'APPLE.COM'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 3900 },
    },
    {
      id: 'solberg-linkedin',
      merchantId: 'linkedin-premium',
      merchantName: 'LinkedIn Premium',
      category: 'software-productivity',
      amountMinor: 89900,
      currency: 'SEK',
      billingCadence: 'ANNUAL',
      ownerType: 'ME',
      descriptorVariants: ['LINKEDIN', 'LINKEDIN PREMIUM', 'LINKEDIN.COM', 'LINKEDIN DIGITAL'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 89900 },
    },
  ],
};

// ─── Household 2: lindqvist ───────────────────────────────────────────────────
// Lars & Maria Lindqvist — couple; 6 shared household subscriptions.

export const PERSONA_LINDQVIST: PersonaHousehold = {
  id: 'household-lindqvist',
  displayName: 'Lars & Maria Lindqvist',
  seed: 'persona:household-lindqvist',
  members: [
    { id: 'lars', name: 'Lars Lindqvist' },
    { id: 'maria', name: 'Maria Lindqvist' },
  ],
  subscriptions: [
    {
      id: 'lindqvist-disney',
      merchantId: 'disney-plus',
      merchantName: 'Disney+',
      category: 'video-streaming',
      amountMinor: 13900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['DISNEY+', 'DISNEY PLUS', 'DISNEYPLUS.COM', 'DISNEY DIGITAL'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 13900 },
    },
    {
      id: 'lindqvist-youtube',
      merchantId: 'youtube-premium',
      merchantName: 'YouTube Premium',
      category: 'video-streaming',
      amountMinor: 21900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['GOOGLE YOUTUBE', 'YOUTUBE PREMIUM', 'YOUTUBE.COM', 'GOOGLE*YOUTUBE'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 21900 },
    },
    {
      id: 'lindqvist-spotify',
      merchantId: 'spotify-duo',
      merchantName: 'Spotify Duo',
      category: 'music-audio',
      amountMinor: 15900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['SPOTIFY', 'SPOTIFY AB', 'SPOTIFY NORDIC', 'SPOTIFY DUO'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 15900 },
    },
    {
      id: 'lindqvist-storytel',
      merchantId: 'storytel',
      merchantName: 'Storytel',
      category: 'books-media',
      amountMinor: 17900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['STORYTEL', 'STORYTEL AB', 'STORYTEL.COM', 'STORYTEL SWEDEN'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 17900 },
    },
    {
      id: 'lindqvist-microsoft365',
      merchantId: 'microsoft-365',
      merchantName: 'Microsoft 365 Family',
      category: 'software-productivity',
      amountMinor: 119900,
      currency: 'SEK',
      billingCadence: 'ANNUAL',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['MICROSOFT*365', 'MICROSOFT 365', 'MICROSOFT.COM', 'MSFT*OFFICE365'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 119900 },
    },
    {
      id: 'lindqvist-icloud',
      merchantId: 'apple-icloud-2tb',
      merchantName: 'iCloud 2TB',
      category: 'cloud-storage',
      amountMinor: 9900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['APPLE.COM/BILL', 'ICLOUD 2TB', 'APPLE ICLOUD', 'APPLE.COM'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 9900 },
    },
  ],
};

// ─── Household 3: ahmadi ──────────────────────────────────────────────────────
// Karim + Sara Ahmadi + teenage children — family; 8 subscriptions spanning
// HOUSEHOLD and MEMBER ownerTypes.

export const PERSONA_AHMADI: PersonaHousehold = {
  id: 'household-ahmadi',
  displayName: 'Ahmadi Family',
  seed: 'persona:household-ahmadi',
  members: [
    { id: 'karim', name: 'Karim Ahmadi' },
    { id: 'sara', name: 'Sara Ahmadi' },
  ],
  subscriptions: [
    {
      id: 'ahmadi-netflix',
      merchantId: 'netflix-standard',
      merchantName: 'Netflix',
      category: 'video-streaming',
      amountMinor: 18900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['NETFLIX', 'NETFLIX*', 'NETFLIX.COM', 'NETFLIX DIGITAL'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 18900 },
    },
    {
      id: 'ahmadi-spotify-family',
      merchantId: 'spotify-family',
      merchantName: 'Spotify Family',
      category: 'music-audio',
      amountMinor: 19900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['SPOTIFY', 'SPOTIFY AB', 'SPOTIFY FAMILY', 'SPOTIFY.COM'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 19900 },
    },
    {
      id: 'ahmadi-hbo',
      merchantId: 'max-hbo',
      merchantName: 'Max',
      category: 'video-streaming',
      amountMinor: 12900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['MAX.COM', 'HBO MAX', 'MAX STREAMING', 'WARNERMEDIA*MAX'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 12900 },
    },
    {
      id: 'ahmadi-adobe-cc',
      merchantId: 'adobe-creative-cloud',
      merchantName: 'Adobe Creative Cloud',
      category: 'software-productivity',
      amountMinor: 67900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'MEMBER',
      memberId: 'karim',
      descriptorVariants: ['ADOBE SYSTEMS', 'ADOBE*CREATIVE', 'ADOBE.COM', 'ADOBE CREATIVE'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 67900 },
    },
    {
      id: 'ahmadi-youtube-sara',
      merchantId: 'youtube-premium',
      merchantName: 'YouTube Premium',
      category: 'video-streaming',
      amountMinor: 11900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'MEMBER',
      memberId: 'sara',
      descriptorVariants: ['GOOGLE YOUTUBE', 'YOUTUBE PREMIUM', 'YOUTUBE.COM', 'GOOGLE*YOUTUBE'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 11900 },
    },
    {
      id: 'ahmadi-duolingo',
      merchantId: 'duolingo-plus',
      merchantName: 'Duolingo Plus',
      category: 'education',
      amountMinor: 8900,
      currency: 'SEK',
      billingCadence: 'ANNUAL',
      ownerType: 'MEMBER',
      memberId: 'sara',
      descriptorVariants: ['DUOLINGO', 'DUOLINGO*PLUS', 'DUOLINGO.COM', 'DUOLINGO DIGITAL'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 8900 },
    },
    {
      id: 'ahmadi-headspace',
      merchantId: 'headspace',
      merchantName: 'Headspace',
      category: 'health-wellness',
      amountMinor: 9900,
      currency: 'SEK',
      billingCadence: 'ANNUAL',
      ownerType: 'MEMBER',
      memberId: 'karim',
      descriptorVariants: ['HEADSPACE', 'HEADSPACE.COM', 'HEADSPACE ONLINE', 'HEADSPACE DIGITAL'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 9900 },
    },
    {
      id: 'ahmadi-apple-one',
      merchantId: 'apple-one',
      merchantName: 'Apple One',
      category: 'bundle',
      amountMinor: 34900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'HOUSEHOLD',
      descriptorVariants: ['APPLE.COM/BILL', 'APPLE ONE', 'APPLE ONE FAMILY', 'APPLE*ONE'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 34900 },
    },
  ],
};

// ─── Household 4: eriksson ────────────────────────────────────────────────────
// Jakob Eriksson — student; 3 personal subscriptions on a tight budget.

export const PERSONA_ERIKSSON: PersonaHousehold = {
  id: 'household-eriksson',
  displayName: 'Jakob Eriksson',
  seed: 'persona:household-eriksson',
  members: [{ id: 'jakob', name: 'Jakob Eriksson' }],
  subscriptions: [
    {
      id: 'eriksson-spotify-student',
      merchantId: 'spotify-student',
      merchantName: 'Spotify Student',
      category: 'music-audio',
      amountMinor: 5900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['SPOTIFY', 'SPOTIFY AB', 'SPOTIFY STUDENT', 'SPOTIFY NORDIC'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 5900 },
    },
    {
      id: 'eriksson-netflix',
      merchantId: 'netflix',
      merchantName: 'Netflix',
      category: 'video-streaming',
      amountMinor: 14900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['NETFLIX', 'NETFLIX*', 'NETFLIX.COM', 'NETFLIX SE'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 14900 },
    },
    {
      id: 'eriksson-github-copilot',
      merchantId: 'github-copilot',
      merchantName: 'GitHub Copilot',
      category: 'software-productivity',
      amountMinor: 11900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['GITHUB', 'GITHUB.COM', 'GITHUB COPILOT', 'GITHUB*COPILOT'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 11900 },
    },
  ],
};

// ─── Household 5: okonkwo ─────────────────────────────────────────────────────
// Adaeze Okonkwo — freelance designer; 5 productivity-heavy subscriptions.

export const PERSONA_OKONKWO: PersonaHousehold = {
  id: 'household-okonkwo',
  displayName: 'Adaeze Okonkwo',
  seed: 'persona:household-okonkwo',
  members: [{ id: 'adaeze', name: 'Adaeze Okonkwo' }],
  subscriptions: [
    {
      id: 'okonkwo-adobe-cc',
      merchantId: 'adobe-creative-cloud',
      merchantName: 'Adobe Creative Cloud',
      category: 'software-productivity',
      amountMinor: 67900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['ADOBE SYSTEMS', 'ADOBE*CREATIVE', 'ADOBE.COM', 'ADOBE CREATIVE'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 67900 },
    },
    {
      id: 'okonkwo-figma',
      merchantId: 'figma-professional',
      merchantName: 'Figma',
      category: 'software-productivity',
      amountMinor: 19000,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['FIGMA', 'FIGMA.COM', 'FIGMA ONLINE', 'FIGMA*PRO'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 19000 },
    },
    {
      id: 'okonkwo-notion',
      merchantId: 'notion-plus',
      merchantName: 'Notion',
      category: 'software-productivity',
      amountMinor: 11900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['NOTION', 'NOTION.SO', 'NOTION ONLINE', 'NOTION*PLUS'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 11900 },
    },
    {
      id: 'okonkwo-slack',
      merchantId: 'slack-pro',
      merchantName: 'Slack',
      category: 'software-productivity',
      amountMinor: 31900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['SLACK', 'SLACK.COM', 'SLACK TECHNOLOGIES', 'SLACK*PRO'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 31900 },
    },
    {
      id: 'okonkwo-vercel',
      merchantId: 'vercel-pro',
      merchantName: 'Vercel',
      category: 'cloud-infrastructure',
      amountMinor: 23900,
      currency: 'SEK',
      billingCadence: 'MONTHLY',
      ownerType: 'ME',
      descriptorVariants: ['VERCEL', 'VERCEL.COM', 'VERCEL INC', 'VERCEL*PRO'],
      groundTruth: { isRecurring: true, normalizedAmountMinor: 23900 },
    },
  ],
};

/** All 5 showcase households in a single ordered array. */
export const ALL_PERSONAS: readonly PersonaHousehold[] = [
  PERSONA_SOLBERG,
  PERSONA_LINDQVIST,
  PERSONA_AHMADI,
  PERSONA_ERIKSSON,
  PERSONA_OKONKWO,
] as const;
