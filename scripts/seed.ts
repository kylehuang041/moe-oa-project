#!/usr/bin/env npx tsx

/**
 * Seed script to populate the database with sample listings.
 * 
 * Usage:
 *   pnpm seed <apiUrl>
 * 
 * Example:
 *   pnpm seed https://pz0hdqgtmf.execute-api.us-west-2.amazonaws.com
 */

import { normalizeApiBase } from "./normalizeApiUrl.js";

const rawApiUrl = process.argv[2];

if (!rawApiUrl?.trim()) {
  console.error("Usage: pnpm seed <apiUrl>");
  console.error("Example: pnpm seed https://pz0hdqgtmf.execute-api.us-west-2.amazonaws.com");
  process.exit(1);
}

/** Undici hides root cause behind "fetch failed" — unwrap .cause chain for ENOENT/DNS/network hints. */
function formatFetchFailure(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  let depth = 0;
  while (e !== undefined && e !== null && depth < 6) {
    if (e instanceof Error) {
      parts.push(e.message);
      e = e.cause;
    } else {
      parts.push(String(e));
      break;
    }
    depth += 1;
  }
  return parts.join(" → ");
}

let baseUrlRaw: string;
try {
  baseUrlRaw = normalizeApiBase(rawApiUrl);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
const baseUrl = `${baseUrlRaw}/`;

interface SampleListing {
  title: string;
  description: string;
  price: number;
  currency?: string;
}

const sampleListings: SampleListing[] = [
  {
    title: "iPhone 14 Pro Max 256GB",
    description: "Excellent condition, Space Black. Includes original box and charger. Battery health 94%.",
    price: 899.99,
  },
  {
    title: "MacBook Pro 14\" M3 Pro",
    description: "2023 model, 18GB RAM, 512GB SSD. AppleCare+ until 2026. Minor scratch on bottom.",
    price: 1749.00,
  },
  {
    title: "Sony WH-1000XM5 Headphones",
    description: "Wireless noise-canceling headphones. Black color. Like new, used for 2 months.",
    price: 279.99,
  },
  {
    title: "Nintendo Switch OLED",
    description: "White model with dock. Comes with 3 games: Zelda TOTK, Mario Kart 8, Animal Crossing.",
    price: 299.00,
  },
  {
    title: "Herman Miller Aeron Chair",
    description: "Size B, fully loaded. Remastered version. Some wear on armrests but fully functional.",
    price: 650.00,
  },
  {
    title: "Canon EOS R6 Mark II",
    description: "Mirrorless camera body only. Shutter count ~5000. Includes extra battery and SD card.",
    price: 1899.00,
  },
  {
    title: "iPad Air 5th Gen 256GB",
    description: "Wi-Fi model, Space Gray. Perfect condition with Smart Folio case included.",
    price: 549.99,
  },
  {
    title: "Dyson V15 Detect Vacuum",
    description: "Cordless stick vacuum. All attachments included. 6 months old, works perfectly.",
    price: 449.00,
  },
  {
    title: "PS5 Digital Edition",
    description: "Slim model, 1TB. Includes 2 controllers and charging dock. No games included.",
    price: 399.99,
  },
  {
    title: "Vintage Leather Messenger Bag",
    description: "Handcrafted full-grain leather. Fits 15\" laptop. Beautiful patina from 5 years of use.",
    price: 125.00,
  },
];

async function createListing(
  listing: SampleListing
): Promise<{ success: boolean; data?: unknown; error?: string; retried?: boolean }> {
  const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
  const maxAttempts = Math.min(
    8,
    Math.max(1, Number.parseInt(process.env.SEED_POST_ATTEMPTS ?? "4", 10) || 4)
  );

  const attempt = async (): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    status?: number;
  }> => {
    try {
      const listingsUrl = new URL("listings", baseUrl).toString();
      const response = await fetch(listingsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...listing, currency: listing.currency ?? "USD" }),
        signal: AbortSignal.timeout(60_000),
      });

      const text = await response.text();
      let data: { message?: string } | null = null;
      try {
        data = JSON.parse(text) as { message?: string };
      } catch {
        /* non-JSON error body */
      }

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          error: data?.message || text.slice(0, 160) || `HTTP ${response.status}`,
        };
      }

      return { success: true, data, status: response.status };
    } catch (error) {
      return { success: false, error: formatFetchFailure(error) };
    }
  };

  const isTransientAttempt = (
    r: Awaited<ReturnType<typeof attempt>>
  ): boolean => {
    if (r.status !== undefined && TRANSIENT_HTTP.has(r.status)) return true;
    const msg = r.error ?? "";
    return /\b(?:ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN)\b/i.test(msg);
  };

  let last = await attempt();
  if (last.success) return last;

  let attempts = 1;
  while (attempts < maxAttempts && isTransientAttempt(last)) {
    last = await attempt();
    attempts += 1;
    if (last.success) {
      return { ...last, retried: attempts > 1 };
    }
  }

  return last;
}

/** Bounded concurrency (cooperative worker pool — no throttle sleep between requests). */
async function mapPool<T, R>(
  items: T[],
  poolSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Math.max(1, Math.min(poolSize, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function main() {
  console.log(`\n🌱 Seeding database via ${baseUrl}\n`);

  const probeUrl = new URL("listings", baseUrl).toString();
  console.log(`Probing GET ${probeUrl} …`);

  try {
    const ping = await fetch(probeUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!ping.ok) {
      console.error(
        `❌ Probe failed (${ping.status}). Use the HTTPS \`Api\` / \`api.url\` from \`pnpm dev\` or \`pnpm deploy\` — not the CloudFront web URL.`
      );
      process.exit(1);
    }
  } catch (e) {
    console.error(
      `❌ Cannot reach API at ${probeUrl}\n   ${formatFetchFailure(e)}\n\n` +
        `Hints:\n` +
        `  • Paste the exact \`api.url\`/Api URL printed by SST (must include https://).\n` +
        `  • On WSL2, try: NODE_OPTIONS='--dns-result-order=ipv4first' pnpm seed "${baseUrlRaw}"`
    );
    process.exit(1);
  }

  console.log(`Creating ${sampleListings.length} sample listings (concurrent) …\n`);

  const rawPool = process.env.SEED_CONCURRENCY ?? "4";
  const pool = Math.min(16, Math.max(1, Number.parseInt(rawPool, 10) || 4));

  const results = await mapPool(sampleListings, pool, async (listing) => {
    const result = await createListing(listing);
    return { listing, result };
  });

  let successCount = 0;
  let failCount = 0;

  for (const { listing, result } of results) {
    if (result.success) {
      const tag = result.retried ? " (retried)" : "";
      console.log(`  ✅ Created: ${listing.title}${tag}`);
      successCount++;
    } else {
      console.log(`  ❌ Failed: ${listing.title} — ${result.error}`);
      failCount++;
    }
  }

  console.log(`\n📊 Results: ${successCount} created, ${failCount} failed (pool=${pool})\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main();
