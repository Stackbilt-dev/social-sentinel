# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ecosystem Context

**Social Sentinel is a specialized microservice within the AiDoctor ecosystem.** It functions as a social media monitoring and brand protection tool/function that feeds data to the main AiDoctor service layer.

**Location in Ecosystem:**
- **AiDoctor Service Layer**: `C:\Users\kover\Documents\AiDoctor\src` (main service)
- **Social Sentinel**: `C:\Users\kover\Documents\SocialSentinel` (this microservice)

**Relationship:**
- Social Sentinel is NOT a standalone application - it's a data collection and analysis worker
- Runs independently as a Cloudflare Worker on a cron schedule (every 15 minutes)
- Pushes processed metric events to AiDoctor's `/ingest/batch` endpoint
- Acts as one of potentially many specialized monitoring microservices in the ecosystem
- Provides social media sentiment and brand mention metrics that AiDoctor aggregates and analyzes

When working on Social Sentinel, consider how changes affect the data contract with AiDoctor (event schema, metric names, etc.).

## Project Overview

Social Sentinel is a Cloudflare Worker that monitors social media platforms (Twitter/X, Google Reviews, Facebook) for brand mentions and sentiment. It processes mentions through PII redaction and AI sentiment analysis, then sends structured metric events to AiDoctor for monitoring.

## Development Commands

```bash
# Run tests (watch mode)
npm test

# Run tests once
npm test:run

# Type check
npm run typecheck

# Local development server (with live reload)
npm run dev

# Deploy to Cloudflare
npm run deploy

# Generate TypeScript types for Cloudflare Workers
npm run types

# Run a single test file
npm test -- tests/pii/redactor.test.ts

# Run tests with coverage
npm test -- --coverage
```

## Architecture

The worker follows a pipeline architecture triggered by cron (every 15 minutes) or manual HTTP trigger:

1. **Tenant Configuration** - Multi-tenant support via KV namespace. Each tenant can enable/disable platforms and provide API credentials.
2. **Platform Adapters** - Pluggable adapters implement the `PlatformAdapter` interface defined in `src/adapters/types.ts`. Each adapter fetches mentions and normalizes them into `SocialMention` objects.
3. **PII Redaction** - All text passes through `PIIRedactor` before processing to remove emails, phones, addresses, SSNs, etc.
4. **Sentiment Analysis** - Uses Cloudflare Workers AI (`@cf/huggingface/distilbert-sst-2-int8`) to score sentiment from -1 (negative) to +1 (positive).
5. **Event Building** - `BatchBuilder` converts mentions into AiDoctor-compatible events with deterministic IDs for deduplication.
6. **Batch Ingestion** - Events sent in batches of up to 100 to AiDoctor's `/ingest/batch` endpoint.

### Key Design Patterns

**Deterministic Event IDs**: Event IDs follow the format `ss-{platform}-{platform_id}[-suffix]` to enable 24-hour deduplication in AiDoctor. This prevents duplicate ingestion if the worker runs multiple times on the same data.

**Multi-tenant Processing**: The cron handler loads all enabled tenant configs from KV and processes them concurrently using `ctx.waitUntil()` to maximize throughput within the worker's execution limits.

**Error Isolation**: Adapter failures are caught and logged but don't block other adapters or tenants from processing. The worker continues with partial results.

**Metric Multiplexing**: Each mention generates multiple metric events:
- `{platform}_sentiment` - sentiment score (-1 to +1)
- `{platform}_mentions` - count (always 1 per mention)
- `{platform}_rating` - star rating if available (Google Reviews, Facebook)

## Configuration

### KV Namespace Setup

Tenant configurations are stored in the `TENANT_CONFIG` KV namespace. Before first deployment:

```bash
# Create KV namespace
npx wrangler kv:namespace create TENANT_CONFIG

# Update wrangler.toml with the returned namespace ID
```

### Tenant Configuration Schema

Each KV key represents a tenant. Value must conform to `TenantConfigSchema` (defined in `src/config.ts`):

```json
{
  "tenantId": "tenant-123",
  "stage": "production",
  "enabled": true,
  "platforms": {
    "twitter": {
      "enabled": true,
      "bearerToken": "AAAA...",
      "searchQuery": "@YourBrand OR \"Your Brand\""
    },
    "googleReviews": {
      "enabled": true,
      "apiKey": "AIza...",
      "placeId": "ChIJ..."
    },
    "facebook": {
      "enabled": true,
      "pageAccessToken": "EAAa...",
      "pageId": "123456789"
    }
  }
}
```

All platform configurations are optional. Only enabled platforms will be processed.

## Adding New Platform Adapters

1. Create new file in `src/adapters/` (e.g., `linkedin.ts`)
2. Implement `PlatformAdapter` interface from `src/adapters/types.ts`
3. Add platform to the union type in `SocialMention["platform"]`
4. Add config schema to `src/config.ts` (follow existing examples)
5. Wire up adapter in `getEnabledAdapters()` in `src/index.ts`
6. Create test file in `tests/adapters/`

The adapter must return `SocialMention[]` with platform-specific IDs, timestamps, and text content.

## Testing

Tests use Vitest with mocks for external dependencies (Workers AI, KV, platform APIs). Key testing patterns:

- Mock the `Ai` binding by creating an object with a `run` method
- Mock fetch for platform API calls
- Use `vi.fn()` for assertions on adapter behavior
- Coverage excludes `src/index.ts` and `src/env.ts` (entry points)

## Security Features

Social Sentinel implements several security measures validated through zero-trust red team review:

### Authentication

The `/trigger` endpoint requires authentication:
- Set `TRIGGER_API_KEY` secret to enable manual triggers
- If unset, the endpoint returns 403 (disabled by default)
- Requires `Authorization: Bearer <token>` header

```bash
# Enable manual triggers
wrangler secret put TRIGGER_API_KEY

# Usage
curl -X POST https://your-worker.workers.dev/trigger \
  -H "Authorization: Bearer YOUR_SECRET_KEY"
```

### Sanitized Error Logging

All errors are logged through `src/utils/logging.ts` utilities:
- `logError(context, error, metadata?)` - Structured JSON logs without stack traces
- Error messages sanitized to prevent information disclosure
- Metadata includes non-sensitive context (adapter name, action taken)

### PII Audit Trail

When PII is detected during redaction:
- Structured warning logged via `logPIIDetection()`
- Includes tenant ID, platform, mention ID, and timestamp
- Enables compliance audits and GDPR/CCPA tracking

## Deployment Notes

- Worker runs on cron schedule defined in `wrangler.toml` (every 15 minutes)
- Manual trigger available via `POST /trigger` (requires authentication)
- Health check available at `GET /health` (public, no auth required)
- Uses Cloudflare Workers AI binding (must be enabled on paid plan)
- KV reads are eventually consistent - config changes may take time to propagate
- Each cron invocation processes all enabled tenants concurrently

## Important Constants

- Max batch size: 100 events (configurable in `builder.getBatches()`)
- Sentiment text truncation: 500 characters (model token limit)
- Sentiment batch concurrency: 10 requests (configurable in `analyzer.analyzeBatch()`)
- Event ID prefix: `ss-` (Social Sentinel)
