<div align="center">
<img src="assets/hero.png" alt="Social Sentinel — privacy-first sentiment monitoring" width="100%" />
</div>

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)

# Social Sentinel

Monitor Twitter/X, Google Reviews, and Facebook for brand mentions. PII redacted before transmission. AI-powered sentiment scoring. Multi-tenant. Runs on Cloudflare Workers.

## Why Social Sentinel?

- **Privacy-first** — All text is scrubbed for PII (emails, phones, addresses, SSNs) before it leaves the worker. Nothing sensitive is transmitted or stored.
- **Real-time** — Cron-triggered every 15 minutes. Brand mentions are captured and scored continuously.
- **Multi-platform** — Twitter/X, Google Reviews, and Facebook out of the box. Adding a new platform is one adapter file.
- **Zero-knowledge** — No long-term data storage. Mentions are processed in-flight and forwarded as structured metric events to your ingestion endpoint.
- **Multi-tenant** — Tenant configs live in Cloudflare KV. Each tenant gets independent platform credentials and processing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOCIAL SENTINEL                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                   │
│  │ Twitter/X │  │  Google   │  │ Facebook  │                   │
│  │  Adapter  │  │  Reviews  │  │  Adapter  │                   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                   │
│        └──────────────┼──────────────┘                         │
│                       ▼                                         │
│              ┌────────────────┐                                 │
│              │ PII Redaction  │                                 │
│              └───────┬────────┘                                 │
│                      ▼                                          │
│              ┌────────────────┐                                 │
│              │  Workers AI    │  @cf/huggingface/               │
│              │   Sentiment    │  distilbert-sst-2-int8          │
│              └───────┬────────┘                                 │
│                      ▼                                          │
│              ┌────────────────┐                                 │
│              │ Batch Builder  │  Up to 100 events/batch         │
│              └───────┬────────┘                                 │
└──────────────────────┼──────────────────────────────────────────┘
                       ▼
              POST /ingest/batch → Your HTTP Endpoint
```

## Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers paid plan
- Wrangler CLI
- API keys for desired platforms

### Installation

```bash
npm install
```

### Configuration

1. Create a KV namespace for tenant configurations:
   ```bash
   npx wrangler kv:namespace create TENANT_CONFIG
   ```

2. Update `wrangler.toml` with your KV namespace ID

3. Add tenant configuration to KV:
   ```bash
   npx wrangler kv:key put --namespace-id=<KV_ID> "your-tenant-id" '{
     "tenantId": "your-tenant-id",
     "stage": "production",
     "enabled": true,
     "platforms": {
       "twitter": {
         "enabled": true,
         "bearerToken": "YOUR_TWITTER_BEARER_TOKEN",
         "searchQuery": "@YourBrand OR \"Your Brand\""
       },
       "googleReviews": {
         "enabled": true,
         "apiKey": "YOUR_GOOGLE_API_KEY",
         "placeId": "YOUR_PLACE_ID"
       },
       "facebook": {
         "enabled": true,
         "pageAccessToken": "YOUR_PAGE_ACCESS_TOKEN",
         "pageId": "YOUR_PAGE_ID"
       }
     }
   }'
   ```

### Development

```bash
# Run tests
npm test

# Type check
npm run typecheck

# Start local dev server
npm run dev
```

### Deploy

```bash
npm run deploy
```

## Metrics Generated

| Metric Name | Unit | Description |
|---|---|---|
| `twitter_sentiment` | score (-1 to +1) | Tweet sentiment |
| `twitter_mentions` | count | Volume of mentions |
| `google_reviews_sentiment` | score (-1 to +1) | Review sentiment |
| `google_reviews_rating` | score (1-5) | Star rating |
| `google_reviews_mentions` | count | Review count |
| `facebook_sentiment` | score (-1 to +1) | Post/comment sentiment |
| `facebook_mentions` | count | Mention volume |

Metrics are sent as structured events to your configured ingestion endpoint with deterministic IDs (`ss-{platform}-{id}`) for deduplication.

## API Keys Setup

### Twitter/X

1. Create a Twitter Developer account
2. Create a project and app
3. Generate a Bearer Token (App-only auth)
4. Add to tenant config as `bearerToken`

### Google Reviews

1. Enable Places API in Google Cloud Console
2. Create an API key
3. Find your Place ID using the Place ID Finder
4. Add to tenant config as `apiKey` and `placeId`

### Facebook

1. Create a Facebook Developer account
2. Create an app with pages_read_engagement permission
3. Generate a Page Access Token
4. Add to tenant config as `pageAccessToken` and `pageId`

## Adding a New Platform Adapter

1. Create a new file in `src/adapters/` (e.g., `linkedin.ts`)
2. Implement the `PlatformAdapter` interface from `src/adapters/types.ts`
3. Add the platform to the union type in `SocialMention["platform"]`
4. Add config schema to `src/config.ts`
5. Wire up the adapter in `getEnabledAdapters()` in `src/index.ts`
6. Create tests in `tests/adapters/`

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/pii/redactor.test.ts

# Run with coverage
npm test -- --coverage
```

## Project Structure

```
social-sentinel/
├── src/
│   ├── index.ts              # Cron handler entry point
│   ├── env.ts                # Environment type definitions
│   ├── config.ts             # Tenant configuration loader
│   ├── adapters/
│   │   ├── types.ts          # Common adapter interface
│   │   ├── twitter.ts        # Twitter/X API adapter
│   │   ├── google-reviews.ts # Google Places API adapter
│   │   └── facebook.ts       # Facebook Graph API adapter
│   ├── sentiment/
│   │   └── analyzer.ts       # Workers AI sentiment analysis
│   ├── pii/
│   │   └── redactor.ts       # PII scrubbing layer
│   ├── batch/
│   │   └── builder.ts        # Event builder + batching
│   └── utils/
│       └── logging.ts        # Structured logging utilities
├── tests/                    # Test files mirror src structure
├── wrangler.toml
└── package.json
```

## Security

- **Authenticated triggers** — `POST /trigger` requires `Authorization: Bearer <token>`. Disabled by default if `TRIGGER_API_KEY` is not set.
- **PII redaction** — All mention text is scrubbed before processing or transmission.
- **Sanitized logging** — Errors are logged as structured JSON without stack traces or sensitive data.
- **PII audit trail** — Structured warnings logged when PII is detected, enabling GDPR/CCPA compliance auditing.

## License

MIT

---

Built by [Stackbilt](https://stackbilt.dev)
