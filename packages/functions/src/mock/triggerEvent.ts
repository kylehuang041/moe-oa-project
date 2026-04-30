import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Resource } from "sst";
import { EventType } from "@marketplace/core";
import {
  generateId,
  generateWebhookSignature,
  now,
  jsonResponse,
  errorResponse,
} from "@marketplace/core";

interface TriggerEventRequest {
  listingId: string;
  sellerId: string;
  marketplaceListingId?: string;
  eventType: EventType;
  payload?: Record<string, unknown>;
  webhookUrl: string;
}

// Manual trigger endpoint to simulate marketplace events
// Used for testing: item_sold, new_comment, etc.

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!event.body) {
      return errorResponse(400, "Request body is required", "MISSING_BODY");
    }

    const request: TriggerEventRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.listingId || !request.sellerId || !request.eventType || !request.webhookUrl) {
      return errorResponse(400, "Missing required fields: listingId, sellerId, eventType, webhookUrl", "INVALID_REQUEST");
    }

    // Validate event type
    const validEventTypes: EventType[] = [
      "item_sold",
      "new_comment",
      "price_change_request",
      "question_asked",
    ];

    if (!validEventTypes.includes(request.eventType)) {
      return errorResponse(400, `Invalid eventType. Must be one of: ${validEventTypes.join(", ")}`, "INVALID_EVENT_TYPE");
    }

    const eventId = generateId();
    const timestamp = now();

    // Build event-specific payload
    let eventPayload: Record<string, unknown> = request.payload ?? {};

    switch (request.eventType) {
      case "item_sold":
        eventPayload = {
          buyerId: `buyer-${generateId().slice(0, 8)}`,
          salePrice: eventPayload.salePrice ?? 99.99,
          quantity: eventPayload.quantity ?? 1,
          ...eventPayload,
        };
        break;
      case "new_comment":
        eventPayload = {
          commentId: `comment-${generateId().slice(0, 8)}`,
          authorId: `user-${generateId().slice(0, 8)}`,
          authorName: eventPayload.authorName ?? "John Doe",
          content: eventPayload.content ?? "Is this still available?",
          ...eventPayload,
        };
        break;
      case "question_asked":
        eventPayload = {
          questionId: `question-${generateId().slice(0, 8)}`,
          askerId: `user-${generateId().slice(0, 8)}`,
          askerName: eventPayload.askerName ?? "Jane Smith",
          question: eventPayload.question ?? "What condition is this item in?",
          ...eventPayload,
        };
        break;
      case "price_change_request":
        eventPayload = {
          requestId: `request-${generateId().slice(0, 8)}`,
          requesterId: `user-${generateId().slice(0, 8)}`,
          proposedPrice: eventPayload.proposedPrice ?? 75.0,
          message: eventPayload.message ?? "Would you accept this price?",
          ...eventPayload,
        };
        break;
    }

    // Build webhook payload
    const webhookPayload = {
      eventId,
      eventType: request.eventType,
      marketplaceListingId: request.marketplaceListingId ?? `MP-${generateId().slice(0, 8).toUpperCase()}`,
      listingId: request.listingId,
      sellerId: request.sellerId,
      timestamp,
      payload: eventPayload,
    };

    // Sign and send webhook
    const payloadWithoutSig = JSON.stringify(webhookPayload);
    const signature = generateWebhookSignature(payloadWithoutSig, Resource.WebhookSecret.value);

    const fullPayload = { ...webhookPayload, signature };

    console.log(`[MOCK] Triggering ${request.eventType} event for listing ${request.listingId}`);

    const response = await fetch(request.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MOCK] Webhook delivery failed: ${response.status} - ${errorText}`);
      return errorResponse(502, `Webhook delivery failed: ${response.status}`, "WEBHOOK_FAILED");
    }

    console.log(`[MOCK] Event ${request.eventType} delivered successfully`);

    return jsonResponse(200, {
      success: true,
      eventId,
      eventType: request.eventType,
      message: `Event ${request.eventType} triggered and delivered`,
    });
  } catch (error) {
    console.error("[MOCK] Error triggering event:", error);
    return errorResponse(500, "Internal error", "INTERNAL_ERROR");
  }
};
