# @marketplace/core

Shared TypeScript types and utility functions used by both `functions` and `web` packages.

## Contents

### `src/types.ts`
Type definitions for the domain:
- `Listing` — Product listing structure
- `ActivityEvent` — Activity feed events (sales, comments)
- `CreateListingRequest` — API request types
- `PublishJobMessage` — SQS message format
- `EventType` — Event type enum

### `src/utils.ts`
Utility functions:
- `generateId()` — UUID generation
- `generateWebhookSignature()` / `verifyWebhookSignature()` — HMAC-SHA256 signing
- `jsonResponse()` / `errorResponse()` — Lambda response helpers
- `listingKey()` / `activityKey()` — DynamoDB key builders
- `getBackoffDelay()` — Exponential backoff calculator

## Usage

```typescript
import { Listing, ActivityEvent } from "@marketplace/core";
import { generateId, jsonResponse } from "@marketplace/core";
```

## Note on secrets

The `WEBHOOK_SECRET` constant was removed from this package. Secrets are now stored in SST Secrets and accessed via `Resource.WebhookSecret.value` in Lambda handlers.
