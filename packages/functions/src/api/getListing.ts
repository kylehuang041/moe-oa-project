import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { ActivityEvent, ListingWithActivity } from "@marketplace/core";
import { jsonResponse, errorResponse, listingKey, listingFromDynamoRecord } from "@marketplace/core";

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const listingId = event.pathParameters?.listingId;

    if (!listingId) {
      return errorResponse(400, "Listing ID is required", "MISSING_LISTING_ID");
    }

    // For demo purposes, use a fixed seller ID
    const sellerId = "demo-seller";

    // Get the listing
    const listingResult = await dynamodb.send(
      new GetCommand({
        TableName: Resource.Listings.name,
        Key: listingKey(sellerId, listingId),
      })
    );

    if (!listingResult.Item) {
      return errorResponse(404, "Listing not found", "NOT_FOUND");
    }

    const normalized = listingFromDynamoRecord(listingResult.Item as Record<string, unknown>);
    if (!normalized) {
      return errorResponse(404, "Listing not found", "NOT_FOUND");
    }

    const listing = normalized;

    // Query all activities for this listing
    const activitiesResult = await dynamodb.send(
      new QueryCommand({
        TableName: Resource.Listings.name,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": sellerId,
          ":prefix": "ACTIVITY#",
        },
        ScanIndexForward: false,
      })
    );

    // Filter activities for this specific listing
    const allActivities = (activitiesResult.Items ?? []) as unknown as ActivityEvent[];
    const listingActivities = allActivities
      .filter((a) => a.listingId === listingId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const listingWithActivity: ListingWithActivity = {
      ...listing,
      recentActivity: listingActivities,
    };

    return jsonResponse(200, { listing: listingWithActivity });
  } catch (error) {
    console.error("Error getting listing:", error);
    return errorResponse(500, "Internal server error", "INTERNAL_ERROR");
  }
};
