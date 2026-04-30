import { useState, useEffect, useCallback } from "react";
import { CreateListingForm } from "./components/CreateListingForm";
import { ListingCard } from "./components/ListingCard";
import { TriggerEventPanel } from "./components/TriggerEventPanel";
import type { ListingWithActivity } from "./types";

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

const API_URL = withTrailingSlash(
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/"
);
const MOCK_MARKETPLACE_URL = withTrailingSlash(
  import.meta.env.VITE_MOCK_MARKETPLACE_URL ?? "http://localhost:3001/"
);

function App() {
  const [listings, setListings] = useState<ListingWithActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}listings`);
      if (!response.ok) throw new Error("Failed to fetch listings");
      const data = await response.json();
      setListings(data.listings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
    const interval = setInterval(fetchListings, 5000);
    return () => clearInterval(interval);
  }, [fetchListings]);

  const handleListingCreated = () => {
    fetchListings();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Marketplace Aggregator
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            List once, publish everywhere
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Create listing form */}
          <div className="lg:col-span-1 space-y-6">
            <CreateListingForm
              apiUrl={API_URL}
              onListingCreated={handleListingCreated}
            />
            <TriggerEventPanel
              apiUrl={API_URL}
              mockMarketplaceUrl={MOCK_MARKETPLACE_URL}
              listings={listings}
              onEventTriggered={fetchListings}
            />
          </div>

          {/* Right column - Listings grid */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Your Listings
              </h2>
              <button
                onClick={fetchListings}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Refresh
              </button>
            </div>

            {loading && listings.length === 0 ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading listings...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No listings yet
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create your first listing to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {listings.map((listing, index) => (
                  <ListingCard
                    key={
                      listing.listingId && listing.listingId.length > 0
                        ? `${listing.sellerId}-${listing.listingId}`
                        : `listing-${index}`
                    }
                    listing={listing}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 text-center">
            Demo prototype - Mock marketplace integration
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
