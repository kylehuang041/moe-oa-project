# Infrastructure (`infra/`)

This folder contains **infrastructure-as-code** definitions using SST v3. These files define all AWS resources and are executed at deploy time.

## Files

| File | Resources Created |
|------|-------------------|
| `api.ts` | Main API Gateway + Lambda routes (listings, webhooks) |
| `database.ts` | DynamoDB tables (Listings, Idempotency) |
| `mock.ts` | Mock marketplace API Gateway + Lambda routes |
| `queue.ts` | SQS publish queue + dead letter queue |
| `secrets.ts` | SST Secrets (WebhookSecret) |
| `web.ts` | S3 + CloudFront static site hosting |

## How it works

1. `sst.config.ts` imports these files in order
2. SST/Pulumi provisions the AWS resources
3. Resources are linked to Lambda functions (auto-wires IAM permissions + env vars)

## Key concepts

- **`link: [...]`** — Grants Lambda access to resources and injects connection info
- **`environment: {...}`** — Injects environment variables into Lambda
- **`new sst.Secret(...)`** — Creates encrypted secrets stored in S3

## Adding new resources

1. Create or update a file in this folder
2. Export the resource
3. Import and link it in `sst.config.ts` or other infra files
4. Run `pnpm dev` to deploy changes
