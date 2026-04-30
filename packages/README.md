# Packages

This is a **pnpm workspace monorepo**. Each subfolder is a separate package that can depend on others.

## Structure

```
packages/
├── core/       # Shared TypeScript types and utilities
├── functions/  # AWS Lambda handlers (backend)
└── web/        # React frontend (Vite)
```

## Package dependencies

```
web ──────────────────────────────┐
                                  │
functions ──────► core ◄──────────┘
```

- `@marketplace/core` — Shared by both functions and web
- `@marketplace/functions` — Depends on core
- `@marketplace/web` — Standalone (types duplicated for simplicity)

## Workspace commands

```bash
# Install all packages
pnpm install

# Run command in specific package
pnpm -C packages/web dev
pnpm -C packages/web build

# Add dependency to specific package
pnpm -C packages/functions add <package>
```

## Adding a new package

1. Create folder under `packages/`
2. Add `package.json` with `"name": "@marketplace/<name>"`
3. Run `pnpm install` to link it
