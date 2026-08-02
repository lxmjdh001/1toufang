"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type UserRow = {
  id: string;
  email: string;
  status: string;
  maxTeamCount?: number;
  profile?: { name?: string | null; companyName?: string | null } | null;
};

type RoleRow = {
  id: string;
  name: string;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
};

type TeamMemberRow = {
  id: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
  role?: { id: string; name: string } | null;
  user: {
    id: string;
    email: string;
    profile?: { name?: string | null } | null;
  };
};

type TeamRow = {
  id: string;
  name: string;
  type: "PERSONAL" | "TEAM";
  seatLimit: number;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  expiresAt?: string | null;
  notes?: string | null;
  owner?: {
    id: string;
    email: string;
    profile?: { name?: string | null; companyName?: string | null } | null;
  } | null;
  members: TeamMemberRow[];
  employeeAccounts: Array<{
    id: string;
    employeeNo: string;
    status: string;
    user: { email: string; profile?: { name?: string | null } | null };
    role?: { name: string } | null;
  }>;
  _count?: {
    members: number;
    employeeAccounts: number;
    adAccounts: number;
    campaigns: number;
  };
};

type TeamForm = {
  name: string;
  ownerId: string;
  type: "PERSONAL" | "TEAM";
  seatLimit: string;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  expiresAt: string;
  notes: string;
};

const emptyForm: TeamForm = {
  name: "",
  ownerId: "",
  type: "TEAM",
  seatLimit: "3",
  status: "ACTIVE",
  expiresAt: "",
  notes: ""
};

const typeLabels: Record<TeamRow["type"], string> = {
  PERSONAL: "个人",
  TEAM: "团队"
};

const statusLabels: Record<TeamRow["status"], string> = {
  ACTIVE: "启用",
  SUSPENDED: "暂停",
  EXPIRED: "到期"
};

