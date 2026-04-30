# Marketplace Aggregator

A prototype marketplace aggregation system that lets sellers list products once and publish to multiple marketplaces, with an aggregated activity feed for sales, comments, and questions.

> **See also:** 
> - [APPROACH.md](./APPROACH.md) — Summary of architecture, safety, and cost
> - [docs/deliverable_1.md](./docs/deliverable_1.md) — Detailed approach document with eBay reference analysis
> - [scripts/README.md](./scripts/README.md) — **Mock / sample data**: `pnpm seed`, `pnpm reset-seed`, concurrency and retry options
> - [packages/functions/README.md](./packages/functions/README.md) — Lambda handlers (`POST /listings`, workers, mock marketplace)

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│   React Web     │────▶│   Main API      │────▶│  Mock Marketplace   │
│   (CloudFront)  │     │   (API Gateway) │     │  (API Gateway)      │
└─────────────────┘     └────────┬────────┘     └──────────┬──────────┘
                                 │                         │
                        ┌────────▼────────┐                │
                        │   SQS Queue     │                │
                        │   (Publish)     │                │
                        └────────┬────────┘                │
                                 │                         │
                        ┌────────▼────────┐                │
                        │  Publish Worker │◀───────────────┘
                        │   (Lambda)      │    (webhooks)
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │   DynamoDB      │
                        │   (On-Demand)   │
                        └─────────────────┘
```

## Prerequisites

- Node.js 20.19+ (or 22.12+) recommended
- AWS CLI configured with credentials (`aws configure`)
- pnpm (recommended) or npm

### AWS SSO (IAM Identity Center)

The AWS CLI loads `~/.aws/config` for SSO automatically. **Pulumi** (used by SST) often needs the same session in **environment-variable** form.

This repo runs SST through `scripts/run-with-aws.sh`, which runs:

```bash
aws configure export-credentials --profile bob --format env
```

…and injects the resulting `AWS_ACCESS_KEY_ID` / `AWS_SESSION_TOKEN` for that shell. **Log in first:**

```bash
aws sso login --profile bob
pnpm dev
```

Override the profile:

```bash
export AWS_PROFILE=other
pnpm dev
```

Requires **AWS CLI v2** (`aws configure export-credentials`).

**If `pnpm dev` still fails with `ExpiredTokenException`:**

1. Confirm the CLI session is valid: `aws sts get-caller-identity --profile bob`
2. Clear stale keys from your shell: `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN`
3. Run SST directly with exported creds (manual check):

   ```bash
   eval "$(aws configure export-credentials --profile bob --format env)"
   pnpm exec sst dev
   ```

## Quick Start

```bash
# Install dependencies
pnpm install

# Deploy to AWS (dev stage)
pnpm dev

# Or deploy to production
pnpm deploy
```

To wipe mock **DynamoDB** data and stuck **publish-queue** messages, then reload the ten demo listings: `pnpm reset-seed "<apiUrl>"` (same AWS session as above). Full options: **[`scripts/README.md`](./scripts/README.md)** (also **`pnpm seed`** for add-only). Handler details: **[`packages/functions/README.md`](./packages/functions/README.md)**.

## Deploy from Clean Clone

Secrets and SST state are **not** in Git: cloning gives you source only. Another machine needs the same **tooling**, **AWS access**, and (for secrets) the **same account/stage context**—or you set things up fresh there.

### Checklist on a new PC

1. **Node.js** — 20.19+ or 22.12+ (see [Prerequisites](#prerequisites)).
2. **pnpm** — install, then **`pnpm install`** in the cloned repo (**required before** `pnpm dev` or `pnpm deploy`).
3. **AWS CLI v2** — SST calls AWS; `scripts/run-with-aws.sh` relies on **`aws configure export-credentials`**.
4. **AWS profile matches `sst.config.ts`** — the app defaults to profile **`bob`** and region **`us-west-2`**. On your machine configure that profile (e.g. SSO in `~/.aws/config`), or change `sst.config.ts` to use your profile name.
5. **Log in before dev/deploy** — e.g. `aws sso login --profile bob` (or `export AWS_PROFILE=…` — see [AWS SSO](#aws-sso-iam-identity-center)).

### SST secret: `WebhookSecret`

Values live in SST’s encrypted store for an **AWS account + stage**, not in the repo.

- **Same AWS account** you already use: after `aws login` / profile is valid, **`pnpm dev`** normally works **without** setting the secret again, as long as it was created for that account/stage (`pnpm exec sst secret list` to confirm).
- **New AWS account or never set**: run once (see [Secrets](#secrets-sst-secrets)):

  ```bash
  pnpm exec sst secret set WebhookSecret "$(openssl rand -hex 32)"
  ```

  Use **`--stage <name>`** if you deploy dev/prod under a non-default stage.

### Commands

```bash
git clone <repo-url>
cd <repo-directory>
pnpm install
aws sso login --profile bob   # or your profile
pnpm dev                      # SST dev stack (wrapped by run-with-aws.sh)
# or
pnpm deploy                   # production stage (see package.json)
```

Outputs from dev/deploy typically include **`apiUrl`**, **`mockMarketplaceUrl`**, and **`webUrl`** (main API, mock marketplace, frontend).

## Testing the Flow

### 1. Create a Listing
```bash
curl -X POST https://<apiUrl>/listings \
  -H "Content-Type: application/json" \
  -d '{"title": "iPhone 14 Pro", "description": "Like new condition", "price": 899.99}'
