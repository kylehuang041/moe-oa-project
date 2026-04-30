import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { MarketplaceWebhookPayload, ActivityEvent } from "@marketplace/core";
import {
  verifyWebhookSignature,
  now,
  jsonResponse,
  errorResponse,
  listingKey,
  activityKey,
  generateId,
} from "@marketplace/core";

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!event.body) {
      return errorResponse(400, "Request body is required", "MISSING_BODY");
    }

    const payload: MarketplaceWebhookPayload = JSON.parse(event.body);

    // Verify webhook signature
    const bodyWithoutSignature = JSON.stringify({
      ...payload,
      signature: undefined,
    });
    
    if (!verifyWebhookSignature(bodyWithoutSignature, payload.signature, Resource.WebhookSecret.value)) {
      console.error("Invalid webhook signature");
      return errorResponse(401, "Invalid signature", "INVALID_SIGNATURE");
    }

    // Idempotency check - prevent duplicate event processing
    const idempotencyCheck = await dynamodb.send(
      new GetCommand({
        TableName: Resource.Idempotency.name,
        Key: { pk: `webhook#${payload.eventId}` },
      })
    );

    if (idempotencyCheck.Item) {
      // Already processed, return success
      console.log(`Duplicate webhook event: ${payload.eventId}`);
      return jsonResponse(200, { status: "already_processed" });
    }

    const timestamp = now();

    // listing_published is already logged by the publish worker (system activity). Still verify
    // signature + dedupe IDs so webhook path is tested without duplicating UI rows.
    if (payload.eventType !== "listing_published") {
      const activityEvent: ActivityEvent = {
        eventId: payload.eventId || generateId(),
        listingId: payload.listingId,
        sellerId: payload.sellerId,
        eventType: payload.eventType,
        payload: payload.payload,
        source: "marketplace",
        createdAt: timestamp,
      };

      await dynamodb.send(
        new PutCommand({
          TableName: Resource.Listings.name,
          Item: {
            ...activityKey(payload.sellerId, timestamp, activityEvent.eventId),
            ...activityEvent,
          },
        })
      );
    }

    // Update listing status if relevant
    if (payload.eventType === "item_sold") {
      await dynamodb.send(
        new UpdateCommand({
          TableName: Resource.Listings.name,
          Key: listingKey(payload.sellerId, payload.listingId),
          UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "sold",
            ":updatedAt": timestamp,
          },
        })
      );
    }

    // Save idempotency record
    await dynamodb.send(
      new PutCommand({
        TableName: Resource.Idempotency.name,
        Item: {
          pk: `webhook#${payload.eventId}`,
          processedAt: timestamp,
          expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24 hour TTL
        },
      })
    );

    console.log(`Processed webhook event: ${payload.eventType} for listing ${payload.listingId}`);

    return jsonResponse(200, { status: "processed" });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return errorResponse(500, "Internal server error", "INTERNAL_ERROR");
  }
};