function formatDate(value?: string | null) {
  if (!value) return "永久";
  return new Date(value).toLocaleDateString("zh-CN");
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function dateInputToIso(value?: string) {
  if (!value) return null;
  return new Date(`${value}T23:59:59`).toISOString();
}

function teamStatusClass(team: TeamRow) {
  if (team.status !== "ACTIVE") return "pill danger";
  if (team.expiresAt && new Date(team.expiresAt) <= new Date()) return "pill danger";
  return "pill success";
}

function memberName(member: TeamMemberRow) {
  return member.user.profile?.name ?? member.user.email;
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRoleId, setMemberRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeUsers = useMemo(() => users.filter((user) => user.status === "ACTIVE"), [users]);
  const selectedTeam = useMemo(() => teams.find((team) => team.id === editingId) ?? null, [editingId, teams]);
  const teamCount = useMemo(() => teams.filter((team) => team.type === "TEAM").length, [teams]);
  const personalCount = teams.length - teamCount;
  const expiredCount = useMemo(
    () => teams.filter((team) => team.status !== "ACTIVE" || (team.expiresAt && new Date(team.expiresAt) <= new Date())).length,
    [teams]
  );
  const availableRoles = useMemo(
    () => roles.filter((role) => !role.teamId || !editingId || role.teamId === editingId),
    [editingId, roles]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [teamRows, userRows, roleRows] = await Promise.all([
        apiRequest<TeamRow[]>("/teams"),
        apiRequest<UserRow[]>("/admin/users"),
        apiRequest<RoleRow[]>("/permissions/roles")
      ]);
      setTeams(teamRows);
      setUsers(userRows);
      setRoles(roleRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载团队数据失败");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(patch: Partial<TeamForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMemberUserId("");
    setMemberRoleId("");
  }

  function editTeam(team: TeamRow) {
    setEditingId(team.id);
    setForm({
      name: team.name,
      ownerId: team.owner?.id ?? "",
      type: team.type,
      seatLimit: String(team.seatLimit),
      status: team.status,
      expiresAt: toDateInput(team.expiresAt),
      notes: team.notes ?? ""
    });
    setMemberUserId("");
    setMemberRoleId("");
  }

  async function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest(editingId ? `/teams/${editingId}` : "/teams", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          name: form.name,
          ownerId: form.ownerId || null,
          type: form.type,
          seatLimit: Math.max(1, Number(form.seatLimit) || 1),
          status: form.status,
          expiresAt: dateInputToIso(form.expiresAt),
          notes: form.notes || null
        })
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存团队失败");
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (!editingId || !memberUserId) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/teams/${editingId}/members`, {
        method: "POST",
        body: JSON.stringify({
          userId: memberUserId,
          roleId: memberRoleId || undefined
        })
      });
      setMemberUserId("");
      setMemberRoleId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加成员失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleMember(team: TeamRow, member: TeamMemberRow) {
    setSaving(true);
    setError(null);
    const action = member.status === "ACTIVE" ? "disable" : "enable";
    try {
      await apiRequest(`/teams/${team.id}/members/${member.id}/${action}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "成员状态更新失败");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="团队管理"
      description="维护客户团队类型、负责人、账号席位、到期时间和团队成员。"
      actions={
        <button className="button secondary" onClick={load} type="button">
          刷新
        </button>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>团队总数</span>
          <strong>{teams.length}</strong>
        </div>
        <div className="metric">
          <span>团队版</span>
          <strong>{teamCount}</strong>
        </div>
        <div className="metric">
          <span>个人版</span>
          <strong>{personalCount}</strong>
        </div>
        <div className="metric">
          <span>暂停/到期</span>
          <strong>{expiredCount}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑团队" : "新增团队"}</h2>
            <p>团队版默认 3 个账号席位，可按客户套餐调整。</p>
          </div>
          {editingId ? (
            <button className="button secondary" onClick={resetForm} type="button">
              取消编辑
            </button>
          ) : null}
        </div>
        <form className="form" onSubmit={submitTeam}>
          <div className="form-grid team-form-grid">
            <div className="field">
              <label htmlFor="teamName">团队名称</label>
              <input id="teamName" onChange={(event) => updateForm({ name: event.target.value })} required value={form.name} />
            </div>
            <div className="field">
              <label htmlFor="teamOwner">负责人</label>
              <select id="teamOwner" onChange={(event) => updateForm({ ownerId: event.target.value })} value={form.ownerId}>
                <option value="">不指定</option>
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.profile?.name ?? user.email} / {user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="teamType">类型</label>
              <select id="teamType" onChange={(event) => updateForm({ type: event.target.value as TeamForm["type"] })} value={form.type}>
                <option value="TEAM">团队</option>
                <option value="PERSONAL">个人</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="seatLimit">账号席位</label>
              <input
                id="seatLimit"
                min={1}
                onChange={(event) => updateForm({ seatLimit: event.target.value })}
                type="number"
                value={form.seatLimit}
              />
            </div>
            <div className="field">
              <label htmlFor="teamStatus">状态</label>
              <select id="teamStatus" onChange={(event) => updateForm({ status: event.target.value as TeamForm["status"] })} value={form.status}>
                <option value="ACTIVE">启用</option>
                <option value="SUSPENDED">暂停</option>
                <option value="EXPIRED">到期</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="teamExpiresAt">到期时间</label>
              <input id="teamExpiresAt" onChange={(event) => updateForm({ expiresAt: event.target.value })} type="date" value={form.expiresAt} />
            </div>
            <div className="field team-notes-field">
              <label htmlFor="teamNotes">备注</label>
              <input id="teamNotes" onChange={(event) => updateForm({ notes: event.target.value })} value={form.notes} />
            </div>
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存团队" : "创建团队"}
            </button>
          </div>
        </form>
      </section>

      {selectedTeam ? (
        <section className="panel team-member-panel">
          <div className="panel-heading">
            <div>
              <h2>团队成员</h2>
              <p>{selectedTeam.name} 当前成员 {selectedTeam.members.length} / {selectedTeam.seatLimit}</p>
            </div>
          </div>
          <div className="form-grid team-member-form">
            <div className="field">
              <label htmlFor="memberUserId">用户</label>
              <select id="memberUserId" onChange={(event) => setMemberUserId(event.target.value)} value={memberUserId}>
                <option value="">选择用户</option>
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.profile?.name ?? user.email} / {user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="memberRoleId">角色</label>
              <select id="memberRoleId" onChange={(event) => setMemberRoleId(event.target.value)} value={memberRoleId}>
                <option value="">不指定</option>
                {availableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.team?.name ? `${role.team.name} / ` : ""}
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field team-member-action">
              <label>&nbsp;</label>
              <button className="button primary" disabled={saving || !memberUserId} onClick={addMember} type="button">
                添加成员
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="table-panel admin-team-table-panel">
        <table className="admin-team-table">
          <thead>
            <tr>
              <th>团队</th>
              <th>负责人</th>
              <th>类型/状态</th>
              <th>席位</th>
              <th>资源</th>
              <th>成员</th>
              <th>到期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id}>
                <td>
                  <strong>{team.name}</strong>
                  {team.notes ? (
                    <>
                      <br />
                      <span className="muted">{team.notes}</span>
                    </>
                  ) : null}
                </td>
                <td>
                  <strong>{team.owner?.profile?.name ?? team.owner?.email ?? "-"}</strong>
                  <br />
                  <span className="muted">{team.owner?.profile?.companyName ?? team.owner?.email ?? "-"}</span>
                </td>
                <td>
                  <span className="pill info">{typeLabels[team.type]}</span>
                  <br />
                  <span className={teamStatusClass(team)}>{statusLabels[team.status]}</span>
                </td>
                <td>
                  <strong>{team._count?.employeeAccounts ?? team.employeeAccounts.length}</strong>
                  <span className="muted"> / {team.seatLimit}</span>
                </td>
                <td>
                  <span className="muted">广告账户 {team._count?.adAccounts ?? 0}</span>
                  <br />
                  <span className="muted">Campaign {team._count?.campaigns ?? 0}</span>
                </td>
                <td>
                  <div className="team-member-list">
                    {team.members.slice(0, 4).map((member) => (
                      <span key={member.id}>
                        {memberName(member)} / {member.role?.name ?? "未设角色"}
                        {member.status === "ACTIVE" ? "" : " / 停用"}
                        <button disabled={saving} onClick={() => void toggleMember(team, member)} type="button">
                          {member.status === "ACTIVE" ? "停用" : "启用"}
                        </button>
                      </span>
                    ))}
                    {team.members.length > 4 ? <span>+{team.members.length - 4}</span> : null}
                  </div>
                </td>
                <td>{formatDate(team.expiresAt)}</td>
                <td>
                  <div className="row-actions nowrap">
                    <button className="button primary" onClick={() => editTeam(team)} type="button">
                      编辑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {teams.length === 0 && !loading ? (
              <tr>
                <td colSpan={8}>暂无团队</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
