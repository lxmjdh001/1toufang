"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type UserRow = {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  profile?: {
    name?: string;
    companyName?: string;
    phone?: string;
  } | null;
  employeeAccounts?: Array<{
    employeeNo: string;
    status: string;
    team?: { name: string } | null;
    role?: { name: string } | null;
  }>;
  teamMemberships?: Array<{
    team?: { name: string } | null;
    role?: { name: string } | null;
  }>;
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
  { label: "已驳回", value: "REJECTED" },
  { label: "异常状态", value: "BLOCKED" }
];

function statusClass(status: string) {
  if (status === "ACTIVE") return "pill success";
  if (status === "PENDING_REVIEW") return "pill warning";
  if (["REJECTED", "SUSPENDED", "DISABLED", "LOCKED"].includes(status)) return "pill danger";
  return "pill";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeNo, setEmployeeNo] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const pendingCount = useMemo(
    () => users.filter((user) => user.status === "PENDING_REVIEW").length,
    [users]
  );
  const activeCount = useMemo(() => users.filter((user) => user.status === "ACTIVE").length, [users]);
  const blockedCount = useMemo(
    () => users.filter((user) => ["SUSPENDED", "DISABLED", "LOCKED"].includes(user.status)).length,
    [users]
  );
  const filteredUsers = useMemo(() => {
    if (statusFilter === "ALL") return users;
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

  async function approve(user: UserRow) {
    const teamName = user.profile?.companyName || `${user.email} Team`;
    setError(null);
    try {
      await apiRequest(`/admin/users/${user.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          teamName,
          employeeNo: employeeNo[user.id] || undefined,
          reviewNotes: reviewNotes[user.id] || "审核通过"
        })
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核失败");
    }
  }

  async function reject(user: UserRow) {
    setError(null);
    try {
      await apiRequest(`/admin/users/${user.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes: reviewNotes[user.id] || "资料不完整" })
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "驳回失败");
    }
  }

  async function changeStatus(user: UserRow, action: "enable" | "disable" | "suspend" | "unlock") {
    setError(null);
    try {
      await apiRequest(`/admin/users/${user.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: reviewNotes[user.id] || "后台操作" })
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "状态更新失败");
    }
  }

  function userTeam(user: UserRow) {
    return (
      user.employeeAccounts?.[0]?.team?.name ??
      user.teamMemberships?.[0]?.team?.name ??
      user.profile?.companyName ??
      "-"
    );
  }

  function userRole(user: UserRow) {
    return user.employeeAccounts?.[0]?.role?.name ?? user.teamMemberships?.[0]?.role?.name ?? "-";
  }

  function renderActions(user: UserRow) {
    if (user.status === "PENDING_REVIEW") {
      return (
        <div className="button-row">
          <button className="button primary" onClick={() => void approve(user)} type="button">
            通过
          </button>
          <button className="button danger" onClick={() => void reject(user)} type="button">
            驳回
          </button>
        </div>
      );
    }

    if (user.status === "ACTIVE") {
      return (
        <div className="button-row">
          <button className="button secondary" onClick={() => void changeStatus(user, "suspend")} type="button">
            暂停
          </button>
          <button className="button danger" onClick={() => void changeStatus(user, "disable")} type="button">
            禁用
          </button>
        </div>
      );
    }

    if (user.status === "LOCKED") {
      return (
        <button className="button primary" onClick={() => void changeStatus(user, "unlock")} type="button">
          解锁
        </button>
      );
    }

    return (
      <button className="button primary" onClick={() => void changeStatus(user, "enable")} type="button">
        启用
      </button>
    );
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <AdminShell
      title="用户审核"
      description="注册申请必须由管理员审核开通；开通后用户才能正式进入中后台。"
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

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>申请人</th>
              <th>团队/角色</th>
              <th>员工号</th>
              <th>状态</th>
              <th>联系方式</th>
              <th>审核配置</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.profile?.name ?? "-"}</strong>
                  <br />
                  <span className="muted">{user.email}</span>
                </td>
                <td>
                  <strong>{userTeam(user)}</strong>
                  <br />
                  <span className="muted">{userRole(user)}</span>
                </td>
                <td>{user.employeeAccounts?.[0]?.employeeNo ?? "-"}</td>
                <td>
                  <span className={statusClass(user.status)}>{statusLabels[user.status] ?? user.status}</span>
                </td>
                <td>{user.profile?.phone ?? "-"}</td>
                <td>
                  <div className="inline-fields">
                    <input
                      disabled={user.status !== "PENDING_REVIEW"}
                      onChange={(event) =>
                        setEmployeeNo((value) => ({ ...value, [user.id]: event.target.value }))
                      }
                      placeholder="开通员工号"
                      value={employeeNo[user.id] ?? ""}
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
                <td>{formatDate(user.createdAt)}</td>
                <td>{renderActions(user)}</td>
              </tr>
            ))}
            {filteredUsers.length === 0 && !loading ? (
              <tr>
                <td colSpan={8}>暂无用户</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
