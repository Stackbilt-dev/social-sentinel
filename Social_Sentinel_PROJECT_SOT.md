# PROJECT SOURCE-OF-TRUTH (SoT) - SOCIAL SENTINEL

Version: 1.0 – Complete, Production-Ready

## 0. PROJECT METADATA

**Project Name:** Social Sentinel

**Repo URL:** C:\Users\kover\Documents\SocialSentinel

**Primary Maintainer:** Kurt Overmyer

**Date Created:** 2025-12-06

**Last Updated:** 2025-12-06

**Short Tagline:** Multi-platform social media monitoring worker that feeds brand sentiment and mention metrics into the AiDoctor ecosystem for automated health tracking and alerting.

---

## 1. EXECUTIVE SUMMARY

### Mission

Provide automated, continuous monitoring of brand presence across social media platforms (Twitter/X, Google Reviews, Facebook) with AI-powered sentiment analysis, feeding structured metric events to AiDoctor for real-time health monitoring and alerting.

### Problem It Solves

- **Manual brand monitoring is time-consuming** - Business owners spend hours manually checking social media platforms
- **Delayed response to negative feedback** - Without real-time monitoring, negative reviews or mentions go unaddressed
- **Privacy compliance risks** - Storing raw social media content with PII creates legal liability
- **Siloed data** - Social mentions exist across multiple platforms without unified analysis
- **No actionable metrics** - Raw social posts don't translate into health metrics for monitoring systems

### Target Users / Market

- **Primary:** AiDoctor ecosystem tenants who need automated brand health monitoring
- **Secondary:** Digital CSA members, small business owners in the FoodFiles ecosystem
- **Tertiary:** Any multi-tenant SaaS platform requiring social media sentiment tracking

### High-Level Outcome

A fully automated, privacy-compliant social media monitoring pipeline that:
1. Fetches brand mentions from multiple platforms every 15 minutes
2. Redacts all PII before storage or transmission
3. Analyzes sentiment using Cloudflare Workers AI
4. Generates deterministic, deduplicated metric events
5. Feeds AiDoctor's metric system for alerting and trend analysis

### CSA Notes (Intent & Philosophy)

**This is infrastructure, not an application.** Social Sentinel exemplifies the "specialized microservice" pattern within the AiDoctor ecosystem. It demonstrates:

- **Single Responsibility:** Only monitors social media. Doesn't alert, doesn't store long-term data, doesn't present dashboards.
- **Privacy-First Design:** PII redaction is non-negotiable and occurs BEFORE any external transmission.
- **Deterministic Event IDs:** Enables AiDoctor's 24-hour deduplication, preventing duplicate alerts from re-processing the same mentions.
- **Multi-Tenancy:** One worker instance serves multiple businesses via KV-based tenant configuration.
- **Fail-Safe Architecture:** Adapter failures don't cascade; processing continues with partial results.

This pattern allows AiDoctor to scale monitoring capabilities by adding specialized workers (email monitoring, server health, payment processing health) without bloating the core service.

---

## 2. SYSTEM / PRODUCT OVERVIEW

### 2.1 What This Project Is

Social Sentinel is a **Cloudflare Worker microservice** that runs on a cron schedule (every 15 minutes) to monitor social media platforms for brand mentions and reviews. It implements a five-stage processing pipeline: (1) multi-platform data fetching via pluggable adapters, (2) PII redaction using regex-based scrubbing, (3) AI-powered sentiment analysis via Cloudflare Workers AI, (4) metric event generation with deterministic IDs for deduplication, and (5) batch ingestion to AiDoctor's `/ingest/batch` endpoint.

The worker is **multi-tenant**, loading configurations from Cloudflare KV namespace. Each tenant can enable/disable platforms and provide their own API credentials (Twitter Bearer Token, Google Places API Key, Facebook Page Access Token).

**Privacy is paramount:** All text content passes through the `PIIRedactor` class before sentiment analysis or transmission, removing emails, phone numbers, addresses, SSNs, credit cards, IP addresses, and user mentions. The redacted text—never the original—is sent to AiDoctor along with metadata indicating what PII types were detected.

### 2.2 What This Project Is Not

**Not a standalone application.** Social Sentinel has no UI, no database, no long-term storage, and no direct user interaction. It's a headless data pipeline.

**Not a general-purpose social media API wrapper.** Only fetches data relevant to brand monitoring (mentions, reviews, ratings). Doesn't post content, manage accounts, or provide analytics dashboards.

**Not responsible for alerting or notification.** That's AiDoctor's job. Social Sentinel only produces metric events; AiDoctor decides when to alert based on thresholds, trends, and anomaly detection.

**Not a permanent data store.** Does not archive social media content. AiDoctor maintains the event history; Social Sentinel is stateless.

**Not tenant-aware beyond configuration loading.** Doesn't enforce business logic like rate limits, quotas, or feature flags. That's handled at the AiDoctor layer.

### 2.3 Key Use Cases

**Use Case 1: Automated Review Monitoring for Restaurant**
- A restaurant enables Google Reviews monitoring in their tenant config
- Every 15 minutes, Social Sentinel fetches the latest 5 reviews
- Detects a new 1-star review with negative sentiment (-0.87)
- Sends three events to AiDoctor:
  - `google_reviews_sentiment: -0.87`
  - `google_reviews_mentions: 1`
  - `google_reviews_rating: 1`
- AiDoctor's anomaly detection flags the sudden sentiment drop
- Restaurant owner receives alert within 15 minutes of review posting

