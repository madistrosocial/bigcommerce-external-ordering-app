import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SaaSLayout } from "@/components/layout/SaaSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, Trash2, UserCog, Key, ChevronDown, ChevronUp } from "lucide-react";
import * as api from "@/lib/api";
import type { RbacRole, RbacPermission, RbacUser } from "@/lib/api";

// ─── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [expandedRole, setExpandedRole] = useState<number | null>(null);
  const [addPermRoleId, setAddPermRoleId] = useState<number | null>(null);
  const [selectedPermId, setSelectedPermId] = useState<string>("");

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["rbac-roles"],
    queryFn: api.getRoles,
  });

  const { data: allPerms = [] } = useQuery({
    queryKey: ["rbac-permissions"],
    queryFn: api.getPermissions,
  });

  const createRole = useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.createRole(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
      setShowCreate(false);
      setNewRoleName("");
      setNewRoleDesc("");
      toast({ title: "Role created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRole = useMutation({
    mutationFn: (id: number) => api.deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
      toast({ title: "Role deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addPerm = useMutation({
    mutationFn: ({ roleId, permId }: { roleId: number; permId: number }) =>
      api.addPermissionToRole(roleId, permId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
      setAddPermRoleId(null);
      setSelectedPermId("");
      toast({ title: "Permission assigned" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removePerm = useMutation({
    mutationFn: ({ roleId, permId }: { roleId: number; permId: number }) =>
      api.removePermissionFromRole(roleId, permId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
      toast({ title: "Permission removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Roles define groups of permissions that can be assigned to users.</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="btn-create-role">
          <Plus className="h-4 w-4 mr-1" /> New Role
        </Button>
      </div>

      {rolesLoading ? (
        <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No roles yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {roles.map((role: RbacRole) => (
            <Card key={role.id} className="shadow-sm">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
                      className="flex items-center gap-2 text-left"
                      data-testid={`btn-expand-role-${role.id}`}
                    >
                      {expandedRole === role.id ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="font-semibold text-sm text-slate-800">{role.name}</span>
                    </button>
                    {role.description && (
                      <span className="text-xs text-slate-400">{role.description}</span>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setAddPermRoleId(role.id); setSelectedPermId(""); }}
                      data-testid={`btn-add-perm-role-${role.id}`}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Permission
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteRole.mutate(role.id)}
                      data-testid={`btn-delete-role-${role.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedRole === role.id && (
                <CardContent className="pt-0 pb-3 px-4">
                  {role.permissions.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">No permissions assigned to this role yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {role.permissions.map((p: RbacPermission) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2 py-0.5 text-xs text-slate-700"
                          data-testid={`perm-badge-${role.id}-${p.id}`}
                        >
                          {p.module}:{p.action}
                          <button
                            onClick={() => removePerm.mutate({ roleId: role.id, permId: p.id })}
                            className="ml-0.5 text-slate-400 hover:text-red-500"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create role dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Role Name *</label>
              <Input
                placeholder="e.g. Sales Manager"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                data-testid="input-role-name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <Input
                placeholder="Optional description"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                data-testid="input-role-desc"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createRole.mutate({ name: newRoleName, description: newRoleDesc || undefined })}
              disabled={!newRoleName.trim() || createRole.isPending}
              data-testid="btn-submit-role"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add permission to role dialog */}
      <Dialog open={addPermRoleId !== null} onOpenChange={(o) => !o && setAddPermRoleId(null)}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Permission to Role</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-slate-600">Select Permission</label>
            <Select value={selectedPermId} onValueChange={setSelectedPermId}>
              <SelectTrigger data-testid="select-perm-for-role">
                <SelectValue placeholder="Choose permission…" />
              </SelectTrigger>
              <SelectContent>
                {allPerms.map((p: RbacPermission) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.module}:{p.action}{p.description ? ` — ${p.description}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPermRoleId(null)}>Cancel</Button>
            <Button
              onClick={() =>
                addPermRoleId !== null &&
                selectedPermId &&
                addPerm.mutate({ roleId: addPermRoleId, permId: parseInt(selectedPermId) })
              }
              disabled={!selectedPermId || addPerm.isPending}
              data-testid="btn-submit-add-perm"
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newModule, setNewModule] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: perms = [], isLoading } = useQuery({
    queryKey: ["rbac-permissions"],
    queryFn: api.getPermissions,
  });

  const createPerm = useMutation({
    mutationFn: (data: { module: string; action: string; description?: string }) =>
      api.createPermission(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-permissions"] });
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
      setShowCreate(false);
      setNewModule("");
      setNewAction("");
      setNewDesc("");
      toast({ title: "Permission created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePerm = useMutation({
    mutationFn: (id: number) => api.deletePermission(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-permissions"] });
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
      toast({ title: "Permission deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const PRESETS = [
    { module: "admin", action: "view", description: "Access admin area" },
    { module: "pos", action: "view", description: "Access POS" },
    { module: "orders", action: "view", description: "View orders" },
    { module: "inventory", action: "push", description: "Push inventory" },
    { module: "pricing", action: "view", description: "View pricing" },
    { module: "reports", action: "view", description: "View reports" },
  ];

  const existingKeys = new Set(perms.map((p: RbacPermission) => `${p.module}:${p.action}`));
  const missingPresets = PRESETS.filter((p) => !existingKeys.has(`${p.module}:${p.action}`));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Permissions represent specific access rights (module:action).</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="btn-create-permission">
          <Plus className="h-4 w-4 mr-1" /> New Permission
        </Button>
      </div>

      {/* Quick-add presets */}
      {missingPresets.length > 0 && (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium text-slate-600 mb-2">Quick add standard permissions:</p>
            <div className="flex flex-wrap gap-2">
              {missingPresets.map((p) => (
                <button
                  key={`${p.module}:${p.action}`}
                  onClick={() => createPerm.mutate(p)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full text-xs border border-blue-200 transition-colors"
                  data-testid={`btn-preset-${p.module}-${p.action}`}
                >
                  <Plus className="h-2.5 w-2.5" />
                  {p.module}:{p.action}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
      ) : perms.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No permissions defined yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {perms.map((p: RbacPermission) => (
            <Card key={p.id} className="shadow-sm">
              <CardContent className="py-3 px-4 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {p.module}:{p.action}
                  </p>
                  {p.description && (
                    <p className="text-xs text-slate-400 truncate">{p.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deletePerm.mutate(p.id)}
                  className="shrink-0 text-slate-400 hover:text-red-500"
                  data-testid={`btn-delete-perm-${p.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Permission</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Module *</label>
              <Input
                placeholder="e.g. pos, orders, admin"
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                data-testid="input-perm-module"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Action *</label>
              <Input
                placeholder="e.g. view, edit, delete"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                data-testid="input-perm-action"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <Input
                placeholder="Optional description"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                data-testid="input-perm-desc"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() =>
                createPerm.mutate({
                  module: newModule.trim(),
                  action: newAction.trim(),
                  description: newDesc.trim() || undefined,
                })
              }
              disabled={!newModule.trim() || !newAction.trim() || createPerm.isPending}
              data-testid="btn-submit-permission"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [addPermUserId, setAddPermUserId] = useState<number | null>(null);
  const [selectedPermId, setSelectedPermId] = useState<string>("");

  const { data: rbacUsers = [], isLoading } = useQuery({
    queryKey: ["rbac-admin-users"],
    queryFn: api.getAdminUsers,
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["rbac-roles"],
    queryFn: api.getRoles,
  });

  const { data: allPerms = [] } = useQuery({
    queryKey: ["rbac-permissions"],
    queryFn: api.getPermissions,
  });

  const setRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number | null }) =>
      api.setUserRole(userId, roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-admin-users"] });
      toast({ title: "Role updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addPerm = useMutation({
    mutationFn: ({ userId, permId }: { userId: number; permId: number }) =>
      api.addPermissionToUser(userId, permId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-admin-users"] });
      setAddPermUserId(null);
      setSelectedPermId("");
      toast({ title: "Permission granted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removePerm = useMutation({
    mutationFn: ({ userId, permId }: { userId: number; permId: number }) =>
      api.removePermissionFromUser(userId, permId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rbac-admin-users"] });
      toast({ title: "Permission revoked" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Assign roles and direct permissions to users.</p>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
      ) : (
        <div className="space-y-2">
          {rbacUsers.map((u: RbacUser) => (
            <Card key={u.id} className="shadow-sm">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                      className="flex items-center gap-2"
                      data-testid={`btn-expand-user-${u.id}`}
                    >
                      {expandedUser === u.id ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="font-semibold text-sm text-slate-800">{u.name}</span>
                      <span className="text-xs text-slate-400">@{u.username}</span>
                    </button>
                    <Badge
                      variant={u.role === "admin" ? "default" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {u.role}
                    </Badge>
                    {!u.is_enabled && (
                      <Badge variant="destructive" className="text-xs">Disabled</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={u.role_id ? String(u.role_id) : "none"}
                      onValueChange={(v) =>
                        setRole.mutate({ userId: u.id, roleId: v === "none" ? null : parseInt(v) })
                      }
                    >
                      <SelectTrigger
                        className="h-7 text-xs w-36"
                        data-testid={`select-role-user-${u.id}`}
                      >
                        <SelectValue placeholder="No role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No role</SelectItem>
                        {allRoles.map((r: RbacRole) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setAddPermUserId(u.id); setSelectedPermId(""); }}
                      data-testid={`btn-add-perm-user-${u.id}`}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Permission
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedUser === u.id && (
                <CardContent className="pt-0 pb-3 px-4">
                  <p className="text-xs font-medium text-slate-500 mb-2">Direct permissions:</p>
                  {u.permissions.length === 0 ? (
                    <p className="text-xs text-slate-400">No direct permissions.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {u.permissions.map((p: RbacPermission) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-xs border border-blue-200"
                          data-testid={`user-perm-badge-${u.id}-${p.id}`}
                        >
                          {p.module}:{p.action}
                          <button
                            onClick={() => removePerm.mutate({ userId: u.id, permId: p.id })}
                            className="ml-0.5 text-blue-400 hover:text-red-500"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add permission to user dialog */}
      <Dialog open={addPermUserId !== null} onOpenChange={(o) => !o && setAddPermUserId(null)}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Direct Permission</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-slate-600">Select Permission</label>
            <Select value={selectedPermId} onValueChange={setSelectedPermId}>
              <SelectTrigger data-testid="select-perm-for-user">
                <SelectValue placeholder="Choose permission…" />
              </SelectTrigger>
              <SelectContent>
                {allPerms.map((p: RbacPermission) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.module}:{p.action}{p.description ? ` — ${p.description}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPermUserId(null)}>Cancel</Button>
            <Button
              onClick={() =>
                addPermUserId !== null &&
                selectedPermId &&
                addPerm.mutate({ userId: addPermUserId, permId: parseInt(selectedPermId) })
              }
              disabled={!selectedPermId || addPerm.isPending}
              data-testid="btn-submit-user-perm"
            >
              Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RBACPage() {
  return (
    <SaaSLayout title="Access Control">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Shield className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Access Control</h2>
            <p className="text-sm text-slate-500">Manage roles, permissions, and user access.</p>
          </div>
        </div>

        <Tabs defaultValue="roles">
          <TabsList className="mb-4">
            <TabsTrigger value="roles" data-testid="tab-roles">
              <Key className="h-3.5 w-3.5 mr-1.5" />
              Roles
            </TabsTrigger>
            <TabsTrigger value="permissions" data-testid="tab-permissions">
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              Permissions
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <UserCog className="h-3.5 w-3.5 mr-1.5" />
              Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <RolesTab />
          </TabsContent>
          <TabsContent value="permissions">
            <PermissionsTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </SaaSLayout>
  );
}
