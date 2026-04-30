# Approach Document

## Approach Summary

This prototype uses an **API-driven architecture with asynchronous job processing**. Listings are created via a REST API, then published to marketplaces through an SQS queue with retry logic. Marketplace events flow back via webhooks into an aggregated activity feed. This approach was chosen over a fully synchronous design because marketplace APIs are inherently unreliable and rate-limited — decoupling with queues provides resilience, observability (DLQ), and horizontal scalability without complexity.

## Architecture

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

### AWS Services & Rationale

| Service | Why |
|---------|-----|
| **Lambda** | Pay-per-invocation, no idle cost, scales to zero |
| **API Gateway v2** | HTTP APIs are cheaper than REST APIs, sufficient for this use case |
| **DynamoDB (on-demand)** | Zero provisioned capacity, pay-per-request, single-digit ms latency |
| **SQS + DLQ** | Decouples publish flow, built-in retry, dead-letter for failed jobs |
| **S3 + CloudFront** | Static hosting with global CDN, pennies/month at demo scale |
| **SST** | Infrastructure-as-code with live Lambda dev, single-command deploy/teardown |

## Reference Marketplace: eBay

**Why eBay:**
- Well-documented public API with clear rate limits
- Webhook/notification system for order and message events
- Representative of the complexity we'd face (OAuth, async processing, rate limiting)

**eBay's Model:**
- **Auth**: OAuth 2.0 with refresh tokens (24-hour access tokens)
- **Rate limits**: 5,000 calls/day for most endpoints, burst limits vary
- **Webhooks**: Push notifications for item sold, buyer messages, returns
- **Known pitfalls**: Token refresh race conditions, webhook delivery delays (up to 15 min), duplicate notifications

The mock marketplace simulates these characteristics: async responses, 10-20% failure rate, and signed webhook callbacks.

## Safety

| Concern | Solution |
|---------|----------|
| **Credential storage** | Webhook signing secret stored in SST Secrets (encrypted S3), not in code |
| **Idempotent publish** | Idempotency key stored in DynamoDB with 24h TTL; duplicate submissions return existing listing |
| **Retry without duplicates** | SQS message deduplication + idempotency table prevents duplicate marketplace posts |
| **Webhook verification** | HMAC-SHA256 signature verification on all incoming webhooks |
| **Event deduplication** | Event IDs stored in idempotency table to reject duplicate webhook deliveries |
| **Multi-tenant isolation** | Seller ID partitions all data; queries scoped to authenticated seller (demo uses fixed ID) |

## Cost

**At demo scale (10 sellers, 1k listings, 10k events/month):**

| Service | Monthly Cost |
|---------|--------------|
| Lambda | < $0.05 (free tier) |
| API Gateway | ~$0.10 |
| DynamoDB | ~$0.15 |
| SQS | < $0.01 (free tier) |
| S3 + CloudFront | ~$1.00 |
| **Total** | **~$1.30/month** |

**Cost wall**: First meaningful cost appears around 1M requests/month (~$3.50 API Gateway) or 25GB DynamoDB storage (~$6.25). Scaling to 100 sellers / 100k listings / 1M events would cost ~$15-20/month.

**At rest**: $0/month — all services are pay-per-use with no provisioned capacity.

## What I Would Cut / Build Next

### Cut for MVP
- Image upload (adds S3 complexity, presigned URLs)
- Multi-marketplace support (one integration first)
- Real-time updates (polling every 5s is fine for prototype)

### Build Next (in priority order)
1. **Authentication** — Cognito or Auth.js to replace the hardcoded `demo-seller`
2. **Real eBay integration** — OAuth flow, actual API calls, production webhook receiver
3. **Batch operations** — Bulk listing updates, bulk publish
4. **Observability** — CloudWatch dashboards, DLQ alarms, error rate alerts
5. **Multi-region** — DynamoDB global tables if sellers are geographically distributed