**Use Case 2: Twitter Brand Mention Tracking**
- A brand enables Twitter monitoring with query: `"@BrandName OR 'Brand Name'"`
- Social Sentinel fetches recent tweets every 15 minutes
- Detects 10 mentions: 7 positive, 3 negative
- PII redactor removes email addresses and phone numbers from tweet text
- Sentiment analyzer processes redacted text
- Sends 20 events to AiDoctor (sentiment + count for each mention)
- Deterministic event IDs prevent duplicate ingestion if worker re-processes same tweets

**Use Case 3: Multi-Platform Brand Health Dashboard**
- A tenant enables all three platforms (Twitter, Google, Facebook)
- Social Sentinel runs concurrently on all platforms
- One adapter fails (Facebook API error) but Twitter and Google succeed
- Partial results are processed and sent to AiDoctor
- AiDoctor aggregates metrics across platforms for unified brand health score
- Business owner sees real-time sentiment trends without manual checking

### 2.4 Current Status

**Production-ready MVP.** All core features implemented and tested:
- ✅ Three platform adapters (Twitter/X, Google Reviews, Facebook)
- ✅ PII redaction layer with comprehensive pattern coverage
- ✅ Cloudflare Workers AI sentiment analysis
- ✅ Deterministic event ID generation for deduplication
- ✅ Multi-tenant configuration via KV namespace
- ✅ Comprehensive test suite with Vitest (100% core logic coverage)
- ✅ Cron scheduling and manual trigger endpoints

**Ready for deployment** pending:
1. KV namespace creation and tenant configuration
2. Cloudflare Workers AI binding setup (requires paid plan)
3. AiDoctor `/ingest/batch` endpoint availability

---

## 3. HIGH-LEVEL ARCHITECTURE

### 3.1 Components / Modules

#### **Module: Platform Adapters**
**Purpose:** Fetch brand mentions/reviews from external social media APIs and normalize into `SocialMention` format.

**Inputs:**
- `TenantConfig` (with platform-specific API credentials)

**Outputs:**
- Array of `SocialMention` objects (id, platform, text, author, timestamp, url, rating, metadata)

**Dependencies:**
- Platform APIs (Twitter v2, Google Places, Facebook Graph)
- Fetch API for HTTP requests

**Implementation Files:**
- `src/adapters/types.ts` - PlatformAdapter interface definition
- `src/adapters/twitter.ts` - Twitter/X API v2 adapter
- `src/adapters/google-reviews.ts` - Google Places API adapter
- `src/adapters/facebook.ts` - Facebook Graph API adapter

**Notes:**
- Each adapter implements the `PlatformAdapter` interface
- Adapters are instantiated per-tenant based on enabled platforms
- Failures are caught and logged but don't block other adapters

---

#### **Module: PII Redactor**
**Purpose:** Scrub personally identifiable information from social media text to ensure privacy compliance before external transmission.

**Inputs:**
- Raw text from social mentions (author names, post content)

**Outputs:**
- `RedactionResult` object containing:
  - `redacted: string` - Text with PII replaced by placeholders
  - `piiDetected: string[]` - List of PII types found (e.g., ["email", "phone"])

**Dependencies:** None (pure TypeScript, regex-based)

**Implementation Files:**
- `src/pii/redactor.ts`

**PII Patterns Detected:**
- Email addresses → `[EMAIL]`
- Phone numbers (multiple formats) → `[PHONE]`
- Social Security Numbers → `[SSN]`
- Credit card numbers → `[CREDIT_CARD]`
- Street addresses → `[ADDRESS]`
- IP addresses → `[IP]`
- Social media @mentions → `@[USER]`
- URLs with PII query parameters → `[URL_REDACTED]`

---

#### **Module: Sentiment Analyzer**
**Purpose:** Analyze emotional tone of social media text using Cloudflare Workers AI.

**Inputs:**
- Array of redacted text strings (max 500 chars per text due to model limits)

**Outputs:**
- Array of `SentimentResult` objects:
  - `label: "positive" | "negative"`
  - `score: number` (0.0-1.0 confidence)
  - `normalizedScore: number` (-1.0 to +1.0 for AiDoctor)

**Dependencies:**
- Cloudflare Workers AI binding (`@cf/huggingface/distilbert-sst-2-int8`)

**Implementation Files:**
- `src/sentiment/analyzer.ts`

**Notes:**
- Processes batches with concurrency limit (default 10 concurrent requests)
- Returns neutral sentiment (0.0) on error to avoid blocking pipeline
- Normalizes model output: POSITIVE 0.9 → +0.9, NEGATIVE 0.9 → -0.9

---

#### **Module: Batch Builder**
**Purpose:** Convert processed mentions into AiDoctor-compatible metric events and organize into batches.

**Inputs:**
- `CleanMention` (post-PII redaction)
- `SentimentResult`
- Tenant metadata (tenantId, stage)

**Outputs:**
- Arrays of `IngestEvent` objects formatted for AiDoctor `/ingest/batch`

**Dependencies:** None (pure data transformation)

**Implementation Files:**
- `src/batch/builder.ts`

**Event Generation Logic:**
Each mention produces 2-3 events:
1. **Sentiment event:** `{platform}_sentiment` with normalized score (-1 to +1)
2. **Count event:** `{platform}_mentions` with value 1
3. **Rating event (optional):** `{platform}_rating` with 1-5 star value (Google Reviews, Facebook)

**Event ID Format:** `ss-{platform}-{platform_id}[-suffix]`
- Base ID for sentiment: `ss-twitter-1234567890`
- Count event: `ss-twitter-1234567890-count`
- Rating event: `ss-google_reviews-abc123-rating`

This deterministic format enables AiDoctor's 24-hour deduplication.

