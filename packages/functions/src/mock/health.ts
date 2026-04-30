import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { jsonResponse } from "@marketplace/core";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  return jsonResponse(200, {
    status: "healthy",
    service: "mock-marketplace",
    timestamp: new Date().toISOString(),
  });
};
