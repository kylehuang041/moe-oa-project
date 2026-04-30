export interface Listing {
  listingId: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  currency?: string;
  status: ListingStatus;
  marketplaceStatus: MarketplaceStatus;
  marketplaceListingId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ListingStatus = "draft" | "publishing" | "published" | "failed" | "sold";
export type MarketplaceStatus = "pending" | "queued" | "publishing" | "published" | "failed" | string;

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
  | "publish_retry"
  | "listing_created"
  | "listing_published"
  | "listing_failed"
  | "item_sold"
  | "new_comment"
  | "price_change_request"
  | "question_asked";

export interface ListingWithActivity extends Listing {
  recentActivity: ActivityEvent[];
}
