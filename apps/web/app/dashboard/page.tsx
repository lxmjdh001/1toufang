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

type DashboardSnapshot = {
  range: {
    startDate: string;
    endDate: string;
  };
  wallet: {
    balance: number;
    currency: string;
    status: string;
    note?: string;
  };
  adAccountBalance: {
    balance: number;
    currency: string;
    accountCount: number;
    lastSyncedAt?: string | null;
  };
  adAccountSpend: Metric & {
    currency: string;
    source: string;
  };
  visitors: {
    total: number;
    status: string;
    note?: string;
    series: Array<{ date: string; visitors: number }>;
  };
  spendSeries: SeriesRow[];
  aiLogs: Array<{
    id: string;
    title: string;
    message: string;
    status: "info" | "success" | "warning" | "danger" | string;
    action: string;
    createdAt: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    severity: "info" | "success" | "warning" | "danger" | string;
    actionHref?: string | null;
    createdAt: string;
  }>;
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

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("zh-CN", {
    currency,
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
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spendSeries = dashboard?.spendSeries.length ? dashboard.spendSeries : (overview?.series ?? []);
  const maxDailySpend = Math.max(...(spendSeries.map((row) => row.spend) ?? [0]), 1);
  const maxPlatformSpend = Math.max(...(overview?.platformBreakdown.map((row) => row.spend) ?? [0]), 1);

  async function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ startDate, endDate });

    const [report, dashboardPanel, users, pending, integrations, adAccounts, campaigns, mediaAssets, copywritings, creatives] =
      await Promise.allSettled([
        apiRequest<ReportOverview>(`/reports/overview?${params.toString()}`),
        apiRequest<DashboardSnapshot>(`/reports/dashboard?${params.toString()}`),
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

    if (dashboardPanel.status === "fulfilled") {
      setDashboard(dashboardPanel.value);
    } else {
      setDashboard(null);
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
          <a className="button primary" href="/integrations?platform=META">
            连接 Facebook
          </a>
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

      <section className="metric-grid control-metrics dashboard-metrics">
        <div className="metric metric-strong">
          <span>钱包余额</span>
          <strong>{dashboard ? formatCurrency(dashboard.wallet.balance, dashboard.wallet.currency) : loading ? "..." : "-"}</strong>
          <small>{dashboard?.wallet.status === "not_configured" ? "账务模块未配置" : "可用余额"}</small>
        </div>
        <div className="metric">
          <span>广告户余额</span>
          <strong>
            {dashboard
              ? formatCurrency(dashboard.adAccountBalance.balance, dashboard.adAccountBalance.currency)
              : loading
                ? "..."
                : "-"}
          </strong>
          <small>{dashboard ? `${dashboard.adAccountBalance.accountCount} 个广告账户` : "官方账户余额"}</small>
        </div>
        <div className="metric">
          <span>广告户消耗</span>
          <strong>
            {dashboard
              ? formatCurrency(dashboard.adAccountSpend.spend, dashboard.adAccountSpend.currency)
              : loading
                ? "..."
                : "-"}
          </strong>
          <small>
            {dashboard?.range.startDate ?? startDate} - {dashboard?.range.endDate ?? endDate}
          </small>
        </div>
        <div className="metric">
          <span>访客总数</span>
          <strong>{dashboard ? formatNumber(dashboard.visitors.total) : loading ? "..." : "-"}</strong>
          <small>{dashboard?.visitors.status === "tracking_not_configured" ? "埋点未接入" : "落地页访客"}</small>
        </div>
      </section>

      <section className="metric-grid dashboard-metrics">
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
            <h2>Spend Chart 消耗趋势</h2>
            <span className="muted">
              {dashboard?.range.startDate ?? overview?.range.startDate ?? startDate} -{" "}
              {dashboard?.range.endDate ?? overview?.range.endDate ?? endDate}
            </span>
          </div>
          <div className="mini-chart">
            {spendSeries.length ? (
              spendSeries.map((row) => (
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
            <div>
              <h2>AI 助手日志</h2>
              <p>先展示固定规则自动化、报表同步和发布链路日志，后续可接 AI 优化建议。</p>
            </div>
            <a className="button secondary" href="/strategies">
              固定模型
            </a>
          </div>
          <div className="ai-log-list" id="ai-logs">
            {dashboard?.aiLogs.length ? (
              dashboard.aiLogs.map((log) => (
                <div className="ai-log-item" key={log.id}>
                  <span className={`pill ${log.status}`}>{log.status}</span>
                  <div>
                    <strong>{log.title}</strong>
                    <small>{log.message}</small>
                  </div>
                  <time>{formatDateTime(log.createdAt)}</time>
                </div>
              ))
            ) : (
              <div className="empty-state compact-empty">
                <div>
                  <strong>没有 AI 助手日志</strong>
                  <span>当前先使用固定策略模板和规则自动化。</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="split-grid">
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

        <div className="panel dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>快捷入口</h2>
              <p>渠道连接、通知和访客统计状态。</p>
            </div>
            <a className="button primary" href="/integrations?platform=META">
              连接 Facebook
            </a>
          </div>
          <div className="quick-status-list">
            {dashboard?.notifications.length ? (
              dashboard.notifications.slice(0, 4).map((item) => (
                <a className={`quick-status-item ${item.severity}`} href={item.actionHref ?? "/dashboard"} key={item.id}>
                  <span className={`pill ${item.severity}`}>{item.severity}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.message}</small>
                  </div>
                </a>
              ))
            ) : (
              <div className="empty-state compact-empty">暂无通知</div>
            )}
          </div>
        </div>
      </section>

      <section className="metric-grid compact-metrics dashboard-metrics">
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
