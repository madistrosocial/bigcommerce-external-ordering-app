export const MARKETING_PAGE_PERMISSIONS = [
  {
    module: "marketing",
    action: "view",
    label: "Main Module & Overview",
    description: "Can open the main Marketing module and its overview dashboard.",
  },
  {
    module: "marketing",
    action: "view_campaigns",
    label: "Campaigns",
    description: "Can view campaign lists, details, and campaign editor pages.",
  },
  {
    module: "marketing",
    action: "view_order_form",
    label: "Order Form",
    description: "Can view and prepare customer order-form emails.",
  },
  {
    module: "marketing",
    action: "view_product_lists",
    label: "Product Lists",
    description: "Can view reusable product collections.",
  },
  {
    module: "marketing",
    action: "view_audiences",
    label: "Audiences",
    description: "Can view audiences, members, and audience contacts.",
  },
  {
    module: "marketing",
    action: "view_audience_readiness",
    label: "Audience Readiness",
    description: "Can view CRM and email-platform audience readiness reports.",
  },
  {
    module: "marketing",
    action: "view_templates",
    label: "Templates",
    description: "Can view reusable marketing templates.",
  },
  {
    module: "marketing",
    action: "view_automations",
    label: "Automations",
    description: "Can view marketing automations and execution history.",
  },
  {
    module: "marketing",
    action: "view_log",
    label: "Delivery Log",
    description: "Can view campaign and order-form delivery history.",
  },
  {
    module: "marketing",
    action: "view_analytics",
    label: "Analytics",
    description: "Can view campaign performance metrics.",
  },
  {
    module: "marketing",
    action: "view_settings",
    label: "Settings",
    description: "Can view Marketing sender and eligibility settings.",
  },
] as const;

export const MARKETING_ACTION_PERMS = [
  ...MARKETING_PAGE_PERMISSIONS,
  { module: "marketing", action: "create", label: "Create Campaigns", description: "Can create and duplicate campaigns." },
  { module: "marketing", action: "edit", label: "Edit Campaigns", description: "Can edit campaign content and audience settings." },
  { module: "marketing", action: "delete", label: "Delete Campaigns", description: "Can delete campaigns that have not been sent." },
  { module: "marketing", action: "send", label: "Schedule and Send Campaigns", description: "Can move campaigns through the scheduling and sending workflow." },
  { module: "marketing", action: "manage_product_lists", label: "Manage Product Lists", description: "Can create, edit, and delete product lists and their items." },
  { module: "marketing", action: "manage_audiences", label: "Manage Marketing Audiences", description: "Can create, edit, import, and delete campaign audiences." },
  { module: "marketing", action: "manage_templates", label: "Manage Marketing Templates", description: "Can create, edit, archive, and reuse marketing templates." },
  { module: "marketing", action: "manage_automations", label: "Manage Marketing Automations", description: "Can create and manage marketing automations." },
  { module: "marketing", action: "manage_suppressions", label: "Manage Marketing Suppressions", description: "Can manage customer marketing preferences and suppressions." },
] as const;

// One-time mapping that preserves the existing access users/groups received
// before Marketing pages had separate view permissions.
export const MARKETING_LEGACY_PAGE_GRANTS = [
  { pageAction: "view_campaigns", sourceActions: ["view", "create", "edit"] },
  { pageAction: "view_order_form", sourceActions: ["view"] },
  { pageAction: "view_product_lists", sourceActions: ["view"] },
  { pageAction: "view_audiences", sourceActions: ["view", "manage_audiences"] },
  { pageAction: "view_audience_readiness", sourceActions: ["view"] },
  { pageAction: "view_templates", sourceActions: ["view", "manage_templates"] },
  { pageAction: "view_automations", sourceActions: ["view", "manage_automations"] },
  { pageAction: "view_log", sourceActions: ["view"] },
  { pageAction: "view_settings", sourceActions: ["view", "send"] },
] as const;