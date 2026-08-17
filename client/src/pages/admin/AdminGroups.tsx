import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRoles, createRole, deleteRole, updateRole,
  getPermissions, createPermission,
  addPermissionToRole, removePermissionFromRole,
  getAdminUsers,
  RbacRole, RbacPermission, RbacUser,
} from "@/lib/api";
import { MODULES, CRM_ACTION_PERMS, INVENTORY_AUDIT_ACTION_PERMS } from "./AdminUsers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, Trash2, ArrowLeft, Save, Pencil, UsersRound, Lock, X, Check, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ─── Group list row ───────────────────────────────────────────────────────────

function GroupRow({
  group, memberCount, onClick,
}: {
  group: RbacRole; memberCount: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-slate-50 text-left transition-colors"
      data-testid={`group-row-${group.id}`}
    >
      <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold shrink-0">
        {group.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{group.name}</p>
        {group.description && <p className="text-xs text-slate-400 truncate">{group.description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-[10px]">{group.permissions.length} perm{group.permissions.length !== 1 ? "s" : ""}</Badge>
        <Badge variant="outline" className="text-[10px]">{memberCount} member{memberCount !== 1 ? "s" : ""}</Badge>
      </div>
    </button>
  );
}

// ─── Group detail ─────────────────────────────────────────────────────────────

function GroupDetail({
  group, permMap, members, onBack, onDeleted,
}: {
  group: RbacRole; permMap: Map<string, RbacPermission>;
  members: RbacUser[]; onBack: () => void; onDeleted: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);
  const [descInput, setDescInput] = useState(group.description || "");
  const [savingName, setSavingName] = useState(false);
  const [busyPerm, setBusyPerm] = useState<string | null>(null);

  // Keep local state synced when group prop refreshes
  useEffect(() => {
    if (!editingName) { setNameInput(group.name); setDescInput(group.description || ""); }
  }, [group.name, group.description]);

  const hasGroupPerm = (key: string) => {
    const perm = permMap.get(`${key}:view`);
    if (!perm) return false;
    return group.permissions.some((p) => p.id === perm.id);
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await updateRole(group.id, { name: nameInput.trim(), description: descInput.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-users-rbac"] });
      setEditingName(false);
      toast({ title: "Group updated" });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setSavingName(false); }
  };

  const handleTogglePerm = async (key: string, enabled: boolean) => {
    const perm = permMap.get(`${key}:view`);
    if (!perm) return;
    setBusyPerm(key);
    try {
      if (enabled) await addPermissionToRole(group.id, perm.id);
      else await removePermissionFromRole(group.id, perm.id);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
      toast({ title: enabled ? "Permission added to group" : "Permission removed from group", description: `${key}:view` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusyPerm(null); }
  };

  const handleToggleCrmPerm = async (module: string, action: string, enabled: boolean) => {
    const perm = permMap.get(`${module}:${action}`);
    if (!perm) return;
    setBusyPerm(`crm-${action}`);
    try {
      if (enabled) await addPermissionToRole(group.id, perm.id);
      else await removePermissionFromRole(group.id, perm.id);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
      toast({ title: enabled ? "Permission added to group" : "Permission removed from group", description: `${module}:${action}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusyPerm(null); }
  };

  const handleToggleActionPerm = async (module: string, action: string, busyId: string, enabled: boolean) => {
    const perm = permMap.get(`${module}:${action}`);
    if (!perm) return;
    setBusyPerm(busyId);
    try {
      if (enabled) await addPermissionToRole(group.id, perm.id);
      else await removePermissionFromRole(group.id, perm.id);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
      toast({ title: enabled ? "Permission added to group" : "Permission removed from group", description: `${module}:${action}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusyPerm(null); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
          {group.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-slate-800 truncate">{group.name}</h1>
          <p className="text-xs text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>

        {/* Delete */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete group "{group.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the group and unassign all {members.length} member{members.length !== 1 ? "s" : ""}. Direct permissions on users are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={async () => {
                  try {
                    await deleteRole(group.id);
                    await queryClient.invalidateQueries({ queryKey: ["roles"] });
                    await queryClient.invalidateQueries({ queryKey: ["admin-users-rbac"] });
                    toast({ title: `Group "${group.name}" deleted` });
                    onDeleted();
                  } catch (e: any) {
                    toast({ title: "Delete failed", description: e.message, variant: "destructive" });
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">

        {/* Name & description card */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Group Info</span>
            </div>
            {!editingName && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingName(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>
          <div className="px-4 py-4 space-y-3">
            {editingName ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Group Name</label>
                  <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Group name" data-testid="input-group-name" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                  <Input value={descInput} onChange={(e) => setDescInput(e.target.value)} placeholder="Short description…" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 gap-1" onClick={handleSaveName} disabled={savingName || !nameInput.trim()} data-testid="btn-save-group-name">
                    {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditingName(false); setNameInput(group.name); setDescInput(group.description || ""); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                {group.description ? <p className="text-xs text-slate-400 mt-1">{group.description}</p> : <p className="text-xs text-slate-300 mt-1 italic">No description</p>}
              </div>
            )}
          </div>
        </div>

        {/* Permission toggles */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Module Permissions</span>
            <span className="ml-auto text-[10px] text-slate-400">{group.permissions.length} enabled</span>
          </div>
          <div className="divide-y">
            {MODULES.map((m) => {
              const perm = permMap.get(`${m.key}:view`);
              const isBusy = busyPerm === m.key;
              const enabled = hasGroupPerm(m.key);
              return (
                <div key={m.key} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-slate-700">{m.label}</span>
                  {perm === undefined ? (
                    <span className="text-[10px] text-slate-400 italic">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <Switch checked={enabled} onCheckedChange={(v) => handleTogglePerm(m.key, v)} data-testid={`toggle-group-${m.key}-${group.id}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CRM-specific permissions */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">CRM Permissions</span>
          </div>
          <div className="divide-y">
            {CRM_ACTION_PERMS.map(p => {
              const perm = permMap.get(`${p.module}:${p.action}`);
              const isBusy = busyPerm === `crm-${p.action}`;
              const enabled = perm ? group.permissions.some(gp => gp.id === perm.id) : false;
              return (
                <div key={p.action} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-slate-700">{p.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                  {perm === undefined ? (
                    <span className="text-[10px] text-slate-400 italic shrink-0">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <Switch
                      checked={enabled}
                      onCheckedChange={v => handleToggleCrmPerm(p.module, p.action, v)}
                      data-testid={`toggle-group-crm-${p.action}-${group.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Inventory Audit permissions */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Inventory Audit Permissions</span>
          </div>
          <div className="divide-y">
            {INVENTORY_AUDIT_ACTION_PERMS.map(p => {
              const perm = permMap.get(`${p.module}:${p.action}`);
              const busyId = `inv-audit-${p.action}`;
              const isBusy = busyPerm === busyId;
              const enabled = perm ? group.permissions.some(gp => gp.id === perm.id) : false;
              return (
                <div key={p.action} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-slate-700">{p.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>
                  </div>
                  {perm === undefined ? (
                    <span className="text-[10px] text-slate-400 italic shrink-0">N/A</span>
                  ) : isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <Switch
                      checked={enabled}
                      onCheckedChange={v => handleToggleActionPerm(p.module, p.action, busyId, v)}
                      data-testid={`toggle-group-inv-audit-${p.action}-${group.id}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t bg-slate-50">
            "Inventory › Audit Queue" module access controls who can <em>view</em> the queue. This controls who can <em>submit</em> audits.
          </p>
        </div>

        {/* Members */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Members ({members.length})</span>
          </div>
          {members.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No users assigned to this group yet.</div>
          ) : (
            <div className="divide-y">
              {members.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    u.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")}>
                    {u.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                    <p className="text-xs text-slate-400">@{u.username}</p>
                  </div>
                  <Badge variant={u.is_enabled ? "default" : "secondary"} className="text-[10px] h-4 px-1.5 shrink-0">
                    {u.is_enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t bg-slate-50">
            To assign or remove members, go to User Management and change each user's group.
          </p>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminGroups() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: groups = [], isLoading: groupsLoading } = useQuery<RbacRole[]>({
    queryKey: ["roles"],
    queryFn: getRoles,
  });

  const { data: permissions = [], isLoading: permsLoading } = useQuery<RbacPermission[]>({
    queryKey: ["permissions"],
    queryFn: getPermissions,
  });

  const { data: allUsers = [] } = useQuery<RbacUser[]>({
    queryKey: ["admin-users-rbac"],
    queryFn: getAdminUsers,
  });

  const permMap = useMemo(
    () => new Map<string, RbacPermission>(permissions.map((p) => [`${p.module}:${p.action}`, p])),
    [permissions],
  );

  // Auto-create missing standard permissions
  useEffect(() => {
    if (permsLoading) return;
    const missing = MODULES.filter((m) => !permMap.has(`${m.key}:view`));
    if (!missing.length) return;
    Promise.all(
      missing.map((m) => createPermission({ module: m.key, action: "view", description: `Access ${m.label} module` }).catch(() => {})),
    ).then(() => queryClient.invalidateQueries({ queryKey: ["permissions"] }));
  }, [permsLoading, permissions.length]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createRole({ name: newName.trim(), description: newDesc.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      setNewName(""); setNewDesc(""); setShowCreateForm(false);
      toast({ title: `Group "${newName.trim()}" created` });
    } catch (e: any) {
      toast({ title: "Create failed", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const groupMembers = useMemo(
    () => allUsers.filter((u) => u.role_id === selectedGroupId),
    [allUsers, selectedGroupId],
  );

  if (selectedGroup) {
    return (
      <GroupDetail
        group={selectedGroup} permMap={permMap} members={groupMembers}
        onBack={() => setSelectedGroupId(null)}
        onDeleted={() => setSelectedGroupId(null)}
      />
    );
  }

  const isLoading = groupsLoading || permsLoading;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <UsersRound className="h-5 w-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">User Groups</h1>
        {!isLoading && <span className="text-xs text-slate-400">{groups.length} group{groups.length !== 1 ? "s" : ""}</span>}
        <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={() => setShowCreateForm((v) => !v)} data-testid="btn-new-group">
          {showCreateForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showCreateForm ? "Cancel" : "New Group"}
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-3">

        {/* Create form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">New Group</p>
            <div className="space-y-2">
              <Input
                value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Group name (e.g. Sales Team, East Region…)"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus data-testid="input-new-group-name"
              />
              <Input
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 gap-1" onClick={handleCreate} disabled={creating || !newName.trim()} data-testid="btn-create-group">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowCreateForm(false); setNewName(""); setNewDesc(""); }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Groups list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <UsersRound className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">No groups yet.</p>
            <p className="text-xs mt-1">Create a group to assign permissions to multiple users at once.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {groups.map((g) => (
              <GroupRow
                key={g.id} group={g}
                memberCount={allUsers.filter((u) => u.role_id === g.id).length}
                onClick={() => setSelectedGroupId(g.id)}
              />
            ))}
          </div>
        )}

        {/* Info card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-xs text-blue-700 font-semibold mb-1">How Groups Work</p>
          <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
            <li>Each group has its own set of module permissions.</li>
            <li>Users assigned to a group inherit all group permissions automatically.</li>
            <li>Users can also have additional direct permissions on top of their group.</li>
            <li>System admins always have full access regardless of group settings.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
