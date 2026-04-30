import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Resource } from "sst";
import { MockPublishRequest, MockPublishResponse } from "@marketplace/core";
import {
  generateId,
  generateWebhookSignature,
  now,
  jsonResponse,
  errorResponse,
} from "@marketplace/core";

// Simulates an external marketplace API like eBay
// - Accepts publish requests
// - Fails randomly (10-20% error rate) to test retry logic
// - Sends webhook callbacks for events

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!event.body) {
      return errorResponse(400, "Request body is required", "MISSING_BODY");
    }

    const request: MockPublishRequest = JSON.parse(event.body);

    const listingId =
      typeof request.listingId === "string" ? request.listingId.trim() : "";
    const sellerId =
      typeof request.sellerId === "string" ? request.sellerId.trim() : "";
    const titleRaw = typeof request.title === "string" ? request.title : "";
    const title = titleRaw.trim();

    const missing: string[] = [];
    if (!listingId) missing.push("listingId");
    if (!sellerId) missing.push("sellerId");
    if (!title) missing.push("title");

    if (missing.length > 0) {
      return errorResponse(
        400,
        `Missing required fields: ${missing.join(", ")}`,
        "INVALID_REQUEST"
      );
    }

    if (typeof request.price !== "number" || !Number.isFinite(request.price) || request.price <= 0) {
      return errorResponse(400, "price must be a positive finite number", "INVALID_REQUEST");
    }

    request.listingId = listingId;
    request.sellerId = sellerId;
    request.title = title;
    // Intermittent HTTP errors → publish worker throws → SQS redrive with DelaySeconds backoff.
    // This is not a Lambda timeout; it exercises the queue retry path. Tune with env (0–1).
    const rawRate = process.env.MOCK_PUBLISH_FAILURE_RATE ?? "0.32";
    const parsed = Number.parseFloat(rawRate);
    const failureRate = Math.min(
      0.95,
      Math.max(0, Number.isFinite(parsed) ? parsed : 0.32)
    );
    if (Math.random() < failureRate) {
      console.log(`[MOCK] Simulated failure for listing ${request.listingId}`);
      
      // Randomly choose between different failure types
      const failureTypes = [
        { status: 429, message: "Rate limit exceeded", code: "RATE_LIMITED" },
        { status: 503, message: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 500, message: "Internal marketplace error", code: "INTERNAL_ERROR" },
      ];
      const failure = failureTypes[Math.floor(Math.random() * failureTypes.length)]!;
      
      return errorResponse(failure.status, failure.message, failure.code);
    }

    // Simulate processing delay (100-500ms)
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));

    // Generate a marketplace listing ID
    const marketplaceListingId = `MP-${generateId().slice(0, 8).toUpperCase()}`;

    console.log(`[MOCK] Published listing ${request.listingId} as ${marketplaceListingId}`);

    // Schedule async webhook callback for listing_published
    // In a real implementation, this would be a separate async process
    if (request.webhookUrl) {
      // Fire webhook asynchronously (don't await)
      fireWebhook(request.webhookUrl, {
        eventId: generateId(),
        eventType: "listing_published",
        marketplaceListingId,
        listingId: request.listingId,
        sellerId: request.sellerId,
        timestamp: now(),
        payload: { marketplaceListingId },
      }).catch((err) => console.error("[MOCK] Webhook delivery failed:", err));
    }

    const response: MockPublishResponse = {
      success: true,
      marketplaceListingId,
    };

    return jsonResponse(200, response);
  } catch (error) {
    console.error("[MOCK] Error processing publish request:", error);
    return errorResponse(500, "Internal marketplace error", "INTERNAL_ERROR");
  }
};

// Helper to fire webhook with signature
async function fireWebhook(url: string, payload: Record<string, unknown>) {
  const payloadWithoutSig = JSON.stringify(payload);
  const signature = generateWebhookSignature(payloadWithoutSig, Resource.WebhookSecret.value);

  const fullPayload = { ...payload, signature };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullPayload),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status}`);
  }

  console.log(`[MOCK] Webhook delivered to ${url}`);
}
