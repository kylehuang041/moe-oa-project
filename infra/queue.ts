import { database } from "./database";

// Dead letter queue for failed publish attempts
export const publishDlq = new sst.aws.Queue("PublishDLQ");

// Main publish queue with retry configuration
export const publishQueue = new sst.aws.Queue("PublishQueue", {
  dlq: publishDlq.arn,
  visibilityTimeout: "60 seconds",
});

export const queue = {
  publishQueue,
  publishDlq,
};
