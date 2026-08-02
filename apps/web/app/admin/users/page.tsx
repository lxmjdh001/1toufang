"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type TeamBrief = {
  id: string;
  name: string;
  type?: "PERSONAL" | "TEAM";
  seatLimit?: number;
  status?: string;
  expiresAt?: string | null;
};

type UserRow = {
  id: string;
  email: string;
  status: string;
  accessExpiresAt?: string | null;
  maxTeamCount?: number;
  createdAt: string;
  profile?: {
    name?: string;
    companyName?: string;
    phone?: string;
  } | null;
  employeeAccounts?: Array<{
    employeeNo: string;
    status: string;
    team?: TeamBrief | null;
    role?: { name: string } | null;
  }>;
  teamMemberships?: Array<{
    team?: TeamBrief | null;
    role?: { name: string } | null;
  }>;
  ownedTeams?: TeamBrief[];
  _count?: {
    employeeAccounts: number;
    teamMemberships: number;
    ownedTeams: number;
  };
};

const statusLabels: Record<string, string> = {
  PENDING_REVIEW: "待审核",
  ACTIVE: "已开通",
  REJECTED: "已驳回",
  SUSPENDED: "已暂停",
  DISABLED: "已禁用",
  LOCKED: "已锁定"
};

const statusOptions = [
  { label: "全部状态", value: "ALL" },
  { label: "待审核", value: "PENDING_REVIEW" },
  { label: "已开通", value: "ACTIVE" },
  { label: "已到期", value: "EXPIRED" },
  { label: "已驳回", value: "REJECTED" },
  { label: "异常状态", value: "BLOCKED" }
];

