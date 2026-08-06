---
name: CustomerOrdersPanel reuse in CRM
description: CustomerProfile no longer has its own OrdersTable or OrderNotesModal; CustomerOrdersPanel owns all order display and note editing for CRM customer pages.
---

## Rule
`CustomerProfile.tsx` uses `CustomerOrdersPanel` (from `client/src/components/orders/CustomerOrdersPanel.tsx`) for all order display. Do NOT recreate a separate orders table inside CustomerProfile.

## What CustomerOrdersPanel does
- Fetches `/api/crm/customers/:crmCustomerId/orders` for the order list
- When a row is expanded, fetches `/api/bigcommerce/orders/:bcOrderId/detail` for line items
- Note editing via `PATCH /api/bigcommerce/orders/:bcOrderId/notes`
- Own pagination (25 per page) unless `limit` prop is set (used in Overview tab for "latest 20")

## Props
```tsx
<CustomerOrdersPanel crmCustomerId={id} />              // Orders tab — full list
<CustomerOrdersPanel crmCustomerId={id} limit={20} />   // Overview tab — recent 20
```

## What was removed from CustomerProfile
- `OrdersTable` local component (replaced by CustomerOrdersPanel)
- `OrderNotesModal` local component (note editing is inline in CustomerOrdersPanel)
- `orders` useQuery, `loadingOrders`, `recentOrders`, `allOrders`, `pagedOrders`
- `orderModal`, `ordersPage`, `ordersPageSize`, `totalOrderPages`, `handlePageSizeChange`

**Why:** Avoids duplicating order display logic and syncing two separate implementations of note editing.
