import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminUsers, getPermissions, getRoles, createPermission,
  addPermissionToUser, removePermissionFromUser, updateUserDetails, setUserRole,
  resetAttendanceHomeLocation,
  RbacUser, RbacPermission, RbacRole,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, ShieldCheck, ChevronRight, ArrowLeft, User, Lock, Shield, Eye, EyeOff, Save, Search, UsersRound, Home, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

function googleMapsUrl(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

// ─── Landing page options ─────────────────────────────────────────────────────

export const LANDING_OPTIONS = [
  { label: "Dashboard",             route: "/dashboard",        permission: "dashboard" },
  { label: "CRM › Customers",       route: "/crm/customers",    permission: "crm_customers" },
  { label: "CRM › Reactivation",    route: "/crm/reactivation", permission: "crm_reactivation" },
  { label: "Inventory › Push",      route: "/inventory-push",   permission: "inventory_push" },
  { label: "Products",              route: "/products",         permission: "catalog" },
  { label: "Orders",                route: "/orders",           permission: "orders_my" },
  { label: "POS",                   route: "/pos",              permission: "pos" },
  { label: "Settings",              route: "/settings",         permission: "admin" },
];

// ─── All permission modules ───────────────────────────────────────────────────

export const MODULES = [
  { key: "dashboard",          label: "Dashboard" },
  { key: "pos",                label: "POS" },
  { key: "catalog",            label: "Catalog" },
  { key: "cart",               label: "Cart" },
  { key: "dropshipping",       label: "Dropshipping" },
  { key: "orders_drafts",      label: "Orders › Drafts" },
  { key: "orders_all",         label: "Orders › Sales History" },
  { key: "customers_create",   label: "CRM › Create BC Customer" },
  { key: "customers_submit_docs", label: "Customers › Submit Docs" },
  { key: "customer_signups",   label: "Customers › Signup List" },
  { key: "inventory_push",     label: "Inventory › Push Inventory" },
  { key: "inventory_audit",    label: "Inventory › Audit Queue" },
  { key: "inventory_logs",     label: "Inventory › Push Logs" },
  { key: "marketing",          label: "Marketing" },
  { key: "pricing",            label: "Price Tiers" },
  { key: "reports",            label: "Reports" },
  { key: "reporting_price_override_audit", label: "Reporting › Price Override Audit" },
  { key: "reporting_sales",                label: "Reporting › Sales Report" },
  { key: "tools_bc_link",      label: "Tools › BC Product Link" },
  { key: "tools_bc_link_logs", label: "Tools › Product Link Logs" },
  { key: "promo_sku_tracker",  label: "Tools › Promo SKU Tracker" },
  { key: "attendance",         label: "Attendance Module" },
  { key: "crm_customers",      label: "CRM › Customers" },
  { key: "crm_reactivation",   label: "CRM › Reactivation Opportunities" },
  { key: "crm_notes",          label: "CRM › Customer Notes" },
  { key: "crm_settings",       label: "CRM › CRM Settings" },
  { key: "admin",              label: "Admin / Settings" },
];

export const CRM_ACTION_PERMS = [
  { module: "crm", action: "view_all",           label: "View All Customers",        description: "Can see all customers. Without this, only assigned customers are visible." },
  { module: "crm", action: "assign_rep",         label: "Assign Sales Rep",          description: "Can assign or remove a sales rep from a customer." },
  { module: "crm", action: "export",             label: "Export CRM Data",           description: "Can export the customer list to CSV or Excel." },
  { module: "crm", action: "add_note",           label: "Add CRM Notes",             description: "Can create CRM customer notes." },
  { module: "crm", action: "edit_customer_notes", label: "Edit Customer Account Notes", description: "Can edit and save BigCommerce customer account notes." },
  { module: "crm", action: "notes_edit",          label: "Edit Own CRM Notes",          description: "Can edit CRM notes they personally created." },
  { module: "crm", action: "view_all_todos",      label: "View All To Dos",             description: "Can see To Dos assigned to any user, not just themselves." },
  { module: "crm", action: "manage_todos",        label: "Manage To Dos",               description: "Can create, edit, and delete To Dos for any customer." },
  { module: "crm", action: "manage_account_classification", label: "Manage Account Classification", description: "Can set the ERP account type (Customer / Vendor / Internal)." },
  { module: "crm", action: "manage_inactive_accounts", label: "Manage Inactive Accounts",   description: "Can mark customers as inactive and restore them." },
  { module: "customer_signups", action: "view_all", label: "View All Signup Records", description: "Can see customer signups created by every app user. Without this, only their own signups are visible." },
];

export const ORDERS_ACTION_PERMS = [
  { module: "orders", action: "view",            label: "View All Orders",        description: "Can see all orders from all channels and users. Without this, only their own Sales App orders are visible." },
  { module: "orders", action: "export",          label: "Export Sales History",   description: "Can export the Sales History report to CSV or Excel." },
  { module: "orders", action: "view_all_drafts", label: "View All Drafts",        description: "Can see draft orders created by every user. Without this, only their own drafts are visible." },
];

export const INVENTORY_AUDIT_ACTION_PERMS = [
  { module: "inventory_audit", action: "audit", label: "Complete Audits",  description: "Can enter physical counts, submit audit results, and adjust SKUVault inventory. Requires Audit Queue access above." },
];

export const MARKETING_ACTION_PERMS = [
  { module: "marketing", action: "create", label: "Create Campaigns", description: "Can create and duplicate campaigns." },
  { module: "marketing", action: "edit", label: "Edit Campaigns", description: "Can edit campaign content and audience settings." },
  { module: "marketing", action: "delete", label: "Delete Campaigns", description: "Can delete campaigns that have not been sent." },
  { module: "marketing", action: "send", label: "Schedule and Send Campaigns", description: "Can move campaigns through the scheduling and sending workflow." },
  { module: "marketing", action: "view_analytics", label: "View Marketing Analytics", description: "Can view campaign performance metrics." },
  { module: "marketing", action: "manage_audiences", label: "Manage Marketing Audiences", description: "Can create, edit, import, and delete campaign audiences." },
  { module: "marketing", action: "manage_templates", label: "Manage Marketing Templates", description: "Can create, edit, archive, and reuse marketing templates." },
  { module: "marketing", action: "manage_automations", label: "Manage Marketing Automations", description: "Can create and manage marketing automations." },
  { module: "marketing", action: "manage_suppressions", label: "Manage Marketing Suppressions", description: "Can manage customer marketing preferences and suppressions." },
];

export const ATTENDANCE_ACTION_PERMS = [
  { module: "attendance", action: "clock", label: "Clock In / Out", description: "Can start and end their own attendance day." },
  { module: "attendance", action: "view_own", label: "View Own History", description: "Can view their own attendance history." },
  { module: "attendance", action: "view_dashboard", label: "View Overview", description: "Can view the team Attendance management overview. Requires View All Employees." },
  { module: "attendance", action: "view_all", label: "View All Employees", description: "Unlocks team-wide Attendance views, filters, details, and management." },
  { module: "attendance", action: "view_logs", label: "View Attendance Logs", description: "Can view attendance logs; without View All Employees, only their own records are shown." },
  { module: "attendance", action: "view_exceptions", label: "View Exceptions", description: "Can view team attendance exceptions. Requires View All Employees." },
  { module: "attendance", action: "view_reports", label: "View Reports", description: "Can view team pay-period attendance reports. Requires View All Employees." },
  { module: "attendance", action: "review_exceptions", label: "Review Exceptions", description: "Can resolve attendance exceptions and add review notes." },
  { module: "attendance", action: "manage_settings", label: "Manage Settings", description: "Can configure warehouse, checkpoints, and pay periods." },
  { module: "attendance", action: "manage", label: "Manage Attendance", description: "Can perform administrative attendance actions." },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userInitials(user: RbacUser) {
  const parts = user.name.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return user.name.slice(0, 2).toUpperCase();
}

function roleColor(role: string) {
  return role === "admin" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";
}

function userHasPerm(user: RbacUser, permId: number) {
  return user.permissions.some((p) => p.id === permId);
}

// ─── User list row ────────────────────────────────────────────────────────────

function UserRow({ user, onClick, groups }: { user: RbacUser; onClick: () => void; groups: RbacRole[] }) {
  const groupName = groups.find((g) => g.id === user.role_id)?.name;
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-slate-50 text-left transition-colors" data-testid={`user-row-${user.id}`}>
      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0", user.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>
        {userInitials(user)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
          <Badge className={cn("text-[10px] h-4 px-1.5 shrink-0", roleColor(user.role))}>{user.role}</Badge>
          {groupName && <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">{groupName}</Badge>}
        </div>
        <p className="text-xs text-slate-400 truncate mt-0.5">@{user.username}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <Badge variant={user.is_enabled ? "default" : "secondary"} className="text-[10px] h-4 px-1.5">{user.is_enabled ? "Active" : "Disabled"}</Badge>
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
    </button>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function UserDetail({
  user, permMap, groups, onBack, onSaved, busyKey, onToggleModule,
}: {
  user: RbacUser; permMap: Map<string, RbacPermission>; groups: RbacRole[];
  onBack: () => void; onSaved: () => void; busyKey: string | null;
  onToggleModule: (userId: number, key: string, enabled: boolean, permId: number | null) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState(user.role);
  const [isEnabled, setIsEnabled] = useState(user.is_enabled);
  const [allowBcSearch, setAllowBcSearch] = useState(user.allow_bigcommerce_search);
  const [groupId, setGroupId] = useState<string>(user.role_id != null ? String(user.role_id) : "none");
  const [landingPage, setLandingPage] = useState(user.default_landing_page || "/dashboard");
  const [saving, setSaving] = useState(false);
  const [resettingHome, setResettingHome] = useState(false);

  useEffect(() => {
    setName(user.name); setUsername(user.username); setRole(user.role);
    setIsEnabled(user.is_enabled); setAllowBcSearch(user.allow_bigcommerce_search);
    setGroupId(user.role_id != null ? String(user.role_id) : "none");
    setLandingPage(user.default_landing_page || "/dashboard");
  }, [user.id]);

  const isDirty = name !== user.name || username !== user.username || role !== user.role
    || isEnabled !== user.is_enabled || allowBcSearch !== user.allow_bigcommerce_search
    || password.trim() !== "" || groupId !== (user.role_id != null ? String(user.role_id) : "none")
    || landingPage !== (user.default_landing_page || "/dashboard");

  const handleSave = async () => {
    if (!name.trim() || !username.trim()) {
      toast({ title: "Name and username are required.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const newGroupId = groupId === "none" ? null : parseInt(groupId);
      await Promise.all([
        updateUserDetails(user.id, {
          name: name.trim(), username: username.trim(), role, is_enabled: isEnabled,
          allow_bigcommerce_search: allowBcSearch,
          default_landing_page: landingPage,
          ...(password.trim() ? { password: password.trim() } : {}),
        }),
        setUserRole(user.id, newGroupId),
      ]);
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["admin-users-rbac"] });
      toast({ title: "User updated successfully." });
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleResetHomeLocation = async () => {
    if (!user.attendance_home_latitude && !user.attendance_home_longitude) return;
    if (!window.confirm(`Reset ${user.name}'s saved home location? They will need to set it again before using Route Start.`)) return;
    setResettingHome(true);
    try {
      await resetAttendanceHomeLocation(user.id);
      await queryClient.invalidateQueries({ queryKey: ["admin-users-rbac"] });
      toast({ title: "Home location reset." });
      onSaved();
    } catch (e: any) {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    } finally {
      setResettingHome(false);
    }
  };

  const hasModule = (key: string) => {
    const perm = permMap.get(`${key}:view`);
    if (!perm) return false;
    return userHasPerm(user, perm.id);
  };

  // Effective permissions: direct + inherited from group
  const groupPerms = useMemo(() => {
    if (groupId === "none") return new Set<number>();
    const grp = groups.find((g) => g.id === parseInt(groupId));
    return new Set((grp?.permissions ?? []).map((p) => p.id));
  }, [groupId, groups]);

  const hasModuleEffective = (key: string) => {
    const perm = permMap.get(`${key}:view`);
    if (!perm) return false;
    return userHasPerm(user, perm.id) || groupPerms.has(perm.id);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0 shrink-0" data-testid="btn-back-users">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0", roleColor(user.role))}>
          {userInitials(user)}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-slate-800 truncate">{user.name}</h1>
          <p className="text-xs text-slate-400">@{user.username}</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={!isDirty || saving} className="h-8 shrink-0 gap-1.5" data-testid="btn-save-user">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {/* Account details */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Details</span>
          </div>
          <div className="px-4 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" data-testid="input-user-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoCapitalize="none" data-testid="input-user-username" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                New Password <span className="ml-1 font-normal text-slate-400">(leave blank to keep current)</span>
              </Label>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password…" className="pr-10" data-testid="input-user-password" />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Default Landing Page</Label>
              <Select value={landingPage} onValueChange={setLandingPage}>
                <SelectTrigger data-testid="select-user-landing-page"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANDING_OPTIONS.map((o) => (
                    <SelectItem key={o.route} value={o.route}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">Page shown after the user logs in. Falls back if the user lacks permission.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">System Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">User Group</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger data-testid="select-user-group"><SelectValue placeholder="No group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No group —</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">User inherits all permissions from the assigned group.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <Home className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Attendance Route Start</span>
          </div>
          <div className="px-4 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-700">{user.attendance_home_latitude && user.attendance_home_longitude ? "Home location is configured" : "Home location is not configured"}</p>
              <p className="text-xs text-slate-400">Reset this when the rep moves or needs to set a new home location.</p>
              {(() => { const mapUrl = googleMapsUrl(user.attendance_home_latitude, user.attendance_home_longitude); return mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 underline"><ExternalLink className="h-3 w-3" />View saved location in Google Maps</a> : null; })()}
            </div>
            <Button variant="outline" size="sm" onClick={handleResetHomeLocation} disabled={resettingHome || (!user.attendance_home_latitude && !user.attendance_home_longitude)} className="border-red-200 text-red-600 hover:bg-red-50">
              {resettingHome && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Reset Home Location
            </Button>
          </div>
        </div>

        {/* Account flags */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Settings</span>
          </div>
          <div className="divide-y">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Account Active</p>
                <p className="text-xs text-slate-400">Disabled accounts cannot sign in.</p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} data-testid="toggle-user-enabled" />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">BigCommerce Catalog Search</p>
                <p className="text-xs text-slate-400">Allows agent to search full BC catalog in POS.</p>
              </div>
              <Switch checked={allowBcSearch} onCheckedChange={setAllowBcSearch} data-testid="toggle-user-bc-search" />
            </div>
          </div>
        </div>

        {/* Module access */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Module Access</span>
            </div>
            {groupId !== "none" && (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <UsersRound className="h-3 w-3" /> Group permissions shown with (G)
              </span>
            )}
          </div>
          <div className="divide-y">
            {MODULES.map((m) => {
              const perm = permMap.get(`${m.key}:view`);
              const permId = perm?.id ?? null;
              const isBusy = busyKey === `${user.id}-${m.key}`;
              const directEnabled = hasModule(m.key);
              const fromGroup = !directEnabled && groupPerms.has(perm?.id ?? -1);
              const effectiveEnabled = directEnabled || fromGroup;

              return (
                <div key={m.key} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm text-slate-700">{m.label}</span>
                    {fromGroup && <span className="ml-2 text-[10px] text-blue-500 font-medium">(G)</span>}
                  </div>
                  {permId === null ? (
                    <span className="text-[10px] text-slate-400 italic">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <Switch
                      checked={effectiveEnabled}
                      disabled={fromGroup}
                      onCheckedChange={(v) => onToggleModule(user.id, m.key, v, permId)}
                      data-testid={`toggle-${m.key}-${user.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t bg-slate-50">
            Toggles here grant/revoke direct permissions for this user only. Group permissions (G) must be managed via User Groups.
          </p>
        </div>

        {/* CRM-specific permissions */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">CRM Permissions</span>
            </div>
            {groupId !== "none" && (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <UsersRound className="h-3 w-3" /> (G) = from group
              </span>
            )}
          </div>
          <div className="divide-y">
            {CRM_ACTION_PERMS.map(p => {
              const perm = permMap.get(`${p.module}:${p.action}`);
              const permId = perm?.id ?? null;
              const isBusy = busyKey === `${user.id}-crm-${p.action}`;
              const directEnabled = perm ? userHasPerm(user, perm.id) : false;
              const fromGroup = !directEnabled && perm ? groupPerms.has(perm.id) : false;
              const effectiveEnabled = directEnabled || fromGroup;
              return (
                <div key={p.action} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-slate-700">
                      {p.label}
                      {fromGroup && <span className="ml-2 text-[10px] text-blue-500 font-medium">(G)</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                  {permId === null ? (
                    <span className="text-[10px] text-slate-400 italic shrink-0">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <Switch
                      checked={effectiveEnabled}
                      disabled={fromGroup}
                      onCheckedChange={v => onToggleModule(user.id, `marketing-${p.action}`, v, permId)}
                      data-testid={`toggle-marketing-${p.action}-${user.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Orders-specific permissions */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Orders Permissions</span>
            </div>
            {groupId !== "none" && (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <UsersRound className="h-3 w-3" /> (G) = from group
              </span>
            )}
          </div>
          <div className="divide-y">
            {ORDERS_ACTION_PERMS.map(p => {
              const perm = permMap.get(`${p.module}:${p.action}`);
              const permId = perm?.id ?? null;
              const isBusy = busyKey === `${user.id}-orders-${p.action}`;
              const directEnabled = perm ? userHasPerm(user, perm.id) : false;
              const fromGroup = !directEnabled && perm ? groupPerms.has(perm.id) : false;
              const effectiveEnabled = directEnabled || fromGroup;
              return (
                <div key={p.action} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-slate-700">
                      {p.label}
                      {fromGroup && <span className="ml-2 text-[10px] text-blue-500 font-medium">(G)</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                  {permId === null ? (
                    <span className="text-[10px] text-slate-400 italic shrink-0">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <Switch
                      checked={effectiveEnabled}
                      disabled={fromGroup}
                      onCheckedChange={v => onToggleModule(user.id, `orders-${p.action}`, v, permId)}
                      data-testid={`toggle-orders-${p.action}-${user.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Inventory Audit permissions */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Inventory Audit Permissions</span>
            </div>
            {groupId !== "none" && (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <UsersRound className="h-3 w-3" /> (G) = from group
              </span>
            )}
          </div>
          <div className="divide-y">
            {INVENTORY_AUDIT_ACTION_PERMS.map(p => {
              const perm = permMap.get(`${p.module}:${p.action}`);
              const permId = perm?.id ?? null;
              const isBusy = busyKey === `${user.id}-inv-audit-${p.action}`;
              const directEnabled = perm ? userHasPerm(user, perm.id) : false;
              const fromGroup = !directEnabled && perm ? groupPerms.has(perm.id) : false;
              const effectiveEnabled = directEnabled || fromGroup;
              return (
                <div key={p.action} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-slate-700">
                      {p.label}
                      {fromGroup && <span className="ml-2 text-[10px] text-blue-500 font-medium">(G)</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                  {permId === null ? (
                    <span className="text-[10px] text-slate-400 italic shrink-0">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <Switch
                      checked={effectiveEnabled}
                      disabled={fromGroup}
                      onCheckedChange={v => onToggleModule(user.id, `inv-audit-${p.action}`, v, permId)}
                      data-testid={`toggle-inv-audit-${p.action}-${user.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t bg-slate-50">
            "Inventory › Audit Queue" module access above controls who can <em>see</em> the queue. This section controls who can <em>submit</em> audits.
          </p>
        </div>

        {/* Marketing-specific permissions */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Marketing Permissions</span>
            </div>
            {groupId !== "none" && (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <UsersRound className="h-3 w-3" /> (G) = from group
              </span>
            )}
          </div>
          <div className="divide-y">
            {MARKETING_ACTION_PERMS.map(p => {
              const perm = permMap.get(`${p.module}:${p.action}`);
              const permId = perm?.id ?? null;
              const isBusy = busyKey === `${user.id}-marketing-${p.action}`;
              const directEnabled = perm ? userHasPerm(user, perm.id) : false;
              const fromGroup = !directEnabled && perm ? groupPerms.has(perm.id) : false;
              const effectiveEnabled = directEnabled || fromGroup;
              return (
                <div key={p.action} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-slate-700">
                      {p.label}
                      {fromGroup && <span className="ml-2 text-[10px] text-blue-500 font-medium">(G)</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                  {permId === null ? (
                    <span className="text-[10px] text-slate-400 italic shrink-0">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <Switch
                      checked={effectiveEnabled}
                      disabled={fromGroup}
                      onCheckedChange={v => onToggleModule(user.id, `marketing-${p.action}`, v, permId)}
                      data-testid={`toggle-marketing-${p.action}-${user.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Attendance-specific permissions */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Attendance Permissions</span>
            </div>
            {groupId !== "none" && <span className="text-[10px] text-blue-600 flex items-center gap-1"><UsersRound className="h-3 w-3" /> (G) = from group</span>}
          </div>
          <div className="divide-y">
            {ATTENDANCE_ACTION_PERMS.map(p => {
              const perm = permMap.get(`${p.module}:${p.action}`);
              const permId = perm?.id ?? null;
              const isBusy = busyKey === `${user.id}-attendance-${p.action}`;
              const directEnabled = perm ? userHasPerm(user, perm.id) : false;
              const fromGroup = !directEnabled && perm ? groupPerms.has(perm.id) : false;
              const effectiveEnabled = directEnabled || fromGroup;
              return (
                <div key={p.action} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-slate-700">{p.label}{fromGroup && <span className="ml-2 text-[10px] text-blue-500 font-medium">(G)</span>}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                  {permId === null ? <span className="text-[10px] text-slate-400 italic shrink-0">N/A</span> : isBusy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" /> : (
                    <Switch checked={effectiveEnabled} disabled={fromGroup} onCheckedChange={v => onToggleModule(user.id, `attendance-${p.action}`, v, permId)} data-testid={`toggle-attendance-${p.action}-${user.id}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<RbacUser | null>(null);
  const [search, setSearch] = useState("");

  const { data: users = [], isLoading: usersLoading } = useQuery<RbacUser[]>({
    queryKey: ["admin-users-rbac"],
    queryFn: getAdminUsers,
  });

  const { data: permissions = [], isLoading: permsLoading } = useQuery<RbacPermission[]>({
    queryKey: ["permissions"],
    queryFn: getPermissions,
  });

  const { data: groups = [] } = useQuery<RbacRole[]>({
    queryKey: ["roles"],
    queryFn: getRoles,
  });

  const permMap = useMemo(
    () => new Map<string, RbacPermission>(permissions.map((p) => [`${p.module}:${p.action}`, p])),
    [permissions],
  );

  // Auto-create any missing standard module permissions
  useEffect(() => {
    if (permsLoading) return;
    const missing = MODULES.filter((m) => !permMap.has(`${m.key}:view`));
    if (!missing.length) return;
    Promise.all(
      missing.map((m) => createPermission({ module: m.key, action: "view", description: `Access ${m.label} module` }).catch(() => {})),
    ).then(() => queryClient.invalidateQueries({ queryKey: ["permissions"] }));
  }, [permsLoading, permissions.length]);

  // Auto-create any missing CRM action permissions
  useEffect(() => {
    if (permsLoading) return;
    const missing = CRM_ACTION_PERMS.filter(p => !permMap.has(`${p.module}:${p.action}`));
    if (!missing.length) return;
    Promise.all(
      missing.map(p => createPermission({ module: p.module, action: p.action, description: p.label }).catch(() => {})),
    ).then(() => queryClient.invalidateQueries({ queryKey: ["permissions"] }));
  }, [permsLoading, permissions.length]);

  // Auto-create any missing Orders action permissions
  useEffect(() => {
    if (permsLoading) return;
    const missing = ORDERS_ACTION_PERMS.filter(p => !permMap.has(`${p.module}:${p.action}`));
    if (!missing.length) return;
    Promise.all(
      missing.map(p => createPermission({ module: p.module, action: p.action, description: p.label }).catch(() => {})),
    ).then(() => queryClient.invalidateQueries({ queryKey: ["permissions"] }));
  }, [permsLoading, permissions.length]);

  // Auto-create any missing Inventory Audit action permissions
  useEffect(() => {
    if (permsLoading) return;
    const missing = INVENTORY_AUDIT_ACTION_PERMS.filter(p => !permMap.has(`${p.module}:${p.action}`));
    if (!missing.length) return;
    Promise.all(
      missing.map(p => createPermission({ module: p.module, action: p.action, description: p.description }).catch(() => {})),
    ).then(() => queryClient.invalidateQueries({ queryKey: ["permissions"] }));
  }, [permsLoading, permissions.length]);

  useEffect(() => {
    if (permsLoading) return;
    const missing = MARKETING_ACTION_PERMS.filter(p => !permMap.has(`${p.module}:${p.action}`));
    if (!missing.length) return;
    Promise.all(
      missing.map(p => createPermission({ module: p.module, action: p.action, description: p.description }).catch(() => {})),
    ).then(() => queryClient.invalidateQueries({ queryKey: ["permissions"] }));
  }, [permsLoading, permissions.length]);

  useEffect(() => {
    if (!selectedUser) return;
    const fresh = users.find((u) => u.id === selectedUser.id);
    if (fresh) setSelectedUser(fresh);
  }, [users]);

  const handleToggleModule = async (userId: number, key: string, enabled: boolean, permId: number | null) => {
    if (permId === null) return;
    const bk = `${userId}-${key}`;
    setBusyKey(bk);
    try {
      if (enabled) await addPermissionToUser(userId, permId);
      else await removePermissionFromUser(userId, permId);
      await queryClient.invalidateQueries({ queryKey: ["admin-users-rbac"] });
      toast({ title: enabled ? "Permission Granted" : "Permission Revoked", description: `${key} access ${enabled ? "granted to" : "revoked from"} user.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusyKey(null); }
  };

  if (selectedUser) {
    return (
      <UserDetail
        user={selectedUser} permMap={permMap} groups={groups}
        onBack={() => setSelectedUser(null)} onSaved={() => {}}
        busyKey={busyKey} onToggleModule={handleToggleModule}
      />
    );
  }

  const filtered = users.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Users className="h-5 w-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">User Management</h1>
        {!usersLoading && <span className="ml-auto text-xs text-slate-400">{users.length} user{users.length !== 1 ? "s" : ""}</span>}
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by name or username…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white" data-testid="input-user-search" />
        </div>

        {(usersLoading || permsLoading) ? (
          <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Users className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">{search ? "No users match your search." : "No users found."}</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {filtered.map((user) => <UserRow key={user.id} user={user} groups={groups} onClick={() => setSelectedUser(user)} />)}
          </div>
        )}
      </div>
    </div>
  );
}