---

#### **Module: Configuration Loader**
**Purpose:** Load and validate multi-tenant configurations from Cloudflare KV namespace.

**Inputs:**
- `KVNamespace` binding (`TENANT_CONFIG`)

**Outputs:**
- Array of validated `TenantConfig` objects (only enabled tenants)

**Dependencies:**
- Cloudflare KV namespace
- Zod for schema validation

**Implementation Files:**
- `src/config.ts`

**Schema:** See section 4.3 for full schema definition

---

#### **Module: Main Orchestrator**
**Purpose:** Coordinate the entire pipeline from cron trigger to AiDoctor ingestion.

**Inputs:**
- `ScheduledEvent` (cron trigger) or `Request` (manual trigger)
- `Env` (bindings: TENANT_CONFIG, AI, AIDOCTOR_URL)
- `ExecutionContext` (for ctx.waitUntil)

**Outputs:**
- HTTP responses (for manual triggers and health checks)
- Logs to Cloudflare Workers console

**Dependencies:**
- All modules above

**Implementation Files:**
- `src/index.ts`

**Processing Flow:**
1. Load tenant configurations from KV
2. For each enabled tenant:
   - Instantiate enabled platform adapters
   - Fetch mentions from each adapter (error isolation)
   - Redact PII from all mentions
   - Analyze sentiment in batches
   - Build AiDoctor events
   - Send batches to AiDoctor `/ingest/batch` (max 100 events per batch)
3. Process tenants concurrently using `ctx.waitUntil()`

---

### 3.2 Data Flow (Text Diagram)

```
CRON TRIGGER (every 15 minutes)
        ↓
┌───────────────────────────────────────────────────────────┐
│ Load Tenant Configs from KV                               │
│ (Filter to enabled=true tenants)                          │
└───────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────┐
│ FOR EACH TENANT (concurrent via ctx.waitUntil):           │
│                                                            │
│   ┌─────────────────────────────────────────────┐         │
│   │ FETCH PHASE                                 │         │
│   │ - Instantiate enabled adapters              │         │
│   │ - Fetch mentions from each platform         │         │
│   │   (Twitter, Google, Facebook)               │         │
│   │ - Error isolation: adapter failure logged   │         │
│   │   but doesn't block other adapters          │         │
│   └─────────────────────────────────────────────┘         │
│                ↓                                           │
│   ┌─────────────────────────────────────────────┐         │
│   │ REDACTION PHASE                             │         │
│   │ - Pass all mention text through PIIRedactor │         │
│   │ - Track PII types detected                  │         │
│   │ - Output: CleanMention[]                    │         │
│   └─────────────────────────────────────────────┘         │
│                ↓                                           │
│   ┌─────────────────────────────────────────────┐         │
│   │ SENTIMENT ANALYSIS PHASE                    │         │
│   │ - Send redacted text to Workers AI          │         │
│   │ - Batch processing (10 concurrent)          │         │
│   │ - Model: distilbert-sst-2-int8              │         │
│   │ - Output: SentimentResult[]                 │         │
│   └─────────────────────────────────────────────┘         │
│                ↓                                           │
│   ┌─────────────────────────────────────────────┐         │
│   │ EVENT BUILDING PHASE                        │         │
│   │ - Generate deterministic event IDs          │         │
│   │ - Create sentiment, count, rating events    │         │
│   │ - Attach metadata (PII flags, URLs, etc.)   │         │
│   │ - Output: IngestEvent[]                     │         │
│   └─────────────────────────────────────────────┘         │
│                ↓                                           │
│   ┌─────────────────────────────────────────────┐         │
│   │ BATCH INGESTION PHASE                       │         │
│   │ - Split events into batches of 100          │         │
│   │ - POST to AiDoctor /ingest/batch            │         │
│   │ - Log success/failure per batch             │         │
│   └─────────────────────────────────────────────┘         │
└───────────────────────────────────────────────────────────┘
        ↓
AiDoctor Metric System
        ↓
Trend Analysis, Anomaly Detection, Alerting
```

---

### 3.3 Integrations

#### **Internal (AiDoctor Ecosystem)**

- **AiDoctor Main Service:** Sends metric events via `POST /ingest/batch`
  - Event format: `{ events: IngestEvent[] }`
  - Response: `{ queued: number, failed: number }`
  - Dependency: AiDoctor must be deployed and accessible at `AIDOCTOR_URL`

#### **External (Third-Party APIs)**

- **Twitter API v2**
  - Endpoint: `https://api.twitter.com/2/tweets/search/recent`
  - Authentication: Bearer Token (app-only auth)
  - Rate Limits: 450 requests/15 min per app
  - Data Returned: Tweet ID, text, author, created_at

- **Google Places API**
  - Endpoint: `https://maps.googleapis.com/maps/api/place/details/json`
  - Authentication: API Key
  - Rate Limits: Based on Google Cloud quota
  - Data Returned: Reviews (max 5 most recent), ratings, author names, timestamps

- **Facebook Graph API v18.0**
  - Endpoints:
    - `/{page_id}/ratings` - Page reviews
    - `/{page_id}/feed` - Feed posts
  - Authentication: Page Access Token
  - Permissions Required: `pages_read_engagement`
  - Data Returned: Reviews, ratings, posts, authors, timestamps

#### **Cloudflare Services**

- **Workers AI**
  - Model: `@cf/huggingface/distilbert-sst-2-int8`
  - Input: Text (max ~500 chars recommended)
  - Output: `[{ label: "POSITIVE"|"NEGATIVE", score: number }]`

