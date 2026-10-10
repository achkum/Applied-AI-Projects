# ST-212 contract guard QA — APPROVE_SOURCE
Reviewed working Git blobs: `contracts.test.mjs` `2cec904212796f38f86d62e970d40985ab19021d`; `openapi.yaml` `72836cd6c2ff63e1fbb89a112b3feb19763bde30`.
Parent `70d7fbb` OpenAPI has none of `/v1/subscriptions`, `/v1/subscriptions/{id}`, or `/v1/review-inbox`; excluding exactly those paths preserves the accepted `96279f7e…29a4adee` legacy semantic digest for every prior non-v2 path and named schema/Problem response.
Exact route and availability inventories require only the three new GET operations; explicit assertions bind each operation's bearer auth, unavailable-default marker, parameters, response codes, 200 schema, and problem response.
The new schema/parameter inventory detects missing definitions; focused subscription-read contract coverage supplies projection, money, cursor, and schema checks. No blanket hash replacement or relaxed legacy assertions found.
Source verdict only: no local test execution or PostgreSQL/CI approval in this review.
