"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type EmployeeRow = {
  id: string;
  employeeNo: string;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  roleId?: string | null;
  user: {
    id: string;
    email: string;
    profile?: { name?: string | null } | null;
  };
  team: { id: string; name: string };
  role?: { id: string; name: string } | null;
};

type UserRow = {
  id: string;
  email: string;
  status: string;
  profile?: { name?: string | null; companyName?: string | null } | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type RoleRow = {
  id: string;
  name: string;
  teamId?: string | null;
  team?: { id: string; name: string } | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeUsers = useMemo(() => users.filter((user) => user.status === "ACTIVE"), [users]);
  const activeCount = useMemo(
    () => employees.filter((employee) => employee.status === "ACTIVE").length,
    [employees]
  );
  const disabledCount = employees.length - activeCount;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [employeeRows, userRows, teamRows, roleRows] = await Promise.all([
        apiRequest<EmployeeRow[]>("/admin/employees"),
        apiRequest<UserRow[]>("/admin/users"),
        apiRequest<TeamRow[]>("/teams"),
        apiRequest<RoleRow[]>("/permissions/roles")
      ]);
      setEmployees(employeeRows);
      setUsers(userRows);
      setTeams(teamRows);
      setRoles(roleRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载员工数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/admin/employees", {
        method: "POST",
        body: JSON.stringify({
          employeeNo: form.get("employeeNo"),
          userId: form.get("userId"),
          teamId: form.get("teamId"),
          roleId: form.get("roleId") || undefined
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建员工号失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(id: string, roleId: string) {
    setError(null);
    try {
      await apiRequest(`/admin/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ roleId: roleId || undefined })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新角色失败");
    }
  }

  async function toggleStatus(employee: EmployeeRow) {
    setError(null);
    const action = employee.status === "ACTIVE" ? "disable" : "enable";
    try {
      await apiRequest(`/admin/employees/${employee.id}/${action}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新员工状态失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="员工管理"
      description="维护内部员工号、归属团队、角色和启停状态。"
      actions={
        <button className="button secondary" onClick={load} type="button">
          刷新
        </button>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>员工号总数</span>
          <strong>{employees.length}</strong>
        </div>
        <div className="metric">
          <span>启用中</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="metric">
          <span>已停用</span>
          <strong>{disabledCount}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>新增员工号</h2>
            <p>员工号绑定已审核开通的用户，再分配团队和角色。</p>
          </div>
        </div>
        <form className="form" onSubmit={createEmployee}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="employeeNo">员工号</label>
              <input id="employeeNo" name="employeeNo" placeholder="TF000002" required />
            </div>
            <div className="field">
              <label htmlFor="userId">用户</label>
              <select disabled={activeUsers.length === 0} id="userId" name="userId" required>
                <option value="">选择用户</option>
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.profile?.name ?? user.email} / {user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="teamId">团队</label>
              <select disabled={teams.length === 0} id="teamId" name="teamId" required>
                <option value="">选择团队</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="roleId">角色</label>
              <select id="roleId" name="roleId">
                <option value="">不指定角色</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.team?.name ? `${role.team.name} / ` : ""}
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving || activeUsers.length === 0 || teams.length === 0} type="submit">
              {saving ? "保存中..." : "创建员工号"}
            </button>
          </div>
        </form>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>员工号</th>
              <th>姓名/邮箱</th>
              <th>团队</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <strong>{employee.employeeNo}</strong>
                </td>
                <td>
                  <strong>{employee.user.profile?.name ?? "-"}</strong>
                  <br />
                  <span className="muted">{employee.user.email}</span>
                </td>
                <td>{employee.team.name}</td>
                <td>
                  <select
                    aria-label="调整角色"
                    onChange={(event) => void updateRole(employee.id, event.target.value)}
                    value={employee.roleId ?? ""}
                  >
                    <option value="">不指定角色</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.team?.name ? `${role.team.name} / ` : ""}
                        {role.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={employee.status === "ACTIVE" ? "pill success" : "pill danger"}>
                    {employee.status === "ACTIVE" ? "启用中" : "已停用"}
                  </span>
                </td>
                <td>{formatDate(employee.createdAt)}</td>
                <td>
                  <button
                    className={employee.status === "ACTIVE" ? "button danger" : "button primary"}
                    onClick={() => void toggleStatus(employee)}
                    type="button"
                  >
                    {employee.status === "ACTIVE" ? "停用" : "启用"}
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && !loading ? (
              <tr>
                <td colSpan={7}>暂无员工号</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
