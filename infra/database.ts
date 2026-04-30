// DynamoDB tables for listings and activity feed
export const listingsTable = new sst.aws.Dynamo("Listings", {
  fields: {
    pk: "string", // sellerId
    sk: "string", // LISTING#<listingId> or ACTIVITY#<timestamp>#<eventId>
  },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    // GSI to query all listings across sellers (for admin/demo purposes)
    byListingId: {
      hashKey: "sk",
      rangeKey: "pk",
    },
  },
});

// Idempotency table to prevent duplicate webhook processing
export const idempotencyTable = new sst.aws.Dynamo("Idempotency", {
  fields: {
    pk: "string", // eventId or idempotencyKey
  },
  primaryIndex: { hashKey: "pk" },
  ttl: "expiresAt",
});

export const database = {
  listingsTable,
  idempotencyTable,
};
