#!/usr/bin/env npx tsx

/**
 * Wipes app data stores (Listings + Idempotency DynamoDB tables, publish SQS queues)
 * then runs the same seed as `pnpm seed`.
 *
 * Requires AWS credentials (same as SST): use `./scripts/run-with-aws.sh`.
 *
 * Usage:
 *   pnpm reset-seed <apiUrl>
 *
 * Override table discovery:
 *   LISTINGS_TABLE=my-table IDEMPOTENCY_TABLE=other pnpm reset-seed <apiUrl>
 */

import {
  DynamoDBClient,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ListQueuesCommand, PurgeQueueCommand, SQSClient } from "@aws-sdk/client-sqs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeApiBase } from "./normalizeApiUrl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

if (!process.argv[2]?.trim()) {
  console.error("Usage: pnpm reset-seed <apiUrl>");
  console.error("Example: pnpm reset-seed https://abc123.execute-api.us-west-2.amazonaws.com");
  process.exit(1);
}

let API_URL: string;
try {
  API_URL = normalizeApiBase(process.argv[2]);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const REGION =
  process.env.AWS_REGION ??
  process.env.AWS_DEFAULT_REGION ??
  "us-west-2";

async function resolveTable(names: string[], label: string, substring: RegExp): Promise<string> {
  const explicit =
    label === "Listings"
      ? process.env.LISTINGS_TABLE
      : label === "Idempotency"
        ? process.env.IDEMPOTENCY_TABLE
        : undefined;
  if (explicit?.trim()) {
    if (!names.includes(explicit.trim())) {
      console.warn(`warn: explicit ${label} table "${explicit.trim()}" not in account list — trying anyway`);
    }
    return explicit.trim();
  }

  const hints = ["marketplace-aggregator", "aggregator", "Marketplace"];
  let matches = names.filter((n) => substring.test(n));
  const appPrefer = hints
    .map((h) => matches.find((n) => n.includes(h)))
    .find(Boolean);
  if (appPrefer) {
    matches = matches.filter((n) => n === appPrefer);
  }
  if (matches.length === 1) {
    return matches[0]!;
  }
  console.error(`Could not pick ${label} table. DynamoDB candidates: ${matches.join(", ") || "(none)"}`);
  console.error(`Set LISTINGS_TABLE and/or IDEMPOTENCY_TABLE, or prune extra stacks in ${REGION}.`);
  process.exit(1);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function purgeDynamoComposite(
  doc: DynamoDBDocumentClient,
  tableName: string
): Promise<void> {
  let lastKey: Record<string, unknown> | undefined;

  let deleted = 0;

  while (true) {
    const scan = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey: lastKey,
      })
    );

    const items = (scan.Items ?? []) as Array<Record<string, string>>;
    for (const batch of chunk(items, 25)) {
      if (batch.length === 0) continue;
      const RequestItems = {
        [tableName]: batch.map((Key) => ({ DeleteRequest: { Key } })),
      };

      let attempt = RequestItems as typeof RequestItems | undefined;

      while (attempt) {
        const res = await doc.send(new BatchWriteCommand({ RequestItems: attempt }));

        attempt = undefined;
        if (res.UnprocessedItems && Object.keys(res.UnprocessedItems).length > 0) {
          await new Promise((r) => setTimeout(r, 500));
          attempt = res.UnprocessedItems as typeof RequestItems;
        }
      }

      deleted += batch.length;
    }

    console.log(`  … ${tableName}: removed ${deleted} items so far`);

    lastKey = scan.LastEvaluatedKey;
    if (!lastKey) break;
  }

  console.log(`  ✅ ${tableName}: empty (${deleted} items deleted)`);
}

async function purgeDynamoPkOnly(
  doc: DynamoDBDocumentClient,
  tableName: string
): Promise<void> {
  let lastKey: Record<string, unknown> | undefined;
  let deleted = 0;

  while (true) {
    const scan = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "pk",
        ExclusiveStartKey: lastKey,
      })
    );

    const items = (scan.Items ?? []) as Array<Record<string, string>>;
    for (const batch of chunk(items, 25)) {
      if (batch.length === 0) continue;

      let RequestItems: Record<
        string,
        Array<{ DeleteRequest: { Key: Record<string, string> } }>
      > = {
        [tableName]: batch.map((Key) => ({ DeleteRequest: { Key } })),
      };

      while (true) {
        const res = await doc.send(new BatchWriteCommand({ RequestItems }));

        RequestItems =
          res.UnprocessedItems && Object.keys(res.UnprocessedItems).length > 0
            ? (res.UnprocessedItems as typeof RequestItems)
            : {};

        if (Object.keys(RequestItems).length === 0) break;
        await new Promise((r) => setTimeout(r, 500));
      }

      deleted += batch.length;
    }

    console.log(`  … ${tableName}: removed ${deleted} items so far`);

    lastKey = scan.LastEvaluatedKey;
    if (!lastKey) break;
  }

  console.log(`  ✅ ${tableName}: empty (${deleted} items deleted)`);
}

async function purgePublishQueues(client: SQSClient): Promise<void> {
  const needles = ["publishdlq", "publishqueue"];
  const urls = new Set<string>();
  let next: string | undefined;

  while (true) {
    const res = await client.send(new ListQueuesCommand({ NextToken: next }));
    for (const url of res.QueueUrls ?? []) {
      const norm = url.toLowerCase().replace(/[-_]/g, "");
      if (needles.some((n) => norm.includes(n))) {
        urls.add(url);
      }
    }
    if (!res.NextToken) break;
    next = res.NextToken;
  }

  if (urls.size === 0) {
    console.log("  (no publish queues found to purge)");
    return;
  }

  for (const url of urls) {
    await client.send(new PurgeQueueCommand({ QueueUrl: url }));
    console.log(`  ✅ Purged queue ${url}`);
  }
}

async function main() {
  console.log("\n🔻 Reset databases & queues …\n");

  const dynamo = new DynamoDBClient({ region: REGION });
  const doc = DynamoDBDocumentClient.from(dynamo, {
    marshallOptions: { removeUndefinedValues: true },
  });

  const { TableNames = [] } = await dynamo.send(new ListTablesCommand({}));

  const listingsTable = await resolveTable(TableNames, "Listings", /Listings/i);
  const idemTable = await resolveTable(TableNames, "Idempotency", /Idempotency/i);

  await purgeDynamoComposite(doc, listingsTable);
  await purgeDynamoPkOnly(doc, idemTable);

  const sqs = new SQSClient({ region: REGION });
  await purgePublishQueues(sqs);

  console.log("\n🌱 Re-seeding …\n");

  execFileSync("pnpm", ["exec", "tsx", "scripts/seed.ts", API_URL], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env as NodeJS.ProcessEnv,
  });

  console.log("\n✅ Reset + seed finished.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
