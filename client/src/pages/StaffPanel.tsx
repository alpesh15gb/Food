import { useState } from "react";
import { LoaderCircle, Mail, Plus, Shield, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <h2 className="text-xl font-bold text-gray-900">Team Management</h2>
        <p className="text-sm text-gray-600 mt-1">Invite staff, assign roles, manage access levels.</p>
      </div>

      {!showInvite ? (
        <Button onClick={() => setShowInvite(true)} className="bg-gray-900 hover:bg-gray-800 text-white gap-2">
          <Plus className="w-4 h-4" /> Invite Member
        </Button>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="staff@restaurant.com" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={inviteForm.role} onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as RoleValue })}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => { if (!inviteForm.email) { toast.error("Email required"); return; } inviteMember.mutate({ restaurantId, email: inviteForm.email, role: inviteForm.role }); }} disabled={inviteMember.isPending} className="bg-gray-900 hover:bg-gray-800 text-white">
              {inviteMember.isPending ? <LoaderCircle className="w-4 h-4 animate-spin mr-1" /> : null} Send Invite
            </Button>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-gray-600">Name</th>
              <th className="px-4 py-2.5 font-semibold text-gray-600">Email</th>
              <th className="px-4 py-2.5 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-2.5 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-2.5 font-semibold text-gray-600">Joined</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No team members yet
              </td></tr>
            ) : list.map(m => (
              <tr key={m.id} className={`border-t border-gray-100 ${!m.isActive ? "opacity-50" : ""}`}>
                <td className="px-4 py-2.5 font-medium">{m.userName ?? "—"}</td>
                <td className="px-4 py-2.5">{m.userEmail ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <select
                    className="text-xs font-bold px-2 py-1 rounded border border-gray-200 bg-transparent"
                    value={m.role}
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
                <td className="px-4 py-2.5 text-gray-600">{new Date(m.joinedAt).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-right">
                  {m.isActive && (
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2" onClick={() => deactivate.mutate({ memberId: m.id })}>
                      <UserMinus className="w-3 h-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role Reference */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Role Permissions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.map(r => (
            <div key={r.value} className="p-3 rounded-lg bg-gray-50">
              <p className="font-bold text-sm text-gray-900">{r.label}</p>
              <p className="text-xs text-gray-600 mt-1">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
