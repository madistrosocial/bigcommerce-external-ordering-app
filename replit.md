# VanSales Pro

## Overview

VanSales Pro is an offline-first mobile van sales application designed for field sales agents to manage product catalogs, shopping carts, and create orders even with limited connectivity. It aims to streamline the sales process for agents on the go. Administrators can manage product data and agent accounts through a separate interface. The system integrates with BigCommerce for product data and order synchronization, leveraging local IndexedDB for robust offline capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: Zustand (global state), TanStack Query (server state/caching)
- **Offline Storage**: Dexie.js (IndexedDB)
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS v4 with a custom industrial slate theme

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **API Design**: RESTful endpoints
- **Build System**: Vite (development), esbuild (production)

### Data Storage
- **Primary Database**: PostgreSQL with Drizzle ORM
- **Schema**: Defined in `shared/schema.ts`
- **Client-side**: IndexedDB via Dexie for offline persistence

### Authentication
- **Method**: Username/password with bcryptjs hashing
- **Session**: User stored in localStorage
- **Access Control**: Role-based ('admin', 'agent') with distinct interfaces

### Key Features
- **Offline-First Capabilities**: Enables agents to work without internet, syncing data when reconnected. Includes offline order creation and customer management.
- **Product Catalog Management**: Agents can browse and select products, with pinning for featured items.
- **Order Management**: Create, view, and manage sales orders with various statuses (Draft, Pending, Synced, Failed). Includes a local price history cache for quick access to past customer prices.
- **Cart Validation & Max Purchase Override**: Automatic quantity validation and a mechanism to override BigCommerce max purchase limits during checkout for specific scenarios.
- **Manual Inventory Push**: Admins can manually push inventory updates to BigCommerce, with logging and search functionality.
- **Agent Permissions (RBAC)**: Granular role-based access control system (`roles`, `permissions`, `role_permissions`, `user_permissions`) governing access to modules and actions.
- **Customer Management**: Create new BigCommerce customers and view/manage all BigCommerce customers with search, sort, and detailed order history.
- **BigCommerce Order Browser**: Comprehensive interface to view, filter, search, and edit existing BigCommerce orders, including adding/removing/updating line items.
- **SaaS Layout**: Global application layout with a collapsible sidebar and header, adapting for mobile and desktop, with role-based navigation.
- **Dashboard**: Landing page providing a summary of orders and quick actions for both agents and administrators.
- **Admin Console**: Dedicated section for administrators to manage users, roles, permissions, BigCommerce integration settings, and view all orders.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: Type-safe ORM for PostgreSQL.

### Third-Party Services
- **BigCommerce**: E-commerce platform used for product catalog, inventory, and order synchronization.

### Key npm Packages
- `@tanstack/react-query`: Server state management.
- `dexie` + `dexie-react-hooks`: IndexedDB wrapper for offline storage.
- `zustand`: Client-side state management.
- `bcryptjs`: Password hashing utility.
- `drizzle-orm` + `drizzle-kit`: ORM and migration tools for PostgreSQL.
- `wouter`: Lightweight client-side router.
- Radix UI primitives: Headless UI component library.