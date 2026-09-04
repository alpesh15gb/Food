import { useState } from "react";
import { LoaderCircle, Plus, Shield, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminError } from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

const ROLES = [
  { value: "owner", label: "Owner", desc: "Full access including billing and team" },
  { value: "admin", label: "Admin", desc: "Everything except settings and integrations" },
  { value: "manager", label: "Manager", desc: "Orders, menu, customers, reports" },
  { value: "staff", label: "Counter Staff", desc: "Orders and billing only" },
  { value: "kitchen", label: "Kitchen Staff", desc: "KDS only" },
] as const;

type RoleValue = typeof ROLES[number]["value"];

export default function StaffPanel({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const members = trpc.admin.listMembers.useQuery({ restaurantId });
  const inviteMember = trpc.admin.inviteMember.useMutation({
    onSuccess: () => {
      toast.success("Team member added");
      utils.admin.listMembers.invalidate({ restaurantId });
      setShowInvite(false);
      setInviteForm({ email: "", role: "staff" });
    },
    onError: (err) => toast.error(err.message),
  });
  const updateRole = trpc.admin.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.admin.listMembers.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message),
  });
  const deactivate = trpc.admin.deactivateMember.useMutation({
    onSuccess: () => {
      toast.success("Member deactivated");
      utils.admin.listMembers.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message),
  });

  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "staff" as RoleValue });

  const list = members.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#38271F]" style={{ fontFamily: "var(--font-display)" }}>Team Management</h2>
        <p className="text-sm text-[#6b5c52] mt-1">Invite staff, assign roles, manage access levels.</p>
      </div>

      {!showInvite ? (
        <Button onClick={() => setShowInvite(true)} className="bg-[#38271F] hover:bg-[#2a1d17] text-white gap-2">
          <Plus className="w-4 h-4" /> Invite Member
        </Button>
      ) : (
        <div className="bg-white rounded-xl border border-[#e8ddd0] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="staff@restaurant.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-role">Role</Label>
              <select id="invite-role" className="flex h-9 min-h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as RoleValue })}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => { if (!inviteForm.email) { toast.error("Email required"); return; } inviteMember.mutate({ restaurantId, email: inviteForm.email, role: inviteForm.role }); }} disabled={inviteMember.isPending} className="bg-[#38271F] hover:bg-[#2a1d17] text-white">
              {inviteMember.isPending ? <LoaderCircle className="w-4 h-4 animate-spin mr-1" /> : null} Send Invite
            </Button>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {members.isLoading ? (
        <div className="space-y-3" aria-label="Loading team members">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[#eadfd4]" />
          ))}
        </div>
      ) : members.isError ? (
        <AdminError
          message="We couldn't load team members. Please retry."
          onRetry={() => members.refetch()}
        />
      ) : (
      <div className="bg-white rounded-xl border border-[#e8ddd0] overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[#f7f2eb] text-left">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-[#6b5c52]">Name</th>
              <th className="px-4 py-2.5 font-semibold text-[#6b5c52]">Email</th>
              <th className="px-4 py-2.5 font-semibold text-[#6b5c52]">Role</th>
              <th className="px-4 py-2.5 font-semibold text-[#6b5c52]">Status</th>
              <th className="px-4 py-2.5 font-semibold text-[#6b5c52]">Joined</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#a09080]">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No team members yet
              </td></tr>
            ) : list.map(m => (
              <tr key={m.id} className={`border-t border-[#f0e8de] ${!m.isActive ? "opacity-50" : ""}`}>
                <td className="px-4 py-2.5 font-medium">{m.userName ?? "—"}</td>
                <td className="px-4 py-2.5">{m.userEmail ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <select
                    aria-label={`Role for ${m.userEmail ?? m.userName ?? "member"}`}
                    className="min-h-11 text-xs font-bold px-2 py-1 rounded border border-[#e8ddd0] bg-transparent"
                    value={m.role}
                    disabled={updateRole.isPending}
                    onChange={e => updateRole.mutate({ memberId: m.id, role: e.target.value as RoleValue })}
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {m.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[#6b5c52]">{new Date(m.joinedAt).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-right">
                  {m.isActive && (
                    <Button size="sm" variant="ghost" aria-label={`Deactivate ${m.userEmail ?? m.userName ?? "member"}`} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2" disabled={deactivate.isPending} onClick={() => deactivate.mutate({ memberId: m.id })}>
                      <UserMinus className="w-3 h-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Role Reference */}
      <div className="bg-white rounded-xl border border-[#e8ddd0] p-4">
        <h3 className="font-semibold text-[#38271F] mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Role Permissions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.map(r => (
            <div key={r.value} className="p-3 rounded-lg bg-[#f7f2eb]">
              <p className="font-bold text-sm text-[#38271F]">{r.label}</p>
              <p className="text-xs text-[#6b5c52] mt-1">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
