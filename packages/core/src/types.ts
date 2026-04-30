// Listing entity
export interface Listing {
  listingId: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  status: ListingStatus;
  marketplaceStatus: MarketplaceStatus;
  marketplaceListingId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ListingStatus = "draft" | "publishing" | "published" | "failed" | "sold";
export type MarketplaceStatus = "pending" | "queued" | "publishing" | "published" | "failed";

// Activity event
export interface ActivityEvent {
  eventId: string;
  listingId: string;
  sellerId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  source: "marketplace" | "system";
  createdAt: string;
}

export type EventType =
  /** Queued publish will retry after mock/API failure (SQS backoff); not user-triggerable */
  | "publish_retry"
  | "listing_created"
  | "listing_published"
  | "listing_failed"
  | "item_sold"
  | "new_comment"
  | "price_change_request"
  | "question_asked";

// API request/response types
export interface CreateListingRequest {
  title: string;
  description: string;
  price: number;
  currency?: string;
  idempotencyKey?: string;
}

export interface CreateListingResponse {
  listing: Listing;
}

export interface GetListingsResponse {
  listings: ListingWithActivity[];
}

export interface ListingWithActivity extends Listing {
  recentActivity: ActivityEvent[];
}

// Webhook payload from mock marketplace
export interface MarketplaceWebhookPayload {
  eventId: string;
  eventType: EventType;
  marketplaceListingId: string;
  listingId: string;
  sellerId: string;
  timestamp: string;
  payload: Record<string, unknown>;
  signature: string;
}

// Queue message for publish job
export interface PublishJobMessage {
  listingId: string;
  sellerId: string;
  attempt: number;
  maxAttempts: number;
  idempotencyKey: string;
}

// Mock marketplace API types
export interface MockPublishRequest {
  listingId: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  webhookUrl: string;
}

export interface MockPublishResponse {
  success: boolean;
  marketplaceListingId?: string;
  error?: string;
}
