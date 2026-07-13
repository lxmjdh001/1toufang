"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type ResourceTab = {
  key: string;
  label: string;
  count: number;
};

type FieldOption = {
  key: string;
  label: string;
};

type TikTokOverview = {
  accounts: number;
  businessCenters: number;
  advertisers: number;
  catalogs: number;
  feeds: number;
  products: number;
  apps: number;
  campaigns: number;
  tasks: number;
};

type TikTokResource = {
  id: string;
  type: string;
  name: string;
  externalId: string;
  status: string;
  currency?: string;
  timezone?: string;
  updatedAt?: string;
  metadata?: string;
};

type TikTokTask = {
  id: string;
  type: string;
  name: string;
  status: string;
  updatedAt: string;
};

type TikTokChannelResponse = {
  connected: boolean;
  overview: TikTokOverview;
  resourceTabs: ResourceTab[];
  resources: TikTokResource[];
  fieldOptions: FieldOption[];
  tasks: TikTokTask[];
  updatedAt: string;
};

type OAuthResponse = {
  configured: boolean;
  url: string;
};

type SyncResult = {
  integrations: number;
  adAccounts: number;
  assets: number;
  errors: Array<{ message: string }>;
};

const defaultFields = ["type", "name", "externalId", "status", "updatedAt"];

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

function formatNumber(value?: number) {
  return Intl.NumberFormat("zh-CN").format(Number(value ?? 0));
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("active") || normalized.includes("synced") || normalized.includes("succeeded")) return "pill success";
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("disabled")) return "pill danger";
  if (normalized.includes("pending") || normalized.includes("running")) return "pill warning";
  return "pill";
}

