// Mock Marketplace - simulates eBay's API
// This is a SEPARATE service boundary from our main system
import { webhookSecret } from "./secrets";

export const mockMarketplace = new sst.aws.ApiGatewayV2("MockMarketplace", {
  cors: {
    allowOrigins: ["*"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  },
});

// POST /publish - accepts a listing; intermittent failures exercise SQS retry + backoff on the aggregator
mockMarketplace.route("POST /publish", {
  handler: "packages/functions/src/mock/publish.handler",
  timeout: "10 seconds",
  link: [webhookSecret],
  environment: {
    MOCK_PUBLISH_FAILURE_RATE: "0.20",
  },
});

// POST /trigger-event - manual trigger for testing (simulates item_sold, new_comment)
mockMarketplace.route("POST /trigger-event", {
  handler: "packages/functions/src/mock/triggerEvent.handler",
  timeout: "10 seconds",
  link: [webhookSecret],
});

// GET /health - health check endpoint
mockMarketplace.route("GET /health", {
  handler: "packages/functions/src/mock/health.handler",
});