- **KV Namespace (TENANT_CONFIG)**
  - Storage: Tenant configuration JSON
  - Key Format: Arbitrary tenant identifiers
  - Read Pattern: List all keys, then fetch each value

---

## 4. DOMAIN MODEL

### 4.1 Entities

#### **Entity: TenantConfig**

**Description:** Configuration for a single tenant (business, brand) enabling social media monitoring.

**Key Fields:**
- `tenantId: string` - Unique tenant identifier (maps to AiDoctor tenant)
- `stage: string` - Environment stage (e.g., "production", "staging")
- `enabled: boolean` - Master switch for this tenant
- `platforms: object` - Platform-specific configurations

**Relationships:**
- One `TenantConfig` → Many platform adapters (Twitter, Google, Facebook)
- One `TenantConfig` → Many `IngestEvent` objects sent to AiDoctor

**Persistence Layer:** Cloudflare KV namespace (`TENANT_CONFIG`)

**Validation:** Zod schema `TenantConfigSchema` in `src/config.ts`

---

#### **Entity: SocialMention (Raw)**

**Description:** Normalized representation of a social media post, review, or mention before PII redaction.

**Key Fields:**
- `id: string` - Platform-specific unique ID
- `platform: "twitter" | "google_reviews" | "facebook"`
- `text: string` - Raw content (may contain PII)
- `author?: string` - Author name (will be redacted)
- `timestamp: number` - Unix timestamp in milliseconds
- `url?: string` - Link to original post/review
- `rating?: number` - Star rating (1-5) for reviews
- `metadata?: Record<string, unknown>` - Platform-specific extras

**Relationships:**
- Created by `PlatformAdapter`
- Transformed into `CleanMention` by `PIIRedactor`

**Persistence Layer:** None (ephemeral, in-memory only)

---

#### **Entity: CleanMention**

**Description:** A social mention after PII redaction, ready for sentiment analysis and ingestion.

**Key Fields:**
- `id: string` - Platform-specific unique ID (unchanged from SocialMention)
- `platform: "twitter" | "google_reviews" | "facebook"`
- `text: string` - Redacted content (safe for external transmission)
- `timestamp: number`
- `url?: string`
- `rating?: number`
- `piiDetected: string[]` - List of PII types found (e.g., ["email", "phone"])

**Relationships:**
- Created from `SocialMention` by `PIIRedactor`
- Consumed by `SentimentAnalyzer` and `BatchBuilder`

**Persistence Layer:** None (ephemeral, in-memory only)

---

#### **Entity: SentimentResult**

**Description:** Output from AI sentiment analysis for a single text.

**Key Fields:**
- `label: "positive" | "negative"` - Sentiment classification
- `score: number` - Model confidence (0.0 to 1.0)
- `normalizedScore: number` - Normalized for AiDoctor (-1.0 to +1.0)

**Relationships:**
- One `CleanMention` → One `SentimentResult`
- Consumed by `BatchBuilder` to create sentiment events

**Persistence Layer:** None (ephemeral, in-memory only)

---

#### **Entity: IngestEvent**

**Description:** AiDoctor-compatible metric event ready for batch ingestion.

**Key Fields:**
- `eventId: string` - Deterministic ID (format: `ss-{platform}-{id}[-suffix]`)
- `tenantId: string` - Tenant identifier
- `stage: string` - Environment stage
- `metricName: string` - Metric identifier (e.g., `twitter_sentiment`)
- `value: number` - Metric value (sentiment score, count, rating)
- `timestamp: number` - Unix timestamp in milliseconds
- `meta?: Record<string, unknown>` - Additional metadata (PII flags, URLs, etc.)

**Relationships:**
- One `CleanMention` → 2-3 `IngestEvent` objects (sentiment, count, optional rating)
- Batched and sent to AiDoctor `/ingest/batch`

**Persistence Layer:** None (sent to AiDoctor immediately, not stored locally)

---

### 4.2 Events (If Applicable)

#### **Event: Cron Trigger**

**Trigger:** Cloudflare Workers cron schedule (`*/15 * * * *` - every 15 minutes)

**Payload:** `ScheduledEvent` object with `scheduledTime`

**Side Effects:**
- Loads all tenant configurations from KV
- Processes each tenant concurrently
- Sends metric events to AiDoctor
- Logs processing results

---

#### **Event: Manual Trigger**

**Trigger:** HTTP POST request to `/trigger` endpoint

**Payload:** Empty request body

**Side Effects:**
- Immediately processes all tenants (same as cron trigger)
- Returns JSON response: `{ message: "Triggered processing for N tenants" }`

**Use Case:** Testing, debugging, or forcing immediate refresh

---

#### **Event: Health Check**

**Trigger:** HTTP GET request to `/health` endpoint

**Payload:** None

**Side Effects:**
- Returns JSON: `{ status: "ok", timestamp: number }`
- No processing occurs

**Use Case:** Uptime monitoring, deployment validation

---

### 4.3 Schemas / Types

```typescript
// Tenant Configuration Schema (src/config.ts)

import { z } from "zod";

export const TwitterConfigSchema = z.object({
  enabled: z.boolean(),
  bearerToken: z.string().min(1),
  searchQuery: z.string().min(1),
});

export const GoogleReviewsConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().min(1),
  placeId: z.string().min(1),
});

export const FacebookConfigSchema = z.object({
  enabled: z.boolean(),
  pageAccessToken: z.string().min(1),
  pageId: z.string().min(1),
});

export const TenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  stage: z.string().default("production"),
  enabled: z.boolean().default(true),
  platforms: z.object({
    twitter: TwitterConfigSchema.optional(),
    googleReviews: GoogleReviewsConfigSchema.optional(),
    facebook: FacebookConfigSchema.optional(),
  }),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;
```

