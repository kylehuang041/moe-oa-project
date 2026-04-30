import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { Listing, ActivityEvent, ListingWithActivity } from "@marketplace/core";
import {
  jsonResponse,
  errorResponse,
  parseListingSk,
  listingFromDynamoRecord,
} from "@marketplace/core";

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async () => {
  try {
    // For demo purposes, use a fixed seller ID
    const sellerId = "demo-seller";

    const result = await dynamodb.send(
      new QueryCommand({
        TableName: Resource.Listings.name,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": sellerId,
        },
        ScanIndexForward: false,
      })
    );

    const items = result.Items ?? [];

    const listings: Map<string, Listing> = new Map();
    const activities: Map<string, ActivityEvent[]> = new Map();

    for (const item of items) {
      const sk = item.sk as string;

      if (sk.startsWith("LISTING#")) {
        const listingId = parseListingSk(sk);
        if (!listingId) continue;
        const normalized = listingFromDynamoRecord(item as Record<string, unknown>);
        if (normalized) listings.set(listingId, normalized);
      } else if (sk.startsWith("ACTIVITY#")) {
        const activity = item as unknown as ActivityEvent;
        const lid = activity.listingId;
        if (!activities.has(lid)) {
          activities.set(lid, []);
        }
        activities.get(lid)!.push(activity);
      }
    }

    const listingsWithActivity: ListingWithActivity[] = [];

    for (const [listingId, listing] of listings) {
      const listingActivities = activities.get(listingId) ?? [];
      const recentActivity = listingActivities
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);

      listingsWithActivity.push({
        ...listing,
        recentActivity,
      });
    }

    listingsWithActivity.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return jsonResponse(200, { listings: listingsWithActivity });
  } catch (error) {
    console.error("Error getting listings:", error);
    return errorResponse(500, "Internal server error", "INTERNAL_ERROR");
  }
};
