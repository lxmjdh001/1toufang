"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";

type InventoryState = {
  users: number | string;
  pending: number | string;
  integrations: number | string;
  adAccounts: number | string;
  campaigns: number | string;
  mediaAssets: number | string;
  copywritings: number | string;
  creatives: number | string;
};

type Metric = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
};

type SeriesRow = Metric & {
  date: string;
};

type PlatformMetric = Metric & {
  platform: Platform;
};

type AccountMetric = Metric & {
  id: string;
  name: string;
  platform: Platform;
};

type CampaignMetric = Metric & {
  id: string;
  name: string;
  platform: Platform;
  status: string;
};

type SyncRun = {
  id: string;
  platform?: Platform | null;
  adAccountName?: string | null;
  source: string;
  status: string;
  message?: string | null;
  rangeStart: string;
  rangeEnd: string;
  startedAt: string;
  finishedAt?: string | null;
};

type ReportOverview = {
  range: {
    startDate: string;
    endDate: string;
  };
  totals: Metric;
  series: SeriesRow[];
  platformBreakdown: PlatformMetric[];
  accountRanking: AccountMetric[];
  campaignRanking: CampaignMetric[];
  latestSyncRuns: SyncRun[];
};

const emptyInventory: InventoryState = {
  users: "-",
  pending: "-",
  integrations: "-",
  adAccounts: "-",
  campaigns: "-",
  mediaAssets: "-",
  copywritings: "-",
  creatives: "-"
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency"
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

function statusClass(status: string) {
  if (status === "SUCCEEDED") return "pill success";
  if (status === "FAILED") return "pill danger";
  return "pill warning";
}

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(() => dateKey(addDays(today, -6)));
  const [endDate, setEndDate] = useState(() => dateKey(today));
  const [inventory, setInventory] = useState<InventoryState>(emptyInventory);
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxDailySpend = Math.max(...(overview?.series.map((row) => row.spend) ?? [0]), 1);
  const maxPlatformSpend = Math.max(...(overview?.platformBreakdown.map((row) => row.spend) ?? [0]), 1);

  async function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ startDate, endDate });

    const [report, users, pending, integrations, adAccounts, campaigns, mediaAssets, copywritings, creatives] =
      await Promise.allSettled([
        apiRequest<ReportOverview>(`/reports/overview?${params.toString()}`),
        apiRequest<unknown[]>("/admin/users"),
        apiRequest<unknown[]>("/admin/users/pending"),
        apiRequest<unknown[]>("/integrations"),
        apiRequest<unknown[]>("/ad-accounts"),
        apiRequest<unknown[]>("/campaigns"),
        apiRequest<unknown[]>("/media-assets"),
        apiRequest<unknown[]>("/copywritings"),
        apiRequest<unknown[]>("/creatives")
      ]);

    if (report.status === "fulfilled") {
      setOverview(report.value);
    } else {
      setOverview(null);
      setError(report.reason instanceof Error ? report.reason.message : "加载报表数据失败");
    }

    setInventory({
      users: users.status === "fulfilled" ? users.value.length : "-",
      pending: pending.status === "fulfilled" ? pending.value.length : "-",
      integrations: integrations.status === "fulfilled" ? integrations.value.length : "-",
      adAccounts: adAccounts.status === "fulfilled" ? adAccounts.value.length : "-",
      campaigns: campaigns.status === "fulfilled" ? campaigns.value.length : "-",
      mediaAssets: mediaAssets.status === "fulfilled" ? mediaAssets.value.length : "-",
      copywritings: copywritings.status === "fulfilled" ? copywritings.value.length : "-",
      creatives: creatives.status === "fulfilled" ? creatives.value.length : "-"
    });
    setLoading(false);
  }

  async function syncDryRun() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const run = await apiRequest<SyncRun>("/reports/sync/dry-run", {
        method: "POST",
        body: JSON.stringify({ startDate, endDate })
      });
      setNotice(run.message ?? "报表同步完成");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "报表同步失败");
    } finally {
      setSyncing(false);
    }
  }

  async function syncOfficial() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const run = await apiRequest<SyncRun>("/reports/sync", {
        method: "POST",
        body: JSON.stringify({ startDate, endDate })
      });
      if (run.status === "FAILED") {
        setError(run.message ?? "官方报表同步失败");
      } else {
        setNotice(run.message ?? "官方报表同步完成");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "官方报表同步失败");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="数据看板"
      description="核心投放表现、账户资产和同步状态。"
      actions={
        <div className="dashboard-actions">
          <label>
            开始
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            结束
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
          <button className="button primary" disabled={syncing} onClick={syncOfficial} type="button">
            {syncing ? "同步中..." : "同步官方数据"}
          </button>
          <button className="button secondary" disabled={syncing} onClick={syncDryRun} type="button">
            演示数据
          </button>
        </div>
      }
    >
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="metric-grid">
        <div className="metric">
          <span>总消耗</span>
          <strong>{overview ? formatCurrency(overview.totals.spend) : loading ? "..." : "-"}</strong>
        </div>
        <div className="metric">
          <span>曝光</span>
          <strong>{overview ? formatNumber(overview.totals.impressions) : loading ? "..." : "-"}</strong>
        </div>
        <div className="metric">
          <span>点击</span>
          <strong>{overview ? formatNumber(overview.totals.clicks) : loading ? "..." : "-"}</strong>
        </div>
        <div className="metric">
          <span>转化</span>
          <strong>{overview ? formatNumber(overview.totals.conversions) : loading ? "..." : "-"}</strong>
        </div>
        <div className="metric">
          <span>CTR</span>
          <strong>{overview ? formatPercent(overview.totals.ctr) : loading ? "..." : "-"}</strong>
        </div>
        <div className="metric">
          <span>CPC</span>
          <strong>{overview ? formatCurrency(overview.totals.cpc) : loading ? "..." : "-"}</strong>
        </div>
        <div className="metric">
          <span>CPA</span>
          <strong>{overview ? formatCurrency(overview.totals.cpa) : loading ? "..." : "-"}</strong>
        </div>
        <div className="metric">
          <span>ROAS</span>
          <strong>{overview ? overview.totals.roas.toFixed(2) : loading ? "..." : "-"}</strong>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel dashboard-panel">
          <div className="panel-heading">
            <h2>消耗趋势</h2>
            <span className="muted">
              {overview?.range.startDate ?? startDate} - {overview?.range.endDate ?? endDate}
            </span>
          </div>
          <div className="mini-chart">
            {overview?.series.length ? (
              overview.series.map((row) => (
                <div className="bar-row" key={row.date}>
                  <span>{row.date.slice(5)}</span>
                  <div className="bar-track">
                    <i style={{ width: `${Math.max((row.spend / maxDailySpend) * 100, row.spend ? 4 : 0)}%` }} />
                  </div>
                  <strong>{formatCurrency(row.spend)}</strong>
                </div>
              ))
            ) : (
              <div className="empty-state">暂无报表数据</div>
            )}
          </div>
        </div>

        <div className="panel dashboard-panel">
          <div className="panel-heading">
            <h2>平台占比</h2>
            <span className="muted">Meta / TikTok</span>
          </div>
          <div className="mini-chart">
            {overview?.platformBreakdown.length ? (
              overview.platformBreakdown.map((row) => (
                <div className="bar-row" key={row.platform}>
                  <span>{row.platform}</span>
                  <div className="bar-track accent">
                    <i style={{ width: `${Math.max((row.spend / maxPlatformSpend) * 100, row.spend ? 4 : 0)}%` }} />
                  </div>
                  <strong>{formatCurrency(row.spend)}</strong>
                </div>
              ))
            ) : (
              <div className="empty-state">暂无平台数据</div>
            )}
          </div>
        </div>
      </section>

      <section className="metric-grid compact-metrics">
        <div className="metric">
          <span>用户</span>
          <strong>{inventory.users}</strong>
        </div>
        <div className="metric">
          <span>待审核</span>
          <strong>{inventory.pending}</strong>
        </div>
        <div className="metric">
          <span>渠道连接</span>
          <strong>{inventory.integrations}</strong>
        </div>
        <div className="metric">
          <span>广告账户</span>
          <strong>{inventory.adAccounts}</strong>
        </div>
        <div className="metric">
          <span>Campaign</span>
          <strong>{inventory.campaigns}</strong>
        </div>
        <div className="metric">
          <span>素材</span>
          <strong>{inventory.mediaAssets}</strong>
        </div>
        <div className="metric">
          <span>文案</span>
          <strong>{inventory.copywritings}</strong>
        </div>
        <div className="metric">
          <span>创意</span>
          <strong>{inventory.creatives}</strong>
        </div>
      </section>

      <section className="split-grid">
        <div className="table-panel">
          <div className="table-header">
            <h2>账户消耗排行</h2>
            <span className="muted">按消耗降序</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>账户</th>
                <th>平台</th>
                <th>消耗</th>
                <th>点击</th>
                <th>转化</th>
                <th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {overview?.accountRanking.length ? (
                overview.accountRanking.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.platform}</td>
                    <td>{formatCurrency(row.spend)}</td>
                    <td>{formatNumber(row.clicks)}</td>
                    <td>{formatNumber(row.conversions)}</td>
                    <td>{row.roas.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>暂无账户排行</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-panel">
          <div className="table-header">
            <h2>Campaign 表现排行</h2>
            <span className="muted">按消耗降序</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>平台</th>
                <th>状态</th>
                <th>消耗</th>
                <th>CPA</th>
                <th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {overview?.campaignRanking.length ? (
                overview.campaignRanking.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.platform}</td>
                    <td>
                      <span className="pill">{row.status}</span>
                    </td>
                    <td>{formatCurrency(row.spend)}</td>
                    <td>{formatCurrency(row.cpa)}</td>
                    <td>{row.roas.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>暂无 Campaign 排行</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-header">
          <h2>最近同步</h2>
          <span className="muted">官方 API 接入后会显示真实同步任务</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>来源</th>
              <th>平台</th>
              <th>账户</th>
              <th>状态</th>
              <th>区间</th>
              <th>完成时间</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {overview?.latestSyncRuns.length ? (
              overview.latestSyncRuns.map((row) => (
                <tr key={row.id}>
                  <td>{row.source}</td>
                  <td>{row.platform ?? "ALL"}</td>
                  <td>{row.adAccountName ?? "-"}</td>
                  <td>
                    <span className={statusClass(row.status)}>{row.status}</span>
                  </td>
                  <td>
                    {row.rangeStart} - {row.rangeEnd}
                  </td>
                  <td>{formatDateTime(row.finishedAt ?? row.startedAt)}</td>
                  <td>{row.message ?? "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>暂无同步记录</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
