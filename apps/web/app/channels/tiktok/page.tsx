"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type ResourceTab = {
  key: string;
  label: string;
  count: number;
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

const resourceLabels: Record<string, string> = {
  accounts: "账号",
  business_centers: "商务中心",
  advertisers: "广告主",
  catalogs: "Catalog",
  feeds: "Feed",
  products: "商品",
  apps: "App"
};

const statusLabels: Record<string, string> = {
  active: "启用",
  manual: "手动",
  synced: "已同步",
  succeeded: "成功",
  failed: "失败",
  pending: "待处理",
  running: "运行中",
  disabled: "停用"
};

const resourcePageSizeOptions = [20, 50, 100];

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

function statusLabel(status?: string) {
  if (!status) return "-";
  return statusLabels[status.toLowerCase()] ?? status;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function TikTokChannelPageContent() {
  const searchParams = useSearchParams();
  const queryResource = searchParams.get("resource");
  const [data, setData] = useState<TikTokChannelResponse | null>(null);
  const [resource, setResource] = useState(() => {
    if (typeof window === "undefined") return "advertisers";
    return new URLSearchParams(window.location.search).get("resource") ?? "advertisers";
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [resourcePage, setResourcePage] = useState(1);
  const [resourcePageSize, setResourcePageSize] = useState(20);

  const overview = data?.overview;
  const activeResourceLabel = resourceLabels[resource] ?? data?.resourceTabs.find((tab) => tab.key === resource)?.label ?? "资源";
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
  const resourceTotal = resources.length;
  const resourcePageCount = Math.max(1, Math.ceil(resourceTotal / resourcePageSize));
  const currentResourcePage = Math.min(resourcePage, resourcePageCount);
  const resourceStartIndex = resourceTotal ? (currentResourcePage - 1) * resourcePageSize : 0;
  const resourceEndIndex = Math.min(resourceStartIndex + resourcePageSize, resourceTotal);
  const paginatedResources = resources.slice(resourceStartIndex, resourceEndIndex);
  const resourcePageNumbers = Array.from({ length: Math.min(resourcePageCount, 5) }, (_, index) => {
    const start = Math.min(Math.max(currentResourcePage - 2, 1), Math.max(resourcePageCount - 4, 1));
    return start + index;
  });

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
    setCopyNotice(null);
    try {
      const returnUrl = `${window.location.origin}/channels/tiktok`;
      const response = await apiRequest<OAuthResponse>(
        `/integrations/tiktok/oauth-url?returnUrl=${encodeURIComponent(returnUrl)}`
      );
      if (!response.configured) {
        setError("TikTok 开发者密钥未配置，请先到系统管理配置。");
        return;
      }
      setOauthUrl(response.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成 TikTok 授权链接失败");
    }
  }

  async function copyOAuthUrl() {
    if (!oauthUrl) return;
    try {
      await navigator.clipboard.writeText(oauthUrl);
      setCopyNotice("授权链接已复制");
    } catch {
      setCopyNotice("复制失败，请手动选中链接复制。");
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
    setResourcePage(1);
    void load(nextResource);
  }

  function changeResourcePageSize(nextPageSize: number) {
    setResourcePageSize(nextPageSize);
    setResourcePage(1);
  }

  function exportResources() {
    const headers = ["类型", "名称", "外部 ID", "状态", "币种", "时区", "更新时间", "元数据"];
    const rows = resources.map((row) =>
      [
        row.type,
        row.name,
        row.externalId,
        statusLabel(row.status),
        row.currency ?? "-",
        row.timezone ?? "-",
        formatDate(row.updatedAt),
        row.metadata ?? "-"
      ].map(csvCell)
    );
    downloadCsv(`tiktok-${resource}.csv`, [headers.map(csvCell), ...rows]);
  }

  useEffect(() => {
    setResourcePage((current) => Math.min(current, resourcePageCount));
  }, [resourcePageCount]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialResource = params.get("resource") ?? "advertisers";
    setResource(initialResource);
    if (params.get("oauth") === "success") {
      setNotice("TikTok 授权成功，连接已保存");
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (params.get("oauth") === "error") {
      setError(params.get("message") ?? "TikTok 授权失败");
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load(initialResource);
  }, []);

  useEffect(() => {
    if (!queryResource || queryResource === resource) return;
    setResource(queryResource);
    setSearch("");
    setStatus("");
    setResourcePage(1);
    void load(queryResource);
  }, [queryResource]);

  return (
    <AdminShell
      title="账户"
      breadcrumbs={[{ label: "Tiktok", href: "/channels/tiktok" }, { label: "Account", href: "/channels/tiktok?resource=accounts" }, { label: "列表" }]}
      actions={
        <button className="button primary" onClick={() => void connectTikTok()} type="button">Connect TikTok</button>
      }
    >
      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {oauthUrl ? (
        <div className="oauth-link-backdrop" role="presentation">
          <section aria-labelledby="tiktokOauthLinkTitle" className="oauth-link-modal" role="dialog">
            <div className="oauth-link-head">
              <h2 id="tiktokOauthLinkTitle">TikTok 授权</h2>
              <button aria-label="关闭授权链接" onClick={() => setOauthUrl(null)} type="button">
                ×
              </button>
            </div>
            <div className="field">
              <label htmlFor="tiktokOauthAuthorizationLink">授权链接</label>
              <input
                id="tiktokOauthAuthorizationLink"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={oauthUrl}
              />
            </div>
            {copyNotice ? <div className="notice success compact-notice">{copyNotice}</div> : null}
            <div className="button-row">
              <button className="button primary" onClick={() => void copyOAuthUrl()} type="button">
                复制授权链接
              </button>
              <a className="button secondary" href={oauthUrl} rel="noreferrer" target="_blank">
                打开授权页
              </a>
              <button className="button secondary" onClick={() => setOauthUrl(null)} type="button">
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="channel-toolbar peer-resource-toolbar" aria-label="TikTok 渠道筛选">
        <div className="channel-filter-strip">
          {showFilters ? (
            <label className="channel-resource-select compact-channel-select">
              <span>状态</span>
              <select
                onChange={(event) => {
                  setStatus(event.target.value);
                  setResourcePage(1);
                }}
                value={status}
              >
                <option value="">全部状态</option>
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="channel-search-field">
            <span>搜索</span>
            <input
              id="resourceSearch"
              onChange={(event) => {
                setSearch(event.target.value);
                setResourcePage(1);
              }}
              placeholder="名称 / ID / 类型"
              value={search}
            />
          </label>
          <button className="button secondary" onClick={() => setShowFilters((current) => !current)} type="button">
            筛选 {status ? 1 : 0}
          </button>
          <button className="button secondary" type="button">切换显示字段</button>
        </div>
      </section>

      <section className="table-panel channel-table-panel">
        <div className="table-header">
          <div>
            <strong>{activeResourceLabel}</strong>
            <br />
            <span className="muted">当前资源：{activeResourceLabel} / 任务 {formatNumber(data?.tasks.length)}</span>
          </div>
        </div>
        <div className="channel-table-scroll">
          <table className="channel-resource-table tiktok-resource-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th>外部 ID</th>
                <th>状态</th>
                <th>币种</th>
                <th>时区</th>
                <th>更新时间</th>
                <th>元数据</th>
              </tr>
            </thead>
            <tbody>
              {paginatedResources.map((row) => (
                <tr key={`${row.type}:${row.id}`}>
                  <td>{row.type}</td>
                  <td>
                    <div className="channel-name-cell">
                      <strong title={row.name}>{row.name}</strong>
                    </div>
                  </td>
                  <td>{row.externalId}</td>
                  <td>
                    <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
                  </td>
                  <td>{row.currency ?? "-"}</td>
                  <td>{row.timezone ?? "-"}</td>
                  <td>{formatDate(row.updatedAt)}</td>
                  <td className="notes-cell" title={row.metadata ?? "-"}>
                    {row.metadata ?? "-"}
                  </td>
                </tr>
              ))}
              {resources.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8}>没有 {activeResourceLabel}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            共 {formatNumber(resourceTotal)} 条，当前{" "}
            {resourceTotal ? `${formatNumber(resourceStartIndex + 1)}-${formatNumber(resourceEndIndex)}` : "0"} 条
          </span>
          <div className="pagination-controls">
            <label>
              每页
              <select
                onChange={(event) => changeResourcePageSize(Number(event.target.value))}
                value={resourcePageSize}
              >
                {resourcePageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              条
            </label>
            <button
              className="button secondary pagination-button"
              disabled={currentResourcePage <= 1}
              onClick={() => setResourcePage(1)}
              type="button"
            >
              首页
            </button>
            <button
              className="button secondary pagination-button"
              disabled={currentResourcePage <= 1}
              onClick={() => setResourcePage((page) => Math.max(1, page - 1))}
              type="button"
            >
              上一页
            </button>
            <div className="pagination-pages">
              {resourcePageNumbers.map((page) => (
                <button
                  className={`pagination-page ${page === currentResourcePage ? "active" : ""}`}
                  key={page}
                  onClick={() => setResourcePage(page)}
                  type="button"
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              className="button secondary pagination-button"
              disabled={currentResourcePage >= resourcePageCount}
              onClick={() => setResourcePage((page) => Math.min(resourcePageCount, page + 1))}
              type="button"
            >
              下一页
            </button>
            <button
              className="button secondary pagination-button"
              disabled={currentResourcePage >= resourcePageCount}
              onClick={() => setResourcePage(resourcePageCount)}
              type="button"
            >
              末页
            </button>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}

export default function TikTokChannelPage() {
  return (
    <Suspense fallback={<main className="admin-loading"><div className="brand">WzzAds</div><p>正在加载 TikTok...</p></main>}>
      <TikTokChannelPageContent />
    </Suspense>
  );
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob([`\ufeff${rows.map((row) => row.join(",")).join("\n")}`], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