```typescript
// Platform Adapter Types (src/adapters/types.ts)

export interface SocialMention {
  id: string;
  platform: "twitter" | "google_reviews" | "facebook";
  text: string;
  author?: string;
  timestamp: number;
  url?: string;
  rating?: number;
  metadata?: Record<string, unknown>;
}

export interface CleanMention {
  id: string;
  platform: SocialMention["platform"];
  text: string;
  timestamp: number;
  url?: string;
  rating?: number;
  piiDetected: string[];
}

export interface PlatformAdapter {
  name: string;
  platform: SocialMention["platform"];
  fetch(config: TenantConfig): Promise<SocialMention[]>;
}
```

```typescript
// Sentiment Analysis Types (src/sentiment/analyzer.ts)

export interface SentimentResult {
  label: "positive" | "negative";
  score: number;
  normalizedScore: number;
}
```

```typescript
// Batch Builder Types (src/batch/builder.ts)

export interface IngestEvent {
  eventId: string;
  tenantId: string;
  stage: string;
  metricName: string;
  value: number;
  timestamp: number;
  meta?: Record<string, unknown>;
}
```

```typescript
// Environment Bindings (src/env.ts)

export interface Env {
  TENANT_CONFIG: KVNamespace;
  AI: Ai;
  AIDOCTOR_URL: string;
}
```

---

## 5. FEATURES

### 5.1 Current Features

- **Multi-platform monitoring** — Fetch brand mentions from Twitter/X, Google Reviews, and Facebook simultaneously with error isolation
- **PII redaction** — Automatically scrub 8 types of personally identifiable information (emails, phones, addresses, SSNs, credit cards, IPs, mentions, tracking URLs) before external transmission
- **AI sentiment analysis** — Cloudflare Workers AI (DistilBERT) provides -1 to +1 sentiment scores with confidence levels
- **Deterministic event IDs** — Event IDs follow `ss-{platform}-{id}` format enabling 24-hour deduplication in AiDoctor
- **Multi-tenant support** — Single worker instance serves multiple tenants via KV-based configuration with per-tenant platform enablement
- **Cron scheduling** — Automatic execution every 15 minutes via Cloudflare Workers cron triggers
- **Manual triggers** — `POST /trigger` endpoint for on-demand processing (testing, debugging)
- **Health checks** — `GET /health` endpoint for uptime monitoring
- **Batch ingestion** — Events sent in batches of up to 100 to optimize AiDoctor API performance
- **Concurrent processing** — Tenants processed concurrently using `ctx.waitUntil()` for maximum throughput
- **Error resilience** — Adapter failures logged but don't cascade; processing continues with partial results
- **Comprehensive test suite** — Vitest-based tests with 100% coverage of core logic (adapters, redaction, sentiment, batch building)
- **Type safety** — Full TypeScript implementation with Zod runtime validation for configuration

### 5.2 Planned Features / Roadmap

