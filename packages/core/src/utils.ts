import { createHmac, randomUUID } from "crypto";
import type { Listing, ListingStatus, MarketplaceStatus } from "./types";

// Generate a unique ID
export function generateId(): string {
  return randomUUID();
}

// Generate webhook signature for verification
export function generateWebhookSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = generateWebhookSignature(payload, secret);
  return signature === expected;
}

// ISO timestamp
export function now(): string {
  return new Date().toISOString();
}

// Calculate exponential backoff delay
export function getBackoffDelay(attempt: number, baseMs: number = 1000): number {
  return Math.min(baseMs * Math.pow(2, attempt), 60000); // Max 60 seconds
}

// JSON response helper
export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

// Error response helper
export function errorResponse(statusCode: number, message: string, code?: string) {
  return jsonResponse(statusCode, {
    error: {
      message,
      code: code ?? "ERROR",
    },
  });
}

// DynamoDB key helpers
export function listingKey(sellerId: string, listingId: string) {
  return {
    pk: sellerId,
    sk: `LISTING#${listingId}`,
  };
}

export function activityKey(sellerId: string, timestamp: string, eventId: string) {
  return {
    pk: sellerId,
    sk: `ACTIVITY#${timestamp}#${eventId}`,
  };
}

// Parse DynamoDB sort key
export function parseActivitySk(sk: string): { timestamp: string; eventId: string } | null {
  const match = sk.match(/^ACTIVITY#(.+)#(.+)$/);
  if (!match) return null;
  return { timestamp: match[1]!, eventId: match[2]! };
}

export function parseListingSk(sk: string): string | null {
  const match = sk.match(/^LISTING#(.+)$/);
  return match ? match[1]! : null;
}

const MISSING_TIME = "1970-01-01T00:00:00.000Z";

const LISTING_STATUSES: readonly ListingStatus[] = [
  "draft",
  "publishing",
  "published",
  "failed",
  "sold",
] as const;

function coerceFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function coerceIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function coerceListingStatus(value: unknown): ListingStatus {
  const s = typeof value === "string" ? value : "";
  return (LISTING_STATUSES as readonly string[]).includes(s) ? (s as ListingStatus) : "draft";
}

/**
 * Build a {@link Listing} from a raw DynamoDB item (pk/sk + attributes).
 * Hardens against missing / wrong-typed fields so API + publish worker stay consistent.
 */
export function listingFromDynamoRecord(raw: Record<string, unknown>): Listing | null {
  const sk = String(raw.sk ?? "");
  const listingId = parseListingSk(sk);
  if (!listingId) return null;

  const pk = String(raw.pk ?? "");
  const sellerId =
    typeof raw.sellerId === "string" && raw.sellerId.trim().length > 0
      ? raw.sellerId.trim()
      : pk || "demo-seller";

  const title =
    (typeof raw.title === "string" ? raw.title : String(raw.title ?? "")).trim() || "(Untitled listing)";
  const description =
    (typeof raw.description === "string" ? raw.description : String(raw.description ?? "")).trim() || "";

  const price = coerceFiniteNumber(raw.price, 0);

  const currencyRaw = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "USD";

  const createdAt = coerceIsoTimestamp(raw.createdAt) ?? coerceIsoTimestamp(raw.updatedAt) ?? MISSING_TIME;
  const updatedAt = coerceIsoTimestamp(raw.updatedAt) ?? createdAt;

  const status = coerceListingStatus(raw.status);
  const marketplaceStatus = (
    typeof raw.marketplaceStatus === "string" && raw.marketplaceStatus.trim().length > 0
      ? raw.marketplaceStatus.trim()
      : "pending"
  ) as MarketplaceStatus;

  const marketplaceListingId =
    typeof raw.marketplaceListingId === "string" && raw.marketplaceListingId.trim().length > 0
      ? raw.marketplaceListingId.trim()
      : undefined;

  return {
    listingId,
    sellerId,
    title,
    description,
    price,
    currency,
    status,
    marketplaceStatus,
    marketplaceListingId,
    createdAt,
    updatedAt,
  };
}

// Note: WEBHOOK_SECRET has been moved to SST Secrets (Resource.WebhookSecret)
// See infra/secrets.ts for the secret definition
