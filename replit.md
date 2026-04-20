# VanSales Pro

## Overview

VanSales Pro is an offline-first mobile van sales application designed for field sales agents. The application allows sales agents to browse product catalogs, manage shopping carts, and create orders while working in areas with limited connectivity. Administrators can manage product catalogs and agent accounts through a separate admin interface.

The system integrates with BigCommerce as the source of product data and order synchronization, with local IndexedDB storage enabling offline functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: Zustand for global app state (user session, cart, offline mode)
- **Data Fetching**: TanStack Query for server state and caching
- **Offline Storage**: Dexie.js (IndexedDB wrapper) for local data persistence
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom industrial slate theme

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript compiled with tsx
- **API Design**: RESTful endpoints under `/api/` prefix
- **Build System**: Vite for development, esbuild for production server bundling

### Data Storage
- **Primary Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Managed via `drizzle-kit push` command
- **Client-side**: IndexedDB via Dexie for offline-first capabilities

### Authentication
- **Method**: Username/password authentication with bcryptjs hashing
- **Session Storage**: User stored in localStorage after login
- **Role-based Access**: Two roles - 'admin' and 'agent' with separate interfaces

### Key Data Models
- **Users**: Admin and agent accounts with enable/disable functionality
- **Products**: Catalog items with BigCommerce ID references, pinning for featured items
- **Orders**: Sales orders with status tracking (draft/pending_sync/failed/synced), order notes, sync error capture

### Order Status Flow
1. **Draft** - Created offline with manual customer input, no BigCommerce sync
2. **Pending** - Awaiting sync to BigCommerce
3. **Synced** - Successfully synced with BigCommerce order ID
4. **Failed** - Sync attempt failed, error message stored in sync_error field

### Local Price History Cache
- IndexedDB table `localPriceHistory` mirrors the Postgres `price_history_cache` table
- `getLocalPriceHistory(customerId, productId)` is checked first before backend price history API calls
- Background sync hook (`usePriceHistorySync`) syncs Postgres records into IndexedDB incrementally
- Sync is device-aware: mobile skips, tablet prompts user once, desktop syncs automatically when idle (2.5s)
- Sync endpoint: `GET /api/price-history/sync?after=<ms>&limit=<n>`
- Last sync timestamp stored in localStorage key `vansales_price_history_last_sync`
- Sync indicator shown at bottom-left of POS during sync; tablet shows a confirm prompt

### Cart Validation + Max Purchase Override
- `autoAddVariant` applies min/max purchase quantity validation on every add
- Below min → auto-adjusted to min; above max → non-blocking warning toast
- Before checkout, cart is scanned for items where `quantity > max_purchase_quantity`
- If any found → Max Override Modal appears listing affected items
- On confirm: removes BC limit for each variant via `POST /api/bigcommerce/products/set-variant-max-qty`, proceeds checkout, always restores original limits in `finally` block; opens BC product edit pages for verification
- Backend route extends refresh-stock and BC search to include `min_purchase_quantity` / `max_purchase_quantity` per variant

### Product Layout (POS)
- Pinned products shown as 2-column grid of `PinnedProductCard` components
- Each card has product image, name, price, stock, and an "Add to Cart" button
- Single-variant: "Add" button fetches fresh stock (incl. min/max) then calls `autoAddVariant` directly
- Multi-variant: "Add" button opens the VariantPopupDialog

### Manual Inventory Push
- `inventory_push_logs` table in PostgreSQL logs every push action
- `POST /api/inventory/push` fetches current BC inventory, increments, updates BC, logs to DB
- `GET /api/inventory/push-logs` returns log entries
- POS dropdown has "Push Inventory" button → opens `PushInventoryModal`
- Modal: search product → select variant (if multi-variant) → qty input → confirm dialog → push

### Offline Mode
- Automatic detection via browser online/offline events
- When offline: Customer search disabled, manual input fields shown
- Draft orders can be submitted when back online with automatic customer matching
- If auto-match fails, agent can edit customer details and manually search BigCommerce

### Agent Permissions
- `allow_bigcommerce_search` field on users table controls agent catalog search
- When enabled, agents see toggle to search full BigCommerce catalog (not just pinned products)
- Backend validates permission before allowing BigCommerce search API calls
- Admin can toggle permission per-agent in Users tab

### Inventory Validation
- Cart quantity inputs are clamped to available stock level
- +/- buttons respect inventory limits
- Zero-inventory items cannot be added to cart
- Validation accounts for items already in cart

### Directory Structure
```
├── client/src/          # React frontend application
│   ├── components/ui/   # shadcn/ui components
│   ├── pages/           # Route components (Login, admin/, agent/)
│   ├── lib/             # Utilities, API client, stores
│   └── hooks/           # Custom React hooks
├── server/              # Express backend
│   ├── routes.ts        # API endpoint definitions
│   ├── storage.ts       # Database access layer
│   └── static.ts        # Production static file serving
├── shared/              # Shared code between client/server
│   └── schema.ts        # Drizzle database schema
└── db/                  # Database configuration and seeds
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store accessed via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Third-Party Services
- **BigCommerce**: External e-commerce platform for product catalog source and order syncing (fully integrated with v2 Orders API)
- **Google Sheets**: Order backup integration was requested but dismissed - user declined to provide credentials. To enable in future, user needs to provide Google Service Account JSON and spreadsheet ID.

### Key npm Packages
- `@tanstack/react-query`: Server state management
- `dexie` + `dexie-react-hooks`: IndexedDB offline storage
- `zustand`: Client state management
- `bcryptjs`: Password hashing
- `drizzle-orm` + `drizzle-kit`: Database ORM and migrations
- `wouter`: Client-side routing
- Radix UI primitives: Accessible component foundations