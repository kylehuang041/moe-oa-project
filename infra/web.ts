import { api } from "./api";
import { mockMarketplace } from "./mock";

// Static website hosted on S3 + CloudFront
export const web = new sst.aws.StaticSite("Web", {
  path: "packages/web",
  build: {
    command: "pnpm run build",
    output: "dist",
  },
  environment: {
    VITE_API_URL: api.url,
    VITE_MOCK_MARKETPLACE_URL: mockMarketplace.url,
  },
});
