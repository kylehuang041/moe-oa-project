# @marketplace/functions

AWS Lambda handlers for the backend API, mock marketplace, and queue workers.

## Structure

```
src/
├── api/              # Main API handlers
│   ├── createListing.ts    # POST /listings
│   ├── getListings.ts      # GET /listings
│   ├── getListing.ts       # GET /listings/{id}
│   └── webhookReceiver.ts  # POST /webhooks/marketplace
│
├── mock/             # Mock marketplace handlers
│   ├── publish.ts          # POST /publish (accepts listings)
│   ├── triggerEvent.ts     # POST /trigger-event (fires webhooks)
│   └── health.ts           # GET /health
│
└── workers/          # Queue processors
    └── publish.ts          # SQS consumer (publishes to marketplace)
```

## How handlers work

Each file exports a `handler` function that SST wires to API Gateway or SQS:

```typescript
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // Lambda handler code
};
```

## Accessing resources

SST automatically injects linked resources:

```typescript
import { Resource } from "sst";

// DynamoDB table name
Resource.Listings.name

// SQS queue URL
Resource.PublishQueue.url

// Secret value
Resource.WebhookSecret.value
```

## Local development

With `pnpm dev` running, Lambda code changes are **hot-reloaded** — no redeploy needed.
