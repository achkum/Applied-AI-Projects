# Subscription Category Taxonomy (Sweden-first)

The `code` is stable and stored in the database. Labels are i18n keys `category.<code>`.
Example merchants seed the merchant catalogue and the synthetic data.
All prices in seeds are **illustrative**. Real prices come from the Price Catalogue scraper and are always shown with a "last verified" date.

| code | sv | en | Example merchants (SE market) |
|---|---|---|---|
| VIDEO_STREAMING | Film & serier | Video streaming | Netflix, Disney+, HBO Max, Viaplay, SVT Play (free, excluded), TV4 Play, SkyShowtime, Prime Video, Apple TV+ |
| MUSIC_AUDIO | Musik & podd | Music & podcasts | Spotify, Apple Music, YouTube Music, Tidal, Podme, Acast+ |
| AUDIOBOOKS_EBOOKS | Ljudböcker & e-böcker | Audiobooks & e-books | Storytel, BookBeat, Nextory, Audible |
| NEWS_MAGAZINES | Nyheter & tidningar | News & magazines | Dagens Nyheter, Svenska Dagbladet, Aftonbladet Plus, Expressen Premium, GP, Readly, Dagens Industri |
| GAMING | Spel | Gaming | Xbox Game Pass, PlayStation Plus, Nintendo Switch Online, EA Play, Steam (non-recurring, excluded) |
| SOFTWARE_PRODUCTIVITY | Programvara | Software & productivity | Microsoft 365, Adobe Creative Cloud, Notion, Canva, Dropbox, 1Password |
| CLOUD_STORAGE | Molnlagring | Cloud storage | iCloud+, Google One, OneDrive standalone |
| AI_TOOLS | AI-verktyg | AI tools | ChatGPT Plus/Pro, Claude Pro/Max, Gemini/Google AI Pro, Perplexity Pro, Midjourney, GitHub Copilot |
| MOBILE_PLAN | Mobilabonnemang | Mobile plans | Telia, Tele2, Tre, Telenor, Comviq, Hallon, Vimla, Fello |
| BROADBAND_TV | Bredband & TV | Broadband & TV | Bahnhof, Bredband2, Telia, Tele2/Com Hem, Telenor, Ownit |
| FITNESS_WELLNESS | Träning & hälsa | Fitness & wellness | SATS, Nordic Wellness, Friskis & Svettis, Actic, STC, Strava, Headspace |
| FOOD_MEALKITS | Mat & matkassar | Food & meal kits | Linas Matkasse, HelloFresh, Mathem Plus, Foodora Pro, Wolt+ |
| TRANSPORT_MOBILITY | Transport | Transport & mobility | SL 30-day (recurring autoload), Voi Pass, Tier/Dott passes, EasyPark/Parkster subscriptions, EV charging plans |
| HOME_SECURITY | Hem & larm | Home & security | Verisure, Sector Alarm, Securitas Direct smart home |
| EDUCATION_KIDS | Lärande & barn | Learning & kids | Duolingo, Babbel, Kahoot!, Polyglutt, kids' activity memberships |
| PETS | Husdjur | Pets | Pet insurance *excluded*; Buddy/Zooplus subscription boxes |
| SHOPPING_MEMBERSHIPS | Medlemskap | Shopping memberships | Amazon Prime, Costco, Klarna Plus, Apotea Plus |
| VPN_SECURITY | VPN & säkerhet | VPN & security | NordVPN, Mullvad, ExpressVPN, Norton, F-Secure |
| DONATIONS | Månadsgivande | Recurring donations | Läkare Utan Gränser, UNICEF Sverige, Rädda Barnen, WWF, Cancerfonden |
| DATING_SOCIAL | Dejting & socialt | Dating & social | Tinder, Hinge, Bumble, X Premium, Snapchat+ |
| APP_STORE_BILLING | Appköp (samlat) | App store billing | APPLE.COM/BILL, GOOGLE *Play; decomposed into underlying services where the plan price matches |
| OTHER_SUBSCRIPTION | Övrigt | Other | Anything recurring and discretionary that doesn't fit above |

## Excluded recurring (recognised, never shown as subscriptions)
`SALARY, RENT, MORTGAGE, LOAN, INSURANCE, UTILITY_ELECTRICITY, UTILITY_WATER, TAX, CHILD_ALLOWANCE (Försäkringskassan), SAVINGS_TRANSFER, INTERNAL_TRANSFER, SWISH, CSN, UNION_FEE (a-kassa/fackavgift)`

`UNION_FEE` is deliberately excluded. Union membership is a GDPR special-category signal and is never classified or stored as such.
