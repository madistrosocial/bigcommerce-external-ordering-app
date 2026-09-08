import { db } from "../db";
 import { type User, type InsertUser, type Product, type InsertProduct, type Order, type InsertOrder, type InsertPriceHistoryCache, type PriceHistoryCacheEntry, type InsertInventoryPushLog, type InventoryPushLog, type InsertProductLinkLog, type ProductLinkLog, type Role, type InsertRole, type Permission, type InsertPermission, type InsertRolePermission, type InsertUserPermission, type InsertShipstationExportHistory, type ShipstationExportHistory, type InsertPromoFreeSkuTracker, type PromoFreeSkuTracker, type CrmCustomer, type InsertCrmCustomer, type CrmOrder, type InsertCrmOrder, type CrmSalesRep, type InsertCrmSalesRep, type CrmNote, type InsertCrmNote, type InsertCrmAuditLog, type PosPriceOverrideAudit, type InsertPosPriceOverrideAudit, type PosStoreCreditUsage, type InsertPosStoreCreditUsage, type InsertReportExportLog, type InsertBcOrderLineItem, type StoreCreditLedgerEntry, type InsertStoreCreditLedger, type EmailTemplate, type InventoryAuditTask, type CustomerSignup, type CustomerSignupAttempt, type InsertCustomerSignup, type MarketingCampaign, type MarketingAudience, type AttendanceSession, type InsertAttendanceSession, type AttendanceCheckpoint, type InsertAttendanceCheckpoint, type AttendanceException, type InsertAttendanceException, users, products, orders, settings, priceHistoryCache, inventoryPushLogs, productLinkLogs, roles, permissions, rolePermissions, userPermissions, shipstationExportHistory, promoFreeSkuTracker, customersMirror, customerOrdersMirror, customerSalesRep, customerSignups, customerSignupAttempts, crmCustomerNotes, crmAuditLog, attendanceSessions, attendanceLocationCheckpoints, attendanceExceptions, posPriceOverrideAudit, posStoreCreditUsage, reportExportLogs, bcOrderLineItems, notifications, storeCreditLedger, emailTemplates, inventoryAuditTasks, marketingCampaigns, marketingAudiences, marketingContacts, marketingAudienceMembers, marketingCampaignRecipients, marketingCampaignActivity, marketingCampaignEvents, marketingCustomerPreferences, marketingSuppressions, marketingAutomations, marketingAutomationSteps, marketingAutomationExecutions } from "@shared/schema";
