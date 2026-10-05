export interface DropshippingPermissionDefinition {
  module: string;
  action: "view" | "manage" | "sync";
  label: string;
  description: string;
}

export interface DropshippingPermissionGroup {
  label: string;
  permissions: DropshippingPermissionDefinition[];
}

export const DROPSHIPPING_PERMISSION_GROUPS: DropshippingPermissionGroup[] = [
  {
    label: "Dashboard",
    permissions: [
      {
        module: "dropshipping_dashboard",
        action: "view",
        label: "View Dashboard",
        description: "Can view Dropshipping brand performance and save personal dashboard pins.",
      },
    ],
  },
  {
    label: "Vendor Imports",
    permissions: [
      {
        module: "dropshipping_vendor",
        action: "view",
        label: "View Vendor Settings",
        description: "Can view the vendor connection and import status.",
      },
      {
        module: "dropshipping_vendor",
        action: "manage",
        label: "Manage Vendor Settings",
        description: "Can update vendor connection settings and test the connection.",
      },
      {
        module: "dropshipping_vendor",
        action: "sync",
        label: "Run Vendor Imports",
        description: "Can sync the vendor feed and upload a vendor CSV.",
      },
    ],
  },
  {
    label: "Product Catalog",
    permissions: [
      {
        module: "dropshipping_catalog",
        action: "view",
        label: "View Product Catalog",
        description: "Can search and view vendor catalog products.",
      },
      {
        module: "dropshipping_catalog",
        action: "manage",
        label: "Manage Product Catalog",
        description: "Can change product status, map SKUs, and create BigCommerce drafts.",
      },
    ],
  },
  {
    label: "Product Sync",
    permissions: [
      {
        module: "dropshipping_product_sync",
        action: "view",
        label: "View Product Sync",
        description: "Can view sync selections, history, and image settings.",
      },
      {
        module: "dropshipping_product_sync",
        action: "manage",
        label: "Run Product Sync",
        description: "Can sync product details or images and manage the watermark logo.",
      },
    ],
  },
  {
    label: "Sync Logs",
    permissions: [
      {
        module: "dropshipping_sync_logs",
        action: "view",
        label: "View Sync Logs",
        description: "Can view vendor catalog import history.",
      },
    ],
  },
];

export const DROPSHIPPING_PERMISSIONS = DROPSHIPPING_PERMISSION_GROUPS.flatMap(
  (group) => group.permissions,
);

export const DROPSHIPPING_LEGACY_PERMISSION_GRANTS = [
  ...[
    "dropshipping_dashboard",
    "dropshipping_vendor",
    "dropshipping_catalog",
    "dropshipping_product_sync",
    "dropshipping_sync_logs",
  ].map((module) => ({ sourceAction: "view", module, action: "view" })),
  ...[
    "dropshipping_vendor",
    "dropshipping_catalog",
    "dropshipping_product_sync",
  ].map((module) => ({ sourceAction: "manage", module, action: "manage" })),
  { sourceAction: "sync", module: "dropshipping_vendor", action: "sync" },
];