# Scripts

Utility scripts for development and testing.

**Backend handlers** these commands call (`POST /listings`, workers, mock marketplace): **[`packages/functions/README.md`](../packages/functions/README.md)**.

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `run-with-aws.sh` | (used by `pnpm dev` / `deploy`) | Exports SSO credentials for SST/Pulumi via `aws configure export-credentials` |
| `seed.ts` | `pnpm seed <apiUrl>` | Populate database with sample listings |
| `resetAndSeed.ts` | `pnpm reset-seed <apiUrl>` | Clear DynamoDB (listings + idempotency), purge publish SQS queues, then run `pnpm seed` |

## Usage

### Reset to fresh seed data

Wipes persisted mock data then recreates the 10 demo listings (**destructive** in the target stage):

```bash
pnpm reset-seed https://your-api-url.execute-api.us-west-2.amazonaws.com
```

Uses the same AWS profile/credentials as `pnpm dev`. If SST creates multiple DynamoDB tables with similar names, set `LISTINGS_TABLE` and/or `IDEMPOTENCY_TABLE` explicitly.

### Seed the database

Creates **10** sample listings in parallel (bounded pool; no fixed delay between POSTs):

```bash
pnpm seed https://your-api-url.execute-api.us-west-2.amazonaws.com
```

- **`SEED_CONCURRENCY`** — max in-flight POSTs (default **`4`**; capped at **`16`**). Lower it (e.g. **`2`**) if you see bursts of **503 Service Unavailable** from API Gateway / Lambda scale-up under load.

- **`SEED_POST_ATTEMPTS`** — max tries **per listing** for **transient** HTTP (**429**, **500**, **502**, **503**, **504**) and a few network errors; default **`4`**, **no sleep** between tries (immediate replays only).

The API URL is printed when you run `pnpm dev` or `pnpm deploy`. It must be the **API Gateway HTTP API** host (like `https://xxxxx.execute-api.us-west-2.amazonaws.com`), not the **CloudFront** `webUrl`. You can omit `https://`; the script will prepend it. If you accidentally paste `https://` twice (`https://https://…`), the seed script now normalizes that.

### If seeding returns `fetch failed`

1. Re-copy `api.url` from the SST terminal output while the stack is up (`sst dev` or after `sst deploy`).
2. On **WSL2**, Node sometimes picks a broken IPv6 path; try:
   ```bash
   NODE_OPTIONS='--dns-result-order=ipv4first' pnpm seed "https://YOUR_API_ID.execute-api.us-west-2.amazonaws.com"
   ```
3. Run the same probe in a shell:  
   `curl -sS -o /dev/null -w "%{http_code}\n" "https://YOUR_API_ID.execute-api.us-west-2.amazonaws.com/listings"` — you should see **`200`**.

## Adding new scripts

1. Create a `.ts` file in this folder
2. Add a script entry to root `package.json`:
   ```json
   "scripts": {
     "your-script": "tsx scripts/your-script.ts"
   }
   ```
3. Run with `pnpm your-script`