function statusClass(status: string) {
  if (status === "ACTIVE") return "pill success";
  if (status === "PENDING_REVIEW") return "pill warning";
  if (["REJECTED", "SUSPENDED", "DISABLED", "LOCKED"].includes(status)) return "pill danger";
  return "pill";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

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

function isExpired(value?: string | null) {
  return Boolean(value && new Date(value) <= new Date());
}

function firstTeam(user: UserRow) {
  return user.teamMemberships?.[0]?.team ?? user.employeeAccounts?.[0]?.team ?? user.ownedTeams?.[0] ?? null;
}

function userRole(user: UserRow) {
  return user.employeeAccounts?.[0]?.role?.name ?? user.teamMemberships?.[0]?.role?.name ?? "-";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeNo, setEmployeeNo] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [accessExpiresAt, setAccessExpiresAt] = useState<Record<string, string>>({});
  const [maxTeamCount, setMaxTeamCount] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => users.filter((user) => user.status === "PENDING_REVIEW").length,
    [users]
  );
  const activeCount = useMemo(() => users.filter((user) => user.status === "ACTIVE").length, [users]);
  const expiredCount = useMemo(
    () => users.filter((user) => user.status === "ACTIVE" && isExpired(user.accessExpiresAt)).length,
    [users]
  );
  const blockedCount = useMemo(
    () => users.filter((user) => ["SUSPENDED", "DISABLED", "LOCKED"].includes(user.status)).length,
    [users]
  );
  const filteredUsers = useMemo(() => {
    if (statusFilter === "ALL") return users;
    if (statusFilter === "EXPIRED") {
      return users.filter((user) => user.status === "ACTIVE" && isExpired(user.accessExpiresAt));
    }
    if (statusFilter === "BLOCKED") {
      return users.filter((user) => ["SUSPENDED", "DISABLED", "LOCKED"].includes(user.status));
    }
    return users.filter((user) => user.status === statusFilter);
  }, [statusFilter, users]);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await apiRequest<UserRow[]>("/admin/users"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载用户失败");
    } finally {
      setLoading(false);
    }
  }

  function currentAccessDate(user: UserRow) {
    return accessExpiresAt[user.id] ?? toDateInput(user.accessExpiresAt);
  }

  function currentMaxTeamCount(user: UserRow) {
    return maxTeamCount[user.id] ?? String(user.maxTeamCount ?? 1);
  }

  function accessPayload(user: UserRow) {
    const limit = Math.max(1, Number(currentMaxTeamCount(user)) || 1);
    const expiry = dateInputToIso(currentAccessDate(user));
    return {
      accessExpiresAt: expiry,
      maxTeamCount: limit,
      seatLimit: limit,
      teamType: limit > 1 ? "TEAM" : "PERSONAL",
      teamExpiresAt: expiry
    };
  }

  async function approve(user: UserRow) {
    const teamName = user.profile?.companyName || `${user.email} Team`;
    setSavingUserId(user.id);
    setError(null);
    try {
      await apiRequest(`/admin/users/${user.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          teamName,
          employeeNo: employeeNo[user.id] || undefined,
          reviewNotes: reviewNotes[user.id] || "审核通过",
          ...accessPayload(user)
        })
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败");
    } finally {
      setSavingUserId(null);
    }
  }

  async function saveAccess(user: UserRow) {
    setSavingUserId(user.id);
    setError(null);
    try {
      const payload = accessPayload(user);
      await apiRequest(`/admin/users/${user.id}/access`, {
        method: "PATCH",
        body: JSON.stringify({
          accessExpiresAt: payload.accessExpiresAt,
          maxTeamCount: payload.maxTeamCount,
          reason: reviewNotes[user.id] || "后台调整开通配置"
        })
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "开通配置保存失败");
    } finally {
      setSavingUserId(null);
    }
  }

  async function reject(user: UserRow) {
    setSavingUserId(user.id);
    setError(null);
    try {
      await apiRequest(`/admin/users/${user.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes: reviewNotes[user.id] || "资料不完整" })
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "驳回失败");
    } finally {
      setSavingUserId(null);
    }
  }

  async function changeStatus(user: UserRow, action: "enable" | "disable" | "suspend" | "unlock") {
    setSavingUserId(user.id);
    setError(null);
    try {
      await apiRequest(`/admin/users/${user.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: reviewNotes[user.id] || "后台操作" })
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "状态更新失败");
    } finally {
      setSavingUserId(null);
    }
  }

  function renderActions(user: UserRow) {
    const saving = savingUserId === user.id;

    if (user.status === "PENDING_REVIEW") {
      return (
        <div className="row-actions nowrap">
          <button className="button primary" disabled={saving} onClick={() => void approve(user)} type="button">
            {saving ? "处理中" : "通过"}
          </button>
          <button className="button danger" disabled={saving} onClick={() => void reject(user)} type="button">
            驳回
          </button>
        </div>
      );
    }

    if (user.status === "ACTIVE") {
      return (
        <div className="row-actions nowrap">
          <button className="button primary" disabled={saving} onClick={() => void saveAccess(user)} type="button">
            保存开通
          </button>
          <button className="button secondary" disabled={saving} onClick={() => void changeStatus(user, "suspend")} type="button">
            暂停
          </button>
          <button className="button danger" disabled={saving} onClick={() => void changeStatus(user, "disable")} type="button">
            禁用
          </button>
        </div>
      );
    }

    if (user.status === "LOCKED") {
      return (
        <button className="button primary" disabled={saving} onClick={() => void changeStatus(user, "unlock")} type="button">
          解锁
        </button>
      );
    }

    return (
      <button className="button primary" disabled={saving} onClick={() => void changeStatus(user, "enable")} type="button">
        启用
      </button>
    );
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <AdminShell
      title="系统用户"
      description="审核注册申请，维护用户开通状态、到期时间和团队管理额度。"
      actions={
        <button className="button secondary" onClick={loadUsers} type="button">
          刷新
        </button>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>全部用户</span>
          <strong>{users.length}</strong>
        </div>
        <div className="metric">
          <span>待审核</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric">
          <span>已开通</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="metric">
          <span>已到期</span>
          <strong>{expiredCount}</strong>
        </div>
        <div className="metric">
          <span>异常状态</span>
          <strong>{blockedCount}</strong>
        </div>
      </section>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="statusFilter">状态筛选</label>
          <select id="statusFilter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="table-panel admin-user-table-panel">
        <table className="admin-user-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>公司/团队</th>
              <th>账号额度</th>
              <th>开通到期</th>
              <th>状态</th>
              <th>联系方式</th>
              <th>开通配置</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const team = firstTeam(user);
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.profile?.name ?? "-"}</strong>
                    <br />
                    <span className="muted">{user.email}</span>
                  </td>
                  <td>
                    <strong>{team?.name ?? user.profile?.companyName ?? "-"}</strong>
                    <br />
                    <span className="muted">{userRole(user)}</span>
                  </td>
                  <td>
                    <strong>{user._count?.ownedTeams ?? user.ownedTeams?.length ?? 0}</strong>
                    <span className="muted"> / {user.maxTeamCount ?? 1} 团队</span>
                    <br />
                    <span className="muted">员工号 {user._count?.employeeAccounts ?? user.employeeAccounts?.length ?? 0}</span>
                  </td>
                  <td>
                    <span className={isExpired(user.accessExpiresAt) ? "pill danger" : "pill success"}>
                      {formatDate(user.accessExpiresAt)}
                    </span>
                  </td>
                  <td>
                    <span className={statusClass(user.status)}>{statusLabels[user.status] ?? user.status}</span>
                  </td>
                  <td>{user.profile?.phone ?? "-"}</td>
                  <td>
                    <div className="inline-fields access-fields">
                      {user.status === "PENDING_REVIEW" ? (
                        <input
                          onChange={(event) =>
                            setEmployeeNo((value) => ({ ...value, [user.id]: event.target.value }))
                          }
                          placeholder="员工号"
                          value={employeeNo[user.id] ?? ""}
                        />
                      ) : null}
                      <input
                        aria-label="开通到期"
                        onChange={(event) =>
                          setAccessExpiresAt((value) => ({ ...value, [user.id]: event.target.value }))
                        }
                        type="date"
                        value={currentAccessDate(user)}
                      />
                      <input
                        aria-label="团队额度"
                        min={1}
                        onChange={(event) =>
                          setMaxTeamCount((value) => ({ ...value, [user.id]: event.target.value }))
                        }
                        type="number"
                        value={currentMaxTeamCount(user)}
                      />
                      <input
                        onChange={(event) =>
                          setReviewNotes((value) => ({ ...value, [user.id]: event.target.value }))
                        }
                        placeholder="备注/原因"
                        value={reviewNotes[user.id] ?? ""}
                      />
                    </div>
                  </td>
                  <td>{formatDateTime(user.createdAt)}</td>
                  <td>{renderActions(user)}</td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && !loading ? (
              <tr>
                <td colSpan={9}>暂无用户</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
