import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import {
  CreateListingRequest,
  Listing,
  PublishJobMessage,
  ActivityEvent,
} from "@marketplace/core";
import {
  generateId,
  now,
  jsonResponse,
  errorResponse,
  listingKey,
  activityKey,
} from "@marketplace/core";

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!event.body) {
      return errorResponse(400, "Request body is required", "MISSING_BODY");
    }

    const body: CreateListingRequest = JSON.parse(event.body);

    // Validate required fields
    if (!body.title?.trim()) {
      return errorResponse(400, "Title is required", "MISSING_TITLE");
    }
    if (!body.description?.trim()) {
      return errorResponse(400, "Description is required", "MISSING_DESCRIPTION");
    }
    if (typeof body.price !== "number" || body.price <= 0) {
      return errorResponse(400, "Price must be a positive number", "INVALID_PRICE");
    }

    // For demo purposes, use a fixed seller ID (in production, extract from JWT)
    const sellerId = "demo-seller";
    const listingId = generateId();
    const idempotencyKey = body.idempotencyKey ?? generateId();
    const timestamp = now();

    // Check idempotency (prevent duplicate submissions)
    if (body.idempotencyKey) {
      const existing = await dynamodb.send(
        new GetCommand({
          TableName: Resource.Idempotency.name,
          Key: { pk: idempotencyKey },
        })
      );
      if (existing.Item) {
        // Return the existing listing
        const existingListing = await dynamodb.send(
          new GetCommand({
            TableName: Resource.Listings.name,
            Key: listingKey(sellerId, existing.Item.listingId as string),
          })
        );
        if (existingListing.Item) {
          return jsonResponse(200, { listing: existingListing.Item });
        }
      }
    }

    // Create the listing
    const listing: Listing = {
      listingId,
      sellerId,
      title: body.title.trim(),
      description: body.description.trim(),
      price: body.price,
      currency: body.currency ?? "USD",
      status: "publishing",
      marketplaceStatus: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Create activity event for listing creation
    const activityEvent: ActivityEvent = {
      eventId: generateId(),
      listingId,
      sellerId,
      eventType: "listing_created",
      payload: { title: listing.title, price: listing.price },
      source: "system",
      createdAt: timestamp,
    };

    // Save listing to DynamoDB
    await dynamodb.send(
      new PutCommand({
        TableName: Resource.Listings.name,
        Item: {
          ...listingKey(sellerId, listingId),
          ...listing,
        },
      })
    );

    // Save activity event
    await dynamodb.send(
      new PutCommand({
        TableName: Resource.Listings.name,
        Item: {
          ...activityKey(sellerId, timestamp, activityEvent.eventId),
          ...activityEvent,
        },
      })
    );

    // Save idempotency record (expires in 24 hours)
    await dynamodb.send(
      new PutCommand({
        TableName: Resource.Idempotency.name,
        Item: {
          pk: idempotencyKey,
          listingId,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
        },
      })
    );

    // Queue publish job
    const publishJob: PublishJobMessage = {
      listingId,
      sellerId,
      attempt: 0,
      maxAttempts: 4,
      idempotencyKey,
    };

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: Resource.PublishQueue.url,
        MessageBody: JSON.stringify(publishJob),
      })
    );

    return jsonResponse(201, { listing });
  } catch (error) {
    console.error("Error creating listing:", error);
    return errorResponse(500, "Internal server error", "INTERNAL_ERROR");
  }
};