export default function TikTokChannelPage() {
  const [data, setData] = useState<TikTokChannelResponse | null>(null);
  const [resource, setResource] = useState("advertisers");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [visibleFields, setVisibleFields] = useState<string[]>(defaultFields);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overview = data?.overview;
  const resources = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.resources ?? []).filter((row) => {
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.externalId.toLowerCase().includes(keyword) ||
        row.type.toLowerCase().includes(keyword);
      const matchesStatus = !status || row.status === status;
      return matchesKeyword && matchesStatus;
    });
  }, [data?.resources, search, status]);

  const statusOptions = useMemo(
    () => Array.from(new Set((data?.resources ?? []).map((row) => row.status).filter(Boolean))).sort(),
    [data?.resources]
  );

  async function load(nextResource = resource) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("resource", nextResource);
      setData(await apiRequest<TikTokChannelResponse>(`/channels/tiktok?${params.toString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 TikTok 渠道失败");
    } finally {
      setLoading(false);
    }
  }

  async function connectTikTok() {
    setError(null);
    setNotice(null);
    try {
      const returnUrl = `${window.location.origin}/channels/tiktok`;
      const response = await apiRequest<OAuthResponse>(
        `/integrations/tiktok/oauth-url?returnUrl=${encodeURIComponent(returnUrl)}`
      );
      if (!response.configured) {
        setError("TikTok 开发者密钥未配置，请先到系统管理配置。");
        return;
      }
      window.location.href = response.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成 TikTok 授权链接失败");
    }
  }

  async function syncAssets() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<SyncResult>("/platform-assets/sync", { method: "POST" });
      setNotice(
        `已同步 ${result.integrations} 个授权连接，更新 ${result.adAccounts} 个广告账户、${result.assets} 个渠道资产${
          result.errors.length ? `；${result.errors.length} 个连接失败` : ""
        }`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步 TikTok 资源失败");
    } finally {
      setSyncing(false);
    }
  }

  function changeResource(nextResource: string) {
    setResource(nextResource);
    setSearch("");
    setStatus("");
    void load(nextResource);
  }

  function toggleField(key: string) {
    setVisibleFields((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      setNotice("TikTok 授权成功，连接已保存");
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (params.get("oauth") === "error") {
      setError(params.get("message") ?? "TikTok 授权失败");
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load();
  }, []);

  return (
    <AdminShell
      title="TikTok 渠道"
      description="管理 TikTok Accounts、Business Centers、Advertisers、Catalogs、Feeds、Products 和 Apps。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={() => void connectTikTok()} type="button">
            Connect TikTok
          </button>
          <button className="button secondary" disabled={syncing} onClick={() => void syncAssets()} type="button">
            {syncing ? "同步中..." : "同步资源"}
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>Accounts</span>
          <strong>{formatNumber(overview?.accounts)}</strong>
        </div>
        <div className="metric">
          <span>Advertisers</span>
          <strong>{formatNumber(overview?.advertisers)}</strong>
        </div>
        <div className="metric">
          <span>Catalog / Feed / Product</span>
          <strong>
            {formatNumber(overview?.catalogs)} / {formatNumber(overview?.feeds)} / {formatNumber(overview?.products)}
          </strong>
        </div>
        <div className="metric">
          <span>Apps / Tasks</span>
          <strong>
            {formatNumber(overview?.apps)} / {formatNumber(overview?.tasks)}
          </strong>
          <small>Campaign {formatNumber(overview?.campaigns)}</small>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="resource-tabs">
        {(data?.resourceTabs ?? []).map((tab) => (
          <button
            className={resource === tab.key ? "active" : ""}
            key={tab.key}
            onClick={() => changeResource(tab.key)}
            type="button"
          >
            <span>{tab.label}</span>
            <strong>{tab.count}</strong>
          </button>
        ))}
      </section>

      <section className="panel channel-filter-panel">
        <div className="panel-heading">
          <div>
            <h2>筛选与字段</h2>
            <p>切换资源模块后，可以按名称、ID、状态筛选，也可以控制表格展示字段。</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="resourceSearch">搜索</label>
            <input id="resourceSearch" onChange={(event) => setSearch(event.target.value)} value={search} />
          </div>
          <div className="field">
            <label htmlFor="resourceStatus">状态</label>
            <select id="resourceStatus" onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="">全部状态</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-toggle-list">
          {(data?.fieldOptions ?? []).map((field) => (
            <label key={field.key}>
              <input
                checked={visibleFields.includes(field.key)}
                onChange={() => toggleField(field.key)}
                type="checkbox"
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>资源状态</h2>
              <p>当前模块共有 {resources.length} 条资源。</p>
            </div>
          </div>
          <div className="quick-status-list">
            {resources.slice(0, 6).map((row) => (
              <div className="quick-status-item" key={`${row.type}:${row.id}`}>
                <span className={statusClass(row.status)}>{row.status}</span>
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.type} / {row.externalId}</small>
                </div>
              </div>
            ))}
            {resources.length === 0 && !loading ? <div className="empty-state compact-empty">暂无资源</div> : null}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>任务</h2>
              <p>发布任务和报表同步任务。</p>
            </div>
          </div>
          <div className="quick-status-list">
            {(data?.tasks ?? []).slice(0, 6).map((task) => (
              <div className="quick-status-item" key={task.id}>
                <span className={statusClass(task.status)}>{task.status}</span>
                <div>
                  <strong>{task.type}</strong>
                  <small>{task.name} / {formatDate(task.updatedAt)}</small>
                </div>
              </div>
            ))}
            {data?.tasks.length === 0 && !loading ? <div className="empty-state compact-empty">暂无任务</div> : null}
          </div>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-header">
          <div>
            <strong>{data?.resourceTabs.find((tab) => tab.key === resource)?.label ?? "资源"}</strong>
            <br />
            <span className="muted">字段切换已应用到当前表格</span>
          </div>
        </div>
        <table className="channel-resource-table">
          <thead>
            <tr>
              {visibleFields.includes("type") ? <th>类型</th> : null}
              {visibleFields.includes("name") ? <th>名称</th> : null}
              {visibleFields.includes("externalId") ? <th>外部 ID</th> : null}
              {visibleFields.includes("status") ? <th>状态</th> : null}
              {visibleFields.includes("currency") ? <th>币种</th> : null}
              {visibleFields.includes("timezone") ? <th>时区</th> : null}
              {visibleFields.includes("updatedAt") ? <th>更新时间</th> : null}
              {visibleFields.includes("metadata") ? <th>元数据</th> : null}
            </tr>
          </thead>
          <tbody>
            {resources.map((row) => (
              <tr key={`${row.type}:${row.id}`}>
                {visibleFields.includes("type") ? <td>{row.type}</td> : null}
                {visibleFields.includes("name") ? <td>{row.name}</td> : null}
                {visibleFields.includes("externalId") ? <td>{row.externalId}</td> : null}
                {visibleFields.includes("status") ? (
                  <td>
                    <span className={statusClass(row.status)}>{row.status}</span>
                  </td>
                ) : null}
                {visibleFields.includes("currency") ? <td>{row.currency ?? "-"}</td> : null}
                {visibleFields.includes("timezone") ? <td>{row.timezone ?? "-"}</td> : null}
                {visibleFields.includes("updatedAt") ? <td>{formatDate(row.updatedAt)}</td> : null}
                {visibleFields.includes("metadata") ? <td className="notes-cell">{row.metadata ?? "-"}</td> : null}
              </tr>
            ))}
            {resources.length === 0 && !loading ? (
              <tr>
                <td colSpan={Math.max(visibleFields.length, 1)}>暂无 TikTok 资源</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
