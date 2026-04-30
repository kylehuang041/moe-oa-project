import { database } from "./database";
import { queue } from "./queue";
import { mockMarketplace } from "./mock";
import { webhookSecret } from "./secrets";

// Main API - our marketplace aggregator system
export const api = new sst.aws.ApiGatewayV2("Api", {
  cors: {
    allowOrigins: ["*"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  },
});

// Shared link for all API routes
const sharedLink = [
  database.listingsTable,
  database.idempotencyTable,
  queue.publishQueue,
];

// POST /listings - create a new listing
api.route("POST /listings", {
  handler: "packages/functions/src/api/createListing.handler",
  link: sharedLink,
  environment: {
    MOCK_MARKETPLACE_URL: mockMarketplace.url,
  },
});

// GET /listings - get all listings with activity
api.route("GET /listings", {
  handler: "packages/functions/src/api/getListings.handler",
  link: [database.listingsTable],
});

// GET /listings/{listingId} - get a single listing with full activity
api.route("GET /listings/{listingId}", {
  handler: "packages/functions/src/api/getListing.handler",
  link: [database.listingsTable],
});

// POST /webhooks/marketplace - receive events from mock marketplace
api.route("POST /webhooks/marketplace", {
  handler: "packages/functions/src/api/webhookReceiver.handler",
  link: [database.listingsTable, database.idempotencyTable, webhookSecret],
});

// Worker that processes the publish queue (defined here to access both api and mockMarketplace URLs)
queue.publishQueue.subscribe(
  {
    handler: "packages/functions/src/workers/publish.handler",
    timeout: "30 seconds",
    link: [database.listingsTable, database.idempotencyTable, queue.publishQueue],
    environment: {
      MOCK_MARKETPLACE_URL: mockMarketplace.url,
      API_URL: api.url,
    },
  },
  {
    batch: {
      size: 1,
    },
  }
);
