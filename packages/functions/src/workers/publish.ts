import { SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { PublishJobMessage, MockPublishRequest, MockPublishResponse, ActivityEvent } from "@marketplace/core";
import {
  listingKey,
  activityKey,
  now,
  getBackoffDelay,
  generateId,
  listingFromDynamoRecord,
} from "@marketplace/core";

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const job: PublishJobMessage = JSON.parse(record.body);

    console.log(`Processing publish job for listing ${job.listingId}, attempt ${job.attempt + 1}/${job.maxAttempts}`);

    try {
      // Get the listing from DynamoDB
      const listingResult = await dynamodb.send(
        new GetCommand({
          TableName: Resource.Listings.name,
          Key: listingKey(job.sellerId, job.listingId),
        })
      );

      if (!listingResult.Item) {
        console.error(`Listing ${job.listingId} not found`);
        continue;
      }

      const listing = listingFromDynamoRecord(listingResult.Item as Record<string, unknown>);
      if (!listing) {
        console.error(`Listing ${job.listingId} row is missing LISTING sort key`);
        continue;
      }
      await dynamodb.send(
        new UpdateCommand({
          TableName: Resource.Listings.name,
          Key: listingKey(job.sellerId, job.listingId),
          UpdateExpression: "SET marketplaceStatus = :status, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":status": "publishing",
            ":updatedAt": now(),
          },
        })
      );

      // Get the webhook URL from environment
      const apiUrl = withTrailingSlash(process.env.API_URL ?? "");
      const webhookUrl = `${apiUrl}webhooks/marketplace`;

      // Call mock marketplace
      const mockMarketplaceUrlRaw = process.env.MOCK_MARKETPLACE_URL;
      if (!mockMarketplaceUrlRaw) {
        throw new Error("MOCK_MARKETPLACE_URL not configured");
      }
      const mockMarketplaceUrl = withTrailingSlash(mockMarketplaceUrlRaw);

      const publishRequest: MockPublishRequest = {
        listingId: job.listingId,
        sellerId: job.sellerId,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        currency: listing.currency,
        webhookUrl,
      };

      const response = await fetch(`${mockMarketplaceUrl}publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publishRequest),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Marketplace API error: ${response.status} - ${errorBody}`);
      }

      const result: MockPublishResponse = await response.json() as MockPublishResponse;

      if (!result.success) {
        throw new Error(result.error ?? "Unknown marketplace error");
      }

      // Update listing with success status
      const timestamp = now();
      await dynamodb.send(
        new UpdateCommand({
          TableName: Resource.Listings.name,
          Key: listingKey(job.sellerId, job.listingId),
          UpdateExpression: "SET #status = :status, marketplaceStatus = :mStatus, marketplaceListingId = :mpId, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "published",
            ":mStatus": "published",
            ":mpId": result.marketplaceListingId,
            ":updatedAt": timestamp,
          },
        })
      );

      // Add success activity event
      const activityEvent: ActivityEvent = {
        eventId: generateId(),
        listingId: job.listingId,
        sellerId: job.sellerId,
        eventType: "listing_published",
        payload: {
          marketplaceListingId: result.marketplaceListingId,
          attempt: job.attempt + 1,
        },
        source: "system",
        createdAt: timestamp,
      };

      await dynamodb.send(
        new PutCommand({
          TableName: Resource.Listings.name,
          Item: {
            ...activityKey(job.sellerId, timestamp, activityEvent.eventId),
            ...activityEvent,
          },
        })
      );

      console.log(`Successfully published listing ${job.listingId} as ${result.marketplaceListingId}`);
    } catch (error) {
      console.error(`Failed to publish listing ${job.listingId}:`, error);

      const nextAttempt = job.attempt + 1;

      if (nextAttempt < job.maxAttempts) {
        // Retry with exponential backoff via SQS DelaySeconds (mock 4xx/5xx / network errors —
        // not Lambda timeouts).
        const delaySeconds = Math.ceil(getBackoffDelay(nextAttempt) / 1000);

        console.log(`Scheduling retry ${nextAttempt + 1}/${job.maxAttempts} in ${delaySeconds}s`);

        const retryJob: PublishJobMessage = {
          ...job,
          attempt: nextAttempt,
        };

        await sqs.send(
          new SendMessageCommand({
            QueueUrl: Resource.PublishQueue.url,
            MessageBody: JSON.stringify(retryJob),
            DelaySeconds: Math.min(delaySeconds, 900), // Max 15 minutes
          })
        );

        const updatedAtRetry = now();
        await dynamodb.send(
          new UpdateCommand({
            TableName: Resource.Listings.name,
            Key: listingKey(job.sellerId, job.listingId),
            UpdateExpression: "SET marketplaceStatus = :status, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
              ":status": `retry_${nextAttempt}`,
              ":updatedAt": updatedAtRetry,
            },
          })
        );

        const errMsg = error instanceof Error ? error.message : "Unknown error";
        const errorShort = errMsg.length > 280 ? `${errMsg.slice(0, 280)}…` : errMsg;
        const retryActivityTs = now();
        const retryActivity: ActivityEvent = {
          eventId: generateId(),
          listingId: job.listingId,
          sellerId: job.sellerId,
          eventType: "publish_retry",
          payload: {
            tryThatFailed: job.attempt + 1,
            nextTryNumber: nextAttempt + 1,
            maxAttempts: job.maxAttempts,
            delaySeconds: Math.min(delaySeconds, 900),
            error: errorShort,
          },
          source: "system",
          createdAt: retryActivityTs,
        };

        await dynamodb.send(
          new PutCommand({
            TableName: Resource.Listings.name,
            Item: {
              ...activityKey(job.sellerId, retryActivityTs, retryActivity.eventId),
              ...retryActivity,
            },
          })
        );
      } else {
        // Max retries exceeded, mark as failed
        const timestamp = now();

        await dynamodb.send(
          new UpdateCommand({
            TableName: Resource.Listings.name,
            Key: listingKey(job.sellerId, job.listingId),
            UpdateExpression: "SET #status = :status, marketplaceStatus = :mStatus, updatedAt = :updatedAt",
            ExpressionAttributeNames: {
              "#status": "status",
            },
            ExpressionAttributeValues: {
              ":status": "failed",
              ":mStatus": "failed",
              ":updatedAt": timestamp,
            },
          })
        );

        // Add failure activity event
        const activityEvent: ActivityEvent = {
          eventId: generateId(),
          listingId: job.listingId,
          sellerId: job.sellerId,
          eventType: "listing_failed",
          payload: {
            error: error instanceof Error ? error.message : "Unknown error",
            attempts: job.maxAttempts,
          },
          source: "system",
          createdAt: timestamp,
        };

        await dynamodb.send(
          new PutCommand({
            TableName: Resource.Listings.name,
            Item: {
              ...activityKey(job.sellerId, timestamp, activityEvent.eventId),
              ...activityEvent,
            },
          })
        );

        console.error(`Listing ${job.listingId} failed after ${job.maxAttempts} attempts`);
      }
    }
  }
};