```

### 2. View Listings
```bash
curl https://<apiUrl>/listings
```

### 3. Trigger a Mock Sale Event
```bash
curl -X POST https://<mockMarketplaceUrl>/trigger-event \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "<listing-id>",
    "sellerId": "demo-seller",
    "eventType": "item_sold",
    "webhookUrl": "https://<apiUrl>/webhooks/marketplace"
  }'
```

### 4. Trigger a Comment Event
```bash
curl -X POST https://<mockMarketplaceUrl>/trigger-event \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "<listing-id>",
    "sellerId": "demo-seller", 
    "eventType": "new_comment",
    "payload": {"content": "Is this still available?"},
    "webhookUrl": "https://<apiUrl>/webhooks/marketplace"
  }'
```

Or use the web UI's "Trigger Mock Event" panel.

## Tear Down

```bash
# Remove all resources
pnpm remove

# Or for dev stage
pnpm exec sst remove
```

This removes all AWS resources created by the stack.

## Project Structure

```
├── sst.config.ts           # SST configuration
├── infra/                  # Infrastructure definitions
│   ├── api.ts              # Main API routes
│   ├── database.ts         # DynamoDB tables
│   ├── queue.ts            # SQS queues
│   ├── mock.ts             # Mock marketplace
│   └── web.ts              # Frontend hosting
├── packages/
│   ├── core/               # Shared types & utilities
│   ├── functions/          # Lambda handlers
│   │   └── src/
│   │       ├── api/        # Main API handlers
│   │       ├── mock/       # Mock marketplace handlers
│   │       └── workers/    # Queue processors
│   └── web/                # React frontend
```

## AWS Services Used

| Service | Purpose | Pricing Model |
|---------|---------|---------------|
| Lambda | API handlers, queue workers | Pay-per-invocation |
| API Gateway v2 | HTTP APIs | Pay-per-request |
| DynamoDB | Listings, activity, idempotency | On-demand (pay-per-request) |
| SQS | Publish queue with DLQ | Pay-per-message |
| S3 | Frontend static assets | Pay-per-storage/request |
| CloudFront | CDN for frontend | Pay-per-request/transfer |

## Cost Estimate

**At rest (no traffic):** ~$0/month (all serverless, pay-per-use)

**At demo scale (10 sellers, 1k listings, 10k events/month):**

| Service | Estimated Cost |
|---------|----------------|
| Lambda | < $0.05 (free tier covers most) |
| API Gateway | ~$0.10 |
| DynamoDB | ~$0.15 |
| SQS | < $0.01 (free tier) |
| S3 + CloudFront | ~$1.00 |
| **Total** | **~$1.30/month** |

**Cost to leave running for a day:** < $0.05 (essentially free at idle)

## Key Features

- **Idempotent publish**: Duplicate submissions return existing listing
- **Retry with backoff**: Failed marketplace calls retry up to 4 times with exponential backoff
- **Dead letter queue**: Permanently failed jobs go to DLQ for investigation
- **Webhook signature verification**: All marketplace webhooks are cryptographically verified
- **Event deduplication**: Duplicate webhook events are detected and ignored

## Environment Variables & Secrets

### Secrets (SST Secrets)

Secrets are stored encrypted in S3 via SST's built-in secrets management. **No secrets are committed to the repository.**

| Secret | Purpose | How to Set |
|--------|---------|------------|
| `WebhookSecret` | HMAC signing key for webhook verification | `pnpm exec sst secret set WebhookSecret "<value>"` |

To set all required secrets for a new deployment:

```bash
# Generate and set a secure webhook secret
pnpm exec sst secret set WebhookSecret "$(openssl rand -hex 32)"
```

To view current secrets:

```bash
pnpm exec sst secret list
```

### Environment Variables (Auto-injected by SST)

These are automatically configured by SST at deploy time — no manual setup required:

| Variable | Purpose | Set By |
|----------|---------|--------|
| `VITE_API_URL` | Main API endpoint for frontend | `infra/web.ts` |
| `VITE_MOCK_MARKETPLACE_URL` | Mock marketplace endpoint for frontend | `infra/web.ts` |
| `MOCK_MARKETPLACE_URL` | Mock marketplace URL for Lambda workers | `infra/api.ts` |
| `API_URL` | Main API URL for webhook callbacks | `infra/api.ts` |

### Local Development

For local frontend development while `sst dev` is running:

```bash
cd packages/web
VITE_API_URL="<apiUrl from sst dev output>/" \
VITE_MOCK_MARKETPLACE_URL="<mockMarketplaceUrl from sst dev output>/" \
pnpm dev
```

## Observability (Recommended Additions)

First metrics/alarms to add:
1. `PublishDLQ` message count > 0 (alert on failed publishes)
2. Lambda error rate > 5%
3. API Gateway 5xx rate > 1%
4. DynamoDB throttled requests > 0

## Known Limitations

- Single seller ID (`demo-seller`) for prototype - no auth
- Mock marketplace runs in same AWS account (would be separate in production)
- No image upload support
- No batch operations