import { eq, desc, and, inArray, gt, gte, lt, lte, asc, or, ilike, sql, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { normalizeMarketingProductDisplayOptions, DEFAULT_MARKETING_PRODUCT_DISPLAY_OPTIONS } from "@shared/marketing-products";
import { attendanceAuditLog } from "@shared/schema";
import type { AttendanceAuditLog, InsertAttendanceAuditLog } from "@shared/schema";

const MARKETING_US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUsersByIds(ids: number[]): Promise<Pick<User, 'id' | 'name'>[]>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllAgents(): Promise<User[]>;
  getAllAdmins(): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  updateUserStatus(id: number, is_enabled: boolean): Promise<void>;
  updateUserPermission(id: number, allow_bigcommerce_search: boolean): Promise<void>;
  updateUserDetails(id: number, data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean; default_landing_page: string }>): Promise<User>;
  setAttendanceHomeLocation(id: number, latitude: string, longitude: string): Promise<User>;
  clearAttendanceHomeLocation(id: number): Promise<void>;

  // Product operations
  getAllProducts(): Promise<Product[]>;
  getPinnedProducts(): Promise<Product[]>;
  getPromotionProducts(): Promise<Product[]>;
  getProductByBigCommerceId(bcId: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductPin(id: number, is_pinned: boolean): Promise<void>;
  updateProductPromotion(id: number, is_promotion: boolean): Promise<void>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<void>;
  updateProductByBigCommerceId(bcId: number, updates: Partial<InsertProduct>): Promise<void>;

  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrdersByUser(userId: number): Promise<Order[]>;
  getPendingSyncOrders(): Promise<Order[]>;
  getDraftOrders(userId?: number): Promise<Order[]>;
  updateOrderStatus(id: number, status: string, bcOrderId?: number): Promise<void>;
  updateOrderNote(id: number, note: string): Promise<void>;
  updateOrderCustomerNote(id: number, customerNote: string): Promise<void>;
  getConsolidatedOrders(params: { page: number; limit: number; search?: string; createdBy?: number | null; syncStatus?: string; bcStatus?: string; dateFrom?: Date | null; dateTo?: Date | null; salesChannel?: "salesapp" | "allorders"; }): Promise<{ orders: any[]; total: number; kpis: { total: number; revenue: number; successful: number; pending: number; failed: number; completed: number; awaitingFulfillment: number; cancelled: number; }; }>;
  getOrderDetail(id: number): Promise<any | null>;
  updateOrderSyncError(id: number, error: string): Promise<void>;
  updateOrderForSubmission(id: number, updates: { bigcommerce_customer_id: number; billing_address: any; status: string }): Promise<void>;
  deleteOrder(id: number): Promise<void>;
  getOrdersByBcCustomerId(bcCustomerId: number, statuses: string[]): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;

  // Setting operations
  getSetting(key: string): Promise<any>;
  setSetting(key: string, value: any): Promise<void>;

  // Price history cache operations
  getCachedPriceHistory(customerId: number, bcProductId: number): Promise<PriceHistoryCacheEntry[]>;
  savePriceHistoryCacheEntries(entries: InsertPriceHistoryCache[]): Promise<void>;
  getPriceHistoryForSync(afterMs: number | null, limit: number): Promise<PriceHistoryCacheEntry[]>;

  // Inventory push log operations
  createInventoryPushLog(entry: InsertInventoryPushLog): Promise<InventoryPushLog>;
  getInventoryPushLogs(opts: { page: number; limit: number; search?: string; username?: string; dateFrom?: string; dateTo?: string }): Promise<{ rows: InventoryPushLog[]; total: number }>;
  getInventoryPushLogUsernames(): Promise<string[]>;
  getInventoryPushLogsForExport(opts: { search?: string; username?: string; dateFrom?: string; dateTo?: string }): Promise<InventoryPushLog[]>;

  // Inventory audit task operations
  createOrUpdateAuditTask(opts: { sku: string; product_id: number; variant_id: number; product_name: string; variant_name: string; quantity_added: number; system_qty: number; created_by: number; source?: string }): Promise<InventoryAuditTask>;
  getAuditKPIs(): Promise<{ totalPendingTasks: number; skusToAudit: number; totalPendingQty: number; lastAuditAt: Date | null; lastAuditBy: string | null }>;
  getAuditQueue(opts: { page: number; limit: number; search?: string; status?: string; source?: string; dateFrom?: string; dateTo?: string }): Promise<{ groups: any[]; total: number }>;
  getAuditTasksForProduct(productId: number, status?: string): Promise<InventoryAuditTask[]>;
  getAuditTask(id: number): Promise<InventoryAuditTask | undefined>;
  completeAuditTask(id: number, data: { physical_qty: number; variance: number; reason: string; notes?: string; completed_by: number; skuvault_result?: any }): Promise<InventoryAuditTask>;
  failAuditTask(id: number): Promise<void>;

  // Product link log operations
  createProductLinkLog(entry: InsertProductLinkLog): Promise<ProductLinkLog>;
  getProductLinkLogs(limit?: number): Promise<ProductLinkLog[]>;

  // RBAC operations
  getAllRoles(): Promise<Role[]>;
  getRoleById(id: number): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  deleteRole(id: number): Promise<void>;
  getAllPermissions(): Promise<Permission[]>;
  createPermission(perm: InsertPermission): Promise<Permission>;
  deletePermission(id: number): Promise<void>;
  getPermissionsForRole(roleId: number): Promise<Permission[]>;
  addPermissionToRole(entry: InsertRolePermission): Promise<void>;
  removePermissionFromRole(roleId: number, permissionId: number): Promise<void>;
  getPermissionsForUser(userId: number): Promise<Permission[]>;
  addPermissionToUser(entry: InsertUserPermission): Promise<void>;
  removePermissionFromUser(userId: number, permissionId: number): Promise<void>;
  getUserPermissionStrings(userId: number): Promise<string[]>;
  setUserRole(userId: number, roleId: number | null): Promise<void>;
  updateRole(id: number, data: Partial<{ name: string; description: string | null }>): Promise<Role>;

  // ShipStation export history
  createShipstationExportHistory(entry: InsertShipstationExportHistory): Promise<ShipstationExportHistory>;
  getShipstationExportHistory(limit?: number): Promise<ShipstationExportHistory[]>;
  getShipstationExportHistoryById(id: number): Promise<ShipstationExportHistory | undefined>;

  // Promo SKU tracker
  getAllPromoSkus(): Promise<PromoFreeSkuTracker[]>;
  getPromoSkuById(id: number): Promise<PromoFreeSkuTracker | undefined>;
  getPromoSkuBySku(sku: string): Promise<PromoFreeSkuTracker | undefined>;
  createPromoSku(entry: InsertPromoFreeSkuTracker): Promise<PromoFreeSkuTracker>;
  updatePromoSku(id: number, data: Partial<InsertPromoFreeSkuTracker>): Promise<PromoFreeSkuTracker>;
  deletePromoSku(id: number): Promise<void>;

  // CRM operations
  getCrmCustomers(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; limit?: number; offset?: number; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number; accountType?: string; status?: string }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null; last_action_date?: string | null; last_action_type?: string | null })[]; total: number }>;
  getHealthThresholds(): Promise<{ healthy_days: number; watch_days: number; at_risk_days: number }>;
  setHealthThresholds(t: { healthy_days: number; watch_days: number; at_risk_days: number }): Promise<void>;
  getCrmCustomerById(id: number): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null }) | undefined>;
  getCrmCustomerByBcId(bcId: number): Promise<CrmCustomer | undefined>;
  upsertCrmCustomer(data: InsertCrmCustomer): Promise<CrmCustomer>;
  getCrmCustomerCount(): Promise<number>;
  getAllCrmCustomersForExport(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number; accountType?: string; status?: string }): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null; last_action_date?: string | null; last_action_type?: string | null })[]>;
  updateCrmCustomerMasterFields(id: number, data: { primary_rep_id?: number | null; secondary_rep_id?: number | null; customer_type?: string; account_type?: string; inactive_reason?: string | null; inactive_at?: Date | null; inactive_notes?: string | null; inactivated_by_user_id?: number | null; is_active?: boolean }): Promise<void>;
  getCrmFilterOptions(): Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }>;
  getCrmOrdersByBcCustomerId(bcCustomerId: number, limit?: number): Promise<CrmOrder[]>;
  upsertCrmOrder(data: InsertCrmOrder): Promise<CrmOrder>;
  getCrmOrderCount(): Promise<number>;
  updateCrmCustomerStats(bcCustomerId: number, stats: { lifetime_orders: number; lifetime_revenue: string; last_order_date: Date | null }): Promise<void>;
  recalculateCrmCustomerStats(): Promise<{ updated: number; customers_in_orders: number; duration_ms: number }>;
  getCrmSalesRep(customerId: number): Promise<CrmSalesRep | undefined>;
  setCrmSalesRep(data: InsertCrmSalesRep): Promise<CrmSalesRep>;
  removeCrmSalesRep(customerId: number): Promise<void>;
  // CRM Notes
  createCrmNote(data: InsertCrmNote): Promise<CrmNote>;
  getCrmNotes(customerId: number): Promise<(CrmNote & { created_by_name?: string | null })[]>;
  getCrmNoteById(id: number): Promise<CrmNote | undefined>;
  updateCrmNote(id: number, data: { note?: string; note_type?: string; order_id?: number | null }): Promise<CrmNote>;
  deleteCrmNote(id: number): Promise<void>;
  getAllCrmNotes(opts: { search?: string; type?: string; createdBy?: number; customerId?: number; orderId?: number; customerGroup?: string; state?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): Promise<{ notes: any[]; total: number }>;
  getCrmNotesKpis(opts?: { search?: string; createdBy?: number; customerGroup?: string; state?: string; dateFrom?: string; dateTo?: string }): Promise<{ notesToday: number; followUps: number; salesCalls: number; issues: number; internalNotes: number }>;
  // CRM Timeline
  getCrmTimeline(customerId: number): Promise<any[]>;
  // CRM Reactivation
  getReactivationCustomers(opts: { search?: string; group?: string; state?: string; health?: string; rep?: number; sortBy?: string; sortDir?: string; limit?: number; offset?: number; visibilityScope?: string; visibilityUserId?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null })[]; total: number }>;
  // CRM Metrics
  getCrmMetrics(opts: { search?: string; group?: string; state?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; customerType?: string; addressType?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number; accountType?: string; status?: string }): Promise<{ total: number; healthy: number; watch: number; at_risk: number; lost: number; needs_follow_up: number; inactive: number; by_account_type: Record<string, number> }>;
  // CRM Todos (rows in crm_customer_notes with activity_type='todo')
  getCrmTodos(opts: { userId?: number; allUsers?: boolean; status?: string; customerId?: number; visibilityScope?: string; visibilityUserId?: number }): Promise<any[]>;
  createCrmTodo(data: { customer_id?: number | null; title: string; note: string; priority?: string; due_date?: Date | null; assigned_to_user_id?: number | null; reminder_at?: Date | null; created_by: number }): Promise<any>;
  updateCrmTodo(id: number, data: { title?: string; note?: string; priority?: string; due_date?: Date | null; assigned_to_user_id?: number | null; reminder_at?: Date | null; todo_status?: string; completed_at?: Date | null }): Promise<any>;
  deleteCrmTodo(id: number): Promise<void>;
  // CRM Users list
  getCrmUsers(): Promise<{ id: number; name: string }[]>;
  createCustomerSignup(entry: InsertCustomerSignup): Promise<CustomerSignup>;
  getCustomerSignups(opts: { userId?: number; signedUpByUserId?: number; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): Promise<{ rows: (CustomerSignup & { crm_customer_id?: number | null; primary_rep_name?: string | null })[]; total: number }>;
  getCustomerSignupAttempt(key: string): Promise<CustomerSignupAttempt | undefined>;
  createCustomerSignupAttempt(key: string, createdByUserId: number, requestData: unknown): Promise<boolean>;
  setCustomerSignupAttemptCustomerId(key: string, customerId: number): Promise<void>;
  completeCustomerSignupAttempt(key: string, result: unknown): Promise<void>;
  // CRM Order Notes (mirror update)
  updateCrmOrderNotes(bcOrderId: number, data: { staff_notes?: string; customer_order_notes?: string }): Promise<void>;
  // CRM Audit Log
  createCrmAuditLog(data: InsertCrmAuditLog): Promise<void>;
  // CRM Table resets
  truncateCrmCustomers(): Promise<void>;
  truncateCrmOrders(): Promise<void>;

  // Attendance
  getAttendanceHomeLocation(userId: number): Promise<{ latitude: string | null; longitude: string | null; setAt: Date | null }>;
  getAttendanceById(id: number): Promise<AttendanceSession | undefined>;
  getActiveAttendanceForUser(userId: number): Promise<AttendanceSession | undefined>;
  getAttendanceHistoryForUser(userId: number, limit?: number): Promise<AttendanceSession[]>;
  createAttendance(data: InsertAttendanceSession): Promise<AttendanceSession>;
  updateAttendance(id: number, data: Partial<InsertAttendanceSession>): Promise<AttendanceSession | undefined>;
  createAttendanceCheckpoint(data: InsertAttendanceCheckpoint): Promise<AttendanceCheckpoint>;
  getAttendanceCheckpoints(attendanceId: number): Promise<AttendanceCheckpoint[]>;
  getAttendanceRecords(opts: { from?: string; to?: string; userId?: number; status?: string; startMethod?: string; reviewStatus?: string; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number }>;
  getAttendanceAuditHistory(attendanceId: number): Promise<AttendanceAuditLog[]>;
  createAttendanceAuditLog(data: InsertAttendanceAuditLog): Promise<AttendanceAuditLog>;
  updateAttendanceReview(id: number, data: { review_status: string; approved_by?: number | null; approved_at?: Date | null; locked_at?: Date | null }): Promise<AttendanceSession | undefined>;
  createAttendanceException(data: InsertAttendanceException): Promise<AttendanceException>;
  getAttendanceExceptions(opts: { status?: string; from?: string; to?: string; userId?: number; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number }>;
  reviewAttendanceException(id: number, data: { status: string; reviewed_by: number; review_notes?: string | null }): Promise<AttendanceException | undefined>;

  // POS Enhancements — Price Override Audit
  createPosPriceOverrideAudit(entry: InsertPosPriceOverrideAudit): Promise<PosPriceOverrideAudit>;
  getPosPriceOverrideAudit(opts: { userId?: number; customerId?: number; sku?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string; limit?: number; offset?: number }): Promise<{ rows: PosPriceOverrideAudit[]; total: number }>;

  // POS Enhancements — Store Credit Usage
  createPosStoreCreditUsage(entry: InsertPosStoreCreditUsage): Promise<PosStoreCreditUsage>;
  getPosStoreCreditUsage(opts: { customerId?: number; cashierId?: number; orderSearch?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string; limit?: number; offset?: number }): Promise<{ rows: PosStoreCreditUsage[]; total: number }>;

  // Store Credit Ledger
  createStoreCreditLedger(entry: InsertStoreCreditLedger): Promise<StoreCreditLedgerEntry>;
  getCrmIdByBcCustomerId(bcCustomerId: number): Promise<number | null>;
  setCustomerStoreCreditBalance(crmId: number, newBalance: number): Promise<void>;
  getStoreCreditLedger(opts: { customerId?: number; issuedBy?: number; dateFrom?: string; dateTo?: string; search?: string; type?: string; limit?: number; offset?: number }): Promise<{ rows: StoreCreditLedgerEntry[]; total: number }>;
  updateCustomerStoreCreditBalance(customerId: number, delta: number): Promise<void>;

  // Email Templates
  getEmailTemplate(key: string): Promise<EmailTemplate | undefined>;
  upsertEmailTemplate(key: string, data: { name: string; subject_template: string; body: string; template_type?: string; category?: string; is_active?: boolean; updated_by?: number }): Promise<EmailTemplate>;
  getMarketingTemplates(opts?: { search?: string; category?: string; includeArchived?: boolean }): Promise<EmailTemplate[]>;
  getMarketingTemplateById(id: number): Promise<EmailTemplate | undefined>;
  archiveMarketingTemplate(id: number, userId: number, archived: boolean): Promise<EmailTemplate | undefined>;

  // Marketing
  getMarketingDashboard(): Promise<any>;
  getMarketingCampaigns(opts?: { search?: string; status?: string; limit?: number; offset?: number }): Promise<{ campaigns: any[]; total: number }>;
  getMarketingCampaign(id: number): Promise<any | undefined>;
  createMarketingCampaign(data: { name: string; internal_description?: string; campaign_type?: string; subject_line?: string; preview_text?: string; message_content?: string; sender_email?: string; audience_type: string; audience_id?: number | null; audience_config?: Record<string, unknown>; template_id?: number | null; product_snapshots?: unknown[]; product_display_options?: unknown; scheduled_at?: Date | null; timezone?: string; created_by: number; customer_ids?: number[] }): Promise<any>;
  updateMarketingCampaign(id: number, data: Record<string, unknown> & { customer_ids?: number[] }, userId: number): Promise<any | undefined>;
  deleteMarketingCampaign(id: number, userId: number): Promise<void>;
  updateMarketingCampaignStatus(id: number, status: string, userId: number): Promise<any | undefined>;
  claimMarketingCampaign(id: number): Promise<any | undefined>;
  getMarketingQueueCampaigns(): Promise<any[]>;
  prepareMarketingRecipients(campaignId: number): Promise<{ eligible: number; suppressed: number; unsubscribed: number }>;
  claimMarketingRecipient(id: number): Promise<any | undefined>;
  resetMarketingFailedRecipients(campaignId: number): Promise<void>;
  markMarketingRecipientSent(id: number, providerMessageId?: string | null): Promise<void>;
  markMarketingRecipientFailed(id: number, reason: string, retryable?: boolean): Promise<void>;
  recordMarketingEvent(data: { campaign_id: number; recipient_id?: number | null; event_type: string; detail?: Record<string, unknown>; provider_event_id?: string | null }): Promise<void>;
  completeMarketingCampaign(id: number): Promise<any | undefined>;
  getMarketingRecipients(campaignId: number, opts?: { status?: string; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number }>;
  getMarketingRecipient(id: number): Promise<any | undefined>;
  getMarketingAnalytics(opts?: { campaignId?: number; dateFrom?: string; dateTo?: string }): Promise<any>;
  markMarketingTestSent(campaignId: number): Promise<void>;
  getMarketingCustomerPreference(customerId: number): Promise<any>;
  upsertMarketingCustomerPreference(customerId: number, data: { email_subscribed: boolean; userId?: number }): Promise<any>;
  getMarketingSuppressions(customerId?: number): Promise<any[]>;
  createMarketingSuppression(data: { customerId: number; email?: string; reason: string; source?: string; createdBy?: number }): Promise<any>;
  revokeMarketingSuppression(id: number, userId: number, detail?: string): Promise<any | undefined>;
  getMarketingAudiencePreview(filters: Record<string, unknown>, limit?: number): Promise<{ customers: any[]; total: number; suppressed: number }>;
  getMarketingAutomations(opts?: { status?: string; search?: string }): Promise<any[]>;
  getMarketingAutomation(id: number): Promise<any | undefined>;
  createMarketingAutomation(data: { name: string; description?: string; trigger_type: string; trigger_config?: Record<string, unknown>; frequency_days?: number; created_by: number; steps: Array<{ action_type: string; action_config?: Record<string, unknown> }> }): Promise<any>;
  updateMarketingAutomation(id: number, data: Record<string, unknown>, userId: number): Promise<any | undefined>;
  updateMarketingAutomationStatus(id: number, status: string, userId: number): Promise<any | undefined>;
  getMarketingAutomationExecutions(id: number, limit?: number): Promise<any[]>;
  createMarketingAutomationExecution(data: { automationId: number; customerId: number; triggerEvent: string; dedupeKey: string }): Promise<any | undefined>;
  updateMarketingAutomationExecution(id: number, data: Record<string, unknown>): Promise<void>;
  getMarketingAudiences(opts?: { search?: string; type?: string }): Promise<any[]>;
  getMarketingAudience(id: number): Promise<any | undefined>;
  createMarketingAudience(data: { name: string; description?: string; audience_type: string; dynamic_filters?: Record<string, unknown>; customer_ids?: number[]; contact_ids?: number[]; created_by: number }): Promise<any>;
  updateMarketingAudience(id: number, data: { name?: string; description?: string; audience_type?: string; dynamic_filters?: Record<string, unknown>; customer_ids?: number[]; contact_ids?: number[] }, userId: number): Promise<any | undefined>;
  deleteMarketingAudience(id: number, userId: number): Promise<void>;
  getMarketingAudienceCustomers(opts?: { search?: string; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number; limit: number; offset: number }>;
  getMarketingContacts(opts?: { search?: string; type?: string; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number; limit: number; offset: number }>;
  importMarketingContacts(records: Array<{ email: string; first_name?: string; last_name?: string; company?: string; phone?: string; contact_type: string }>, userId: number): Promise<{ imported: number; duplicates: number }>;
  deactivateMarketingContact(id: number): Promise<void>;
  getMarketingAudienceMembers(audienceId: number, opts?: { search?: string; source?: string; status?: string; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number }>;

  // Reports — legacy (orders table)
  getSalesReport(opts: { view: string; dateFrom?: string; dateTo?: string; search?: string; status?: string; page?: number; limit?: number; sortBy?: string; sortDir?: string }): Promise<{ rows: Record<string, unknown>[]; total: number }>;
  logReportExport(data: InsertReportExportLog): Promise<void>;

  // Reports — BC Order Line Items mirror
  getSyncedBcOrderIds(dateFrom?: string, dateTo?: string): Promise<Set<number>>;
  insertBcOrderLineItems(items: InsertBcOrderLineItem[]): Promise<void>;
  getBcOrderLineItemsCount(): Promise<number>;
  truncateBcOrderLineItems(): Promise<void>;
  getCrmOrdersForLineItemSync(since?: string): Promise<Array<{ bigcommerce_order_id: number; order_date: Date | null; customer_name: string | null; customer_email: string | null; bigcommerce_customer_id: number | null }>>;
  searchProductsForReport(query: string, limit?: number): Promise<Product[]>;
  searchLineItemsByQuery(query: string, limit?: number): Promise<Array<{ bigcommerce_product_id: number; product_name: string; brand_name: string; sku: string; variant_label: string | null }>>;
  getProductsByBrandId(brandId: number): Promise<Product[]>;
  getProductsByCategoryId(categoryId: number): Promise<Product[]>;
  getSalesReportSummary(opts: { dateFrom?: string; dateTo?: string; bcProductIds?: number[]; skuFilter?: string; bcStatusFilter?: string; page: number; limit: number; sortBy: string; sortDir: string }): Promise<{ rows: Record<string, unknown>[]; total: number }>;
  getSalesReportDetails(opts: { dateFrom?: string; dateTo?: string; bcProductIds?: number[]; skuFilter?: string; bcStatusFilter?: string; page: number; limit: number; sortBy: string; sortDir: string }): Promise<{ rows: Record<string, unknown>[]; total: number }>;
  getSalesReportStats(opts: { dateFrom?: string; dateTo?: string; bcProductIds?: number[]; skuFilter?: string; bcStatusFilter?: string }): Promise<{ totalProducts: number; totalVariants: number; totalQtySold: number; totalCurrentStock: number }>;
  getRecentExportLogs(limit?: number): Promise<Record<string, unknown>[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUsersByIds(ids: number[]): Promise<Pick<User, 'id' | 'name'>[]> {
    if (ids.length === 0) return [];
    return db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values([user]).returning();
    return result[0];
  }

  async getAllAgents(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, 'agent'));
  }

  async getAllAdmins(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, 'admin'));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getCustomerSignupAttempt(key: string): Promise<CustomerSignupAttempt | undefined> {
    const [attempt] = await db.select().from(customerSignupAttempts).where(eq(customerSignupAttempts.idempotency_key, key));
    return attempt;
  }

  async createCustomerSignupAttempt(key: string, createdByUserId: number, requestData: unknown): Promise<boolean> {
    const result = await db.insert(customerSignupAttempts).values({
      idempotency_key: key,
      created_by_user_id: createdByUserId,
      request_data: requestData,
    }).onConflictDoNothing().returning({ key: customerSignupAttempts.idempotency_key });
    return result.length === 1;
  }

  async setCustomerSignupAttemptCustomerId(key: string, customerId: number): Promise<void> {
    await db.update(customerSignupAttempts).set({
      bigcommerce_customer_id: customerId,
      status: "tracking",
      updated_at: new Date(),
    }).where(eq(customerSignupAttempts.idempotency_key, key));
  }

  async completeCustomerSignupAttempt(key: string, result: unknown): Promise<void> {
    await db.update(customerSignupAttempts).set({
      status: "completed",
      result,
      updated_at: new Date(),
    }).where(eq(customerSignupAttempts.idempotency_key, key));
  }

  async createCustomerSignup(entry: InsertCustomerSignup): Promise<CustomerSignup> {
    const result = await db.insert(customerSignups).values(entry).onConflictDoUpdate({
      target: customerSignups.bigcommerce_customer_id,
      set: {
        first_name: entry.first_name,
        last_name: entry.last_name,
        email: entry.email,
        company: entry.company,
        customer_group_id: entry.customer_group_id,
        customer_group_name: entry.customer_group_name,
        attribution: entry.attribution,
        shipping_address: entry.shipping_address,
        signed_up_by_user_id: entry.signed_up_by_user_id,
        signed_up_by_name: entry.signed_up_by_name,
        primary_rep_id: entry.primary_rep_id,
      },
    }).returning();
    return result[0];
  }

  async getCustomerSignups(opts: { userId?: number; signedUpByUserId?: number; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): Promise<{ rows: (CustomerSignup & { crm_customer_id?: number | null; primary_rep_name?: string | null })[]; total: number }> {
    const { userId, signedUpByUserId, dateFrom, dateTo, limit = 50, offset = 0 } = opts;
    const conditions = [];
    if (userId !== undefined) conditions.push(eq(customerSignups.signed_up_by_user_id, userId));
    if (signedUpByUserId !== undefined) conditions.push(eq(customerSignups.signed_up_by_user_id, signedUpByUserId));
    if (dateFrom) conditions.push(gte(customerSignups.created_at, new Date(`${dateFrom}T00:00:00`)));
    if (dateTo) {
      const end = new Date(`${dateTo}T00:00:00`);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(customerSignups.created_at, end));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const primaryRepUser = alias(users, "signup_primary_rep_user");
    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(customerSignups).where(where),
      db.select({
        signup: customerSignups,
        crm_customer_id: customersMirror.id,
        primary_rep_name: primaryRepUser.name,
      })
        .from(customerSignups)
        .leftJoin(customersMirror, eq(customersMirror.bigcommerce_customer_id, customerSignups.bigcommerce_customer_id))
        .leftJoin(primaryRepUser, eq(primaryRepUser.id, customerSignups.primary_rep_id))
        .where(where)
        .orderBy(desc(customerSignups.created_at))
        .limit(limit)
        .offset(offset),
    ]);
    return {
      rows: rows.map((row) => ({ ...row.signup, crm_customer_id: row.crm_customer_id ?? null, primary_rep_name: row.primary_rep_name ?? null })),
      total: countRows[0]?.count ?? 0,
    };
  }

  async updateUserStatus(id: number, is_enabled: boolean): Promise<void> {
    await db.update(users).set({ is_enabled }).where(eq(users.id, id));
  }

  async updateUserPermission(id: number, allow_bigcommerce_search: boolean): Promise<void> {
    await db.update(users).set({ allow_bigcommerce_search }).where(eq(users.id, id));
  }

  async updateUserDetails(id: number, data: Partial<{ name: string; username: string; password: string; role: string; is_enabled: boolean; allow_bigcommerce_search: boolean; default_landing_page: string }>): Promise<User> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  }

  async setAttendanceHomeLocation(id: number, latitude: string, longitude: string): Promise<User> {
    const [updated] = await db.update(users).set({
      attendance_home_latitude: latitude,
      attendance_home_longitude: longitude,
      attendance_home_set_at: new Date(),
    }).where(eq(users.id, id)).returning();
    return updated;
  }

  async clearAttendanceHomeLocation(id: number): Promise<void> {
    await db.update(users).set({
      attendance_home_latitude: null,
      attendance_home_longitude: null,
      attendance_home_set_at: null,
    }).where(eq(users.id, id));
  }

  // Product operations
  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(desc(products.is_pinned));
  }

  async getPinnedProducts(): Promise<Product[]> {
    return db.select().from(products).where(eq(products.is_pinned, true));
  }

  async getPromotionProducts(): Promise<Product[]> {
    return db.select().from(products).where(eq(products.is_promotion, true));
  }

  async getProductByBigCommerceId(bcId: number): Promise<Product | undefined> {
    const result = await db.select().from(products).where(eq(products.bigcommerce_id, bcId));
    return result[0];
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const result = await db.insert(products).values([product]).returning();
    return result[0];
  }

  async updateProductPin(id: number, is_pinned: boolean): Promise<void> {
    await db.update(products).set({ is_pinned }).where(eq(products.id, id));
  }

  async updateProductPromotion(id: number, is_promotion: boolean): Promise<void> {
    await db.update(products).set({ is_promotion }).where(eq(products.id, id));
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>): Promise<void> {
    await db.update(products).set(updates).where(eq(products.id, id));
  }

  async updateProductByBigCommerceId(bcId: number, updates: Partial<InsertProduct>): Promise<void> {
    await db.update(products).set(updates).where(eq(products.bigcommerce_id, bcId));
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const result = await db.insert(orders).values([order]).returning();
    return result[0];
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const result = await db.select().from(orders).where(eq(orders.id, id));
    return result[0];
  }

  async getOrdersByUser(userId: number): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.created_by_user_id, userId)).orderBy(desc(orders.date));
  }

  async getPendingSyncOrders(): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.status, 'pending_sync'));
  }

  async getDraftOrders(userId?: number): Promise<Order[]> {
    const whereClause = userId == null
      ? eq(orders.status, "draft")
      : and(eq(orders.status, "draft"), eq(orders.created_by_user_id, userId));
    const rows = await db
      .select({
        order: orders,
        created_by_name: users.name,
        created_by_username: users.username,
      })
      .from(orders)
      .leftJoin(users, eq(orders.created_by_user_id, users.id))
      .where(whereClause)
      .orderBy(desc(orders.date));

    return rows.map(({ order, created_by_name, created_by_username }) => ({
      ...order,
      created_by_name: created_by_name ?? undefined,
      created_by_username: created_by_username ?? undefined,
    }));
  }

  async updateOrderStatus(id: number, status: string, bcOrderId?: number): Promise<void> {
    await db.update(orders).set({ 
      status, 
      ...(bcOrderId && { bigcommerce_order_id: bcOrderId }) 
    }).where(eq(orders.id, id));
  }

  async updateOrderNote(id: number, note: string): Promise<void> {
    await db.update(orders).set({ order_note: note }).where(eq(orders.id, id));
  }

  async updateOrderCustomerNote(id: number, customerNote: string): Promise<void> {
    await db.update(orders).set({ customer_note: customerNote }).where(eq(orders.id, id));
  }

  async updateOrderSyncError(id: number, error: string): Promise<void> {
    await db.update(orders).set({ 
      status: 'failed',
      sync_error: error 
    }).where(eq(orders.id, id));
  }

  async updateOrderForSubmission(id: number, updates: { bigcommerce_customer_id: number; billing_address: any; status: string }): Promise<void> {
    await db.update(orders).set({
      bigcommerce_customer_id: updates.bigcommerce_customer_id,
      billing_address: updates.billing_address,
      status: updates.status
    }).where(eq(orders.id, id));
  }

  async deleteOrder(id: number): Promise<void> {
    await db.delete(orders).where(eq(orders.id, id));
  }

  async getAllOrders(): Promise<Order[]> {
    return db.select().from(orders).orderBy(desc(orders.date));
  }

  async getConsolidatedOrders(params: {
    page: number; limit: number; search?: string;
    createdBy?: number | null; syncStatus?: string; bcStatus?: string;
    dateFrom?: Date | null; dateTo?: Date | null;
    salesChannel?: "salesapp" | "allorders";
  }): Promise<{ orders: any[]; total: number; kpis: { total: number; revenue: number; successful: number; pending: number; failed: number; completed: number; awaitingFulfillment: number; cancelled: number; }; }> {
    const { page, limit, search, createdBy, syncStatus, bcStatus, dateFrom, dateTo, salesChannel = "salesapp" } = params;
    const offset = (page - 1) * limit;

    // ── All Orders mode: pull from customerOrdersMirror (BC-synced data) ──────
    if (salesChannel === "allorders") {
      const conds: any[] = [];
      if (search) {
        const q = `%${search}%`;
        conds.push(or(
          ilike(customerOrdersMirror.customer_name, q),
          ilike(customerOrdersMirror.customer_email, q),
          sql`CAST(${customerOrdersMirror.bigcommerce_order_id} AS TEXT) ILIKE ${q}`,
          sql`CAST(${customerOrdersMirror.order_number} AS TEXT) ILIKE ${q}`,
          ilike(customersMirror.phone, q),
        ));
      }
      if (bcStatus)   conds.push(eq(customerOrdersMirror.status, bcStatus));
      if (dateFrom)   conds.push(sql`${customerOrdersMirror.order_date} >= ${dateFrom}`);
      if (dateTo)     conds.push(sql`${customerOrdersMirror.order_date} <= ${dateTo}`);
      const where = conds.length > 0 ? and(...conds) : undefined;

      const [rows, [countRow], [kpiRow]] = await Promise.all([
        db.select({
          id: customerOrdersMirror.id,
          customer_name: customerOrdersMirror.customer_name,
          customer_email: customerOrdersMirror.customer_email,
          bigcommerce_customer_id: customerOrdersMirror.bigcommerce_customer_id,
          billing_address: sql<null>`NULL::jsonb`,
          status: customerOrdersMirror.status,
          bc_status: customerOrdersMirror.status,
          sync_error: sql<null>`NULL::text`,
          order_note: customerOrdersMirror.staff_notes,
          customer_note: customerOrdersMirror.customer_order_notes,
          items: sql<string>`'[]'::json`,
          total: customerOrdersMirror.order_total,
          date: customerOrdersMirror.order_date,
          created_by_user_id: sql<null>`NULL::int`,
          bigcommerce_order_id: customerOrdersMirror.bigcommerce_order_id,
          created_by_name: sql<null>`NULL::text`,
          company: customersMirror.company,
          crm_customer_id: customersMirror.id,
          is_bc_mirror: sql<boolean>`TRUE`,
        })
        .from(customerOrdersMirror)
        .leftJoin(customersMirror, eq(customerOrdersMirror.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
        .where(where)
        .orderBy(sql`${customerOrdersMirror.order_date} DESC NULLS LAST`)
        .limit(limit).offset(offset),

        db.select({ count: sql<number>`COUNT(*)` })
          .from(customerOrdersMirror)
          .leftJoin(customersMirror, eq(customerOrdersMirror.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
          .where(where),

        db.select({
          total:               sql<number>`COUNT(*)`,
          revenue:             sql<string>`COALESCE(SUM(${customerOrdersMirror.order_total}), 0)`,
          completed:           sql<number>`COUNT(*) FILTER (WHERE ${customerOrdersMirror.status} = 'Completed')`,
          awaitingFulfillment: sql<number>`COUNT(*) FILTER (WHERE ${customerOrdersMirror.status} = 'Awaiting Fulfillment')`,
          cancelled:           sql<number>`COUNT(*) FILTER (WHERE ${customerOrdersMirror.status} = 'Cancelled')`,
        })
        .from(customerOrdersMirror)
        .leftJoin(customersMirror, eq(customerOrdersMirror.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
        .where(where),
      ]);

      return {
        orders: rows,
        total: Number(countRow?.count ?? 0),
        kpis: {
          total:               Number(kpiRow?.total               ?? 0),
          revenue:             parseFloat(String(kpiRow?.revenue  ?? "0")),
          successful:          0, pending: 0, failed: 0,
          completed:           Number(kpiRow?.completed           ?? 0),
          awaitingFulfillment: Number(kpiRow?.awaitingFulfillment ?? 0),
          cancelled:           Number(kpiRow?.cancelled           ?? 0),
        },
      };
    }

    // ── Sales App mode: pull from local orders table ──────────────────────────
    const conds: any[] = [sql`${orders.status} != 'draft'`];
    if (search) {
      const q = `%${search}%`;
      conds.push(or(
        ilike(orders.customer_name, q),
        ilike(orders.customer_email, q),
        sql`CAST(${orders.bigcommerce_order_id} AS TEXT) ILIKE ${q}`,
        sql`CAST(${orders.id} AS TEXT) ILIKE ${q}`,
        ilike(customersMirror.phone, q),
      ));
    }
    if (createdBy != null) conds.push(eq(orders.created_by_user_id, createdBy));
    if (syncStatus)        conds.push(eq(orders.status, syncStatus));
    if (dateFrom)          conds.push(sql`${orders.date} >= ${dateFrom}`);
    if (dateTo)            conds.push(sql`${orders.date} <= ${dateTo}`);

    const bcStatusCond = bcStatus ? eq(customerOrdersMirror.status, bcStatus) : undefined;
    const where = conds.length > 0 ? and(...conds) : undefined;
    const fullWhere = bcStatusCond ? and(where, bcStatusCond) : where;

    const baseQuery = () => db.from(orders)
      .leftJoin(users, eq(orders.created_by_user_id, users.id))
      .leftJoin(customersMirror, eq(orders.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
      .leftJoin(customerOrdersMirror, eq(orders.bigcommerce_order_id, customerOrdersMirror.bigcommerce_order_id));

    const [rows, [countRow], [kpiRow]] = await Promise.all([
      db.select({
        id: orders.id,
        customer_name: orders.customer_name,
        customer_email: orders.customer_email,
        bigcommerce_customer_id: orders.bigcommerce_customer_id,
        billing_address: orders.billing_address,
        status: orders.status,
        bc_status: customerOrdersMirror.status,
        sync_error: orders.sync_error,
        order_note: orders.order_note,
        customer_note: orders.customer_note,
        items: orders.items,
        total: orders.total,
        date: orders.date,
        created_by_user_id: orders.created_by_user_id,
        bigcommerce_order_id: orders.bigcommerce_order_id,
        created_by_name: users.name,
        company: customersMirror.company,
        crm_customer_id: customersMirror.id,
        is_bc_mirror: sql<boolean>`FALSE`,
      })
      .from(orders)
      .leftJoin(users, eq(orders.created_by_user_id, users.id))
      .leftJoin(customersMirror, eq(orders.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
      .leftJoin(customerOrdersMirror, eq(orders.bigcommerce_order_id, customerOrdersMirror.bigcommerce_order_id))
      .where(fullWhere)
      .orderBy(desc(orders.date))
      .limit(limit).offset(offset),

      db.select({ count: sql<number>`COUNT(*)` })
        .from(orders)
        .leftJoin(customersMirror, eq(orders.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
        .leftJoin(customerOrdersMirror, eq(orders.bigcommerce_order_id, customerOrdersMirror.bigcommerce_order_id))
        .where(fullWhere),

      db.select({
        total:      sql<number>`COUNT(*)`,
        revenue:    sql<string>`COALESCE(SUM(${orders.total}), 0)`,
        successful: sql<number>`COUNT(*) FILTER (WHERE ${orders.status} = 'synced')`,
        pending:    sql<number>`COUNT(*) FILTER (WHERE ${orders.status} = 'pending_sync')`,
        failed:     sql<number>`COUNT(*) FILTER (WHERE ${orders.status} = 'failed')`,
      })
      .from(orders)
      .leftJoin(customersMirror, eq(orders.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
      .leftJoin(customerOrdersMirror, eq(orders.bigcommerce_order_id, customerOrdersMirror.bigcommerce_order_id))
      .where(fullWhere),
    ]);

    return {
      orders: rows,
      total: Number(countRow?.count ?? 0),
      kpis: {
        total:               Number(kpiRow?.total      ?? 0),
        revenue:             parseFloat(String(kpiRow?.revenue ?? "0")),
        successful:          Number(kpiRow?.successful ?? 0),
        pending:             Number(kpiRow?.pending    ?? 0),
        failed:              Number(kpiRow?.failed     ?? 0),
        completed: 0, awaitingFulfillment: 0, cancelled: 0,
      },
    };
  }

  async getOrderDetail(id: number): Promise<any | null> {
    const [row] = await db.select({
      id: orders.id,
      customer_name: orders.customer_name,
      customer_email: orders.customer_email,
      bigcommerce_customer_id: orders.bigcommerce_customer_id,
      billing_address: orders.billing_address,
      status: orders.status,
      sync_error: orders.sync_error,
      order_note: orders.order_note,
      customer_note: orders.customer_note,
      items: orders.items,
      total: orders.total,
      date: orders.date,
      created_by_user_id: orders.created_by_user_id,
      bigcommerce_order_id: orders.bigcommerce_order_id,
      google_sheets_logged: orders.google_sheets_logged,
      created_by_name: users.name,
      company: customersMirror.company,
      crm_customer_id: customersMirror.id,
    })
    .from(orders)
    .leftJoin(users, eq(orders.created_by_user_id, users.id))
    .leftJoin(customersMirror, eq(orders.bigcommerce_customer_id, customersMirror.bigcommerce_customer_id))
    .where(eq(orders.id, id));
    return row ?? null;
  }

  async getOrdersByBcCustomerId(bcCustomerId: number, statuses: string[]): Promise<Order[]> {
    return db.select().from(orders)
      .where(and(eq(orders.bigcommerce_customer_id, bcCustomerId), inArray(orders.status, statuses)))
      .orderBy(desc(orders.date));
  }

  // Setting operations
  async getSetting(key: string): Promise<any> {
    const result = await db.select().from(settings).where(eq(settings.key, key));
    return result[0];
  }

  async setSetting(key: string, value: any): Promise<void> {
    await db.insert(settings).values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }

  async getCachedPriceHistory(customerId: number, bcProductId: number): Promise<PriceHistoryCacheEntry[]> {
    return db.select().from(priceHistoryCache)
      .where(and(
        eq(priceHistoryCache.customer_id, customerId),
        eq(priceHistoryCache.product_id, bcProductId)
      ))
      .orderBy(desc(priceHistoryCache.created_at))
      .limit(20);
  }

  async savePriceHistoryCacheEntries(entries: InsertPriceHistoryCache[]): Promise<void> {
    for (const entry of entries) {
      const exists = await db.select({ id: priceHistoryCache.id })
        .from(priceHistoryCache)
        .where(and(
          eq(priceHistoryCache.customer_id, entry.customer_id),
          eq(priceHistoryCache.product_id, entry.product_id),
          eq(priceHistoryCache.order_id, entry.order_id)
        ))
        .limit(1);
      if (exists.length === 0) {
        await db.insert(priceHistoryCache).values(entry);
      }
    }
  }

  async getPriceHistoryForSync(afterMs: number | null, limit: number): Promise<PriceHistoryCacheEntry[]> {
    if (afterMs) {
      const afterDate = new Date(afterMs);
      return db.select().from(priceHistoryCache)
        .where(gt(priceHistoryCache.created_at, afterDate))
        .orderBy(asc(priceHistoryCache.created_at))
        .limit(limit);
    }
    return db.select().from(priceHistoryCache)
      .orderBy(asc(priceHistoryCache.created_at))
      .limit(limit);
  }

  async createInventoryPushLog(entry: InsertInventoryPushLog): Promise<InventoryPushLog> {
    const result = await db.insert(inventoryPushLogs).values(entry).returning();
    return result[0];
  }

  async getInventoryPushLogs(opts: { page: number; limit: number; search?: string; username?: string; dateFrom?: string; dateTo?: string }): Promise<{ rows: InventoryPushLog[]; total: number }> {
    const { page, limit, search, username, dateFrom, dateTo } = opts;
    const offset = page * limit;
    const conditions = [];
    if (search) conditions.push(or(ilike(inventoryPushLogs.product_name, `%${search}%`), ilike(inventoryPushLogs.sku, `%${search}%`))!);
    if (username) conditions.push(eq(inventoryPushLogs.username, username));
    if (dateFrom) conditions.push(gte(inventoryPushLogs.created_at, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(inventoryPushLogs.created_at, end));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countRes, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(inventoryPushLogs).where(where),
      db.select().from(inventoryPushLogs).where(where).orderBy(desc(inventoryPushLogs.created_at)).limit(limit).offset(offset),
    ]);
    return { rows: rows as InventoryPushLog[], total: countRes[0]?.count ?? 0 };
  }

  async getInventoryPushLogsForExport(opts: { search?: string; username?: string; dateFrom?: string; dateTo?: string }): Promise<InventoryPushLog[]> {
    const { search, username, dateFrom, dateTo } = opts;
    const conditions = [];
    if (search) conditions.push(or(ilike(inventoryPushLogs.product_name, `%${search}%`), ilike(inventoryPushLogs.sku, `%${search}%`))!);
    if (username) conditions.push(eq(inventoryPushLogs.username, username));
    if (dateFrom) conditions.push(gte(inventoryPushLogs.created_at, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(inventoryPushLogs.created_at, end));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(inventoryPushLogs).where(where).orderBy(desc(inventoryPushLogs.created_at)) as Promise<InventoryPushLog[]>;
  }

  async getInventoryPushLogUsernames(): Promise<string[]> {
    const result = await db.selectDistinct({ username: inventoryPushLogs.username })
      .from(inventoryPushLogs)
      .where(sql`${inventoryPushLogs.username} != ''`)
      .orderBy(inventoryPushLogs.username);
    return result.map(r => r.username);
  }

  // ── Inventory audit task methods ──────────────────────────────────────────

  async createOrUpdateAuditTask(opts: { sku: string; product_id: number; variant_id: number; product_name: string; variant_name: string; quantity_added: number; system_qty: number; created_by: number; source?: string; skuvault_location?: string | null }): Promise<InventoryAuditTask> {
    const { sku, product_id, variant_id, product_name, variant_name, quantity_added, system_qty, created_by, source = "manual_push", skuvault_location } = opts;
    const now = new Date();
    // Try to find an existing pending task for this SKU
    const existing = await db.select().from(inventoryAuditTasks)
      .where(and(eq(inventoryAuditTasks.sku, sku), eq(inventoryAuditTasks.status, "pending")))
      .limit(1);
    if (existing.length > 0) {
      // Accumulate the push
      const task = existing[0];
      const updated = await db.update(inventoryAuditTasks)
        .set({
          total_push_qty: (task.total_push_qty ?? 0) + quantity_added,
          push_count: (task.push_count ?? 0) + 1,
          last_push_at: now,
          system_qty,
          product_name: product_name || task.product_name,
          variant_name: variant_name || task.variant_name,
          ...(skuvault_location ? { skuvault_location } : {}),
        })
        .where(eq(inventoryAuditTasks.id, task.id))
        .returning();
      return updated[0];
    }
    // Create new pending task
    const created = await db.insert(inventoryAuditTasks).values({
      sku, product_id, variant_id, product_name, variant_name,
      status: "pending", source,
      total_push_qty: quantity_added, push_count: 1,
      last_push_at: now, system_qty,
      created_by,
      skuvault_location: skuvault_location ?? null,
    }).returning();
    return created[0];
  }

  async getAuditKPIs(): Promise<{ totalPendingTasks: number; skusToAudit: number; totalPendingQty: number; lastAuditAt: Date | null; lastAuditBy: string | null }> {
    const [pendingAgg, lastCompleted] = await Promise.all([
      db.select({
        product_count: sql<number>`COUNT(DISTINCT product_id)::int`,
        sku_count: sql<number>`COUNT(*)::int`,
        total_qty: sql<number>`COALESCE(SUM(total_push_qty),0)::int`,
      }).from(inventoryAuditTasks).where(eq(inventoryAuditTasks.status, "pending")),
      db.select({
        completed_at: inventoryAuditTasks.completed_at,
        completed_by_id: inventoryAuditTasks.completed_by,
      }).from(inventoryAuditTasks)
        .where(eq(inventoryAuditTasks.status, "completed"))
        .orderBy(desc(inventoryAuditTasks.completed_at)).limit(1),
    ]);
    const agg = pendingAgg[0];
    let lastAuditBy: string | null = null;
    if (lastCompleted[0]?.completed_by_id) {
      const u = await db.select({ name: users.name, username: users.username })
        .from(users).where(eq(users.id, lastCompleted[0].completed_by_id)).limit(1);
      lastAuditBy = u[0]?.name || u[0]?.username || null;
    }
    return {
      totalPendingTasks: agg?.product_count ?? 0,
      skusToAudit: agg?.sku_count ?? 0,
      totalPendingQty: agg?.total_qty ?? 0,
      lastAuditAt: lastCompleted[0]?.completed_at ?? null,
      lastAuditBy,
    };
  }

  async getAuditQueue(opts: { page: number; limit: number; search?: string; status?: string; source?: string; dateFrom?: string; dateTo?: string }): Promise<{ groups: any[]; total: number }> {
    const { page, limit, search, status = "pending", source, dateFrom, dateTo } = opts;
    const conditions: any[] = [eq(inventoryAuditTasks.status, status)];
    if (search) conditions.push(or(ilike(inventoryAuditTasks.sku, `%${search}%`), ilike(inventoryAuditTasks.product_name, `%${search}%`))!);
    if (source) conditions.push(eq(inventoryAuditTasks.source, source));
    if (dateFrom) conditions.push(gte(inventoryAuditTasks.last_push_at, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo); end.setDate(end.getDate() + 1);
      conditions.push(lt(inventoryAuditTasks.last_push_at, end));
    }
    const where = and(...conditions);

    // Count distinct products
    const [countRes, rawGroups] = await Promise.all([
      db.select({ cnt: sql<number>`COUNT(DISTINCT product_id)::int` })
        .from(inventoryAuditTasks).where(where),
      db.select({
        product_id: inventoryAuditTasks.product_id,
        product_name: inventoryAuditTasks.product_name,
        sku_count: sql<number>`COUNT(*)::int`,
        total_push_qty: sql<number>`COALESCE(SUM(total_push_qty),0)::int`,
        last_push_at: sql<Date>`MAX(last_push_at)`,
        source: inventoryAuditTasks.source,
        status: inventoryAuditTasks.status,
      }).from(inventoryAuditTasks).where(where)
        .groupBy(inventoryAuditTasks.product_id, inventoryAuditTasks.product_name, inventoryAuditTasks.source, inventoryAuditTasks.status)
        .orderBy(sql`MAX(last_push_at) DESC`)
        .limit(limit).offset(page * limit),
    ]);

    // For each group, get the sku group prefix from the first SKU
    const groups = rawGroups.map((g) => ({
      ...g,
      sku_group: null as string | null, // populated below
    }));

    // Fetch sku_group (first 8 chars of sku) for display
    for (const group of groups) {
      const firstSku = await db.select({ sku: inventoryAuditTasks.sku })
        .from(inventoryAuditTasks)
        .where(and(eq(inventoryAuditTasks.product_id, group.product_id), eq(inventoryAuditTasks.status, status)))
        .limit(1);
      group.sku_group = firstSku[0]?.sku?.slice(0, 8).toUpperCase() ?? null;
    }

    return { groups, total: countRes[0]?.cnt ?? 0 };
  }

  async getAuditTasksForProduct(productId: number, status?: string): Promise<InventoryAuditTask[]> {
    const conditions: any[] = [eq(inventoryAuditTasks.product_id, productId)];
    if (status) conditions.push(eq(inventoryAuditTasks.status, status));
    return db.select().from(inventoryAuditTasks)
      .where(and(...conditions))
      .orderBy(asc(inventoryAuditTasks.variant_name)) as Promise<InventoryAuditTask[]>;
  }

  async getAuditTask(id: number): Promise<InventoryAuditTask | undefined> {
    const result = await db.select().from(inventoryAuditTasks)
      .where(eq(inventoryAuditTasks.id, id)).limit(1);
    return result[0] as InventoryAuditTask | undefined;
  }

  async completeAuditTask(id: number, data: { physical_qty: number; variance: number; reason: string; notes?: string; completed_by: number; skuvault_result?: any; skuvault_location?: string | null }): Promise<InventoryAuditTask> {
    const result = await db.update(inventoryAuditTasks).set({
      status: "completed",
      physical_qty: data.physical_qty,
      variance: data.variance,
      reason: data.reason,
      notes: data.notes || null,
      completed_by: data.completed_by,
      completed_at: new Date(),
      skuvault_result: data.skuvault_result ?? null,
      ...(data.skuvault_location != null ? { skuvault_location: data.skuvault_location } : {}),
    }).where(eq(inventoryAuditTasks.id, id)).returning();
    return result[0] as InventoryAuditTask;
  }

  async failAuditTask(id: number): Promise<void> {
    await db.update(inventoryAuditTasks).set({ status: "failed" })
      .where(eq(inventoryAuditTasks.id, id));
  }

  async createProductLinkLog(entry: InsertProductLinkLog): Promise<ProductLinkLog> {
    const result = await db.insert(productLinkLogs).values(entry).returning();
    return result[0];
  }

  async getProductLinkLogs(limit = 200): Promise<ProductLinkLog[]> {
    return db.select().from(productLinkLogs)
      .orderBy(desc(productLinkLogs.created_at))
      .limit(limit);
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────

  async getAllRoles(): Promise<Role[]> {
    return db.select().from(roles).orderBy(asc(roles.name));
  }

  async getRoleById(id: number): Promise<Role | undefined> {
    const result = await db.select().from(roles).where(eq(roles.id, id));
    return result[0];
  }

  async createRole(role: InsertRole): Promise<Role> {
    const result = await db.insert(roles).values(role).returning();
    return result[0];
  }

  async deleteRole(id: number): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async getAllPermissions(): Promise<Permission[]> {
    return db.select().from(permissions).orderBy(asc(permissions.module), asc(permissions.action));
  }

  async createPermission(perm: InsertPermission): Promise<Permission> {
    const result = await db.insert(permissions).values(perm).returning();
    return result[0];
  }

  async deletePermission(id: number): Promise<void> {
    await db.delete(permissions).where(eq(permissions.id, id));
  }

  async getPermissionsForRole(roleId: number): Promise<Permission[]> {
    const rps = await db.select({ permission_id: rolePermissions.permission_id })
      .from(rolePermissions)
      .where(eq(rolePermissions.role_id, roleId));
    if (rps.length === 0) return [];
    const ids = rps.map((r) => r.permission_id);
    return db.select().from(permissions).where(inArray(permissions.id, ids));
  }

  async addPermissionToRole(entry: InsertRolePermission): Promise<void> {
    await db.insert(rolePermissions).values(entry).onConflictDoNothing();
  }

  async removePermissionFromRole(roleId: number, permissionId: number): Promise<void> {
    await db.delete(rolePermissions)
      .where(and(eq(rolePermissions.role_id, roleId), eq(rolePermissions.permission_id, permissionId)));
  }

  async getPermissionsForUser(userId: number): Promise<Permission[]> {
    const ups = await db.select({ permission_id: userPermissions.permission_id })
      .from(userPermissions)
      .where(eq(userPermissions.user_id, userId));
    if (ups.length === 0) return [];
    const ids = ups.map((u) => u.permission_id);
    return db.select().from(permissions).where(inArray(permissions.id, ids));
  }

  async addPermissionToUser(entry: InsertUserPermission): Promise<void> {
    await db.insert(userPermissions).values(entry).onConflictDoNothing();
  }

  async removePermissionFromUser(userId: number, permissionId: number): Promise<void> {
    await db.delete(userPermissions)
      .where(and(eq(userPermissions.user_id, userId), eq(userPermissions.permission_id, permissionId)));
  }

  async getUserPermissionStrings(userId: number): Promise<string[]> {
    const user = await this.getUser(userId);
    if (!user) return [];
    const directPerms = await this.getPermissionsForUser(userId);
    let rolePerms: Permission[] = [];
    if (user.role_id) {
      rolePerms = await this.getPermissionsForRole(user.role_id);
    }
    const all = [...directPerms, ...rolePerms];
    return [...new Set(all.map((p) => `${p.module}:${p.action}`))];
  }

  async setUserRole(userId: number, roleId: number | null): Promise<void> {
    await db.update(users).set({ role_id: roleId }).where(eq(users.id, userId));
  }

  async updateRole(id: number, data: Partial<{ name: string; description: string | null }>): Promise<Role> {
    const result = await db.update(roles).set(data).where(eq(roles.id, id)).returning();
    return result[0];
  }

  // ShipStation export history
  async createShipstationExportHistory(entry: InsertShipstationExportHistory): Promise<ShipstationExportHistory> {
    const result = await db.insert(shipstationExportHistory).values([entry]).returning();
    return result[0];
  }

  async getShipstationExportHistory(limit = 100): Promise<ShipstationExportHistory[]> {
    return db.select().from(shipstationExportHistory).orderBy(desc(shipstationExportHistory.created_at)).limit(limit);
  }

  async getShipstationExportHistoryById(id: number): Promise<ShipstationExportHistory | undefined> {
    const result = await db.select().from(shipstationExportHistory).where(eq(shipstationExportHistory.id, id));
    return result[0];
  }

  // Promo SKU tracker
  async getAllPromoSkus(): Promise<PromoFreeSkuTracker[]> {
    return db.select().from(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.is_active, true)).orderBy(asc(promoFreeSkuTracker.product_name));
  }

  async getPromoSkuById(id: number): Promise<PromoFreeSkuTracker | undefined> {
    const result = await db.select().from(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.id, id));
    return result[0];
  }

  async getPromoSkuBySku(sku: string): Promise<PromoFreeSkuTracker | undefined> {
    const result = await db.select().from(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.sku, sku));
    return result[0];
  }

  async createPromoSku(entry: InsertPromoFreeSkuTracker): Promise<PromoFreeSkuTracker> {
    const result = await db.insert(promoFreeSkuTracker).values([entry]).returning();
    return result[0];
  }

  async updatePromoSku(id: number, data: Partial<InsertPromoFreeSkuTracker>): Promise<PromoFreeSkuTracker> {
    const result = await db.update(promoFreeSkuTracker).set({ ...data, updated_at: new Date() }).where(eq(promoFreeSkuTracker.id, id)).returning();
    return result[0];
  }

  async deletePromoSku(id: number): Promise<void> {
    await db.delete(promoFreeSkuTracker).where(eq(promoFreeSkuTracker.id, id));
  }

  // ─── CRM operations ──────────────────────────────────────────────────────────

  private buildCrmWhereClause(
    search?: string,
    group?: string,
    state?: string,
    health?: string,
    customerType?: string,
    addressType?: string,
    primaryRep?: number | "unassigned",
    secondaryRep?: number | "unassigned",
    accountType?: string,
    status?: string, // 'active' | 'inactive' | 'both'; default 'active'
  ) {
    const conditions: any[] = [];
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(customersMirror.email, s),
        ilike(customersMirror.phone, s),
        sql`coalesce(${customersMirror.shipping_address}->>'city', ${customersMirror.billing_address}->>'city') ILIKE ${s}`,
      ));
    }
    if (group) conditions.push(eq(customersMirror.customer_group_name, group));
    if (state) {
      if (state === "Unknown") {
        conditions.push(sql`(coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') IS NULL OR coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = '')`);
      } else {
        conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
      }
    }
    if (health) conditions.push(eq(customersMirror.account_health, health));
    if (customerType) conditions.push(eq(customersMirror.customer_type, customerType));
    if (addressType) conditions.push(eq(customersMirror.address_type, addressType));
    if (primaryRep === "unassigned") {
      conditions.push(isNull(customersMirror.primary_rep_id));
    } else if (primaryRep !== undefined) {
      conditions.push(eq(customersMirror.primary_rep_id, Number(primaryRep)));
    }
    if (secondaryRep === "unassigned") {
      conditions.push(isNull(customersMirror.secondary_rep_id));
    } else if (secondaryRep !== undefined) {
      conditions.push(eq(customersMirror.secondary_rep_id, Number(secondaryRep)));
    }
    // ERP account_type filter (customer / vendor / internal)
    if (accountType) conditions.push(eq(customersMirror.account_type, accountType));
    // Active/inactive filter — default to active-only for backward compat
    if (!status || status === 'active') {
      conditions.push(isNull(customersMirror.inactive_at));
    } else if (status === 'inactive') {
      conditions.push(isNotNull(customersMirror.inactive_at));
    }
    // status === 'both' → no filter
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  }

  async getHealthThresholds(): Promise<{ healthy_days: number; watch_days: number; at_risk_days: number }> {
    const defaults = { healthy_days: 30, watch_days: 60, at_risk_days: 90 };
    const row = await this.getSetting("crm_health_thresholds");
    if (!row?.value) return defaults;
    try { return { ...defaults, ...row.value }; } catch { return defaults; }
  }

  async setHealthThresholds(t: { healthy_days: number; watch_days: number; at_risk_days: number }): Promise<void> {
    await this.setSetting("crm_health_thresholds", t);
  }

  private buildCrmOrderBy(sortBy?: string, sortDir?: string) {
    const dir = sortDir === "asc" ? asc : desc;
    switch (sortBy) {
      case "company":
        return sortDir === "asc"
          ? sql`${customersMirror.company} ASC NULLS LAST`
          : sql`${customersMirror.company} DESC NULLS LAST`;
      case "first_name": return dir(customersMirror.first_name);
      case "state":
        return sortDir === "asc"
          ? sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') ASC NULLS LAST`
          : sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') DESC NULLS LAST`;
      case "customer_group_name":
        return sortDir === "asc"
          ? sql`${customersMirror.customer_group_name} ASC NULLS LAST`
          : sql`${customersMirror.customer_group_name} DESC NULLS LAST`;
      case "lifetime_revenue": return dir(customersMirror.lifetime_revenue);
      case "lifetime_orders": return dir(customersMirror.lifetime_orders);
      case "days_since_order":
        return sortDir === "asc"
          ? sql`${customersMirror.last_order_date} DESC NULLS LAST`
          : sql`${customersMirror.last_order_date} ASC NULLS LAST`;
      case "customer_type":
        return sortDir === "asc"
          ? sql`${customersMirror.customer_type} ASC NULLS LAST`
          : sql`${customersMirror.customer_type} DESC NULLS LAST`;
      case "address_type":
        return sortDir === "asc"
          ? sql`${customersMirror.address_type} ASC NULLS LAST`
          : sql`${customersMirror.address_type} DESC NULLS LAST`;
      case "primary_rep_name":
        return sortDir === "asc"
          ? sql`primary_rep_user.name ASC NULLS LAST`
          : sql`primary_rep_user.name DESC NULLS LAST`;
      case "secondary_rep_name":
        return sortDir === "asc"
          ? sql`secondary_rep_user.name ASC NULLS LAST`
          : sql`secondary_rep_user.name DESC NULLS LAST`;
      case "city":
        return sortDir === "asc"
          ? sql`coalesce(${customersMirror.shipping_address}->>'city', ${customersMirror.billing_address}->>'city') ASC NULLS LAST`
          : sql`coalesce(${customersMirror.shipping_address}->>'city', ${customersMirror.billing_address}->>'city') DESC NULLS LAST`;
      case "last_follow_up":
        return sortDir === "asc"
          ? sql`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id ORDER BY n.created_at DESC LIMIT 1) ASC NULLS LAST`
          : sql`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id ORDER BY n.created_at DESC LIMIT 1) DESC NULLS LAST`;
      default:
        return sortDir === "asc"
          ? sql`${customersMirror.last_order_date} ASC NULLS LAST`
          : sql`${customersMirror.last_order_date} DESC NULLS LAST`;
    }
  }

  private buildCrmRepConditions(assignedRep?: number | "unassigned", visibilityScope?: string, visibilityUserId?: number): any[] {
    const conds: any[] = [];
    if (visibilityScope && visibilityUserId) {
      if (visibilityScope === "ASSIGNED_ONLY") {
        conds.push(eq(customerSalesRep.assigned_user_id, visibilityUserId));
      } else if (visibilityScope === "ASSIGNED_AND_UNASSIGNED") {
        conds.push(or(
          eq(customerSalesRep.assigned_user_id, visibilityUserId),
          isNull(customerSalesRep.id),
        ));
      }
    }
    if (assignedRep === "unassigned") {
      conds.push(isNull(customerSalesRep.id));
    } else if (assignedRep !== undefined) {
      conds.push(eq(customerSalesRep.assigned_user_id, Number(assignedRep)));
    }
    return conds;
  }

  async getCrmCustomers(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; limit?: number; offset?: number; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number; accountType?: string; status?: string }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null })[]; total: number }> {
    const { search, group, state, health, customerType, addressType, primaryRep, secondaryRep,
            sortBy = "last_order_date", sortDir = "desc", limit = 50, offset = 0,
            assignedRep, visibilityScope, visibilityUserId, accountType, status } = opts;
    const primaryRepUser = alias(users, "primary_rep_user");
    const secondaryRepUser = alias(users, "secondary_rep_user");
    const baseWhere = this.buildCrmWhereClause(search, group, state, health, customerType, addressType, primaryRep, secondaryRep, accountType, status);
    const repConds = this.buildCrmRepConditions(assignedRep, visibilityScope, visibilityUserId);
    const needsRepJoin = repConds.length > 0;
    const allConds = [...(baseWhere ? [baseWhere] : []), ...repConds];
    const where = allConds.length === 0 ? undefined : allConds.length === 1 ? allConds[0] : and(...allConds);
    const orderExpr = this.buildCrmOrderBy(sortBy, sortDir);
    const countRows = needsRepJoin
      ? await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror).leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id)).where(where)
      : await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror).where(where);
    const total = countRows[0]?.count ?? 0;
    const rows = await db.select({
      c: customersMirror,
      rep_name: users.name,
      primary_rep_name: primaryRepUser.name,
      secondary_rep_name: secondaryRepUser.name,
      last_action_date: sql<string | null>`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id ORDER BY n.created_at DESC LIMIT 1)`,
      last_action_type: sql<string | null>`(SELECT n.note_type FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id ORDER BY n.created_at DESC LIMIT 1)`,
    })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .leftJoin(primaryRepUser, eq(primaryRepUser.id, customersMirror.primary_rep_id))
      .leftJoin(secondaryRepUser, eq(secondaryRepUser.id, customersMirror.secondary_rep_id))
      .where(where)
      .orderBy(orderExpr as any)
      .limit(limit)
      .offset(offset);
    return {
      customers: rows.map(r => ({
        ...r.c,
        sales_rep_name: r.rep_name ?? null,
        primary_rep_name: r.primary_rep_name ?? null,
        secondary_rep_name: r.secondary_rep_name ?? null,
        last_action_date: r.last_action_date ?? null,
        last_action_type: r.last_action_type ?? null,
      })),
      total,
    };
  }

  async getCrmCustomerById(id: number): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null }) | undefined> {
    const primaryRepUser = alias(users, "primary_rep_user");
    const secondaryRepUser = alias(users, "secondary_rep_user");
    const rows = await db.select({
      c: customersMirror,
      rep_name: users.name,
      primary_rep_name: primaryRepUser.name,
      secondary_rep_name: secondaryRepUser.name,
    })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .leftJoin(primaryRepUser, eq(primaryRepUser.id, customersMirror.primary_rep_id))
      .leftJoin(secondaryRepUser, eq(secondaryRepUser.id, customersMirror.secondary_rep_id))
      .where(eq(customersMirror.id, id));
    if (!rows[0]) return undefined;
    return {
      ...rows[0].c,
      sales_rep_name: rows[0].rep_name ?? null,
      primary_rep_name: rows[0].primary_rep_name ?? null,
      secondary_rep_name: rows[0].secondary_rep_name ?? null,
    };
  }

  async getCrmCustomerByBcId(bcId: number): Promise<CrmCustomer | undefined> {
    const result = await db.select().from(customersMirror).where(eq(customersMirror.bigcommerce_customer_id, bcId));
    return result[0];
  }

  async upsertCrmCustomer(data: InsertCrmCustomer): Promise<CrmCustomer> {
    const result = await db.insert(customersMirror).values(data)
      .onConflictDoUpdate({
        target: customersMirror.bigcommerce_customer_id,
        // NOTE: SalesCore-only ERP columns (account_type, inactive_*, inactivated_by_user_id)
        // are intentionally excluded here — BC sync must never overwrite them.
        set: {
          company: data.company,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone,
          customer_group_id: data.customer_group_id,
          customer_group_name: data.customer_group_name,
          billing_address: data.billing_address,
          shipping_address: data.shipping_address,
          created_date: data.created_date,
          store_credit_balance: data.store_credit_balance,
          address_type: data.address_type,
          updated_at: new Date(),
        },
      }).returning();
    return result[0];
  }

  async getCrmCustomerCount(): Promise<number> {
    // Use fast approximate count from pg statistics (near-instant on large tables)
    const result = await db.execute(sql.raw(
      `SELECT COALESCE(n_live_tup, 0)::int AS cnt FROM pg_stat_user_tables WHERE relname = 'customers_mirror' LIMIT 1`
    ));
    const approx = (result.rows[0] as any)?.cnt;
    if (approx != null && approx > 0) return approx;
    // Fallback to exact count only when table is empty or stats not yet available
    const exact = await db.select({ count: sql<number>`count(*)::int` }).from(customersMirror);
    return exact[0]?.count ?? 0;
  }

  async getAllCrmCustomersForExport(opts: { search?: string; group?: string; state?: string; health?: string; customerType?: string; addressType?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; sortBy?: string; sortDir?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number; accountType?: string; status?: string }): Promise<(CrmCustomer & { sales_rep_name?: string | null; primary_rep_name?: string | null; secondary_rep_name?: string | null })[]> {
    const { search, group, state, health, customerType, addressType, primaryRep, secondaryRep,
            sortBy = "last_order_date", sortDir = "desc",
            assignedRep, visibilityScope, visibilityUserId, accountType, status } = opts;
    const primaryRepUser = alias(users, "primary_rep_user");
    const secondaryRepUser = alias(users, "secondary_rep_user");
    const baseWhere = this.buildCrmWhereClause(search, group, state, health, customerType, addressType, primaryRep, secondaryRep, accountType, status);
    const repConds = this.buildCrmRepConditions(assignedRep, visibilityScope, visibilityUserId);
    const allConds = [...(baseWhere ? [baseWhere] : []), ...repConds];
    const where = allConds.length === 0 ? undefined : allConds.length === 1 ? allConds[0] : and(...allConds);
    const orderExpr = this.buildCrmOrderBy(sortBy, sortDir);
    const rows = await db.select({
      c: customersMirror,
      rep_name: users.name,
      primary_rep_name: primaryRepUser.name,
      secondary_rep_name: secondaryRepUser.name,
      last_action_date: sql<string | null>`(SELECT n.created_at FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id ORDER BY n.created_at DESC LIMIT 1)`,
      last_action_type: sql<string | null>`(SELECT n.note_type FROM crm_customer_notes n WHERE n.customer_id = customers_mirror.id ORDER BY n.created_at DESC LIMIT 1)`,
    })
      .from(customersMirror)
      .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
      .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
      .leftJoin(primaryRepUser, eq(primaryRepUser.id, customersMirror.primary_rep_id))
      .leftJoin(secondaryRepUser, eq(secondaryRepUser.id, customersMirror.secondary_rep_id))
      .where(where)
      .orderBy(orderExpr as any);
    return rows.map(r => ({
      ...r.c,
      sales_rep_name: r.rep_name ?? null,
      primary_rep_name: r.primary_rep_name ?? null,
      secondary_rep_name: r.secondary_rep_name ?? null,
      last_action_date: r.last_action_date ?? null,
      last_action_type: r.last_action_type ?? null,
    }));
  }

  async updateCrmCustomerMasterFields(id: number, data: {
    primary_rep_id?: number | null;
    secondary_rep_id?: number | null;
    customer_type?: string;
    account_type?: string;
    inactive_reason?: string | null;
    inactive_at?: Date | null;
    inactive_notes?: string | null;
    inactivated_by_user_id?: number | null;
    is_active?: boolean;
  }): Promise<void> {
    const updates: Record<string, any> = { updated_at: new Date() };
    if ('primary_rep_id' in data) updates.primary_rep_id = data.primary_rep_id ?? null;
    if ('secondary_rep_id' in data) updates.secondary_rep_id = data.secondary_rep_id ?? null;
    if (data.customer_type !== undefined) updates.customer_type = data.customer_type;
    if (data.account_type !== undefined) updates.account_type = data.account_type;
    if ('inactive_reason' in data) updates.inactive_reason = data.inactive_reason ?? null;
    if ('inactive_at' in data) updates.inactive_at = data.inactive_at ?? null;
    if ('inactive_notes' in data) updates.inactive_notes = data.inactive_notes ?? null;
    if ('inactivated_by_user_id' in data) updates.inactivated_by_user_id = data.inactivated_by_user_id ?? null;
    if ('is_active' in data) updates.is_active = data.is_active;
    await db.update(customersMirror).set(updates).where(eq(customersMirror.id, id));
  }

  async getCrmFilterOptions(): Promise<{ groups: string[]; states: string[]; reps: { id: number; name: string }[] }> {
    const [groupRows, stateRows, repRows] = await Promise.all([
      db.selectDistinct({ name: customersMirror.customer_group_name })
        .from(customersMirror)
        .where(isNotNull(customersMirror.customer_group_name))
        .orderBy(asc(customersMirror.customer_group_name)),
      db.selectDistinct({
        state: sql<string>`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state')`,
      })
        .from(customersMirror)
        .where(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') IS NOT NULL AND coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') != ''`)
        .orderBy(sql`1`),
      db.selectDistinct({ id: users.id, name: users.name })
        .from(customerSalesRep)
        .innerJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
        .orderBy(asc(users.name)),
    ]);
    return {
      groups: (groupRows.map(r => r.name).filter(Boolean) as string[]),
      states: (stateRows.map(r => r.state).filter(Boolean) as string[]).sort(),
      reps: repRows.map(r => ({ id: r.id!, name: r.name! })),
    };
  }

  async getCrmOrdersByBcCustomerId(bcCustomerId: number, limit = 10000): Promise<CrmOrder[]> {
    return db.select().from(customerOrdersMirror)
      .where(eq(customerOrdersMirror.bigcommerce_customer_id, bcCustomerId))
      .orderBy(sql`${customerOrdersMirror.order_date} DESC NULLS LAST`)
      .limit(limit);
  }

  async upsertCrmOrder(data: InsertCrmOrder): Promise<CrmOrder> {
    const result = await db.insert(customerOrdersMirror).values(data)
      .onConflictDoUpdate({
        target: customerOrdersMirror.bigcommerce_order_id,
        set: {
          bigcommerce_customer_id: data.bigcommerce_customer_id,
          order_number: data.order_number,
          order_date: data.order_date,
          order_total: data.order_total,
          status: data.status,
          payment_status: data.payment_status,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          staff_notes: data.staff_notes,
          customer_order_notes: data.customer_order_notes,
          updated_at: new Date(),
        },
      }).returning();
    return result[0];
  }

  async getCrmOrderCount(): Promise<number> {
    const result = await db.execute(sql.raw(
      `SELECT COALESCE(n_live_tup, 0)::int AS cnt FROM pg_stat_user_tables WHERE relname = 'customer_orders_mirror' LIMIT 1`
    ));
    const approx = (result.rows[0] as any)?.cnt;
    if (approx != null && approx > 0) return approx;
    const exact = await db.select({ count: sql<number>`count(*)::int` }).from(customerOrdersMirror);
    return exact[0]?.count ?? 0;
  }

  async updateCrmCustomerStats(bcCustomerId: number, stats: { lifetime_orders: number; lifetime_revenue: string; last_order_date: Date | null }): Promise<void> {
    await db.update(customersMirror).set({
      lifetime_orders: stats.lifetime_orders,
      lifetime_revenue: stats.lifetime_revenue,
      last_order_date: stats.last_order_date,
      updated_at: new Date(),
    }).where(eq(customersMirror.bigcommerce_customer_id, bcCustomerId));
  }

  async getCrmSalesRep(customerId: number): Promise<CrmSalesRep | undefined> {
    const result = await db.select().from(customerSalesRep).where(eq(customerSalesRep.customer_id, customerId));
    return result[0];
  }

  async setCrmSalesRep(data: InsertCrmSalesRep): Promise<CrmSalesRep> {
    await db.delete(customerSalesRep).where(eq(customerSalesRep.customer_id, data.customer_id));
    const result = await db.insert(customerSalesRep).values(data).returning();
    return result[0];
  }

  async removeCrmSalesRep(customerId: number): Promise<void> {
    await db.delete(customerSalesRep).where(eq(customerSalesRep.customer_id, customerId));
  }

  async recalculateCrmCustomerStats(): Promise<{ updated: number; customers_in_orders: number; duration_ms: number }> {
    const start = Date.now();

    const countRes = await db
      .select({ n: sql<number>`count(distinct ${customerOrdersMirror.bigcommerce_customer_id})::int` })
      .from(customerOrdersMirror);
    const customers_in_orders = countRes[0]?.n ?? 0;

    // Load configured thresholds
    const thresholds = await this.getHealthThresholds();
    const healthyDays = thresholds.healthy_days;
    const watchDays   = thresholds.watch_days;
    const atRiskDays  = thresholds.at_risk_days;

    // Update customers that have orders — compute stats + account_health in single pass
    const result = await db.execute(sql`
      UPDATE customers_mirror cm
      SET
        lifetime_orders  = agg.order_count,
        lifetime_revenue = agg.total_revenue,
        last_order_date  = agg.last_order,
        account_health   = CASE
          WHEN agg.last_order IS NULL THEN 'Lost'
          WHEN (EXTRACT(EPOCH FROM (NOW() - agg.last_order)) / 86400)::int <= ${healthyDays} THEN 'Healthy'
          WHEN (EXTRACT(EPOCH FROM (NOW() - agg.last_order)) / 86400)::int <= ${watchDays} THEN 'Watch'
          WHEN (EXTRACT(EPOCH FROM (NOW() - agg.last_order)) / 86400)::int <= ${atRiskDays} THEN 'At Risk'
          ELSE 'Lost'
        END,
        updated_at       = NOW()
      FROM (
        SELECT
          bigcommerce_customer_id,
          COUNT(*)::int                 AS order_count,
          COALESCE(SUM(order_total), 0) AS total_revenue,
          MAX(order_date)               AS last_order
        FROM customer_orders_mirror
        GROUP BY bigcommerce_customer_id
      ) agg
      WHERE cm.bigcommerce_customer_id = agg.bigcommerce_customer_id
    `);

    // Customers with no orders at all → Lost
    await db.execute(sql`
      UPDATE customers_mirror
      SET account_health = 'Lost', updated_at = NOW()
      WHERE bigcommerce_customer_id NOT IN (
        SELECT DISTINCT bigcommerce_customer_id FROM customer_orders_mirror
      )
    `);

    const updated = Number((result as any).count ?? (result as any).rowCount ?? 0);
    const duration_ms = Date.now() - start;
    return { updated, customers_in_orders, duration_ms };
  }

  // ─── CRM Notes ────────────────────────────────────────────────────────────────

  async createCrmNote(data: InsertCrmNote): Promise<CrmNote> {
    const result = await db.insert(crmCustomerNotes).values(data).returning();
    return result[0];
  }

  async getCrmNotes(customerId: number): Promise<(CrmNote & { created_by_name?: string | null })[]> {
    const rows = await db.select({ n: crmCustomerNotes, u: users })
      .from(crmCustomerNotes)
      .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
      .where(and(eq(crmCustomerNotes.customer_id, customerId), eq(crmCustomerNotes.activity_type, 'note')))
      .orderBy(desc(crmCustomerNotes.created_at));
    return rows.map(r => ({ ...r.n, created_by_name: r.u?.name ?? null }));
  }

  async getCrmNoteById(id: number): Promise<CrmNote | undefined> {
    const rows = await db.select().from(crmCustomerNotes).where(eq(crmCustomerNotes.id, id)).limit(1);
    return rows[0];
  }

  async updateCrmNote(id: number, data: { note?: string; note_type?: string; order_id?: number | null }): Promise<CrmNote> {
    const result = await db.update(crmCustomerNotes)
      .set({ ...data, updated_at: new Date() })
      .where(eq(crmCustomerNotes.id, id))
      .returning();
    return result[0];
  }

  async deleteCrmNote(id: number): Promise<void> {
    await db.delete(crmCustomerNotes).where(eq(crmCustomerNotes.id, id));
  }

  async getAllCrmNotes(opts: { search?: string; type?: string; createdBy?: number; customerId?: number; orderId?: number; customerGroup?: string; state?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }): Promise<{ notes: any[]; total: number }> {
    const { search, type, createdBy, customerId, orderId, customerGroup, state, dateFrom, dateTo, limit = 50, offset = 0 } = opts;
    const conditions: any[] = [];

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(crmCustomerNotes.note, s),
      ));
    }
    if (type) conditions.push(eq(crmCustomerNotes.note_type, type));
    if (createdBy) conditions.push(eq(crmCustomerNotes.created_by, createdBy));
    if (customerId) conditions.push(eq(crmCustomerNotes.customer_id, customerId));
    if (orderId) conditions.push(eq(crmCustomerNotes.order_id, orderId));
    if (customerGroup) conditions.push(eq(customersMirror.customer_group_name, customerGroup));
    if (state) {
      conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
    }
    if (dateFrom) conditions.push(sql`${crmCustomerNotes.created_at} >= ${dateFrom}::timestamptz`);
    if (dateTo) conditions.push(sql`${crmCustomerNotes.created_at} <= ${dateTo}::timestamptz + interval '1 day'`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
        .where(where),
      db.select({
        n: crmCustomerNotes,
        customer_company: customersMirror.company,
        customer_first_name: customersMirror.first_name,
        customer_last_name: customersMirror.last_name,
        customer_bc_id: customersMirror.bigcommerce_customer_id,
        customer_group_name: customersMirror.customer_group_name,
        billing_address: customersMirror.billing_address,
        shipping_address: customersMirror.shipping_address,
        created_by_name: users.name,
      })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
        .where(where)
        .orderBy(desc(crmCustomerNotes.created_at))
        .limit(limit)
        .offset(offset),
    ]);

    return {
      notes: rows.map(r => ({
        ...r.n,
        customer_company: r.customer_company,
        customer_first_name: r.customer_first_name,
        customer_last_name: r.customer_last_name,
        customer_bc_id: r.customer_bc_id,
        customer_group_name: r.customer_group_name,
        created_by_name: r.created_by_name ?? null,
      })),
      total: countRows[0]?.count ?? 0,
    };
  }

  async getCrmNotesKpis(opts: {
    search?: string; createdBy?: number; customerGroup?: string;
    state?: string; dateFrom?: string; dateTo?: string;
  } = {}): Promise<{ notesToday: number; followUps: number; salesCalls: number; issues: number; internalNotes: number }> {
    const { search, createdBy, customerGroup, state, dateFrom, dateTo } = opts;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const baseConds: any[] = [];
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      baseConds.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(crmCustomerNotes.note, s),
      ));
    }
    if (createdBy) baseConds.push(eq(crmCustomerNotes.created_by, createdBy));
    if (customerGroup) baseConds.push(eq(customersMirror.customer_group_name, customerGroup));
    if (state) baseConds.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
    if (dateFrom) baseConds.push(sql`${crmCustomerNotes.created_at} >= ${dateFrom}::timestamptz`);
    if (dateTo) baseConds.push(sql`${crmCustomerNotes.created_at} <= ${dateTo}::timestamptz + interval '1 day'`);

    const todayConds = [...baseConds, sql`${crmCustomerNotes.created_at} >= ${todayStart.toISOString()}::timestamptz`];
    const baseWhere = baseConds.length > 0 ? and(...baseConds) : undefined;
    const todayWhere = and(...todayConds);

    const [todayCount, typeRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .where(todayWhere),
      db.select({ type: crmCustomerNotes.note_type, count: sql<number>`count(*)::int` })
        .from(crmCustomerNotes)
        .innerJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
        .where(baseWhere)
        .groupBy(crmCustomerNotes.note_type),
    ]);

    const typeCounts: Record<string, number> = {};
    for (const r of typeRows) typeCounts[r.type] = r.count;

    return {
      notesToday: todayCount[0]?.count ?? 0,
      followUps: typeCounts['Follow Up'] ?? 0,
      salesCalls: typeCounts['Sales'] ?? 0,
      issues: typeCounts['Issue'] ?? 0,
      internalNotes: typeCounts['Internal'] ?? 0,
    };
  }

  // ─── CRM Timeline ─────────────────────────────────────────────────────────────

  async getCrmTimeline(customerId: number): Promise<any[]> {
    const custRow = await db.select({ bc_id: customersMirror.bigcommerce_customer_id })
      .from(customersMirror).where(eq(customersMirror.id, customerId)).limit(1);
    if (!custRow[0]) return [];
    const bcId = custRow[0].bc_id;

    const auditActions = [
      'sales_rep_assigned', 'sales_rep_removed', 'sales_rep_reassigned',
      'primary_rep_assigned', 'primary_rep_changed', 'primary_rep_removed',
      'secondary_rep_assigned', 'secondary_rep_changed', 'secondary_rep_removed',
      'customer_type_changed', 'address_type_updated',
      'note_created', 'note_edited', 'note_deleted',
      'order_note_created', 'staff_note_updated', 'customer_note_updated',
    ];

    const [orders, notes, auditRows] = await Promise.all([
      db.select().from(customerOrdersMirror)
        .where(eq(customerOrdersMirror.bigcommerce_customer_id, bcId))
        .orderBy(desc(customerOrdersMirror.order_date))
        .limit(50),
      db.select({ n: crmCustomerNotes, u: users })
        .from(crmCustomerNotes)
        .leftJoin(users, eq(users.id, crmCustomerNotes.created_by))
        .where(eq(crmCustomerNotes.customer_id, customerId))
        .orderBy(desc(crmCustomerNotes.created_at)),
      db.select({ a: crmAuditLog, u: users })
        .from(crmAuditLog)
        .leftJoin(users, eq(users.id, crmAuditLog.user_id))
        .where(and(
          eq(crmAuditLog.customer_id, customerId),
          inArray(crmAuditLog.action, auditActions),
        ))
        .orderBy(desc(crmAuditLog.created_at))
        .limit(50),
    ]);

    const timeline: any[] = [
      ...orders.map(o => ({
        id: `order-${o.id}`,
        type: 'order',
        date: o.order_date?.toISOString() ?? o.created_at.toISOString(),
        order_number: o.order_number,
        order_total: o.order_total,
        status: o.status,
        bc_order_id: o.bigcommerce_order_id,
        staff_notes: o.staff_notes,
        customer_order_notes: o.customer_order_notes,
      })),
      ...notes.map(row => ({
        id: `note-${row.n.id}`,
        type: 'note',
        date: row.n.created_at.toISOString(),
        note_id: row.n.id,
        note_type: row.n.note_type,
        note_content: row.n.note,
        order_id: row.n.order_id,
        created_by_name: row.u?.name ?? null,
      })),
      ...auditRows.map(row => ({
        id: `audit-${row.a.id}`,
        type: 'audit',
        date: row.a.created_at.toISOString(),
        action: row.a.action,
        detail: row.a.detail,
        user_id: row.a.user_id,
        user_name: row.u?.name ?? null,
      })),
    ];

    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // ─── CRM Reactivation ─────────────────────────────────────────────────────────

  async getReactivationCustomers(opts: { search?: string; group?: string; state?: string; health?: string; rep?: number; sortBy?: string; sortDir?: string; limit?: number; offset?: number; visibilityScope?: string; visibilityUserId?: number }): Promise<{ customers: (CrmCustomer & { sales_rep_name?: string | null })[]; total: number }> {
    const { search, group, state, health, rep, sortBy = 'last_order_date', sortDir = 'asc', limit = 50, offset = 0, visibilityScope, visibilityUserId } = opts;

    const healthFilter = health && ['At Risk', 'Lost'].includes(health) ? [health] : ['At Risk', 'Lost'];
    const conditions: any[] = [inArray(customersMirror.account_health, healthFilter)];

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, s),
        ilike(customersMirror.first_name, s),
        ilike(customersMirror.last_name, s),
        ilike(customersMirror.email, s),
      ));
    }
    if (group) conditions.push(eq(customersMirror.customer_group_name, group));
    if (state) {
      if (state === 'Unknown') {
        conditions.push(sql`(coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') IS NULL OR coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = '')`);
      } else {
        conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'state', ${customersMirror.billing_address}->>'state') = ${state}`);
      }
    }
    if (rep) conditions.push(eq(customerSalesRep.assigned_user_id, rep));
    const repVisConds = this.buildCrmRepConditions(undefined, visibilityScope, visibilityUserId);
    conditions.push(...repVisConds);

    const where = and(...conditions);

    const orderExpr = sortDir === 'asc'
      ? sql`${customersMirror.last_order_date} ASC NULLS LAST`
      : sql`${customersMirror.last_order_date} DESC NULLS LAST`;

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(customersMirror)
        .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
        .where(where),
      db.select({ c: customersMirror, rep_name: users.name })
        .from(customersMirror)
        .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
        .leftJoin(users, eq(users.id, customerSalesRep.assigned_user_id))
        .where(where)
        .orderBy(orderExpr as any)
        .limit(limit)
        .offset(offset),
    ]);

    return {
      customers: rows.map(r => ({ ...r.c, sales_rep_name: r.rep_name ?? null })),
      total: countRows[0]?.count ?? 0,
    };
  }

  // ─── CRM Metrics ──────────────────────────────────────────────────────────────

  async getCrmMetrics(opts: { search?: string; group?: string; state?: string; primaryRep?: number | "unassigned"; secondaryRep?: number | "unassigned"; customerType?: string; addressType?: string; assignedRep?: number | "unassigned"; visibilityScope?: string; visibilityUserId?: number; accountType?: string; status?: string }): Promise<{ total: number; healthy: number; watch: number; at_risk: number; lost: number; needs_follow_up: number; inactive: number; by_account_type: Record<string, number> }> {
    const { search, group, state, primaryRep, secondaryRep, customerType, addressType, assignedRep, visibilityScope, visibilityUserId, accountType, status } = opts;
    // Base where using 'both' status so we can separately count inactive
    const baseWhere = this.buildCrmWhereClause(search, group, state, undefined, customerType, addressType, primaryRep, secondaryRep, accountType, status ?? 'both');
    const repConds = this.buildCrmRepConditions(assignedRep, visibilityScope, visibilityUserId);
    const needsRepJoin = repConds.length > 0;
    const allConds = [...(baseWhere ? [baseWhere] : []), ...repConds];
    const where = allConds.length === 0 ? undefined : allConds.length === 1 ? allConds[0] : and(...allConds);

    const [healthRows, accountTypeRows, inactiveRows] = await Promise.all([
      needsRepJoin
        ? db.select({ account_health: customersMirror.account_health, count: sql<number>`count(*)::int` })
            .from(customersMirror)
            .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
            .where(where ? and(where, isNull(customersMirror.inactive_at)) : isNull(customersMirror.inactive_at))
            .groupBy(customersMirror.account_health)
        : db.select({ account_health: customersMirror.account_health, count: sql<number>`count(*)::int` })
            .from(customersMirror)
            .where(where ? and(where, isNull(customersMirror.inactive_at)) : isNull(customersMirror.inactive_at))
            .groupBy(customersMirror.account_health),
      needsRepJoin
        ? db.select({ account_type: customersMirror.account_type, count: sql<number>`count(*)::int` })
            .from(customersMirror)
            .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
            .where(where)
            .groupBy(customersMirror.account_type)
        : db.select({ account_type: customersMirror.account_type, count: sql<number>`count(*)::int` })
            .from(customersMirror)
            .where(where)
            .groupBy(customersMirror.account_type),
      needsRepJoin
        ? db.select({ count: sql<number>`count(*)::int` })
            .from(customersMirror)
            .leftJoin(customerSalesRep, eq(customerSalesRep.customer_id, customersMirror.id))
            .where(where ? and(where, isNotNull(customersMirror.inactive_at)) : isNotNull(customersMirror.inactive_at))
        : db.select({ count: sql<number>`count(*)::int` })
            .from(customersMirror)
            .where(where ? and(where, isNotNull(customersMirror.inactive_at)) : isNotNull(customersMirror.inactive_at)),
    ]);

    const counts: Record<string, number> = {};
    for (const r of healthRows) counts[r.account_health ?? '__null__'] = r.count;

    const healthy = counts['Healthy'] ?? 0;
    const watch = counts['Watch'] ?? 0;
    const at_risk = counts['At Risk'] ?? 0;
    const lost = (counts['Lost'] ?? 0) + (counts['__null__'] ?? 0);
    const total = healthy + watch + at_risk + lost;
    const inactive = inactiveRows[0]?.count ?? 0;

    const by_account_type: Record<string, number> = {};
    for (const r of accountTypeRows) by_account_type[r.account_type ?? 'customer'] = r.count;

    return { total, healthy, watch, at_risk, lost, needs_follow_up: at_risk + lost, inactive, by_account_type };
  }

  // ─── CRM Todos (rows in crm_customer_notes with activity_type='todo') ─────────

  async getCrmTodos(opts: { userId?: number; allUsers?: boolean; status?: string; customerId?: number; visibilityScope?: string; visibilityUserId?: number }): Promise<any[]> {
    const { userId, allUsers, status, customerId, visibilityScope, visibilityUserId } = opts;
    const assignedUser = alias(users, "assigned_user");
    const createdUser = alias(users, "created_user");
    const conditions: any[] = [eq(crmCustomerNotes.activity_type, 'todo')];
    if (customerId) conditions.push(eq(crmCustomerNotes.customer_id, customerId));
    if (!allUsers && userId) conditions.push(eq(crmCustomerNotes.assigned_to_user_id, userId));
    if (status === 'pending') conditions.push(isNull(crmCustomerNotes.completed_at));
    if (status === 'completed') conditions.push(isNotNull(crmCustomerNotes.completed_at));
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const rows = await db.select({
      n: crmCustomerNotes,
      customer_company: customersMirror.company,
      customer_first_name: customersMirror.first_name,
      customer_last_name: customersMirror.last_name,
      customer_bc_id: customersMirror.bigcommerce_customer_id,
      assigned_to_name: assignedUser.name,
      created_by_name: createdUser.name,
    })
      .from(crmCustomerNotes)
      .leftJoin(customersMirror, eq(customersMirror.id, crmCustomerNotes.customer_id))
      .leftJoin(assignedUser, eq(assignedUser.id, crmCustomerNotes.assigned_to_user_id))
      .leftJoin(createdUser, eq(createdUser.id, crmCustomerNotes.created_by))
      .where(where)
      .orderBy(sql`${crmCustomerNotes.due_date} ASC NULLS LAST`, desc(crmCustomerNotes.created_at));

    const now = new Date();
    return rows.map(r => {
      const isOverdue = r.n.due_date && !r.n.completed_at && new Date(r.n.due_date) < now;
      return {
        ...r.n,
        customer_company: r.customer_company ?? null,
        customer_first_name: r.customer_first_name ?? null,
        customer_last_name: r.customer_last_name ?? null,
        customer_bc_id: r.customer_bc_id ?? null,
        assigned_to_name: r.assigned_to_name ?? null,
        created_by_name: r.created_by_name ?? null,
        is_overdue: !!isOverdue,
        todo_status: r.n.completed_at ? 'completed' : 'pending',
      };
    });
  }

  async createCrmTodo(data: { customer_id?: number | null; title: string; note: string; priority?: string; due_date?: Date | null; assigned_to_user_id?: number | null; reminder_at?: Date | null; created_by: number }): Promise<any> {
    const result = await db.insert(crmCustomerNotes).values({
      customer_id: data.customer_id as any,
      activity_type: 'todo',
      title: data.title,
      note: data.note,
      priority: data.priority ?? 'medium',
      due_date: data.due_date ?? null,
      assigned_to_user_id: data.assigned_to_user_id ?? null,
      reminder_at: data.reminder_at ?? null,
      todo_status: 'pending',
      created_by: data.created_by,
      note_type: 'To Do',
    }).returning();
    return result[0];
  }

  async updateCrmTodo(id: number, data: { title?: string; note?: string; priority?: string; due_date?: Date | null; assigned_to_user_id?: number | null; reminder_at?: Date | null; todo_status?: string; completed_at?: Date | null }): Promise<any> {
    const updates: Record<string, any> = { updated_at: new Date() };
    if (data.title !== undefined) updates.title = data.title;
    if (data.note !== undefined) updates.note = data.note;
    if (data.priority !== undefined) updates.priority = data.priority;
    if ('due_date' in data) updates.due_date = data.due_date ?? null;
    if ('assigned_to_user_id' in data) updates.assigned_to_user_id = data.assigned_to_user_id ?? null;
    if ('reminder_at' in data) updates.reminder_at = data.reminder_at ?? null;
    if ('completed_at' in data) updates.completed_at = data.completed_at ?? null;
    if (data.todo_status !== undefined) updates.todo_status = data.todo_status;
    const result = await db.update(crmCustomerNotes).set(updates).where(eq(crmCustomerNotes.id, id)).returning();
    return result[0];
  }

  async deleteCrmTodo(id: number): Promise<void> {
    await db.delete(crmCustomerNotes).where(and(eq(crmCustomerNotes.id, id), eq(crmCustomerNotes.activity_type, 'todo')));
  }

  // ─── CRM Users ────────────────────────────────────────────────────────────────

  async getCrmUsers(): Promise<{ id: number; name: string }[]> {
    const rows = await db.select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.is_enabled, true))
      .orderBy(asc(users.name));
    return rows.map(r => ({ id: r.id, name: r.name ?? '' }));
  }

  // ─── Attendance ──────────────────────────────────────────────────────────────

  async getAttendanceHomeLocation(userId: number): Promise<{ latitude: string | null; longitude: string | null; setAt: Date | null }> {
    const [row] = await db.select({
      latitude: users.attendance_home_latitude,
      longitude: users.attendance_home_longitude,
      setAt: users.attendance_home_set_at,
    }).from(users).where(eq(users.id, userId)).limit(1);
    return {
      latitude: row?.latitude ?? null,
      longitude: row?.longitude ?? null,
      setAt: row?.setAt ?? null,
    };
  }

  async getAttendanceById(id: number): Promise<AttendanceSession | undefined> {
    const rows = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, id)).limit(1);
    return rows[0];
  }

  async getActiveAttendanceForUser(userId: number): Promise<AttendanceSession | undefined> {
    const rows = await db.select().from(attendanceSessions)
      .where(and(eq(attendanceSessions.user_id, userId), eq(attendanceSessions.status, "active")))
      .orderBy(desc(attendanceSessions.time_in))
      .limit(1);
    return rows[0];
  }

  async getAttendanceHistoryForUser(userId: number, limit = 30): Promise<AttendanceSession[]> {
    return db.select().from(attendanceSessions)
      .where(eq(attendanceSessions.user_id, userId))
      .orderBy(desc(attendanceSessions.time_in), desc(attendanceSessions.created_at))
      .limit(Math.min(Math.max(limit, 1), 100));
  }

  async createAttendance(data: InsertAttendanceSession): Promise<AttendanceSession> {
    const rows = await db.insert(attendanceSessions).values(data as any).returning();
    return rows[0];
  }

  async updateAttendance(id: number, data: Partial<InsertAttendanceSession>): Promise<AttendanceSession | undefined> {
    const rows = await db.update(attendanceSessions)
      .set({ ...data, updated_at: new Date() } as any)
      .where(eq(attendanceSessions.id, id))
      .returning();
    return rows[0];
  }

  async createAttendanceCheckpoint(data: InsertAttendanceCheckpoint): Promise<AttendanceCheckpoint> {
    const rows = await db.insert(attendanceLocationCheckpoints).values(data as any).returning();
    return rows[0];
  }

  async getAttendanceCheckpoints(attendanceId: number): Promise<AttendanceCheckpoint[]> {
    return db.select().from(attendanceLocationCheckpoints)
      .where(eq(attendanceLocationCheckpoints.attendance_id, attendanceId))
      .orderBy(asc(attendanceLocationCheckpoints.captured_at));
  }

  async getAttendanceRecords(opts: { from?: string; to?: string; userId?: number; status?: string; startMethod?: string; reviewStatus?: string; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number }> {
    const conditions: any[] = [];
    if (opts.from) conditions.push(gte(attendanceSessions.work_date, opts.from));
    if (opts.to) conditions.push(lte(attendanceSessions.work_date, opts.to));
    if (opts.userId) conditions.push(eq(attendanceSessions.user_id, opts.userId));
    if (opts.status && opts.status !== "all") conditions.push(eq(attendanceSessions.status, opts.status));
    if (opts.startMethod && opts.startMethod !== "all") conditions.push(eq(attendanceSessions.start_method, opts.startMethod));
    if (opts.reviewStatus && opts.reviewStatus !== "all") {
      if (opts.reviewStatus === "missing_time_out") {
        conditions.push(and(isNotNull(attendanceSessions.time_in), isNull(attendanceSessions.time_out)));
      } else {
        conditions.push(eq(attendanceSessions.review_status, opts.reviewStatus));
      }
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      db.select({
        attendance: attendanceSessions,
        employee_name: users.name,
        employee_username: users.username,
      })
        .from(attendanceSessions)
        .leftJoin(users, eq(users.id, attendanceSessions.user_id))
        .where(where)
        .orderBy(desc(attendanceSessions.work_date), desc(attendanceSessions.time_in))
        .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500))
        .offset(Math.max(opts.offset ?? 0, 0)),
      db.select({ count: sql<number>`count(*)` }).from(attendanceSessions).where(where),
    ]);
    return {
      rows: rows.map(row => ({ ...row.attendance, employee_name: row.employee_name, employee_username: row.employee_username })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async getAttendanceAuditHistory(attendanceId: number): Promise<AttendanceAuditLog[]> {
    return db.select().from(attendanceAuditLog)
      .where(eq(attendanceAuditLog.attendance_id, attendanceId))
      .orderBy(desc(attendanceAuditLog.created_at));
  }

  async createAttendanceAuditLog(data: InsertAttendanceAuditLog): Promise<AttendanceAuditLog> {
    const rows = await db.insert(attendanceAuditLog).values(data as any).returning();
    return rows[0];
  }

  async updateAttendanceReview(id: number, data: { review_status: string; approved_by?: number | null; approved_at?: Date | null; locked_at?: Date | null }): Promise<AttendanceSession | undefined> {
    const rows = await db.update(attendanceSessions)
      .set({ ...data, updated_at: new Date() } as any)
      .where(eq(attendanceSessions.id, id))
      .returning();
    return rows[0];
  }

  async createAttendanceException(data: InsertAttendanceException): Promise<AttendanceException> {
    const rows = await db.insert(attendanceExceptions).values(data as any).returning();
    return rows[0];
  }

  async getAttendanceExceptions(opts: { status?: string; from?: string; to?: string; userId?: number; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number }> {
    const conditions: any[] = [];
    if (opts.status && opts.status !== "all") conditions.push(eq(attendanceExceptions.status, opts.status));
    if (opts.from) conditions.push(gte(attendanceExceptions.detected_at, new Date(`${opts.from}T00:00:00Z`)));
    if (opts.to) {
      const end = new Date(`${opts.to}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      conditions.push(lt(attendanceExceptions.detected_at, end));
    }
    if (opts.userId) conditions.push(eq(attendanceExceptions.user_id, opts.userId));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      db.select({
        exception: attendanceExceptions,
        employee_name: users.name,
        employee_username: users.username,
        work_date: attendanceSessions.work_date,
        start_method: attendanceSessions.start_method,
        time_in: attendanceSessions.time_in,
        time_out: attendanceSessions.time_out,
      })
        .from(attendanceExceptions)
        .leftJoin(users, eq(users.id, attendanceExceptions.user_id))
        .leftJoin(attendanceSessions, eq(attendanceSessions.id, attendanceExceptions.attendance_id))
        .where(where)
        .orderBy(desc(attendanceExceptions.detected_at))
        .limit(Math.min(Math.max(opts.limit ?? 100, 1), 500))
        .offset(Math.max(opts.offset ?? 0, 0)),
      db.select({ count: sql<number>`count(*)` }).from(attendanceExceptions).where(where),
    ]);
    return {
      rows: rows.map(row => ({
        ...row.exception,
        employee_name: row.employee_name,
        employee_username: row.employee_username,
        work_date: row.work_date,
        start_method: row.start_method,
        time_in: row.time_in,
        time_out: row.time_out,
      })),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async reviewAttendanceException(id: number, data: { status: string; reviewed_by: number; review_notes?: string | null }): Promise<AttendanceException | undefined> {
    const rows = await db.update(attendanceExceptions).set({
      status: data.status,
      reviewed_by: data.reviewed_by,
      reviewed_at: new Date(),
      review_notes: data.review_notes ?? null,
    }).where(eq(attendanceExceptions.id, id)).returning();
    return rows[0];
  }

  // ─── CRM Order Notes ──────────────────────────────────────────────────────────

  async updateCrmOrderNotes(bcOrderId: number, data: { staff_notes?: string; customer_order_notes?: string }): Promise<void> {
    await db.update(customerOrdersMirror)
      .set({ ...data, updated_at: new Date() })
      .where(eq(customerOrdersMirror.bigcommerce_order_id, bcOrderId));
  }

  // ─── CRM Audit Log ────────────────────────────────────────────────────────────

  async createCrmAuditLog(data: InsertCrmAuditLog): Promise<void> {
    await db.insert(crmAuditLog).values(data);
  }

  async truncateCrmCustomers(): Promise<void> {
    await db.delete(customersMirror);
  }

  async truncateCrmOrders(): Promise<void> {
    await db.delete(customerOrdersMirror);
  }

  async getBcOrderLineItemsCount(): Promise<number> {
    const result = await db.execute(sql.raw(
      `SELECT COALESCE(n_live_tup, 0)::int AS cnt FROM pg_stat_user_tables WHERE relname = 'bc_order_line_items' LIMIT 1`
    ));
    const approx = (result.rows[0] as any)?.cnt;
    if (approx != null && approx > 0) return approx;
    const exact = await db.select({ count: sql<number>`count(*)::int` }).from(bcOrderLineItems);
    return exact[0]?.count ?? 0;
  }

  async truncateBcOrderLineItems(): Promise<void> {
    await db.delete(bcOrderLineItems);
  }

  async getCrmOrdersForLineItemSync(since?: string): Promise<Array<{ bigcommerce_order_id: number; order_date: Date | null; customer_name: string | null; customer_email: string | null; bigcommerce_customer_id: number | null }>> {
    let q = db.select({
      bigcommerce_order_id: customerOrdersMirror.bigcommerce_order_id,
      order_date: customerOrdersMirror.order_date,
      customer_name: customerOrdersMirror.customer_name,
      customer_email: customerOrdersMirror.customer_email,
      bigcommerce_customer_id: customerOrdersMirror.bigcommerce_customer_id,
    }).from(customerOrdersMirror);
    if (since) {
      return q.where(sql`${customerOrdersMirror.order_date} >= ${since}::date`).orderBy(desc(customerOrdersMirror.order_date)) as unknown as any;
    }
    return q.orderBy(desc(customerOrdersMirror.order_date)) as unknown as any;
  }

  // ─── POS Enhancements — Price Override Audit ───────────────────────────────

  async createPosPriceOverrideAudit(entry: InsertPosPriceOverrideAudit): Promise<PosPriceOverrideAudit> {
    const result = await db.insert(posPriceOverrideAudit).values(entry).returning();
    return result[0];
  }

  async getPosPriceOverrideAudit(opts: { userId?: number; customerId?: number; sku?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string; limit?: number; offset?: number }): Promise<{ rows: PosPriceOverrideAudit[]; total: number }> {
    const { userId, customerId, sku, dateFrom, dateTo, sortBy = "created_at", sortDir = "desc", limit = 50, offset = 0 } = opts;
    const conditions: any[] = [];
    if (userId) conditions.push(eq(posPriceOverrideAudit.user_id, userId));
    if (customerId) conditions.push(eq(posPriceOverrideAudit.customer_id, customerId));
    if (sku?.trim()) conditions.push(ilike(posPriceOverrideAudit.sku, `%${sku.trim()}%`));
    if (dateFrom) conditions.push(sql`${posPriceOverrideAudit.created_at} >= ${dateFrom}::timestamptz`);
    if (dateTo) conditions.push(sql`${posPriceOverrideAudit.created_at} <= ${dateTo}::timestamptz + interval '1 day'`);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColMap: Record<string, any> = {
      created_at: posPriceOverrideAudit.created_at,
      loss_amount: posPriceOverrideAudit.loss_amount,
      sku: posPriceOverrideAudit.sku,
      product_cost: posPriceOverrideAudit.product_cost,
      selling_price: posPriceOverrideAudit.selling_price,
    };
    const sortCol = sortColMap[sortBy] ?? posPriceOverrideAudit.created_at;
    const orderFn = sortDir === "asc" ? asc : desc;

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(posPriceOverrideAudit).where(where),
      db.select().from(posPriceOverrideAudit).where(where).orderBy(orderFn(sortCol)).limit(limit).offset(offset),
    ]);

    return { rows, total: countRows[0]?.count ?? 0 };
  }

  // ─── POS Enhancements — Store Credit Usage ─────────────────────────────────

  async createPosStoreCreditUsage(entry: InsertPosStoreCreditUsage): Promise<PosStoreCreditUsage> {
    const result = await db.insert(posStoreCreditUsage).values(entry).returning();
    return result[0];
  }

  async getPosStoreCreditUsage(opts: { customerId?: number; cashierId?: number; orderSearch?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string; limit?: number; offset?: number }): Promise<{ rows: PosStoreCreditUsage[]; total: number }> {
    const { customerId, cashierId, orderSearch, dateFrom, dateTo, sortBy = "created_at", sortDir = "desc", limit = 50, offset = 0 } = opts;
    const conditions: any[] = [];
    if (customerId) conditions.push(eq(posStoreCreditUsage.customer_id, customerId));
    if (cashierId) conditions.push(eq(posStoreCreditUsage.cashier_id, cashierId));
    if (orderSearch?.trim()) {
      const s = orderSearch.trim();
      conditions.push(or(
        sql`${posStoreCreditUsage.bigcommerce_order_id}::text ilike ${`%${s}%`}`,
        sql`${posStoreCreditUsage.order_id}::text ilike ${`%${s}%`}`,
      ));
    }
    if (dateFrom) conditions.push(sql`${posStoreCreditUsage.created_at} >= ${dateFrom}::timestamptz`);
    if (dateTo) conditions.push(sql`${posStoreCreditUsage.created_at} <= ${dateTo}::timestamptz + interval '1 day'`);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColMap: Record<string, any> = {
      created_at: posStoreCreditUsage.created_at,
      credit_used: posStoreCreditUsage.credit_used,
      final_order_total: posStoreCreditUsage.final_order_total,
    };
    const sortCol = sortColMap[sortBy] ?? posStoreCreditUsage.created_at;
    const orderFn = sortDir === "asc" ? asc : desc;

    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(posStoreCreditUsage).where(where),
      db.select().from(posStoreCreditUsage).where(where).orderBy(orderFn(sortCol)).limit(limit).offset(offset),
    ]);

    return { rows, total: countRows[0]?.count ?? 0 };
  }
  // ─── Store Credit Ledger ──────────────────────────────────────────────────────

  async createStoreCreditLedger(entry: InsertStoreCreditLedger): Promise<StoreCreditLedgerEntry> {
    const result = await db.insert(storeCreditLedger).values(entry).returning();
    return result[0];
  }

  async getStoreCreditLedger(opts: { customerId?: number; issuedBy?: number; dateFrom?: string; dateTo?: string; search?: string; type?: string; limit?: number; offset?: number }): Promise<{ rows: StoreCreditLedgerEntry[]; total: number }> {
    const { customerId, issuedBy, dateFrom, dateTo, search, type, limit = 50, offset = 0 } = opts;
    const conditions: any[] = [];
    if (customerId) conditions.push(eq(storeCreditLedger.customer_id, customerId));
    if (issuedBy) conditions.push(eq(storeCreditLedger.issued_by, issuedBy));
    if (dateFrom) conditions.push(sql`${storeCreditLedger.created_at} >= ${dateFrom}::timestamptz`);
    if (dateTo) conditions.push(sql`${storeCreditLedger.created_at} <= ${dateTo}::timestamptz + interval '1 day'`);
    if (type && type !== "all" && type !== "usage") conditions.push(eq(storeCreditLedger.type, type));
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push(or(
        ilike(storeCreditLedger.issued_by_name, s),
        ilike(storeCreditLedger.reason, s),
        sql`${storeCreditLedger.bigcommerce_order_id}::text ilike ${s}`,
      ));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(storeCreditLedger).where(where),
      db.select().from(storeCreditLedger).where(where).orderBy(desc(storeCreditLedger.created_at)).limit(limit).offset(offset),
    ]);
    return { rows, total: countRows[0]?.count ?? 0 };
  }

  async updateCustomerStoreCreditBalance(customerId: number, delta: number): Promise<void> {
    await db.update(customersMirror)
      .set({ store_credit_balance: sql`GREATEST(0, COALESCE(store_credit_balance, 0) + ${delta.toFixed(2)}::numeric)` })
      .where(eq(customersMirror.id, customerId));
  }

  async getCrmIdByBcCustomerId(bcCustomerId: number): Promise<number | null> {
    const rows = await db
      .select({ id: customersMirror.id })
      .from(customersMirror)
      .where(eq(customersMirror.bigcommerce_customer_id, bcCustomerId))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async setCustomerStoreCreditBalance(crmId: number, newBalance: number): Promise<void> {
    await db.update(customersMirror)
      .set({ store_credit_balance: newBalance.toFixed(2) })
      .where(eq(customersMirror.id, crmId));
  }

  // ─── Email Templates ──────────────────────────────────────────────────────────

  async getEmailTemplate(key: string): Promise<EmailTemplate | undefined> {
    const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key));
    return rows[0];
  }

  async upsertEmailTemplate(key: string, data: { name: string; subject_template: string; body: string; template_type?: string; category?: string; is_active?: boolean; updated_by?: number }): Promise<EmailTemplate> {
    const existing = await this.getEmailTemplate(key);
    if (existing) {
      const rows = await db.update(emailTemplates)
        .set({ ...data, updated_at: new Date() })
        .where(eq(emailTemplates.key, key))
        .returning();
      return rows[0];
    }
    const rows = await db.insert(emailTemplates).values({ key, ...data }).returning();
    return rows[0];
  }

  // ─── Marketing ───────────────────────────────────────────────────────────────

  private async getMarketingAudienceCount(audienceId: number): Promise<number> {
    const audience = await db.select().from(marketingAudiences).where(eq(marketingAudiences.id, audienceId)).limit(1);
    if (!audience[0]) return 0;
    if (audience[0].audience_type === "manual") {
      const rows = await db.select({ count: sql<number>`count(*)::int` })
        .from(marketingAudienceMembers).where(eq(marketingAudienceMembers.audience_id, audienceId));
      return rows[0]?.count ?? 0;
    }
    return this.getMarketingDynamicCustomerCount((audience[0].dynamic_filters ?? {}) as Record<string, unknown>);
  }

  private async getMarketingDynamicCustomerCount(filters: Record<string, unknown>): Promise<number> {
    const preview = await this.getMarketingAudiencePreview(filters, 0);
    return preview.total;
  }

  async getMarketingDashboard(): Promise<any> {
    const [statusRows, totals, recent, activity, audienceRows] = await Promise.all([
      db.select({ status: marketingCampaigns.status, count: sql<number>`count(*)::int` })
        .from(marketingCampaigns).groupBy(marketingCampaigns.status),
      db.select({
        recipients: sql<number>`coalesce(sum(${marketingCampaigns.recipient_count}), 0)::int`,
        sent: sql<number>`coalesce(sum(${marketingCampaigns.sent_count}), 0)::int`,
        delivered: sql<number>`coalesce(sum(${marketingCampaigns.delivered_count}), 0)::int`,
        opened: sql<number>`coalesce(sum(${marketingCampaigns.opened_count}), 0)::int`,
        clicked: sql<number>`coalesce(sum(${marketingCampaigns.clicked_count}), 0)::int`,
      }).from(marketingCampaigns),
      db.select({ c: marketingCampaigns, creator_name: users.name })
        .from(marketingCampaigns).leftJoin(users, eq(users.id, marketingCampaigns.created_by))
        .orderBy(desc(marketingCampaigns.updated_at)).limit(8),
      db.select({ a: marketingCampaignActivity, user_name: users.name, campaign_name: marketingCampaigns.name })
        .from(marketingCampaignActivity)
        .leftJoin(users, eq(users.id, marketingCampaignActivity.user_id))
        .leftJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingCampaignActivity.campaign_id))
        .orderBy(desc(marketingCampaignActivity.created_at)).limit(8),
      db.select({ id: marketingAudiences.id }).from(marketingAudiences),
    ]);
    const byStatus: Record<string, number> = {};
    for (const row of statusRows) byStatus[row.status] = row.count;
    const total = totals[0] ?? { recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0 };
    const audienceCounts = await Promise.all(audienceRows.map(row => this.getMarketingAudienceCount(row.id)));
    return {
      totalCampaigns: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      draftCampaigns: byStatus.draft ?? 0,
      activeCampaigns: (byStatus.ready ?? 0) + (byStatus.scheduled ?? 0) + (byStatus.sending ?? 0),
      sentCampaigns: byStatus.sent ?? 0,
      scheduledCampaigns: byStatus.scheduled ?? 0,
      totalRecipients: total.recipients,
      sentRecipients: total.sent,
      deliveredRecipients: total.delivered,
      openedRecipients: total.opened,
      clickedRecipients: total.clicked,
      openRate: total.delivered ? Math.round((total.opened / total.delivered) * 1000) / 10 : 0,
      clickRate: total.delivered ? Math.round((total.clicked / total.delivered) * 1000) / 10 : 0,
      audienceCount: audienceRows.length,
      audienceMembers: audienceCounts.reduce((sum, n) => sum + n, 0),
      recentCampaigns: recent.map(row => ({ ...row.c, creator_name: row.creator_name })),
      recentActivity: activity.map(row => ({ ...row.a, user_name: row.user_name, campaign_name: row.campaign_name })),
    };
  }

  async getMarketingCampaigns(opts: { search?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ campaigns: any[]; total: number }> {
    const { search, status, limit = 50, offset = 0 } = opts;
    const conditions: any[] = [];
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(marketingCampaigns.name, term), ilike(marketingCampaigns.subject_line, term)));
    }
    if (status && status !== "all") conditions.push(eq(marketingCampaigns.status, status));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      db.select({ c: marketingCampaigns, creator_name: users.name, audience_name: marketingAudiences.name })
        .from(marketingCampaigns)
        .leftJoin(users, eq(users.id, marketingCampaigns.created_by))
        .leftJoin(marketingAudiences, eq(marketingAudiences.id, marketingCampaigns.audience_id))
        .where(where).orderBy(desc(marketingCampaigns.updated_at)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingCampaigns).where(where),
    ]);
    return { campaigns: rows.map(row => ({ ...row.c, creator_name: row.creator_name, audience_name: row.audience_name })), total: countRows[0]?.count ?? 0 };
  }

  async getMarketingCampaign(id: number): Promise<any | undefined> {
    const rows = await db.select({ c: marketingCampaigns, creator_name: users.name, audience_name: marketingAudiences.name })
      .from(marketingCampaigns)
      .leftJoin(users, eq(users.id, marketingCampaigns.created_by))
      .leftJoin(marketingAudiences, eq(marketingAudiences.id, marketingCampaigns.audience_id))
      .where(eq(marketingCampaigns.id, id)).limit(1);
    if (!rows[0]) return undefined;
    const [activity, recipients] = await Promise.all([
      db.select({ a: marketingCampaignActivity, user_name: users.name })
        .from(marketingCampaignActivity).leftJoin(users, eq(users.id, marketingCampaignActivity.user_id))
        .where(eq(marketingCampaignActivity.campaign_id, id)).orderBy(desc(marketingCampaignActivity.created_at)),
      db.select({
        id: customersMirror.id, company: customersMirror.company, first_name: customersMirror.first_name,
        last_name: customersMirror.last_name, email: customersMirror.email,
      }).from(marketingCampaignRecipients)
        .innerJoin(customersMirror, eq(customersMirror.id, marketingCampaignRecipients.customer_id))
        .where(eq(marketingCampaignRecipients.campaign_id, id)).limit(100),
    ]);
     const campaign = {
       ...rows[0].c,
       product_snapshots: Array.isArray(rows[0].c.product_snapshots) ? rows[0].c.product_snapshots : [],
       product_display_options: normalizeMarketingProductDisplayOptions(rows[0].c.product_display_options),
       creator_name: rows[0].creator_name,
       audience_name: rows[0].audience_name,
     };
    let audienceCount = 0;
    if (campaign.audience_type === "selected_customers") {
      const countRows = await db.select({ count: sql<number>`count(*)::int` }).from(marketingCampaignRecipients)
        .where(eq(marketingCampaignRecipients.campaign_id, id));
      audienceCount = countRows[0]?.count ?? 0;
    } else if (campaign.audience_type === "saved_audience" && campaign.audience_id) {
      audienceCount = await this.getMarketingAudienceCount(campaign.audience_id);
    } else if (campaign.audience_type === "customer_group") {
      audienceCount = await this.getMarketingDynamicCustomerCount(
        (campaign.audience_config ?? {}) as Record<string, unknown>,
      );
    } else if (campaign.audience_type === "all_eligible") {
      audienceCount = await this.getMarketingDynamicCustomerCount({});
    }
    return { ...campaign, audience_count: audienceCount, recipients, activity: activity.map(row => ({ ...row.a, user_name: row.user_name })) };
  }

  async createMarketingCampaign(data: { name: string; internal_description?: string; campaign_type?: string; subject_line?: string; preview_text?: string; message_content?: string; sender_email?: string; audience_type: string; audience_id?: number | null; audience_config?: Record<string, unknown>; template_id?: number | null; product_snapshots?: unknown[]; product_display_options?: unknown; scheduled_at?: Date | null; timezone?: string; created_by: number; customer_ids?: number[] }): Promise<any> {
    const customerIds = [...new Set((data.customer_ids ?? []).filter(Number.isInteger))];
    const recipientCount = !data.audience_type
      ? 0
      : data.audience_type === "selected_customers"
      ? customerIds.length
      : data.audience_type === "saved_audience" && data.audience_id
        ? await this.getMarketingAudienceCount(data.audience_id)
        : data.audience_type === "customer_group"
          ? await this.getMarketingDynamicCustomerCount((data.audience_config ?? {}) as Record<string, unknown>)
          : data.audience_type === "all_eligible"
            ? await this.getMarketingDynamicCustomerCount({})
            : 0;
    const result = await db.transaction(async (tx) => {
      const [campaign] = await tx.insert(marketingCampaigns).values({
        name: data.name.trim(),
        internal_description: data.internal_description ?? "",
        campaign_type: data.campaign_type ?? "email",
        subject_line: data.subject_line ?? "",
        preview_text: data.preview_text ?? "",
        message_content: data.message_content ?? "",
        sender_email: data.sender_email ?? "",
        audience_type: data.audience_type,
        audience_id: data.audience_id ?? null,
        audience_config: data.audience_config ?? {},
         template_id: data.template_id ?? null,
         product_snapshots: Array.isArray(data.product_snapshots) ? data.product_snapshots : [],
         product_display_options: normalizeMarketingProductDisplayOptions(data.product_display_options ?? DEFAULT_MARKETING_PRODUCT_DISPLAY_OPTIONS),
        scheduled_at: data.scheduled_at ?? null,
         timezone: data.timezone ?? "UTC",
        created_by: data.created_by,
        recipient_count: recipientCount,
      }).returning();
      if (customerIds.length) {
        await tx.insert(marketingCampaignRecipients).values(customerIds.map(customer_id => ({ campaign_id: campaign.id, customer_id })));
      }
      await tx.insert(marketingCampaignActivity).values({ campaign_id: campaign.id, user_id: data.created_by, action: "created", detail: {} });
      return campaign;
    });
    return this.getMarketingCampaign(result.id);
  }

  async updateMarketingCampaign(id: number, data: Record<string, unknown> & { customer_ids?: number[] }, userId: number): Promise<any | undefined> {
    const [current] = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, id)).limit(1);
    if (!current) return undefined;
     const allowed = ["name", "internal_description", "campaign_type", "subject_line", "preview_text", "message_content", "sender_email", "audience_type", "audience_id", "audience_config", "template_id", "product_snapshots", "product_display_options", "scheduled_at", "timezone"] as const;
    const update: Record<string, unknown> = {};
    for (const key of allowed) if (key in data) update[key] = data[key];
    if ("scheduled_at" in update) {
      const rawScheduledAt = update.scheduled_at;
      if (rawScheduledAt === null || rawScheduledAt === undefined || rawScheduledAt === "") {
        update.scheduled_at = null;
      } else {
        const scheduledAt = rawScheduledAt instanceof Date
          ? rawScheduledAt
          : new Date(String(rawScheduledAt));
        if (Number.isNaN(scheduledAt.getTime())) throw new Error("Invalid scheduled time");
        update.scheduled_at = scheduledAt;
      }
    }
     if ("product_snapshots" in data) {
       update.product_snapshots = Array.isArray(data.product_snapshots) ? data.product_snapshots : [];
     }
     if ("product_display_options" in data) {
       update.product_display_options = normalizeMarketingProductDisplayOptions(data.product_display_options);
     }
    const audienceType = String(data.audience_type ?? current.audience_type);
    const audienceId = data.audience_id !== undefined ? (Number(data.audience_id) || null) : current.audience_id;
    const audienceConfig = (data.audience_config ?? current.audience_config ?? {}) as Record<string, unknown>;
    if (!audienceType) {
      update.recipient_count = 0;
    } else if (audienceType !== "selected_customers") {
      update.recipient_count = audienceType === "saved_audience" && audienceId
        ? await this.getMarketingAudienceCount(audienceId)
        : audienceType === "customer_group"
          ? await this.getMarketingDynamicCustomerCount(audienceConfig)
          : audienceType === "all_eligible"
            ? await this.getMarketingDynamicCustomerCount({})
            : 0;
    } else if (data.customer_ids) {
      update.recipient_count = [...new Set(data.customer_ids.filter(Number.isInteger))].length;
    }
    update.updated_at = new Date();
    const result = await db.transaction(async tx => {
      if (audienceType !== "selected_customers" || data.customer_ids) {
        const customerIds = [...new Set((data.customer_ids ?? []).filter(Number.isInteger))];
        await tx.delete(marketingCampaignRecipients).where(eq(marketingCampaignRecipients.campaign_id, id));
        if (audienceType === "selected_customers" && customerIds.length) {
          await tx.insert(marketingCampaignRecipients).values(customerIds.map(customer_id => ({ campaign_id: id, customer_id })));
        }
      }
      const [updated] = await tx.update(marketingCampaigns).set(update as any).where(eq(marketingCampaigns.id, id)).returning();
      if (updated) await tx.insert(marketingCampaignActivity).values({ campaign_id: id, user_id: userId, action: "edited", detail: {} });
      return updated;
    });
    if (!result) return undefined;
    return this.getMarketingCampaign(id);
  }

  async deleteMarketingCampaign(id: number, userId: number): Promise<void> {
    await db.insert(marketingCampaignActivity).values({ campaign_id: id, user_id: userId, action: "deleted", detail: {} }).catch(() => {});
    await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));
  }

  async updateMarketingCampaignStatus(id: number, status: string, userId: number): Promise<any | undefined> {
    const result = await db.update(marketingCampaigns).set({
      status, updated_at: new Date(),
      ...(status === "queued" ? { queued_at: new Date(), last_error: null } : {}),
      ...(status === "sent" ? { sent_at: new Date() } : {}),
    }).where(eq(marketingCampaigns.id, id)).returning();
    if (!result[0]) return undefined;
    await db.insert(marketingCampaignActivity).values({ campaign_id: id, user_id: userId, action: `status_${status}`, detail: { status } });
    return this.getMarketingCampaign(id);
  }

  async getMarketingAudiences(opts: { search?: string; type?: string } = {}): Promise<any[]> {
    const conditions: any[] = [];
    if (opts.search?.trim()) conditions.push(ilike(marketingAudiences.name, `%${opts.search.trim()}%`));
    if (opts.type && opts.type !== "all") conditions.push(eq(marketingAudiences.audience_type, opts.type));
    const rows = await db.select({ a: marketingAudiences, creator_name: users.name })
      .from(marketingAudiences).leftJoin(users, eq(users.id, marketingAudiences.created_by))
      .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(marketingAudiences.updated_at));
    return Promise.all(rows.map(async row => ({ ...row.a, creator_name: row.creator_name, member_count: await this.getMarketingAudienceCount(row.a.id) })));
  }

  async getMarketingAudience(id: number): Promise<any | undefined> {
    const rows = await db.select({ a: marketingAudiences, creator_name: users.name })
      .from(marketingAudiences).leftJoin(users, eq(users.id, marketingAudiences.created_by))
      .where(eq(marketingAudiences.id, id)).limit(1);
    if (!rows[0]) return undefined;
    const count = await this.getMarketingAudienceCount(id);
    const [members, memberIds] = await Promise.all([
      this.getMarketingAudienceMembers(id, { limit: 200 }),
      db.select({ customer_id: marketingAudienceMembers.customer_id, contact_id: marketingAudienceMembers.marketing_contact_id })
        .from(marketingAudienceMembers).where(eq(marketingAudienceMembers.audience_id, id)),
    ]);
    return {
      ...rows[0].a,
      creator_name: rows[0].creator_name,
      member_count: count,
      members: members.rows,
      member_customer_ids: memberIds.flatMap(member => member.customer_id ? [member.customer_id] : []),
      member_contact_ids: memberIds.flatMap(member => member.contact_id ? [member.contact_id] : []),
    };
  }

  async createMarketingAudience(data: { name: string; description?: string; audience_type: string; dynamic_filters?: Record<string, unknown>; customer_ids?: number[]; contact_ids?: number[]; created_by: number }): Promise<any> {
    const audience = await db.transaction(async tx => {
      const [created] = await tx.insert(marketingAudiences).values({
        name: data.name.trim(), description: data.description ?? "", audience_type: data.audience_type,
        dynamic_filters: data.dynamic_filters ?? {}, created_by: data.created_by,
      }).returning();
      const customerIds = Array.from(new Set((data.customer_ids ?? []).filter(Number.isInteger)));
      const contactIds = Array.from(new Set((data.contact_ids ?? []).filter(Number.isInteger)));
      if (customerIds.length || contactIds.length) {
        await tx.insert(marketingAudienceMembers).values([
          ...customerIds.map(customer_id => ({ audience_id: created.id, customer_id })),
          ...contactIds.map(marketing_contact_id => ({ audience_id: created.id, marketing_contact_id })),
        ]);
      }
      return created;
    });
    return this.getMarketingAudience(audience.id);
  }

  async updateMarketingAudience(id: number, data: { name?: string; description?: string; audience_type?: string; dynamic_filters?: Record<string, unknown>; customer_ids?: number[]; contact_ids?: number[] }, userId: number): Promise<any | undefined> {
    const update: Record<string, unknown> = { updated_at: new Date() };
    for (const key of ["name", "description", "audience_type", "dynamic_filters"] as const) if (data[key] !== undefined) update[key] = data[key];
    const [updated] = await db.update(marketingAudiences).set(update as any).where(eq(marketingAudiences.id, id)).returning();
    if (!updated) return undefined;
    if (data.customer_ids || data.contact_ids) {
      await db.delete(marketingAudienceMembers).where(eq(marketingAudienceMembers.audience_id, id));
      const customerIds = Array.from(new Set((data.customer_ids ?? []).filter(Number.isInteger)));
      const contactIds = Array.from(new Set((data.contact_ids ?? []).filter(Number.isInteger)));
      if (customerIds.length || contactIds.length) {
        await db.insert(marketingAudienceMembers).values([
          ...customerIds.map(customer_id => ({ audience_id: id, customer_id })),
          ...contactIds.map(marketing_contact_id => ({ audience_id: id, marketing_contact_id })),
        ]);
      }
    }
    return this.getMarketingAudience(id);
  }

  async deleteMarketingAudience(id: number, _userId: number): Promise<void> {
    await db.delete(marketingAudiences).where(eq(marketingAudiences.id, id));
  }

  async getMarketingAudienceCustomers(opts: { search?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conditions: any[] = [eq(customersMirror.is_active, true), eq(customersMirror.account_type, "customer")];
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(ilike(customersMirror.company, term), ilike(customersMirror.first_name, term), ilike(customersMirror.last_name, term), ilike(customersMirror.email, term)));
    }
    const where = and(...conditions);
    const [rows, countRows] = await Promise.all([db.select({
      id: customersMirror.id, company: customersMirror.company, first_name: customersMirror.first_name,
      last_name: customersMirror.last_name, email: customersMirror.email, customer_group_name: customersMirror.customer_group_name,
    }).from(customersMirror).where(where).orderBy(asc(customersMirror.company), asc(customersMirror.last_name)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(customersMirror).where(where)]);
    return { rows, total: countRows[0]?.count ?? 0, limit, offset };
  }

  async getMarketingContacts(opts: { search?: string; type?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conditions: any[] = [eq(marketingContacts.is_active, true)];
    if (opts.type && opts.type !== "all") conditions.push(eq(marketingContacts.contact_type, opts.type));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(ilike(marketingContacts.email, term), ilike(marketingContacts.company, term), ilike(marketingContacts.first_name, term), ilike(marketingContacts.last_name, term)));
    }
    const where = and(...conditions);
    const [rows, countRows] = await Promise.all([
      db.select().from(marketingContacts).where(where).orderBy(asc(marketingContacts.company), asc(marketingContacts.last_name), asc(marketingContacts.email)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingContacts).where(where),
    ]);
    return { rows, total: countRows[0]?.count ?? 0, limit, offset };
  }

  async importMarketingContacts(records: Array<{ email: string; first_name?: string; last_name?: string; company?: string; phone?: string; contact_type: string }>, userId: number): Promise<{ imported: number; duplicates: number }> {
    let imported = 0;
    for (const record of records) {
      const [row] = await db.insert(marketingContacts).values({
        email: record.email.trim().toLowerCase(),
        first_name: String(record.first_name ?? "").trim(),
        last_name: String(record.last_name ?? "").trim(),
        company: String(record.company ?? "").trim() || null,
        phone: String(record.phone ?? "").trim() || null,
        contact_type: record.contact_type,
        created_by: userId,
      }).onConflictDoNothing({ target: marketingContacts.email }).returning({ id: marketingContacts.id });
      if (row) imported++;
    }
    return { imported, duplicates: records.length - imported };
  }

  async deactivateMarketingContact(id: number): Promise<void> {
    await db.update(marketingContacts).set({ is_active: false, updated_at: new Date() }).where(eq(marketingContacts.id, id));
  }

  async getMarketingAudienceMembers(audienceId: number, opts: { search?: string; source?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const sourceExpr = sql<string>`case when ${marketingAudienceMembers.marketing_contact_id} is not null then 'imported' else 'crm' end`;
    const statusExpr = sql<string>`case
      when ${marketingAudienceMembers.marketing_contact_id} is not null and ${marketingContacts.is_active} = false then 'inactive'
      when ${marketingAudienceMembers.customer_id} is not null and (
        coalesce(${marketingCustomerPreferences.email_subscribed}, true) = false
        or exists (select 1 from marketing_suppressions ms where ms.customer_id = ${marketingAudienceMembers.customer_id} and ms.revoked_at is null)
      ) then 'suppressed'
      else 'eligible' end`;
    const conditions: any[] = [eq(marketingAudienceMembers.audience_id, audienceId)];
    if (opts.source && opts.source !== "all") conditions.push(sql`${sourceExpr} = ${opts.source}`);
    if (opts.status && opts.status !== "all") conditions.push(sql`${statusExpr} = ${opts.status}`);
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, term), ilike(customersMirror.first_name, term), ilike(customersMirror.last_name, term), ilike(customersMirror.email, term),
        ilike(marketingContacts.company, term), ilike(marketingContacts.first_name, term), ilike(marketingContacts.last_name, term), ilike(marketingContacts.email, term),
      ));
    }
    const where = and(...conditions);
    const selectShape = {
      member_id: marketingAudienceMembers.id,
      customer_id: marketingAudienceMembers.customer_id,
      contact_id: marketingAudienceMembers.marketing_contact_id,
      company: sql<string>`coalesce(${customersMirror.company}, ${marketingContacts.company})`,
      first_name: sql<string>`coalesce(${customersMirror.first_name}, ${marketingContacts.first_name})`,
      last_name: sql<string>`coalesce(${customersMirror.last_name}, ${marketingContacts.last_name})`,
      email: sql<string>`coalesce(${customersMirror.email}, ${marketingContacts.email})`,
      source: sourceExpr,
      status: statusExpr,
      contact_type: marketingContacts.contact_type,
    };
    const [rows, countRows] = await Promise.all([
      db.select(selectShape).from(marketingAudienceMembers)
        .leftJoin(customersMirror, eq(customersMirror.id, marketingAudienceMembers.customer_id))
        .leftJoin(marketingContacts, eq(marketingContacts.id, marketingAudienceMembers.marketing_contact_id))
        .leftJoin(marketingCustomerPreferences, eq(marketingCustomerPreferences.customer_id, marketingAudienceMembers.customer_id))
        .where(where).orderBy(asc(sql`coalesce(${customersMirror.company}, ${marketingContacts.company})`), asc(sql`coalesce(${customersMirror.email}, ${marketingContacts.email})`)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingAudienceMembers)
        .leftJoin(customersMirror, eq(customersMirror.id, marketingAudienceMembers.customer_id))
        .leftJoin(marketingContacts, eq(marketingContacts.id, marketingAudienceMembers.marketing_contact_id))
        .leftJoin(marketingCustomerPreferences, eq(marketingCustomerPreferences.customer_id, marketingAudienceMembers.customer_id))
        .where(where),
    ]);
    return { rows, total: countRows[0]?.count ?? 0 };
  }

  async getMarketingTemplates(opts: { search?: string; category?: string; includeArchived?: boolean } = {}): Promise<EmailTemplate[]> {
    const conditions: any[] = [eq(emailTemplates.template_type, "marketing")];
    if (!opts.includeArchived) conditions.push(isNull(emailTemplates.archived_at));
    if (opts.category && opts.category !== "all") conditions.push(eq(emailTemplates.category, opts.category));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(ilike(emailTemplates.name, term), ilike(emailTemplates.key, term)));
    }
    return db.select().from(emailTemplates).where(and(...conditions)).orderBy(desc(emailTemplates.updated_at));
  }

  async getMarketingTemplateById(id: number): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates).where(and(eq(emailTemplates.id, id), eq(emailTemplates.template_type, "marketing"))).limit(1);
    return template;
  }

  async archiveMarketingTemplate(id: number, userId: number, archived: boolean): Promise<EmailTemplate | undefined> {
    const [template] = await db.update(emailTemplates).set({
      archived_at: archived ? new Date() : null,
      is_active: !archived,
      updated_by: userId,
      updated_at: new Date(),
    }).where(and(eq(emailTemplates.id, id), eq(emailTemplates.template_type, "marketing"))).returning();
    return template;
  }

  private async getMarketingCandidateCustomers(filters: Record<string, unknown> = {}, limit = 100000): Promise<any[]> {
    const normalized = { ...filters };
    if (normalized.lastOrderBefore && !normalized.lastOrderTo) normalized.lastOrderTo = normalized.lastOrderBefore;
    if (normalized.lastOrderAfter && !normalized.lastOrderFrom) normalized.lastOrderFrom = normalized.lastOrderAfter;
    if (typeof normalized.isActive === "string") normalized.isActive = normalized.isActive === "true" || normalized.isActive === "active";
    if (normalized.accountStatus && normalized.isActive === undefined) normalized.isActive = normalized.accountStatus === "active";
    const rawAccountTypes = Array.isArray(normalized.accountTypes)
      ? normalized.accountTypes
      : typeof normalized.accountTypes === "string"
        ? [normalized.accountTypes]
        : normalized.accountType
          ? [normalized.accountType]
          : [];
    normalized.accountTypes = Array.from(new Set(rawAccountTypes
      .map(value => String(value).trim().toLowerCase())
      .filter(value => ["customer", "vendor", "internal"].includes(value))));
    const preference = typeof normalized.marketingPreference === "string"
      ? normalized.marketingPreference.trim().toLowerCase()
      : "";
    filters = normalized;
    const accountTypes = normalized.accountTypes as string[];
    const conditions: any[] = [
      accountTypes.length
        ? inArray(customersMirror.account_type, accountTypes)
        : eq(customersMirror.account_type, "customer"),
    ];
    if (typeof filters.isActive === "boolean") conditions.push(eq(customersMirror.is_active, filters.isActive));
    else conditions.push(eq(customersMirror.is_active, true));
    const addText = (column: any, key: string) => {
      if (typeof filters[key] === "string" && String(filters[key]).trim()) conditions.push(eq(column, String(filters[key]).trim()));
    };
    addText(customersMirror.customer_group_name, "customerGroup");
    addText(customersMirror.customer_type, "customerType");
    addText(customersMirror.account_health, "accountHealth");
    if (preference === "subscribed") {
      conditions.push(sql`coalesce((select mcp.email_subscribed from marketing_customer_preferences mcp where mcp.customer_id = ${customersMirror.id} limit 1), true) = true`);
    } else if (preference === "unsubscribed") {
      conditions.push(sql`coalesce((select mcp.email_subscribed from marketing_customer_preferences mcp where mcp.customer_id = ${customersMirror.id} limit 1), true) = false`);
    }
    if (typeof filters.primaryRepId === "number" && filters.primaryRepId > 0) conditions.push(eq(customersMirror.primary_rep_id, filters.primaryRepId));
    if (typeof filters.secondaryRepId === "number" && filters.secondaryRepId > 0) conditions.push(eq(customersMirror.secondary_rep_id, filters.secondaryRepId));
    if (typeof filters.repId === "number" && filters.repId > 0) conditions.push(eq(customersMirror.primary_rep_id, filters.repId));
    const dateRange = (column: any, fromKey: string, toKey: string) => {
      if (typeof filters[fromKey] === "string" && filters[fromKey]) conditions.push(sql`${column} >= ${filters[fromKey]}::timestamptz`);
      if (typeof filters[toKey] === "string" && filters[toKey]) conditions.push(sql`${column} < ${filters[toKey]}::timestamptz + interval '1 day'`);
    };
    dateRange(customersMirror.created_date, "createdFrom", "createdTo");
    dateRange(customersMirror.last_order_date, "lastOrderFrom", "lastOrderTo");
    if (typeof filters.minOrders === "number") conditions.push(gte(customersMirror.lifetime_orders, filters.minOrders));
    if (typeof filters.maxOrders === "number") conditions.push(sql`${customersMirror.lifetime_orders} <= ${filters.maxOrders}`);
    if (typeof filters.minRevenue === "number") conditions.push(sql`${customersMirror.lifetime_revenue} >= ${filters.minRevenue}`);
    if (typeof filters.maxRevenue === "number") conditions.push(sql`${customersMirror.lifetime_revenue} <= ${filters.maxRevenue}`);
    if (typeof filters.minStoreCredit === "number") conditions.push(sql`${customersMirror.store_credit_balance} >= ${filters.minStoreCredit}`);
    if (typeof filters.maxStoreCredit === "number") conditions.push(sql`${customersMirror.store_credit_balance} <= ${filters.maxStoreCredit}`);
    if (typeof filters.state === "string" && filters.state.trim()) {
      const selectedState = filters.state.trim();
      const stateCode = selectedState.toUpperCase();
      const stateName = MARKETING_US_STATE_NAMES[stateCode];
      const matchedCode = Object.entries(MARKETING_US_STATE_NAMES).find(([, name]) => name.toLowerCase() === selectedState.toLowerCase())?.[0];
      const stateValues = stateName
        ? [stateCode.toLowerCase(), stateName.toLowerCase()]
        : matchedCode
          ? [matchedCode.toLowerCase(), MARKETING_US_STATE_NAMES[matchedCode].toLowerCase()]
          : [selectedState.toLowerCase()];
      const stateFields = [
        sql`${customersMirror.shipping_address}->>'state_or_province'`,
        sql`${customersMirror.billing_address}->>'state_or_province'`,
        sql`${customersMirror.shipping_address}->>'state'`,
        sql`${customersMirror.billing_address}->>'state'`,
      ];
      conditions.push(or(...stateFields.flatMap(field => stateValues.map(value => sql`lower(trim(${field})) = ${value}`))));
    }
    if (typeof filters.country === "string" && filters.country.trim()) {
      conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'country_code', ${customersMirror.billing_address}->>'country_code', ${customersMirror.shipping_address}->>'country') = ${filters.country.trim()}`);
    }
    if (typeof filters.search === "string" && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(or(ilike(customersMirror.company, term), ilike(customersMirror.first_name, term), ilike(customersMirror.last_name, term), ilike(customersMirror.email, term)));
    }
    return db.select().from(customersMirror).where(and(...conditions)).orderBy(asc(customersMirror.company), asc(customersMirror.last_name)).limit(limit);
  }

  private async getMarketingCustomerSuppressionIds(customerIds: number[]): Promise<Set<number>> {
    if (!customerIds.length) return new Set();
    const rows = await db.select({ id: customersMirror.id })
      .from(customersMirror)
      .leftJoin(marketingCustomerPreferences, eq(marketingCustomerPreferences.customer_id, customersMirror.id))
      .where(and(
        inArray(customersMirror.id, customerIds),
        or(
          eq(marketingCustomerPreferences.email_subscribed, false),
          sql`EXISTS (SELECT 1 FROM marketing_suppressions ms WHERE ms.customer_id = ${customersMirror.id} AND ms.revoked_at IS NULL)`,
        ),
      ));
    return new Set(rows.map(row => row.id));
  }

  async getMarketingAudiencePreview(filters: Record<string, unknown>, limit = 25): Promise<{ customers: any[]; total: number; suppressed: number }> {
    const candidates = await this.getMarketingCandidateCustomers(filters, 100000);
    const suppressedIds = await this.getMarketingCustomerSuppressionIds(candidates.map(c => c.id));
    return {
      customers: candidates.slice(0, Math.max(0, limit)).map(c => ({ ...c, marketing_suppressed: suppressedIds.has(c.id) })),
      total: candidates.length,
      suppressed: suppressedIds.size,
    };
  }

  private async resolveMarketingCampaignCustomers(campaign: any): Promise<any[]> {
    if (!String(campaign.audience_type ?? "").trim()) return [];
    if (campaign.audience_type === "selected_customers") {
      return db.select({ customer: customersMirror }).from(marketingCampaignRecipients)
        .innerJoin(customersMirror, eq(customersMirror.id, marketingCampaignRecipients.customer_id))
        .where(eq(marketingCampaignRecipients.campaign_id, campaign.id))
        .then(rows => rows.map(row => row.customer));
    }
    if (campaign.audience_type === "saved_audience" && campaign.audience_id) {
      const [audience] = await db.select().from(marketingAudiences).where(eq(marketingAudiences.id, campaign.audience_id)).limit(1);
      if (!audience) return [];
      if (audience.audience_type === "manual") {
        const [customerRows, contactRows] = await Promise.all([
          db.select({ customer: customersMirror }).from(marketingAudienceMembers)
            .innerJoin(customersMirror, eq(customersMirror.id, marketingAudienceMembers.customer_id))
            .where(eq(marketingAudienceMembers.audience_id, campaign.audience_id)),
          db.select({ contact: marketingContacts }).from(marketingAudienceMembers)
            .innerJoin(marketingContacts, eq(marketingContacts.id, marketingAudienceMembers.marketing_contact_id))
            .where(and(eq(marketingAudienceMembers.audience_id, campaign.audience_id), eq(marketingContacts.is_active, true))),
        ]);
        return [
          ...customerRows.map(row => row.customer),
          ...contactRows.map(row => ({ ...row.contact, marketing_contact_id: row.contact.id, id: undefined })),
        ];
      }
      return this.getMarketingCandidateCustomers((audience.dynamic_filters ?? {}) as Record<string, unknown>);
    }
    if (campaign.audience_type === "customer_group") {
      const config = (campaign.audience_config ?? {}) as Record<string, unknown>;
      const groupName = String(config.customerGroupName ?? config.customerGroup ?? "").trim();
      if (!groupName) return [];
      return this.getMarketingCandidateCustomers({ ...config, customerGroup: groupName });
    }
    if (campaign.audience_type === "all_eligible") return this.getMarketingCandidateCustomers({});
    return [];
  }

  async claimMarketingCampaign(id: number): Promise<any | undefined> {
    const [campaign] = await db.update(marketingCampaigns).set({
      status: "sending",
      started_at: new Date(),
      send_attempts: sql`${marketingCampaigns.send_attempts} + 1`,
      updated_at: new Date(),
      last_error: null,
    }).where(and(eq(marketingCampaigns.id, id), or(eq(marketingCampaigns.status, "queued"), eq(marketingCampaigns.status, "scheduled")))).returning();
    return campaign;
  }

  async getMarketingQueueCampaigns(): Promise<any[]> {
    return db.select().from(marketingCampaigns).where(or(
      eq(marketingCampaigns.status, "queued"),
      and(eq(marketingCampaigns.status, "scheduled"), lte(marketingCampaigns.scheduled_at, new Date())),
    )).orderBy(asc(marketingCampaigns.scheduled_at)).limit(10);
  }

  async prepareMarketingRecipients(campaignId: number): Promise<{ eligible: number; suppressed: number; unsubscribed: number }> {
    const [campaign] = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, campaignId)).limit(1);
    if (!campaign) throw new Error("Campaign not found");
    const candidates = await this.resolveMarketingCampaignCustomers(campaign);
    const customerIds = Array.from(new Set(candidates.map(c => Number(c.id)).filter(Number.isInteger)));
    const contactIds = Array.from(new Set(candidates.map(c => Number(c.marketing_contact_id)).filter(Number.isInteger)));
    const suppressedIds = await this.getMarketingCustomerSuppressionIds(customerIds);
    const existing = await db.select({ customer_id: marketingCampaignRecipients.customer_id, marketing_contact_id: marketingCampaignRecipients.marketing_contact_id, status: marketingCampaignRecipients.status })
      .from(marketingCampaignRecipients).where(eq(marketingCampaignRecipients.campaign_id, campaignId));
    const existingByKey = new Map(existing.map(row => [row.customer_id ? `customer:${row.customer_id}` : `contact:${row.marketing_contact_id}`, row.status]));
    for (const customer of candidates) {
      const isImported = Number.isInteger(Number(customer.marketing_contact_id));
      const entityId = isImported ? Number(customer.marketing_contact_id) : Number(customer.id);
      const existingStatus = existingByKey.get(isImported ? `contact:${entityId}` : `customer:${entityId}`);
      const status = !isImported && suppressedIds.has(customer.id)
        ? (await this.getMarketingCustomerPreference(customer.id))?.email_subscribed === false ? "unsubscribed" : "suppressed"
        : (existingStatus === "sent" ? "sent" : "eligible");
      const values = {
        campaign_id: campaignId,
        customer_id: isImported ? null : entityId,
        marketing_contact_id: isImported ? entityId : null,
        email: String(customer.email ?? "").trim(),
        status,
      };
      if (isImported) {
        await db.insert(marketingCampaignRecipients).values(values).onConflictDoUpdate({
          target: [marketingCampaignRecipients.campaign_id, marketingCampaignRecipients.marketing_contact_id],
          set: { email: values.email, status: status === "sent" ? "sent" : status },
        });
      } else {
        await db.insert(marketingCampaignRecipients).values(values).onConflictDoUpdate({
          target: [marketingCampaignRecipients.campaign_id, marketingCampaignRecipients.customer_id],
          set: { email: values.email, status: status === "sent" ? "sent" : status },
        });
      }
      if (status === "suppressed" || status === "unsubscribed") {
        await this.recordMarketingEvent({ campaign_id: campaignId, event_type: status, detail: { customer_id: isImported ? null : entityId, marketing_contact_id: isImported ? entityId : null } });
      }
    }
    const [counts] = await db.select({
      eligible: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} in ('eligible','queued','sending','failed'))::int`,
      suppressed: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'suppressed')::int`,
      unsubscribed: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'unsubscribed')::int`,
    }).from(marketingCampaignRecipients).where(eq(marketingCampaignRecipients.campaign_id, campaignId));
    await db.update(marketingCampaigns).set({
      recipient_count: customerIds.length + contactIds.length, suppressed_count: counts?.suppressed ?? 0, unsubscribed_count: counts?.unsubscribed ?? 0, updated_at: new Date(),
    }).where(eq(marketingCampaigns.id, campaignId));
    return { eligible: counts?.eligible ?? 0, suppressed: counts?.suppressed ?? 0, unsubscribed: counts?.unsubscribed ?? 0 };
  }

  async claimMarketingRecipient(id: number): Promise<any | undefined> {
    const [recipient] = await db.update(marketingCampaignRecipients).set({
      status: "sending", attempt_count: sql`${marketingCampaignRecipients.attempt_count} + 1`, last_attempt_at: new Date(),
    }).where(and(eq(marketingCampaignRecipients.id, id), or(eq(marketingCampaignRecipients.status, "eligible"), and(eq(marketingCampaignRecipients.status, "failed"), sql`${marketingCampaignRecipients.attempt_count} < 3`)))).returning();
    return recipient;
  }

  async resetMarketingFailedRecipients(campaignId: number): Promise<void> {
    await db.update(marketingCampaignRecipients).set({
      status: "eligible",
      attempt_count: 0,
      last_attempt_at: null,
      failure_reason: null,
      provider_message_id: null,
    }).where(and(
      eq(marketingCampaignRecipients.campaign_id, campaignId),
      eq(marketingCampaignRecipients.status, "failed"),
    ));
  }

  async markMarketingRecipientSent(id: number, providerMessageId?: string | null): Promise<void> {
    const [recipient] = await db.update(marketingCampaignRecipients).set({ status: "sent", sent_at: new Date(), provider_message_id: providerMessageId ?? null }).where(eq(marketingCampaignRecipients.id, id)).returning();
    if (recipient) await this.recordMarketingEvent({ campaign_id: recipient.campaign_id, recipient_id: id, event_type: "sent", detail: { provider_message_id: providerMessageId ?? null } });
  }

  async markMarketingRecipientFailed(id: number, reason: string, retryable = true): Promise<void> {
    const [recipient] = await db.update(marketingCampaignRecipients).set({
      status: "failed",
      failure_reason: reason.slice(0, 1000),
      ...(retryable ? {} : { attempt_count: 3 }),
    }).where(eq(marketingCampaignRecipients.id, id)).returning();
    if (recipient) await this.recordMarketingEvent({ campaign_id: recipient.campaign_id, recipient_id: id, event_type: "failed", detail: { reason: reason.slice(0, 500) } });
  }

  async recordMarketingEvent(data: { campaign_id: number; recipient_id?: number | null; event_type: string; detail?: Record<string, unknown>; provider_event_id?: string | null }): Promise<void> {
    await db.insert(marketingCampaignEvents).values({
      campaign_id: data.campaign_id, recipient_id: data.recipient_id ?? null, event_type: data.event_type,
      detail: data.detail ?? {}, provider_event_id: data.provider_event_id ?? null,
    });
    if (data.event_type === "clicked") {
      await db.update(marketingCampaigns).set({
        clicked_count: sql`${marketingCampaigns.clicked_count} + 1`,
        updated_at: new Date(),
      }).where(eq(marketingCampaigns.id, data.campaign_id));
    }
  }

  async completeMarketingCampaign(id: number): Promise<any | undefined> {
    const [counts] = await db.select({
      sent: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'failed')::int`,
    }).from(marketingCampaignRecipients).where(eq(marketingCampaignRecipients.campaign_id, id));
    const status = (counts?.failed ?? 0) > 0 && (counts?.sent ?? 0) === 0 ? "failed" : "sent";
    const [campaign] = await db.update(marketingCampaigns).set({
      status, sent_count: counts?.sent ?? 0, failed_count: counts?.failed ?? 0, completed_at: new Date(), sent_at: status === "sent" ? new Date() : null, updated_at: new Date(),
    }).where(eq(marketingCampaigns.id, id)).returning();
    if (campaign) await this.recordMarketingEvent({ campaign_id: id, event_type: status, detail: { sent: counts?.sent ?? 0, failed: counts?.failed ?? 0 } });
    return campaign ? this.getMarketingCampaign(id) : undefined;
  }

  async getMarketingRecipients(campaignId: number, opts: { status?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number }> {
    const conditions: any[] = [eq(marketingCampaignRecipients.campaign_id, campaignId)];
    if (opts.status && opts.status !== "all") conditions.push(eq(marketingCampaignRecipients.status, opts.status));
    const where = and(...conditions);
    const [rows, countRows] = await Promise.all([
      db.select({ recipient: marketingCampaignRecipients, customer: customersMirror, contact: marketingContacts }).from(marketingCampaignRecipients)
        .leftJoin(customersMirror, eq(customersMirror.id, marketingCampaignRecipients.customer_id))
        .leftJoin(marketingContacts, eq(marketingContacts.id, marketingCampaignRecipients.marketing_contact_id))
        .where(where)
        .orderBy(desc(marketingCampaignRecipients.created_at)).limit(opts.limit ?? 100).offset(opts.offset ?? 0),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingCampaignRecipients).where(where),
    ]);
    return { rows: rows.map(row => ({ ...row.recipient, customer: row.customer ?? row.contact, source: row.contact ? "imported" : "crm" })), total: countRows[0]?.count ?? 0 };
  }

  async getMarketingRecipient(id: number): Promise<any | undefined> {
    const [row] = await db.select({
      recipient: marketingCampaignRecipients,
      customer: customersMirror,
      contact: marketingContacts,
    }).from(marketingCampaignRecipients)
      .leftJoin(customersMirror, eq(customersMirror.id, marketingCampaignRecipients.customer_id))
      .leftJoin(marketingContacts, eq(marketingContacts.id, marketingCampaignRecipients.marketing_contact_id))
      .where(eq(marketingCampaignRecipients.id, id)).limit(1);
    return row ? { ...row.recipient, customer: row.customer ?? row.contact, source: row.contact ? "imported" : "crm" } : undefined;
  }

  async getMarketingAnalytics(opts: { campaignId?: number; dateFrom?: string; dateTo?: string } = {}): Promise<any> {
    const conditions: any[] = [];
    if (opts.campaignId) conditions.push(eq(marketingCampaignEvents.campaign_id, opts.campaignId));
    if (opts.dateFrom) conditions.push(gte(marketingCampaignEvents.occurred_at, new Date(`${opts.dateFrom}T00:00:00`)));
    if (opts.dateTo) {
      const end = new Date(`${opts.dateTo}T00:00:00`); end.setDate(end.getDate() + 1);
      conditions.push(lt(marketingCampaignEvents.occurred_at, end));
    }
    const rows = await db.select({ event_type: marketingCampaignEvents.event_type, count: sql<number>`count(*)::int` })
      .from(marketingCampaignEvents).where(conditions.length ? and(...conditions) : undefined).groupBy(marketingCampaignEvents.event_type);
    const result: Record<string, number> = {};
    rows.forEach(row => { result[row.event_type] = row.count; });
    return {
      sent: result.sent ?? 0, failed: result.failed ?? 0, suppressed: result.suppressed ?? 0, unsubscribed: result.unsubscribed ?? 0,
      delivered: null, opened: null, clicked: result.clicked ?? 0, clickAvailable: true, deliveryAvailable: false,
    };
  }

  async markMarketingTestSent(campaignId: number): Promise<void> {
    await db.update(marketingCampaigns).set({ test_sent_at: new Date(), updated_at: new Date() }).where(eq(marketingCampaigns.id, campaignId));
  }

  async getMarketingCustomerPreference(customerId: number): Promise<any> {
    const [row] = await db.select().from(marketingCustomerPreferences).where(eq(marketingCustomerPreferences.customer_id, customerId)).limit(1);
    return row ?? { customer_id: customerId, email_subscribed: true, unsubscribed_at: null };
  }

  async upsertMarketingCustomerPreference(customerId: number, data: { email_subscribed: boolean; userId?: number }): Promise<any> {
    const [row] = await db.insert(marketingCustomerPreferences).values({
      customer_id: customerId, email_subscribed: data.email_subscribed, unsubscribed_at: data.email_subscribed ? null : new Date(), updated_by: data.userId ?? null,
    }).onConflictDoUpdate({
      target: marketingCustomerPreferences.customer_id,
      set: { email_subscribed: data.email_subscribed, unsubscribed_at: data.email_subscribed ? null : new Date(), updated_by: data.userId ?? null, updated_at: new Date() },
    }).returning();
    return row;
  }

  async getMarketingSuppressions(customerId?: number): Promise<any[]> {
    return db.select().from(marketingSuppressions).where(and(
      customerId ? eq(marketingSuppressions.customer_id, customerId) : sql`true`,
      isNull(marketingSuppressions.revoked_at),
    )).orderBy(desc(marketingSuppressions.created_at));
  }

  async createMarketingSuppression(data: { customerId: number; email?: string; reason: string; source?: string; createdBy?: number }): Promise<any> {
    const customer = await this.getCrmCustomerById(data.customerId);
    const [row] = await db.insert(marketingSuppressions).values({
      customer_id: data.customerId, email: data.email ?? customer?.email ?? "", reason: data.reason.trim(), source: data.source ?? "manual", created_by: data.createdBy ?? null,
    }).returning();
    await this.upsertMarketingCustomerPreference(data.customerId, { email_subscribed: false, userId: data.createdBy });
    return row;
  }

  async revokeMarketingSuppression(id: number, userId: number, detail?: string): Promise<any | undefined> {
    const [row] = await db.update(marketingSuppressions).set({ revoked_at: new Date(), revoked_by: userId, revoked_at_detail: detail ?? null }).where(and(eq(marketingSuppressions.id, id), isNull(marketingSuppressions.revoked_at))).returning();
    return row;
  }

  async getMarketingAutomations(opts: { status?: string; search?: string } = {}): Promise<any[]> {
    const conditions: any[] = [];
    if (opts.status && opts.status !== "all") conditions.push(eq(marketingAutomations.status, opts.status));
    if (opts.search?.trim()) conditions.push(ilike(marketingAutomations.name, `%${opts.search.trim()}%`));
    const rows = await db.select({ automation: marketingAutomations, creator_name: users.name }).from(marketingAutomations)
      .leftJoin(users, eq(users.id, marketingAutomations.created_by)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(marketingAutomations.updated_at));
    return Promise.all(rows.map(async row => ({ ...row.automation, creator_name: row.creator_name, step_count: (await db.select({ count: sql<number>`count(*)::int` }).from(marketingAutomationSteps).where(eq(marketingAutomationSteps.automation_id, row.automation.id)))[0]?.count ?? 0 })));
  }

  async getMarketingAutomation(id: number): Promise<any | undefined> {
    const [row] = await db.select({ automation: marketingAutomations, creator_name: users.name }).from(marketingAutomations)
      .leftJoin(users, eq(users.id, marketingAutomations.created_by)).where(eq(marketingAutomations.id, id)).limit(1);
    if (!row) return undefined;
    const steps = await db.select().from(marketingAutomationSteps).where(eq(marketingAutomationSteps.automation_id, id)).orderBy(asc(marketingAutomationSteps.step_order));
    return { ...row.automation, creator_name: row.creator_name, steps };
  }

  async createMarketingAutomation(data: { name: string; description?: string; trigger_type: string; trigger_config?: Record<string, unknown>; frequency_days?: number; created_by: number; steps: Array<{ action_type: string; action_config?: Record<string, unknown> }> }): Promise<any> {
    const result = await db.transaction(async tx => {
      const [automation] = await tx.insert(marketingAutomations).values({
        name: data.name.trim(), description: data.description ?? "", trigger_type: data.trigger_type, trigger_config: data.trigger_config ?? {}, frequency_days: data.frequency_days ?? 0, created_by: data.created_by,
      }).returning();
      if (data.steps.length) await tx.insert(marketingAutomationSteps).values(data.steps.map((step, index) => ({ automation_id: automation.id, step_order: index, action_type: step.action_type, action_config: step.action_config ?? {} })));
      return automation;
    });
    return this.getMarketingAutomation(result.id);
  }

  async updateMarketingAutomation(id: number, data: Record<string, unknown>, userId: number): Promise<any | undefined> {
    const allowed = ["name", "description", "trigger_type", "trigger_config", "frequency_days"] as const;
    const update: Record<string, unknown> = { updated_at: new Date() };
    for (const key of allowed) if (key in data) update[key] = data[key];
    const result = await db.transaction(async tx => {
      const [updated] = await tx.update(marketingAutomations).set(update as any).where(eq(marketingAutomations.id, id)).returning();
      if (!updated) return undefined;
      if (Array.isArray(data.steps)) {
        await tx.delete(marketingAutomationSteps).where(eq(marketingAutomationSteps.automation_id, id));
        if (data.steps.length) await tx.insert(marketingAutomationSteps).values((data.steps as any[]).map((step, index) => ({ automation_id: id, step_order: index, action_type: String(step.action_type), action_config: step.action_config ?? {} })));
      }
      return updated;
    });
    if (result) await this.createCrmAuditLog({ user_id: userId, action: "marketing_automation_edited", detail: { automation_id: id } });
    return result ? this.getMarketingAutomation(id) : undefined;
  }

  async updateMarketingAutomationStatus(id: number, status: string, userId: number): Promise<any | undefined> {
    const [updated] = await db.update(marketingAutomations).set({ status, updated_at: new Date() }).where(eq(marketingAutomations.id, id)).returning();
    if (!updated) return undefined;
    await this.createCrmAuditLog({ user_id: userId, action: `marketing_automation_${status}`, detail: { automation_id: id } });
    return this.getMarketingAutomation(id);
  }

  async getMarketingAutomationExecutions(id: number, limit = 50): Promise<any[]> {
    return db.select({ execution: marketingAutomationExecutions, customer: customersMirror }).from(marketingAutomationExecutions)
      .innerJoin(customersMirror, eq(customersMirror.id, marketingAutomationExecutions.customer_id))
      .where(eq(marketingAutomationExecutions.automation_id, id)).orderBy(desc(marketingAutomationExecutions.created_at)).limit(limit)
      .then(rows => rows.map(row => ({ ...row.execution, customer: row.customer })));
  }

  async createMarketingAutomationExecution(data: { automationId: number; customerId: number; triggerEvent: string; dedupeKey: string }): Promise<any | undefined> {
    const [execution] = await db.insert(marketingAutomationExecutions).values({
      automation_id: data.automationId, customer_id: data.customerId, trigger_event: data.triggerEvent, dedupe_key: data.dedupeKey,
    }).onConflictDoNothing({ target: marketingAutomationExecutions.dedupe_key }).returning();
    return execution;
  }

  async updateMarketingAutomationExecution(id: number, data: Record<string, unknown>): Promise<void> {
    await db.update(marketingAutomationExecutions).set(data as any).where(eq(marketingAutomationExecutions.id, id));
  }

  // ─── Reports ──────────────────────────────────────────────────────────────────

  async getSalesReport(opts: {
    view: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { view, dateFrom, dateTo, search, page = 0, limit = 50, sortBy, sortDir = "desc" } = opts;
    const offset = page * limit;

    // Default status filter: synced + pending_sync (unless 'all' is requested)
    const statuses = opts.status === "all"
      ? ["synced", "pending_sync", "draft", "failed"]
      : opts.status === "pending_sync"
      ? ["pending_sync"]
      : opts.status === "synced"
      ? ["synced"]
      : ["synced", "pending_sync"];

    const statusList = statuses.map((s) => `'${s}'`).join(", ");

    const dateFromCond = dateFrom
      ? `AND o.date >= '${dateFrom.replace(/'/g, "''")}'::date`
      : "";
    const dateToCond = dateTo
      ? `AND o.date < ('${dateTo.replace(/'/g, "''")}'::date + INTERVAL '1 day')`
      : "";
    const searchCond = search
      ? `AND (
          item->'product'->>'name' ILIKE '%${search.replace(/'/g, "''")}%'
          OR COALESCE(item->'variant'->>'sku', item->'product'->>'sku', '') ILIKE '%${search.replace(/'/g, "''")}%'
        )`
      : "";

    if (view === "summary") {
      const sortColMap: Record<string, string> = {
        product_name: "product_name",
        variant_label: "variant_label",
        sku: "sku",
        qty_sold: "qty_sold",
        revenue: "revenue",
      };
      const orderCol = sortColMap[sortBy ?? "qty_sold"] ?? "qty_sold";
      const orderDir = sortDir === "asc" ? "ASC" : "DESC";

      const baseWhere = `
        FROM orders o, jsonb_array_elements(o.items) AS item
        WHERE o.status IN (${statusList})
        ${dateFromCond}
        ${dateToCond}
        ${searchCond}
      `;

      const [countResult, dataResult] = await Promise.all([
        db.execute(sql.raw(`
          SELECT COUNT(*)::int AS total
          FROM (
            SELECT 1
            ${baseWhere}
            GROUP BY
              item->'product'->>'name',
              COALESCE(item->'variant'->>'label', ''),
              COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '')
          ) t
        `)),
        db.execute(sql.raw(`
          SELECT
            item->'product'->>'name' AS product_name,
            COALESCE(item->'variant'->>'label', '') AS variant_label,
            COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '') AS sku,
            SUM((item->>'quantity')::numeric) AS qty_sold,
            SUM((item->>'quantity')::numeric * (item->>'price_at_sale')::numeric) AS revenue
          ${baseWhere}
          GROUP BY
            item->'product'->>'name',
            COALESCE(item->'variant'->>'label', ''),
            COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '')
          ORDER BY ${orderCol} ${orderDir}
          LIMIT ${limit} OFFSET ${offset}
        `)),
      ]);

      return {
        rows: dataResult.rows as Record<string, unknown>[],
        total: (countResult.rows[0] as any)?.total ?? 0,
      };
    }

    // ── Order Details view ──────────────────────────────────────────────────────
    const sortColMap: Record<string, string> = {
      product_name: "item->'product'->>'name'",
      variant_label: "COALESCE(item->'variant'->>'label', '')",
      sku: "COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '')",
      order_number: "o.bigcommerce_order_id",
      customer_name: "o.customer_name",
      quantity: "(item->>'quantity')::numeric",
      unit_price: "(item->>'price_at_sale')::numeric",
      order_date: "o.date",
    };
    const orderExpr = sortColMap[sortBy ?? "order_date"] ?? "o.date";
    const orderDir = sortDir === "asc" ? "ASC" : "DESC";

    const baseWhere = `
      FROM orders o, jsonb_array_elements(o.items) AS item
      WHERE o.status IN (${statusList})
      ${dateFromCond}
      ${dateToCond}
      ${searchCond}
    `;

    const [countResult, dataResult] = await Promise.all([
      db.execute(sql.raw(`SELECT COUNT(*)::int AS total ${baseWhere}`)),
      db.execute(sql.raw(`
        SELECT
          item->'product'->>'name' AS product_name,
          COALESCE(item->'variant'->>'label', '') AS variant_label,
          COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '') AS sku,
          o.bigcommerce_order_id AS order_number,
          o.customer_name,
          (item->>'quantity')::numeric AS quantity,
          (item->>'price_at_sale')::numeric AS unit_price,
          o.date AS order_date
        ${baseWhere}
        ORDER BY ${orderExpr} ${orderDir}
        LIMIT ${limit} OFFSET ${offset}
      `)),
    ]);

    return {
      rows: dataResult.rows as Record<string, unknown>[],
      total: (countResult.rows[0] as any)?.total ?? 0,
    };
  }

  async logReportExport(data: InsertReportExportLog): Promise<void> {
    await db.insert(reportExportLogs).values(data);
  }

  // ─── BC Order Line Items mirror ───────────────────────────────────────────

  async getSyncedBcOrderIds(dateFrom?: string, dateTo?: string): Promise<Set<number>> {
    let q = `SELECT DISTINCT bigcommerce_order_id FROM bc_order_line_items`;
    const conditions: string[] = [];
    if (dateFrom) conditions.push(`order_date >= '${dateFrom}'::date`);
    if (dateTo) conditions.push(`order_date < '${dateTo}'::date + interval '1 day'`);
    if (conditions.length) q += ` WHERE ${conditions.join(" AND ")}`;
    const result = await db.execute(sql.raw(q));
    const ids = new Set<number>();
    for (const row of result.rows as any[]) ids.add(Number(row.bigcommerce_order_id));
    return ids;
  }

  async insertBcOrderLineItems(items: InsertBcOrderLineItem[]): Promise<void> {
    if (!items.length) return;
    const CHUNK = 200;
    for (let i = 0; i < items.length; i += CHUNK) {
        // ON CONFLICT DO NOTHING against the unique index uq_bc_order_line_items_business_key
      // (bigcommerce_order_id, bigcommerce_product_id, COALESCE(variant_id, 0))
      await db.insert(bcOrderLineItems).values(items.slice(i, i + CHUNK)).onConflictDoNothing();
    }
  }

  async searchProductsForReport(query: string, limit = 20): Promise<Product[]> {
    const q = `%${query.toLowerCase()}%`;
    return db
      .select()
      .from(products)
      .where(
        or(
          ilike(products.name, `%${query}%`),
          ilike(products.sku, `%${query}%`)
        )
      )
      .limit(limit);
  }

  async searchLineItemsByQuery(query: string, limit = 40): Promise<Array<{ bigcommerce_product_id: number; product_name: string; brand_name: string; sku: string; variant_label: string | null }>> {
    // Only escape single quotes to prevent SQL injection; no ESCAPE clause needed
    // since % and _ false-positives are acceptable in a search dropdown.
    const safeQ = query.replace(/'/g, "''");
    const res = await db.execute(sql.raw(`
      SELECT DISTINCT
        li.bigcommerce_product_id,
        COALESCE(p.name, li.product_name) AS product_name,
        COALESCE(p.brand_name, '') AS brand_name,
        li.sku,
        li.variant_label
      FROM bc_order_line_items li
      LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
      WHERE li.sku ILIKE '%${safeQ}%'
         OR li.product_name ILIKE '%${safeQ}%'
      ORDER BY product_name, li.sku
      LIMIT ${limit}
    `));
    return res.rows as Array<{ bigcommerce_product_id: number; product_name: string; brand_name: string; sku: string; variant_label: string | null }>;
  }

  async getProductsByBrandId(brandId: number): Promise<Product[]> {
    return db.select().from(products).where(eq(products.brand_id, brandId));
  }

  async getProductsByCategoryId(categoryId: number): Promise<Product[]> {
    const result = await db.execute(
      sql.raw(`SELECT * FROM products WHERE categories @> '${categoryId}'::jsonb`)
    );
    return result.rows as Product[];
  }

  async getSalesReportSummary(opts: {
    dateFrom?: string;
    dateTo?: string;
    bcProductIds?: number[];
    skuFilter?: string;
    bcStatusFilter?: string;
    page: number;
    limit: number;
    sortBy: string;
    sortDir: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter, page, limit, sortBy, sortDir } = opts;
    const offset = page * limit;

    const dateFromCond = dateFrom
      ? `AND li.order_date >= '${dateFrom}'::date`
      : "";
    const dateToCond = dateTo
      ? `AND li.order_date < '${dateTo}'::date + interval '1 day'`
      : "";
    const productCond =
      bcProductIds === undefined
        ? ""
        : bcProductIds.length > 0
          ? `AND li.bigcommerce_product_id IN (${bcProductIds.join(",")})`
          : "AND 1=0";
    // SKU-level filter (for variant-specific searches)
    const skuCond = skuFilter
      ? `AND li.sku = '${skuFilter.replace(/'/g, "''")}'`
      : "";
    // BC status filter: empty/undefined = all statuses; otherwise filter to exact status
    const statusCond = bcStatusFilter
      ? `AND COALESCE(com.status, '') = '${bcStatusFilter.replace(/'/g, "''")}'`
      : "";

    const sortColMap: Record<string, string> = {
      qty_sold: "qty_sold",
      current_stock: "current_stock",
      sku: "li.sku",
      product_name: "product_name",
      variant_label: "li.variant_label",
    };
    const sortCol = sortColMap[sortBy] ?? "qty_sold";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    const baseFrom = `
      FROM bc_order_line_items li
      LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
      LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
      WHERE 1=1
      ${statusCond}
      ${dateFromCond}
      ${dateToCond}
      ${productCond}
      ${skuCond}
    `;

    const [countRes, dataRes] = await Promise.all([
      db.execute(sql.raw(`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT li.bigcommerce_product_id, li.variant_id, li.sku
          ${baseFrom}
          GROUP BY li.bigcommerce_product_id, li.variant_id, li.sku, li.variant_label
        ) sub
      `)),
      db.execute(sql.raw(`
        SELECT
          li.bigcommerce_product_id AS bc_product_id,
          COALESCE(p.name, li.product_name) AS product_name,
          COALESCE(p.brand_name, '') AS brand_name,
          li.variant_id,
          li.variant_label,
          li.sku,
          SUM(li.quantity)::int AS qty_sold,
          COALESCE(
            (
              SELECT CAST(CAST(v->>'stock_level' AS numeric) AS int)
              FROM jsonb_array_elements(p.variants) AS v
              WHERE v->>'id' IS NOT NULL
                AND CAST(v->>'id' AS int) = li.variant_id
              LIMIT 1
            ),
            p.stock_level,
            0
          ) AS current_stock
        ${baseFrom}
        GROUP BY li.bigcommerce_product_id, COALESCE(p.name, li.product_name), COALESCE(p.brand_name, ''), li.variant_id, li.variant_label, li.sku, p.stock_level, p.variants
        ORDER BY ${sortCol} ${dir}
        LIMIT ${limit} OFFSET ${offset}
      `)),
    ]);

    return {
      rows: dataRes.rows as Record<string, unknown>[],
      total: (countRes.rows[0] as any)?.total ?? 0,
    };
  }

  async getSalesReportDetails(opts: {
    dateFrom?: string;
    dateTo?: string;
    bcProductIds?: number[];
    skuFilter?: string;
    bcStatusFilter?: string;
    page: number;
    limit: number;
    sortBy: string;
    sortDir: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter, page, limit, sortBy, sortDir } = opts;
    const offset = page * limit;

    const dateFromCond = dateFrom
      ? `AND li.order_date >= '${dateFrom}'::date`
      : "";
    const dateToCond = dateTo
      ? `AND li.order_date < '${dateTo}'::date + interval '1 day'`
      : "";
    const productCond =
      bcProductIds === undefined
        ? ""
        : bcProductIds.length > 0
          ? `AND li.bigcommerce_product_id IN (${bcProductIds.join(",")})`
          : "AND 1=0";
    const skuCond = skuFilter
      ? `AND li.sku = '${skuFilter.replace(/'/g, "''")}'`
      : "";
    const statusCond = bcStatusFilter
      ? `AND COALESCE(com.status, '') = '${bcStatusFilter.replace(/'/g, "''")}'`
      : "";

    const sortColMap: Record<string, string> = {
      order_date: "li.order_date",
      qty: "li.quantity",
      product_name: "product_name",
      customer_name: "li.customer_name",
      order_number: "li.bigcommerce_order_id",
      bc_status: "com.status",
    };
    const sortCol = sortColMap[sortBy] ?? "li.order_date";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    const whereCond = `
      WHERE 1=1
      ${statusCond}
      ${dateFromCond}
      ${dateToCond}
      ${productCond}
      ${skuCond}
    `;

    const [countRes, dataRes] = await Promise.all([
      db.execute(sql.raw(`
        SELECT COUNT(*)::int AS total
        FROM bc_order_line_items li
        LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
        LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
        ${whereCond}
      `)),
      db.execute(sql.raw(`
        SELECT
          li.bigcommerce_product_id AS bc_product_id,
          COALESCE(p.name, li.product_name) AS product_name,
          COALESCE(p.brand_name, '') AS brand_name,
          li.variant_label,
          li.sku,
          li.bigcommerce_order_id AS order_number,
          COALESCE(
            com.order_number::text,
            li.bigcommerce_order_id::text
          ) AS display_order_number,
          li.customer_name,
          li.customer_email,
          li.quantity,
          li.base_price AS unit_price,
          li.order_date,
          COALESCE(com.status, 'Unknown') AS bc_status
        FROM bc_order_line_items li
        LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
        LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
        ${whereCond}
        ORDER BY ${sortCol} ${dir}
        LIMIT ${limit} OFFSET ${offset}
      `)),
    ]);

    return {
      rows: dataRes.rows as Record<string, unknown>[],
      total: (countRes.rows[0] as any)?.total ?? 0,
    };
  }

  async getSalesReportStats(opts: {
    dateFrom?: string;
    dateTo?: string;
    bcProductIds?: number[];
    skuFilter?: string;
    bcStatusFilter?: string;
  }): Promise<{ totalProducts: number; totalVariants: number; totalQtySold: number; totalCurrentStock: number }> {
    const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter } = opts;

    const dateFromCond = dateFrom ? `AND li.order_date >= '${dateFrom}'::date` : "";
    const dateToCond = dateTo ? `AND li.order_date < '${dateTo}'::date + interval '1 day'` : "";
    const productCond =
      bcProductIds === undefined
        ? ""
        : bcProductIds.length > 0
          ? `AND li.bigcommerce_product_id IN (${bcProductIds.join(",")})`
          : "AND 1=0";
    const skuCond = skuFilter
      ? `AND li.sku = '${skuFilter.replace(/'/g, "''")}'`
      : "";
    const statusCond = bcStatusFilter
      ? `AND COALESCE(com.status, '') = '${bcStatusFilter.replace(/'/g, "''")}'`
      : "";

    // Two-phase approach: aggregate qty/counts from line items (fast with index),
    // then compute stock only for the distinct product/variant set (avoids per-row JSONB expansion)
    const res = await db.execute(sql.raw(`
      WITH filtered_li AS (
        SELECT li.bigcommerce_product_id, li.variant_id, li.sku, li.quantity
        FROM bc_order_line_items li
        LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
        WHERE 1=1
        ${statusCond}
        ${dateFromCond}
        ${dateToCond}
        ${productCond}
        ${skuCond}
      ),
      agg AS (
        SELECT
          COUNT(DISTINCT bigcommerce_product_id)::int AS total_products,
          COUNT(DISTINCT (bigcommerce_product_id, variant_id, sku))::int AS total_variants,
          SUM(quantity)::int AS total_qty_sold
        FROM filtered_li
      ),
      distinct_pv AS (
        SELECT DISTINCT bigcommerce_product_id, variant_id FROM filtered_li
      ),
      stock AS (
        SELECT COALESCE(SUM(
          CASE
            WHEN dpv.variant_id IS NOT NULL THEN
              COALESCE(
                (SELECT CAST(v->>'stock_level' AS int)
                 FROM jsonb_array_elements(p.variants) v
                 WHERE (v->>'id') IS NOT NULL AND CAST(v->>'id' AS int) = dpv.variant_id
                 LIMIT 1),
                p.stock_level, 0
              )
            ELSE COALESCE(p.stock_level, 0)
          END
        ), 0)::int AS total_current_stock
        FROM distinct_pv dpv
        LEFT JOIN products p ON p.bigcommerce_id = dpv.bigcommerce_product_id
      )
      SELECT agg.*, stock.total_current_stock FROM agg, stock
    `));

    const row = res.rows[0] as any;
    return {
      totalProducts: row?.total_products ?? 0,
      totalVariants: row?.total_variants ?? 0,
      totalQtySold: row?.total_qty_sold ?? 0,
      totalCurrentStock: row?.total_current_stock ?? 0,
    };
  }

  async getRecentExportLogs(limit = 5): Promise<Record<string, unknown>[]> {
    const res = await db
      .select()
      .from(reportExportLogs)
      .orderBy(desc(reportExportLogs.created_at))
      .limit(limit);
    return res as unknown as Record<string, unknown>[];
  }
}

export const storage = new DatabaseStorage();