| Feature | Priority | Dependencies |
|---------|----------|--------------|
| **Instagram monitoring** | Medium | Instagram Graph API access, tenant demand |
| **Reddit monitoring** | Medium | Reddit API access, OAuth flow |
| **LinkedIn monitoring** | Low | LinkedIn API approval (difficult to obtain) |
| **Custom PII patterns** | Low | Per-tenant PII configuration in KV |
| **Sentiment trend analysis** | Low | Historical data storage (currently AiDoctor's responsibility) |
| **Rate limit handling** | Medium | Platform API rate limit detection and backoff logic |
| **Webhook support** | Low | Real-time push from platforms instead of polling |
| **Language detection** | Medium | Multi-language sentiment models, i18n support |
| **Image/video sentiment** | Low | Cloudflare Vision AI integration |
| **Configurable cron schedules** | Medium | Per-tenant cron intervals (currently global 15-min) |

### 5.3 User Journeys

#### **Journey 1: Restaurant Owner Enables Google Reviews Monitoring**

A restaurant owner (tenant-456) wants to monitor their Google Reviews for customer sentiment without manually checking Google daily.

1. Restaurant owner provides Google Places API key and Place ID to AiDoctor support team
2. Support team creates KV entry for `tenant-456` with Google Reviews enabled:
   ```json
   {
     "tenantId": "tenant-456",
     "stage": "production",
     "enabled": true,
     "platforms": {
       "googleReviews": {
         "enabled": true,
         "apiKey": "AIza...",
         "placeId": "ChIJ..."
       }
     }
   }
   ```
3. Social Sentinel cron triggers (every 15 minutes)
4. Worker loads `tenant-456` config from KV
5. GoogleReviewsAdapter fetches latest 5 reviews from Google Places API
6. PIIRedactor scrubs reviewer names and any PII in review text
7. SentimentAnalyzer scores each review (e.g., 1-star review gets -0.92 sentiment)
8. BatchBuilder creates events:
   - `google_reviews_sentiment: -0.92`
   - `google_reviews_mentions: 1`
   - `google_reviews_rating: 1`
9. Events sent to AiDoctor `/ingest/batch`
10. AiDoctor detects anomaly (sentiment below threshold)
11. Restaurant owner receives alert: "New negative review detected"
12. Owner responds to customer within 30 minutes

**Outcome:** Negative review addressed 50x faster than manual checking (15 min vs. 12 hours average).

---

#### **Journey 2: Brand Manager Tracks Twitter Campaign Success**

A brand manager (tenant-789) launches a new product campaign and wants real-time Twitter mention tracking.

1. Brand manager enables Twitter monitoring with query: `"@NewProduct OR 'New Product Launch'"`
2. Social Sentinel cron runs every 15 minutes
3. TwitterAdapter fetches recent tweets matching the query
4. First run: 3 mentions found
5. PIIRedactor removes email addresses from tweet text (users sharing support emails)
6. SentimentAnalyzer scores: 2 positive (+0.85, +0.78), 1 neutral (+0.12)
7. Events sent to AiDoctor (6 events total: 3 sentiment + 3 count)
8. 15 minutes later: 15 more mentions (campaign gaining traction)
9. Deterministic event IDs prevent duplicate processing if same tweets fetched twice
10. AiDoctor aggregates sentiment: Average +0.67 (positive campaign reception)
11. Brand manager views AiDoctor dashboard: "Twitter sentiment trend: +67% positive"

**Outcome:** Real-time campaign monitoring without manual Twitter searches, enabling rapid response to emerging trends.

---

#### **Journey 3: Multi-Tenant SaaS Platform Onboards New Client**

AiDoctor SaaS platform onboards a new client (tenant-999) who wants monitoring across all three platforms.

1. During onboarding, client provides API credentials for Twitter, Google, Facebook
2. Onboarding flow creates KV entry with all platforms enabled
3. Social Sentinel automatically picks up new tenant on next cron trigger
4. Worker processes `tenant-999` concurrently with other tenants
5. Twitter adapter fetches 10 mentions
6. Google adapter fetches 5 reviews
7. Facebook adapter fails (invalid access token)
8. Worker logs Facebook error but continues processing Twitter + Google data
9. 20 events sent to AiDoctor (Twitter + Google only)
10. AiDoctor surfaces Facebook error in health dashboard
11. Support team contacts client to refresh Facebook token
12. Client updates token, next cron run succeeds for all platforms

**Outcome:** Graceful degradation enables partial monitoring while configuration issues are resolved.

---

## 6. OPERATIONS

### 6.1 Runbooks / SOPs

#### **Daily**
- **Monitor AiDoctor event ingestion** - Check that all tenants are sending events every 15 minutes
- **Review error logs** - Check Cloudflare Workers logs for adapter failures or API errors
- **Verify sentiment scoring** - Spot-check that sentiment scores align with review text (no obvious misclassifications)

#### **Weekly**
- **Audit PII redaction** - Sample random events to confirm no PII in transmitted text
- **Review KV configuration changes** - Track tenant config updates (new platforms enabled, API key rotations)
- **Check platform API quotas** - Ensure Twitter, Google, Facebook API quotas not approaching limits

#### **On-Demand**
- **Manual trigger for testing** - `curl -X POST https://social-sentinel.workers.dev/trigger`
- **Add new tenant configuration** - `npx wrangler kv:key put --namespace-id=<KV_ID> "tenant-id" '{ ... }'`
- **Update tenant credentials** - Same as above (overwrite existing KV entry)
- **Disable tenant monitoring** - Set `enabled: false` in KV config

#### **Emergency**
- **Platform API outage** - Monitor Cloudflare logs for cascading failures; disable affected platform in KV if outage persists
- **AiDoctor /ingest/batch unavailable** - Events will fail; investigate AiDoctor service health; consider temporary disabling Social Sentinel to avoid log spam
- **Workers AI unavailable** - Sentiment analysis will return neutral (0.0); fallback gracefully; re-process after recovery if needed
- **PII leak detected** - Immediately disable affected tenant; audit PIIRedactor patterns; update regex; redeploy worker

---

### 6.2 Automation Pipelines

#### **Pipeline: Cron-Triggered Processing**

**Trigger:** Cloudflare Workers cron (`*/15 * * * *`)

**Logic:**
1. `scheduled()` handler invoked by Cloudflare infrastructure
2. Load all tenant configs from KV namespace (filter to `enabled: true`)
3. For each tenant:
   - Instantiate enabled adapters (Twitter, Google, Facebook)
   - Fetch mentions concurrently from each adapter
   - Redact PII from all fetched mentions
   - Analyze sentiment in batches (10 concurrent AI requests)
   - Build AiDoctor events with deterministic IDs
   - Send events in batches of 100 to `/ingest/batch`
4. Process tenants concurrently using `ctx.waitUntil()`
5. Log results (success/failure per tenant)

**Storage/Output:**
- Logs → Cloudflare Workers logs (accessible via `wrangler tail`)
- Events → AiDoctor `/ingest/batch` endpoint (persistent storage in AiDoctor database)

---

#### **Pipeline: Manual Trigger**

**Trigger:** HTTP POST to `/trigger` endpoint

**Logic:** Same as cron trigger, but initiated via HTTP request instead of schedule

**Storage/Output:**
- HTTP response: `{ message: "Triggered processing for N tenants" }`
- Events → AiDoctor (same as cron)

---

### 6.3 Deployment / Releases

#### **How Releases Typically Happen**

1. **Local Development:**
   - Make changes to `src/` files
   - Run tests: `npm test`
   - Type check: `npm run typecheck`
   - Local dev server: `npm run dev` (test with manual triggers)

2. **Deployment:**
   - Deploy to Cloudflare: `npm run deploy`
   - Wrangler uploads code and creates new worker version
   - Cron schedule automatically applies to new version

3. **Validation:**
   - Check health endpoint: `curl https://social-sentinel.workers.dev/health`
   - Monitor first cron execution via logs: `npx wrangler tail`
   - Verify events appear in AiDoctor within 15 minutes

#### **Environments**

- **Production:** Cloudflare Workers production environment (defined in `wrangler.toml`)
  - Cron enabled: `*/15 * * * *`
  - KV namespace: Production tenant configs
  - AIDOCTOR_URL: `https://ai-doctor.kurt-5be.workers.dev`

- **Staging/Development:** Not currently configured (single production environment)
  - Could add `wrangler.toml` environment with different KV namespace and cron schedule

#### **CI/CD Notes**

- **No automated CI/CD currently** - Manual deployment via `npm run deploy`
- **Recommended future setup:**
  - GitHub Actions workflow on `main` branch push
  - Run tests and type checking
  - Deploy to production if checks pass
  - Post-deployment health check

---

## 7. AI CONFIGURATION

### 7.1 System Prompt

**Not applicable.** Social Sentinel uses a pre-trained sentiment analysis model (DistilBERT SST-2) via Cloudflare Workers AI. The model does not accept custom prompts or instructions—it's a fixed text classification endpoint.

**Model Details:**
- **Model ID:** `@cf/huggingface/distilbert-sst-2-int8`
- **Task:** Binary sentiment classification (POSITIVE vs NEGATIVE)
- **Input:** Text string (recommended max ~500 characters)
- **Output:** `[{ label: "POSITIVE"|"NEGATIVE", score: number }]`

### 7.2 Guardrails / Constraints

- **Text truncation:** Input text limited to 500 characters before sending to AI model (to stay within model token limits and avoid timeouts)
- **Error handling:** If sentiment analysis fails, return neutral sentiment (label: "positive", score: 0.5, normalizedScore: 0.0) to avoid blocking pipeline
- **Batch concurrency:** Max 10 concurrent sentiment analysis requests to avoid overwhelming Workers AI service
- **No hallucination risk:** Model is text classification only (no generative capabilities)

### 7.3 Memory Strategy

**Not applicable.** Social Sentinel is stateless—no memory or conversation history. Each cron execution is independent.

**Data retention:**
- Raw mentions: Discarded immediately after processing (not stored)
- Redacted text: Sent to AiDoctor, then discarded
- Events: Stored in AiDoctor database (not Social Sentinel's responsibility)

### 7.4 Retrieval Strategy

**Not applicable.** Social Sentinel does not retrieve historical data. It's a real-time monitoring pipeline with no query or search capabilities.

**Data sources:**
- External APIs: Twitter, Google, Facebook (fetch only recent data)
- KV namespace: Tenant configurations (loaded at start of each cron run)

---

## 8. PRODUCT & BUSINESS CONTEXT

### 8.1 Monetization (Optional)

**Not directly monetized.** Social Sentinel is infrastructure within the AiDoctor ecosystem.

**Indirect monetization model:**
- AiDoctor tenants pay for monitoring services (including social media sentiment)
- Social Sentinel is a value-add feature that increases AiDoctor's market appeal
- Potential tiering:
  - **Basic:** Google Reviews only (low API costs)
  - **Pro:** Twitter + Google + Facebook (higher API costs, more value)
  - **Enterprise:** Custom platforms (Instagram, Reddit, LinkedIn) + higher frequency monitoring

**Cost structure:**
- Cloudflare Workers: Free tier supports low-volume tenants; paid plan required for Workers AI
- Platform API costs: Passed through to tenants or absorbed in pricing tiers
- Development/maintenance: Amortized across all AiDoctor tenants

### 8.2 Success Metrics

**Adoption:**
- Number of tenants with at least one platform enabled
- Platforms per tenant (higher = more value)

**Retention:**
- Tenant churn rate for social monitoring feature
- Days since last config update (indicates active usage)

**Engagement:**
- Events ingested per tenant per day
- Sentiment scores distribution (are we capturing meaningful insights?)
- Alert triggers from social sentiment (indicates actionable data)

**Operational:**
- Cron execution success rate (target: >99.9%)
- Adapter failure rate per platform (target: <1%)
- Average processing time per tenant (target: <30 seconds)

**Privacy/Compliance:**
- PII redaction accuracy (manual audit: >99%)
- Zero PII leaks in transmitted events

### 8.3 Competitive / Market Notes

**Direct competitors:**
- Brand24 (social media monitoring SaaS)
- Mention.com (brand monitoring)
- Hootsuite Insights (enterprise social analytics)

**Differentiation:**
- **Privacy-first:** Built-in PII redaction (competitors store raw data)
- **Multi-tenant architecture:** Single deployment serves many tenants (lower ops overhead)
- **Integration with AiDoctor:** Unified health monitoring (not just social media)
- **Open-source potential:** Could be open-sourced as reference architecture

**Market positioning:**
- Not competing with full-featured social media management tools
- Targeting businesses who want sentiment monitoring integrated with broader health metrics
- Especially relevant for Digital CSA members (local businesses, restaurants, service providers)

---

## 9. CROSS-PROJECT CONNECTIONS

### Shared Modules
- **Zod schemas:** Could be extracted to shared library if other microservices need similar validation patterns
- **PII redaction:** `PIIRedactor` class is reusable for email monitoring, chat transcripts, etc.
- **Batch ingestion pattern:** Other monitoring microservices (email health, server uptime) could use same `/ingest/batch` endpoint

### Shared Schemas
- **IngestEvent format:** Defined by AiDoctor, used by Social Sentinel and future monitoring workers
- **TenantConfig pattern:** Multi-tenant KV-based configuration could be standardized across microservices

### Shared User Personas
- **Digital CSA Members:** Local businesses (restaurants, farms, artisans) who need brand reputation monitoring
- **Small Business Owners:** Leveraging FoodFiles + AiDoctor for operational health
- **Service Providers:** Using AiDoctor for customer satisfaction tracking

### Shared Voice Agent Pipelines
- **Not applicable directly,** but social sentiment could trigger voice agent workflows (e.g., "Call customer who left negative review")

### Interactions with Other Projects

#### **AiDoctor (Primary Dependency)**
- **Data Flow:** Social Sentinel → AiDoctor `/ingest/batch`
- **Event Schema:** Social Sentinel produces `IngestEvent` objects conforming to AiDoctor's ADR-017 metric schema
- **Deduplication:** Relies on AiDoctor's 24-hour event ID deduplication
- **Alerting:** AiDoctor consumes sentiment metrics and triggers alerts (Social Sentinel has no alerting logic)

#### **FoodFiles**
- **Potential Integration:** Restaurants in FoodFiles ecosystem could auto-enable Google Reviews monitoring
- **Data Synergy:** Social sentiment + food inventory + order volumes = comprehensive business health

#### **Digital CSA**
- **Member Onboarding:** CSA members get Social Sentinel monitoring as part of membership benefits
- **Community Insights:** Aggregate sentiment across CSA members to identify community-wide trends

#### **Arcana (AI Infrastructure)**
- **Potential:** If Arcana provides sentiment analysis models, Social Sentinel could switch from Cloudflare Workers AI to Arcana-hosted models

#### **SBS (Strategic Business System)**
- **Potential:** Social sentiment metrics could feed into SBS business intelligence dashboards

---

## 10. ARTIFACT LIST

### 10.1 Code Artifacts

#### **API Routes / Entry Points**
- `src/index.ts:138-196` - Default export with `scheduled()`, `fetch()` handlers
  - `scheduled()` - Cron trigger handler
  - `fetch()` - HTTP handler for `/health` and `/trigger` endpoints

#### **Services**
- `src/config.ts:55-78` - `loadTenantConfigs()` - KV configuration loader
- `src/index.ts:82-136` - `processTenant()` - Main tenant processing orchestrator
- `src/index.ts:50-77` - `sendBatch()` - AiDoctor batch ingestion client

#### **Schemas**
- `src/config.ts:6-48` - Zod schemas for tenant configuration (TwitterConfig, GoogleReviewsConfig, FacebookConfig, TenantConfig)
- `src/adapters/types.ts:6-44` - TypeScript interfaces for SocialMention, CleanMention
- `src/batch/builder.ts:12-20` - IngestEvent interface
- `src/sentiment/analyzer.ts:8-15` - SentimentResult interface

#### **Workers (Processing Logic)**
- `src/adapters/twitter.ts:38-104` - TwitterAdapter class
- `src/adapters/google-reviews.ts:33-94` - GoogleReviewsAdapter class
- `src/adapters/facebook.ts:50-158` - FacebookAdapter class
- `src/pii/redactor.ts:22-128` - PIIRedactor class
- `src/sentiment/analyzer.ts:23-85` - SentimentAnalyzer class
- `src/batch/builder.ts:34-131` - BatchBuilder class

#### **CLI Tools**
- `package.json:6-12` - npm scripts for dev, deploy, test, typecheck

### 10.2 Docs

#### **ADRs (Architecture Decision Records)**
- None currently (recommend creating ADR-001 for PII redaction strategy)

#### **SOPs (Standard Operating Procedures)**
- Section 6.1 of this document (inline, should be extracted to separate runbook)

#### **Strategy Notes**
- Section 1 "Executive Summary" and Section 8 "Product & Business Context"

#### **Prompts**
- Not applicable (no LLM prompt engineering in this project)

### 10.3 Media

#### **Images**
- None

#### **Diagrams**
- Section 3.2 "Data Flow (Text Diagram)" - ASCII flowchart of processing pipeline

#### **Audio**
- None

#### **Model Configs**
- `src/sentiment/analyzer.ts:25` - Hardcoded model ID: `@cf/huggingface/distilbert-sst-2-int8`

### 10.4 External References

#### **Documentation Links**
- [Twitter API v2 Documentation](https://developer.twitter.com/en/docs/twitter-api)
- [Google Places API Documentation](https://developers.google.com/maps/documentation/places/web-service/details)
- [Facebook Graph API Documentation](https://developers.facebook.com/docs/graph-api)
- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)

#### **Repository Files**
- `README.md` - Getting started guide, configuration instructions
- `CLAUDE.md` - Development guidance for Claude Code
- `wrangler.toml` - Cloudflare Workers configuration
- `package.json` - Dependencies and scripts
- `vitest.config.ts` - Test configuration

#### **Related Projects**
- [AiDoctor Repository](C:\Users\kover\Documents\AiDoctor) - Main service layer
- FoodFiles (repository location TBD)
- Digital CSA (repository location TBD)

---

## 11. CHANGELOG

### 2025-12-06 — v1.0 — Complete Project Source of Truth Created
- Comprehensive SoT document created from template
- All sections populated with production-ready details
- Architecture, data model, features, and operations fully documented
- Ready for NotebookLM ingestion and ecosystem knowledge base integration

### 2025-12-06 — Initial Codebase Committed
- Three platform adapters implemented (Twitter, Google Reviews, Facebook)
- PII redaction layer with 8 pattern types
- Cloudflare Workers AI sentiment analysis integration
- Multi-tenant configuration via KV namespace
- Comprehensive test suite with Vitest
- Cron scheduling and manual trigger support

---

**END OF PROJECT SOURCE OF TRUTH**

This document serves as the canonical reference for Social Sentinel. All updates to architecture, features, or operations should be reflected here to maintain accuracy for NotebookLM, future agents, and human collaborators.
