"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type PermissionRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
};

type RoleRow = {
  id: string;
  teamId?: string | null;
  name: string;
  description?: string | null;
  isSystem: boolean;
  team?: { id: string; name: string } | null;
  permissions: Array<{ permission: PermissionRow }>;
  _count?: {
    members: number;
    employeeAccounts: number;
  };
};

type TeamRow = {
  id: string;
  name: string;
};

function permissionGroup(code: string) {
  const [group] = code.split(".");
  const labels: Record<string, string> = {
    users: "用户",
    employees: "员工",
    roles: "角色",
    ad_accounts: "广告账户",
    campaigns: "投放",
    media: "素材",
    copywriting: "文案",
    targeting: "受众",
    strategies: "策略",
    automation: "自动化",
    pixels: "Pixel",
    finance: "财务",
    reports: "报表",
    system: "系统",
    audit_logs: "日志"
  };
  return labels[group] ?? group;
}

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );
  const draftSet = useMemo(() => new Set(draftCodes), [draftCodes]);
  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, PermissionRow[]>>((groups, permission) => {
      const group = permissionGroup(permission.code);
      groups[group] = [...(groups[group] ?? []), permission];
      return groups;
    }, {});
  }, [permissions]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [permissionRows, roleRows, teamRows] = await Promise.all([
        apiRequest<PermissionRow[]>("/permissions"),
        apiRequest<RoleRow[]>("/permissions/roles"),
        apiRequest<TeamRow[]>("/teams")
      ]);
      setPermissions(permissionRows);
      setRoles(roleRows);
      setTeams(teamRows);
      setSelectedRoleId((current) =>
        current && roleRows.some((role) => role.id === current) ? current : roleRows[0]?.id ?? null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载权限数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const role = await apiRequest<{ id: string }>("/permissions/roles", {
        method: "POST",
        body: JSON.stringify({
          teamId: form.get("teamId") || undefined,
          name: form.get("name"),
          description: form.get("description") || undefined
        })
      });
      event.currentTarget.reset();
      setSelectedRoleId(role.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建角色失败");
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/permissions/roles/${selectedRole.id}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissionCodes: draftCodes })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存角色权限失败");
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(code: string) {
    setDraftCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    );
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setDraftCodes(selectedRole?.permissions.map((item) => item.permission.code) ?? []);
  }, [selectedRole]);

  return (
    <AdminShell
      title="权限角色"
      description="以角色为单位配置权限码，员工号和团队成员通过角色获得操作权限。"
      actions={
        <button className="button secondary" onClick={load} type="button">
          刷新
        </button>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>权限码</span>
          <strong>{permissions.length}</strong>
        </div>
        <div className="metric">
          <span>角色</span>
          <strong>{roles.length}</strong>
        </div>
        <div className="metric">
          <span>团队</span>
          <strong>{teams.length}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="split-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>角色清单</h2>
              <p>选择一个角色后维护它的权限范围。</p>
            </div>
          </div>
          <div className="role-list">
            {roles.map((role) => (
              <button
                className={role.id === selectedRoleId ? "role-item active" : "role-item"}
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                type="button"
              >
                <strong>{role.name}</strong>
                <span className="muted">{role.team?.name ?? "平台角色"}</span>
                <span className="muted">
                  {role.permissions.length} 个权限 / {role._count?.employeeAccounts ?? 0} 个员工号
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>新增角色</h2>
              <p>创建后在右侧勾选权限并保存。</p>
            </div>
          </div>
          <form className="form" onSubmit={createRole}>
            <div className="field">
              <label htmlFor="teamId">所属团队</label>
              <select id="teamId" name="teamId">
                <option value="">平台角色</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="name">角色名称</label>
              <input id="name" name="name" placeholder="投手" required />
            </div>
            <div className="field">
              <label htmlFor="description">说明</label>
              <textarea id="description" name="description" placeholder="角色职责和使用边界" />
            </div>
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : "创建角色"}
            </button>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{selectedRole ? `${selectedRole.name} 权限` : "角色权限"}</h2>
            <p>{selectedRole?.team?.name ?? "平台角色"}</p>
          </div>
          <button className="button primary" disabled={!selectedRole || saving} onClick={() => void savePermissions()} type="button">
            {saving ? "保存中..." : "保存权限"}
          </button>
        </div>

        {selectedRole ? (
          <div className="form">
            {Object.entries(groupedPermissions).map(([group, rows]) => (
              <div key={group}>
                <h3>{group}</h3>
                <div className="checkbox-grid">
                  {rows.map((permission) => (
                    <label className="checkbox-row" key={permission.id}>
                      <input
                        checked={draftSet.has(permission.code)}
                        onChange={() => togglePermission(permission.code)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{permission.name}</strong>
                        <span className="muted">{permission.code}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">暂无角色</div>
        )}
      </section>
    </AdminShell>
  );
}
