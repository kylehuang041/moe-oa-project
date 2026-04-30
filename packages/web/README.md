# @marketplace/web

React frontend built with Vite and Tailwind CSS.

## Tech Stack

- **React 18** — UI framework
- **Vite 8** — Build tool with hot reload
- **Tailwind CSS** — Utility-first styling
- **TypeScript** — Type safety

## Structure

```
src/
├── App.tsx                 # Main app component
├── main.tsx               # React entry point
├── index.css              # Tailwind imports
├── types.ts               # Frontend type definitions
└── components/
    ├── CreateListingForm.tsx   # New listing form
    ├── ListingCard.tsx         # Listing display with activity
    └── TriggerEventPanel.tsx   # Mock event trigger UI
```

## Development

### With SST dev running

The frontend is automatically built and deployed to CloudFront. However, in dev mode the `webUrl` shows as unavailable.

Run locally instead:

```bash
# Get API URLs from sst dev output, then:
VITE_API_URL="https://xxx.execute-api.us-west-2.amazonaws.com/" \
VITE_MOCK_MARKETPLACE_URL="https://yyy.execute-api.us-west-2.amazonaws.com/" \
pnpm dev
```

### Standalone

```bash
pnpm dev      # Start dev server (http://localhost:5173)
pnpm build    # Production build to dist/
pnpm preview  # Preview production build
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Main API endpoint (injected by SST at build) |
| `VITE_MOCK_MARKETPLACE_URL` | Mock marketplace endpoint |

These are embedded at build time, not runtime.
