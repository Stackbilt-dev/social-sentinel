# Social Sentinel

A Cloudflare Worker that monitors social media platforms for brand sentiment and feeds structured metrics into AiDoctor.

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
              POST /ingest/batch → AiDoctor
```

## Features

- **Multi-platform monitoring** - Twitter/X, Google Reviews, Facebook
- **PII redaction** - Scrubs emails, phones, addresses before sending to AiDoctor
- **Sentiment analysis** - Workers AI-powered sentiment scoring (-1 to +1)
- **Automatic deduplication** - Deterministic event IDs for AiDoctor idempotency
- **Cron-triggered** - Runs every 15 minutes

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

| Metric Name | Unit | Good Direction | Description |
|-------------|------|----------------|-------------|
| `twitter_sentiment` | score | up | Sentiment score (-1 to +1) |
| `twitter_mentions` | count | neutral | Volume of mentions |
| `google_reviews_sentiment` | score | up | Review sentiment |
| `google_reviews_rating` | score | up | Star rating (1-5) |
| `google_reviews_mentions` | count | neutral | Review count |
| `facebook_sentiment` | score | up | Post/comment sentiment |
| `facebook_mentions` | count | neutral | Mention volume |

All metrics auto-register in AiDoctor via the schema system (ADR-017).

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
│   └── batch/
│       └── builder.ts        # AiDoctor event builder
├── tests/                    # Test files mirror src structure
├── wrangler.toml
└── package.json
```

## License

MIT
