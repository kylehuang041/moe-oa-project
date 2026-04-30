# Approach Document: Marketplace Aggregator

## Approach Summary

**API-driven architecture.** I chose a classical API-integration approach over an agentic or hybrid system for three reasons: (1) deterministic behavior is critical for financial transactions like listings and sales — LLM unpredictability introduces risk without clear benefit here; (2) cost efficiency at the target scale (10 sellers, 1k listings) where AI inference costs would dominate; (3) simpler debugging and auditability when marketplace integrations inevitably fail. The system uses AWS serverless components (Lambda, API Gateway, DynamoDB) with SST v3 for infrastructure-as-code, keeping operational overhead minimal while maintaining full control over the publish/webhook flow.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SELLER                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CloudFront + S3 (React Frontend)                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  API Gateway                                                            │
│  POST /listings  │  GET /listings  │  POST /webhooks/marketplace        │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
┌──────────────────────────────┐   ┌──────────────────────────────────────┐
│  Lambda: Publish Handler     │   │  Lambda: Webhook Receiver            │
│  - Validates listing         │   │  - Validates signature               │
│  - Writes to DynamoDB        │   │  - Idempotency check                 │
│  - Queues publish job        │   │  - Writes to activity feed           │
└──────────────────────────────┘   └──────────────────────────────────────┘
                    │                             │
                    ▼                             │
┌──────────────────────────────┐                  │
│  SQS: Publish Queue          │                  │
│  - Retry with backoff        │                  │
│  - DLQ for failures          │                  │
└──────────────────────────────┘                  │
                    │                             │
                    ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DynamoDB (on-demand)                                                   │
│  - Listings table (PK: sellerId, SK: listingId)                         │
│  - Activity table (PK: listingId, SK: timestamp)                        │
│  - Idempotency table (PK: eventId, TTL: 24h)                            │
└─────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Mock Marketplace (separate Lambda + API Gateway)                       │
│  - POST /publish: accepts listing, 10-20% failure rate                  │
│  - Emits webhooks: item_sold, new_comment                               │
└─────────────────────────────────────────────────────────────────────────┘
```

**AWS Services & Justification:**
| Service | Why |
|---------|-----|
| Lambda | Pay-per-invocation, zero idle cost, scales to zero |
| API Gateway | Managed HTTPS, throttling, no servers to patch |
| DynamoDB (on-demand) | Single-digit ms latency, pay-per-request, no capacity planning |
| SQS + DLQ | Decouples publish from response, built-in retry, dead-letter for failures |
| S3 + CloudFront | Static hosting at pennies, global CDN |
| SSM Parameter Store | Free tier covers secrets, no Secrets Manager cost |

## Reference Marketplace: eBay

**Why eBay:** Most mature API (Inventory API v1), well-documented OAuth 2.0 flow, predictable rate limits, and webhook support via eBay Marketplace Account Deletion/Notification API. Facebook Marketplace has no official API for third-party sellers.

| Aspect | eBay Details |
|--------|--------------|
| **Auth model** | OAuth 2.0 with user consent. Access tokens expire in 2 hours; refresh tokens last 18 months. Requires app registration and eBay developer account. |
| **Rate limits** | 5,000 calls/day per user for Inventory API. Per-second burst limits vary by endpoint (~20-40 req/s). 429 responses require exponential backoff. |
| **Webhooks** | Notification API pushes `ITEM_SOLD`, `ASK_SELLER_A_QUESTION`, `BEST_OFFER_RECEIVED`. Requires HTTPS endpoint with eBay signature verification. Delivery retries for 24h on failure. |
| **Known pitfalls** | (1) Sandbox and production are separate environments with different credentials; (2) Category-specific required fields change without notice; (3) Webhook delivery is eventually-consistent (can arrive out of order); (4) Rate limit headers are sometimes missing on 429s. |

## Safety

| Concern | Approach |
|---------|----------|
| **Credential storage** | Marketplace OAuth tokens stored in SSM Parameter Store (SecureString). Lambda reads at cold start only. No secrets in code, env vars reference SSM paths. |
| **Multi-tenant isolation** | Every DynamoDB item includes `sellerId` as partition key. IAM policies scope Lambda to seller's data only. API Gateway authorizer validates JWT `sub` claim matches requested sellerId. |
| **Idempotency of publish** | Client generates `idempotencyKey` (UUID). Lambda checks DynamoDB idempotency table before processing. Key expires after 24h. Prevents duplicate listings on retry. |
| **Retry strategy** | SQS handles retries with exponential backoff (1s, 4s, 16s, 64s). Max 4 attempts. Failed messages move to DLQ. DLQ triggers CloudWatch alarm for manual review. Webhook receiver also stores `eventId` to deduplicate marketplace events. |

## Cost

**At 10 sellers / 1k listings / 10k events per month:**

| Service | Calculation | Monthly Cost |
|---------|-------------|--------------|
| Lambda | ~25k invocations × 128MB × 200ms avg = 625 GB-s | $0.01 (free tier covers) |
| API Gateway | ~25k requests | $0.09 |
| DynamoDB | ~50k reads, ~15k writes (on-demand) | $0.15 |
| SQS | ~15k messages | $0.01 (free tier) |
| S3 | <1GB storage, <10k requests | $0.03 |
| CloudFront | <10GB transfer | $0.85 |
| SSM Parameter Store | Standard params | Free |
| **Total** | | **~$1.15/month** |

**First cost wall:** At ~100 sellers / 100k listings / 1M events:
- **DynamoDB** becomes the bottleneck (~$15-25/month). Consider switching to provisioned capacity with auto-scaling at this point.
- **CloudFront** data transfer grows linearly with users (~$8.50/100GB).
- **Lambda** remains cheap until hitting concurrency limits (default 1000).

The real cost wall is **operational complexity**, not dollars — at 100+ sellers, you need proper monitoring, on-call, and SLA commitments.

## What I Would Cut / Build Next

**What I would cut (if time-constrained):**
1. **Photo upload** — adds S3 signed URLs, image processing complexity. Text-only listings work for MVP.
2. **Real-time activity feed** — polling every 30s is fine for prototype; WebSockets add deployment complexity.
3. **Multiple marketplace support** — build for eBay only first; abstraction layer can come later.
4. **Batch operations** — single listing CRUD is sufficient for validation.

**What I would build next (prioritized for real product):**
1. **Webhook signature verification** — even on mock, proves the security pattern works.
2. **Retry visibility UI** — sellers need to see if a listing is stuck in retry limbo.
3. **Activity notifications** — email/push when a sale or comment arrives (high seller value, low effort).
4. **Listing templates** — sellers repeat similar listings; save time with defaults.
5. **Analytics dashboard** — which listings sell, time-to-sale, price optimization hints.
6. **Second marketplace (Facebook)** — validate the abstraction, even if FB requires workarounds (no official API, may need browser automation for real integration).