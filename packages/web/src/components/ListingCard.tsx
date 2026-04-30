import type { ListingWithActivity, EventType } from "../types";

interface ListingCardProps {
  listing: ListingWithActivity;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  publishing: "bg-yellow-100 text-yellow-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  sold: "bg-purple-100 text-purple-700",
};

const eventTypeLabels: Record<EventType, string> = {
  publish_retry: "Publish retry",
  listing_created: "Created",
  listing_published: "Published",
  listing_failed: "Failed",
  item_sold: "Sold",
  new_comment: "New Comment",
  price_change_request: "Price Request",
  question_asked: "Question",
};

const eventTypeColors: Record<EventType, string> = {
  publish_retry: "bg-amber-50 border-amber-200 text-amber-900",
  listing_created: "bg-blue-50 border-blue-200 text-blue-700",
  listing_published: "bg-green-50 border-green-200 text-green-700",
  listing_failed: "bg-red-50 border-red-200 text-red-700",
  item_sold: "bg-purple-50 border-purple-200 text-purple-700",
  new_comment: "bg-orange-50 border-orange-200 text-orange-700",
  price_change_request: "bg-yellow-50 border-yellow-200 text-yellow-700",
  question_asked: "bg-cyan-50 border-cyan-200 text-cyan-700",
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPrice(price: number, currency?: string | null): string {
  const code = (currency ?? "USD").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(price);
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function ListingCard({ listing }: ListingCardProps) {
  const statusClass = statusColors[listing.status] ?? statusColors.draft;

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium text-gray-900 truncate">
              {listing.title}
            </h3>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {listing.description}
            </p>
          </div>
          <div className="ml-4 flex-shrink-0">
            <span className="text-lg font-semibold text-gray-900">
              {formatPrice(listing.price, listing.currency)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
            {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
          </span>
          {listing.marketplaceListingId && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {listing.marketplaceListingId}
            </span>
          )}
          {listing.marketplaceStatus.startsWith("retry_") && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
              Retry {listing.marketplaceStatus.split("_")[1]}
            </span>
          )}
        </div>

        <div className="mt-2 text-xs text-gray-400">
          Created {formatDate(listing.createdAt)}
        </div>
      </div>

      {listing.recentActivity.length > 0 && (
        <div className="border-t bg-gray-50 px-4 py-3">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Recent Activity
          </h4>
          <div className="space-y-2">
            {listing.recentActivity.slice(0, 5).map((activity, activityIndex) => (
              <div
                key={
                  activity.eventId && activity.eventId.length > 0
                    ? activity.eventId
                    : `${listing.listingId}-activity-${activityIndex}`
                }
                className={`rounded border px-3 py-2 text-sm ${eventTypeColors[activity.eventType] ?? "bg-gray-50 border-gray-200 text-gray-700"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {eventTypeLabels[activity.eventType] ?? activity.eventType}
                  </span>
                  <span className="text-xs opacity-75">
                    {formatDate(activity.createdAt)}
                  </span>
                </div>
                {activity.payload && Object.keys(activity.payload).length > 0 && (
                  <div className="mt-1 text-xs opacity-75">
                    {activity.eventType === "new_comment" && (activity.payload as { content?: string }).content && (
                      <p>"{(activity.payload as { content: string }).content}"</p>
                    )}
                    {activity.eventType === "question_asked" && (activity.payload as { question?: string }).question && (
                      <p>"{(activity.payload as { question: string }).question}"</p>
                    )}
                    {activity.eventType === "item_sold" && (
                      <p>
                        Sold for {formatPrice((activity.payload as { salePrice?: number }).salePrice ?? listing.price, listing.currency)}
                      </p>
                    )}
                    {activity.eventType === "price_change_request" && (activity.payload as { proposedPrice?: number }).proposedPrice && (
                      <p>
                        Proposed: {formatPrice((activity.payload as { proposedPrice: number }).proposedPrice, listing.currency)}
                      </p>
                    )}
                    {activity.eventType === "listing_failed" && (activity.payload as { error?: string }).error && (
                      <p>{(activity.payload as { error: string }).error}</p>
                    )}
                    {activity.eventType === "publish_retry" && (
                      <p>
                        Try {(activity.payload as { tryThatFailed?: number }).tryThatFailed ?? "?"} failed — retry #{(
                          activity.payload as { nextTryNumber?: number }
                        ).nextTryNumber ?? "?"} in ~
                        {(activity.payload as { delaySeconds?: number }).delaySeconds ?? "?"}s.{" "}
                        <span className="block truncate">
                          {(activity.payload as { error?: string }).error}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
