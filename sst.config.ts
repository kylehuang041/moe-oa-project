/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "marketplace-aggregator",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          profile: "bob",
          region: "us-west-2",
        },
      },
    };
  },
  async run() {
    const { database } = await import("./infra/database");
    const { queue } = await import("./infra/queue");
    const { mockMarketplace } = await import("./infra/mock");
    const { api } = await import("./infra/api");
    const { web } = await import("./infra/web");

    return {
      apiUrl: api.url,
      mockMarketplaceUrl: mockMarketplace.url,
      webUrl: web.url,
    };
  },
});
