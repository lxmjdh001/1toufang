"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type AdAccountRow = {
  id: string;
  platform: "META" | "TIKTOK";
  externalId: string;
  name: string;
  currency?: string | null;
  timezone?: string | null;
  status?: string | null;
  balance?: string | number | null;
  createdAt: string;
  updatedAt: string;
};

type SyncResult = {
  integrations: number;
  adAccounts: number;
  assets: number;
  errors: Array<{ platform: string; integrationId: string; message: string }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatAmount(value?: string | number | null) {
  if (value == null || value === "") return "-";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function platformLabel(platform: AdAccountRow["platform"]) {
  return platform === "META" ? "Facebook" : "TikTok";
}

function statusLabel(status?: string | null) {
  if (!status) return "-";
  const labels: Record<string, string> = {
    active: "激活",
    synced: "已同步",
    manual: "手动",
    pending: "待同步",
    sync_pending: "待同步",
    disabled: "停用",
    closed: "关闭"
  };
  return labels[status] ?? status;
}

function statusClass(status?: string | null) {
  if (!status) return "pill";
  if (["active", "synced"].includes(status)) return "pill success";
  if (["manual"].includes(status)) return "pill info";
  if (["pending", "sync_pending"].includes(status)) return "pill warning";
  if (["disabled", "closed", "suspended"].includes(status)) return "pill danger";
  return "pill";
}

export default function AdAccountsPage() {
  const [rows, setRows] = useState<AdAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const metaCount = useMemo(() => rows.filter((row) => row.platform === "META").length, [rows]);
  const tiktokCount = rows.length - metaCount;
  const syncedCount = useMemo(() => rows.filter((row) => row.status === "synced" || row.status === "active").length, [rows]);
  const manualCount = useMemo(() => rows.filter((row) => row.status === "manual").length, [rows]);
  const statusOptions = useMemo(() => Array.from(new Set(rows.flatMap((row) => (row.status ? [row.status] : [])))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesPlatform = !platformFilter || row.platform === platformFilter;
      const matchesStatus = !statusFilter || row.status === statusFilter;
      const matchesSearch =
        !normalized ||
        [row.name, row.externalId, row.currency, row.timezone, row.status, platformLabel(row.platform)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized));
      return matchesPlatform && matchesStatus && matchesSearch;
    });
  }, [platformFilter, rows, searchTerm, statusFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiRequest<AdAccountRow[]>("/ad-accounts"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载广告账户失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/ad-accounts/manual", {
        method: "POST",
        body: JSON.stringify({
          platform: form.get("platform"),
          externalId: form.get("externalId"),
          name: form.get("name"),
          currency: form.get("currency") || undefined,
          timezone: form.get("timezone") || undefined
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建广告账户失败");
    } finally {
      setSaving(false);
    }
  }

  async function syncAll() {
    setSyncingAll(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<SyncResult>("/platform-assets/sync", { method: "POST" });
      setNotice(
        `已同步 ${result.integrations} 个授权连接，更新 ${result.adAccounts} 个广告账户、${result.assets} 个渠道资产${
          result.errors.length ? `；${result.errors.length} 个连接同步失败` : ""
        }`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步官方资产失败");
    } finally {
      setSyncingAll(false);
    }
  }

  async function sync(id: string) {
    setError(null);
    try {
      await apiRequest(`/ad-accounts/${id}/sync`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步广告账户失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="广告账户"
      description="维护 Meta 和 TikTok 广告账户资产，用于后续投放创建、同步和数据看板。"
      actions={
        <div className="button-row">
          <button className="button primary" disabled={syncingAll} onClick={() => void syncAll()} type="button">
            {syncingAll ? "同步中..." : "同步官方资产"}
          </button>
          <button className="button secondary" onClick={() => setShowCreate((current) => !current)} type="button">
            {showCreate ? "收起新增" : "新增账户"}
          </button>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="ad-account-summary" aria-label="广告账户概览">
        <span className="ad-account-summary-item active">
          全部 <strong>{rows.length}</strong>
        </span>
        <span className="ad-account-summary-item">
          Facebook <strong>{metaCount}</strong>
        </span>
        <span className="ad-account-summary-item">
          TikTok <strong>{tiktokCount}</strong>
        </span>
        <span className="ad-account-summary-item">
          已同步 <strong>{syncedCount}</strong>
        </span>
        <span className="ad-account-summary-item">
          手动 <strong>{manualCount}</strong>
        </span>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      {showCreate ? (
        <form className="panel form ad-account-create-panel" onSubmit={onSubmit}>
          <div className="panel-heading">
            <div>
              <h2>新增广告账户</h2>
              <p>把可投放的广告账户纳入资产池。</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="platform">平台</label>
              <select id="platform" name="platform" required>
                <option value="META">Facebook</option>
                <option value="TIKTOK">TikTok</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="externalId">广告账户 ID</label>
              <input id="externalId" name="externalId" required />
            </div>
            <div className="field">
              <label htmlFor="name">名称</label>
              <input id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="currency">币种</label>
              <input id="currency" name="currency" placeholder="USD" />
            </div>
            <div className="field">
              <label htmlFor="timezone">时区</label>
              <input id="timezone" name="timezone" placeholder="Asia/Shanghai" />
            </div>
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : "保存广告账户"}
            </button>
          </div>
        </form>
      ) : null}

      <section className="panel ad-account-filter-panel">
        <div className="field compact-field ad-account-search-field">
          <label htmlFor="adAccountSearch">搜索</label>
          <input
            id="adAccountSearch"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="名称 / 广告账户 ID / 币种 / 时区"
            value={searchTerm}
          />
        </div>
        <div className="field compact-field">
          <label htmlFor="adAccountPlatformFilter">平台</label>
          <select id="adAccountPlatformFilter" onChange={(event) => setPlatformFilter(event.target.value)} value={platformFilter}>
            <option value="">全部平台</option>
            <option value="META">Facebook</option>
            <option value="TIKTOK">TikTok</option>
          </select>
        </div>
        <div className="field compact-field">
          <label htmlFor="adAccountStatusFilter">状态</label>
          <select id="adAccountStatusFilter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="">全部状态</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="table-panel ad-account-table-panel">
        <table className="ad-account-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>平台</th>
              <th>广告账户 ID</th>
              <th>币种</th>
              <th>余额</th>
              <th>时区</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="ad-account-name">{row.name}</div>
                </td>
                <td>
                  <span className={row.platform === "META" ? "pill info" : "pill"}>{platformLabel(row.platform)}</span>
                </td>
                <td>{row.externalId}</td>
                <td>{row.currency ?? "-"}</td>
                <td>{formatAmount(row.balance)}</td>
                <td>{row.timezone ?? "-"}</td>
                <td>
                  <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
                </td>
                <td>{formatDate(row.updatedAt ?? row.createdAt)}</td>
                <td>
                  <button className="button secondary tiny-button" onClick={() => void sync(row.id)} type="button">
                    同步
                  </button>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && !loading ? (
              <tr>
                <td colSpan={9}>暂无广告账户</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
