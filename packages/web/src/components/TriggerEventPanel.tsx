import { useState } from "react";
import type { ListingWithActivity, EventType } from "../types";

interface TriggerEventPanelProps {
  apiUrl: string;
  mockMarketplaceUrl: string;
  listings: ListingWithActivity[];
  onEventTriggered: () => void;
}

const eventTypes: { value: EventType; label: string }[] = [
  { value: "item_sold", label: "Item Sold" },
  { value: "new_comment", label: "New Comment" },
  { value: "question_asked", label: "Question Asked" },
  { value: "price_change_request", label: "Price Change Request" },
];

export function TriggerEventPanel({ apiUrl, mockMarketplaceUrl, listings, onEventTriggered }: TriggerEventPanelProps) {
  const [selectedListing, setSelectedListing] = useState("");
  const [eventType, setEventType] = useState<EventType>("item_sold");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Filter to only published listings
  const publishedListings = listings.filter((l) => l.status === "published");

  const handleTrigger = async () => {
    if (!selectedListing) return;

    const listing = listings.find((l) => l.listingId === selectedListing);
    if (!listing) return;

    setLoading(true);
    setResult(null);

    try {
      const webhookUrl = `${apiUrl}webhooks/marketplace`;

      const response = await fetch(`${mockMarketplaceUrl}trigger-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.listingId,
          sellerId: listing.sellerId,
          marketplaceListingId: listing.marketplaceListingId,
          eventType,
          webhookUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message ?? "Failed to trigger event");
      }

      setResult({ success: true, message: `${eventType} event triggered successfully!` });
      onEventTriggered();
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Trigger Mock Event
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Simulate marketplace events for testing
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="listing" className="block text-sm font-medium text-gray-700 mb-1">
            Select Listing
          </label>
          <select
            id="listing"
            value={selectedListing}
            onChange={(e) => setSelectedListing(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Choose a listing...</option>
            {publishedListings.map((listing, index) => (
              <option
                key={
                  listing.listingId && listing.listingId.length > 0
                    ? `${listing.sellerId}-${listing.listingId}`
                    : `published-opt-${index}`
                }
                value={listing.listingId}
              >
                {listing.title} ({listing.marketplaceListingId ?? "pending"})
              </option>
            ))}
          </select>
          {publishedListings.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">
              No published listings available. Create and wait for a listing to be published.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="eventType" className="block text-sm font-medium text-gray-700 mb-1">
            Event Type
          </label>
          <select
            id="eventType"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {eventTypes.map((et) => (
              <option key={et.value} value={et.value}>
                {et.label}
              </option>
            ))}
          </select>
        </div>

        {result && (
          <div
            className={`rounded-md p-3 text-sm ${
              result.success
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {result.message}
          </div>
        )}

        <button
          onClick={handleTrigger}
          disabled={loading || !selectedListing}
          className="w-full bg-gray-800 text-white py-2 px-4 rounded-md hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Triggering..." : "Trigger Event"}
        </button>
      </div>
    </div>
  );
}
