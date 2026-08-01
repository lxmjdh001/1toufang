"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type StatusKey = "all" | "active" | "idle" | "pending_recycle" | "blocked" | "problem" | "archived";

type StatusTab = {
  key: StatusKey;
  label: string;
  count: number;
};

type ResourceTab = {
  key: string;
  label: string;
  count: number;
};

type FacebookOverview = {
  walletBalance: number;
  accountBalance: number;
  totalSpend: number;
  spend: number;
  sealedRate: number;
  pendingRecycle: number;
  accounts: number;
};

type FacebookAccount = {
  id: string;
  name: string;
  accountId: string;
  user: string;
  billing: string;
  partner: string;
  currency: string;
  ads: number;
  idleDays: number;
  balance: number;
  totalSpend: number;
  spend: number;
  timezone: string;
  pixels: number;
  removedAds: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  rawStatus: string;
  statusView: StatusKey;
};

type ChannelResource = {
  id: string;
  type: string;
  name: string;
  externalId: string;
  status: string;
  updatedAt?: string;
  metadata?: string;
};

type ComplianceIssue = {
  id: string;
  accountId: string;
  name: string;
  severity: "warning" | "danger" | string;
  status: string;
  message: string;
  rawStatus: string;
};

type TransactionRow = {
  id: string;
  type: string;
  accountId: string;
  accountName: string;
  amount: number;
  currency: string;
  date: string;
  syncedAt: string;
};

type FacebookChannelResponse = {
  connected: boolean;
  overview: FacebookOverview;
  statusViews: StatusTab[];
  resourceTabs: ResourceTab[];
  accounts: FacebookAccount[];
  resources: ChannelResource[];
  complianceReport: ComplianceIssue[];
  pendingRecycle: FacebookAccount[];
  transactions: TransactionRow[];
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

type ActionResponse = {
  result?: {
    message?: string;
    status?: string;
    amount?: number;
  };
};

const resourceLabels: Record<string, string> = {
  ad_accounts: "广告账户",
  groups: "组",
  business_managers: "BM",
  accounts: "账号",
  pages: "主页",
  pixels: "像素",
  apps: "App",
  tasks: "任务",
  safety_rules: "安全规则",
  ad_account_users: "广告账户用户",
  transactions: "交易记录"
};

const statusLabels: Record<string, string> = {
  all: "全部",
  active: "激活",
  idle: "闲置",
  pending_recycle: "待回收",
  blocked: "封户",
  problem: "问题",
  archived: "存档",
  force_cleared: "已强清",
  switch_pending: "切换中",
  charge_recorded: "已记录充值",
  manual: "手动",
  synced: "已同步"
};

const accountActions: Array<{ action: string; label: string; danger?: boolean }> = [
  { action: "change_name", label: "改名" },
  { action: "edit", label: "编辑" },
  { action: "check_compliance", label: "查合规" },
  { action: "force_clear", label: "强清" },
  { action: "remove", label: "移除", danger: true },
  { action: "switch_facebook", label: "切换账号" },
  { action: "charge", label: "充值" }
];

function formatMoney(value?: number) {
  return Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(value ?? 0));
}

function formatNumber(value?: number) {
  return Intl.NumberFormat("zh-CN").format(Number(value ?? 0));
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

function statusClass(status: string) {
  if (status === "active") return "pill success";
  if (status === "blocked" || status === "problem") return "pill danger";
  if (status === "pending_recycle" || status === "idle") return "pill warning";
  return "pill";
}

function statusLabel(status?: string) {
  if (!status) return "-";
  return statusLabels[status] ?? status;
}

function accountActionLabel(action: string) {
  return accountActions.find((item) => item.action === action)?.label ?? action;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function FacebookChannelPage() {
  const [data, setData] = useState<FacebookChannelResponse | null>(null);
  const [status, setStatus] = useState<StatusKey>("all");
  const [resource, setResource] = useState("ad_accounts");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const overview = data?.overview;
  const accountRows = data?.accounts ?? [];
  const resources = data?.resources ?? [];
  const activeResourceLabel = resourceLabels[resource] ?? "资源";

  async function load(nextStatus = status, nextResource = resource) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", nextStatus);
      params.set("resource", nextResource);
      setData(await apiRequest<FacebookChannelResponse>(`/channels/facebook?${params.toString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Facebook 渠道失败");
    } finally {
      setLoading(false);
    }
  }

  async function connectFacebook() {
    setError(null);
    setNotice(null);
    setCopyNotice(null);
    try {
      const returnUrl = `${window.location.origin}/channels/facebook`;
      const response = await apiRequest<OAuthResponse>(
        `/integrations/meta/oauth-url?returnUrl=${encodeURIComponent(returnUrl)}`
      );
      if (!response.configured) {
        setError("Meta 开发者密钥未配置，请先到系统管理配置。");
        return;
      }
      setOauthUrl(response.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成 Facebook 授权链接失败");
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
      setError(err instanceof Error ? err.message : "同步 Facebook 资源失败");
    } finally {
      setSyncing(false);
    }
  }

  async function runAccountAction(account: FacebookAccount, action: string) {
    const body: Record<string, unknown> = { action };
    if (action === "change_name" || action === "edit") {
      const name = window.prompt("账户名称", account.name);
      if (name === null) return;
      body.name = name;
      if (action === "edit") {
        const nextStatus = window.prompt("状态", account.rawStatus);
        if (nextStatus !== null) body.status = nextStatus;
      }
    }
    if (action === "charge") {
      const amount = window.prompt("充值金额");
      if (amount === null) return;
      body.amount = Number(amount);
    }
    if ((action === "force_clear" || action === "remove") && !window.confirm("确认执行该账户动作？")) return;

    setBusyId(`${account.id}:${action}`);
    setError(null);
    setNotice(null);
    try {
      const response = await apiRequest<ActionResponse>(`/channels/facebook/accounts/${account.id}/action`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setNotice(response.result?.message ?? `操作已提交：${accountActionLabel(action)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "账户操作失败");
    } finally {
      setBusyId(null);
    }
  }

  function changeStatus(nextStatus: StatusKey) {
    setStatus(nextStatus);
    void load(nextStatus, resource);
  }

  function changeResource(nextResource: string) {
    setResource(nextResource);
    void load(status, nextResource);
  }

  function exportAccounts() {
    const headers = [
      "名称",
      "广告账户",
      "用户",
      "账单",
      "合作伙伴",
      "货币",
      "广告",
      "闲置",
      "余额",
      "总消耗",
      "消耗",
      "时区",
      "像素",
      "移除广告",
      "备注",
      "创建时间"
    ];
    const rows = accountRows.map((row) =>
      [
        row.name,
        row.accountId,
        row.user,
        row.billing,
        row.partner,
        row.currency,
        row.ads,
        row.idleDays,
        row.balance,
        row.totalSpend,
        row.spend,
        row.timezone,
        row.pixels,
        row.removedAds,
        row.notes,
        formatDate(row.createdAt)
      ].map(csvCell)
    );
    downloadCsv(`facebook-accounts-${status}.csv`, [headers.map(csvCell), ...rows]);
  }

  function downloadReport() {
    const headers = ["类型", "账户", "ID", "状态", "说明"];
    const complianceRows = (data?.complianceReport ?? []).map((row) =>
      ["Compliance", row.name, row.accountId, row.status, row.message].map(csvCell)
    );
    const transactionRows = (data?.transactions ?? []).map((row) =>
      ["Transaction", row.accountName, row.accountId, row.type, `${row.amount} ${row.currency}`].map(csvCell)
    );
    downloadCsv("facebook-channel-report.csv", [headers.map(csvCell), ...complianceRows, ...transactionRows]);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      setNotice("Facebook 授权成功，连接已保存");
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (params.get("oauth") === "error") {
      setError(params.get("message") ?? "Facebook 授权失败");
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load();
  }, []);

  return (
    <AdminShell
      title="Facebook 渠道"
      description="管理 Facebook 授权、广告账户、BM、主页、像素、合规监控与回收队列。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={() => void connectFacebook()} type="button">
            Facebook 授权
          </button>
          <button className="button secondary" disabled={syncing} onClick={() => void syncAssets()} type="button">
            {syncing ? "同步中..." : "同步资源"}
          </button>
          <button className="button secondary" onClick={downloadReport} type="button">
            下载报表
          </button>
          <button className="button secondary" onClick={exportAccounts} type="button">
            导出账户
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>钱包余额</span>
          <strong>{formatMoney(overview?.walletBalance)}</strong>
        </div>
        <div className="metric">
          <span>广告户余额</span>
          <strong>{formatMoney(overview?.accountBalance)}</strong>
        </div>
        <div className="metric">
          <span>广告户消耗</span>
          <strong>{formatMoney(overview?.spend)}</strong>
          <small>总消耗 {formatMoney(overview?.totalSpend)}</small>
        </div>
        <div className="metric">
          <span>封户率</span>
          <strong>{formatMoney(overview?.sealedRate)}%</strong>
          <small>待回收 {overview?.pendingRecycle ?? 0} / 账户 {overview?.accounts ?? 0}</small>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {oauthUrl ? (
        <div className="oauth-link-backdrop" role="presentation">
          <section aria-labelledby="facebookOauthLinkTitle" className="oauth-link-modal" role="dialog">
            <div className="oauth-link-head">
              <h2 id="facebookOauthLinkTitle">Facebook 授权</h2>
              <button aria-label="关闭授权链接" onClick={() => setOauthUrl(null)} type="button">
                ×
              </button>
            </div>
            <div className="field">
              <label htmlFor="facebookOauthAuthorizationLink">Authorization Link</label>
              <input
                id="facebookOauthAuthorizationLink"
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

      <section className="channel-toolbar facebook-channel-toolbar" aria-label="Facebook 渠道筛选">
        <div className="channel-tab-row">
          <div className="status-tabs channel-inline-status-tabs">
            {(data?.statusViews ?? []).map((tab) => (
              <button
                className={`status-tab ${status === tab.key ? "active" : ""}`}
                key={tab.key}
                onClick={() => changeStatus(tab.key)}
                type="button"
              >
                <span>{tab.label}</span>
                <strong>{tab.count}</strong>
              </button>
            ))}
          </div>
          <div className="resource-tabs channel-inline-resource-tabs">
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
          </div>
        </div>
      </section>

      <section className="table-panel channel-table-panel">
        <div className="table-header">
          <div>
            <strong>广告账户</strong>
            <br />
            <span className="muted">状态视图：{statusLabel(status)} / 当前资源：{activeResourceLabel}</span>
          </div>
        </div>
        <table className="channel-account-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>广告账户</th>
              <th>用户</th>
              <th>账单</th>
              <th>合作伙伴</th>
              <th>货币</th>
              <th>广告</th>
              <th>闲置</th>
              <th>余额</th>
              <th>总消耗</th>
              <th>消耗</th>
              <th>时区</th>
              <th>像素</th>
              <th>移除广告</th>
              <th>备注</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {accountRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="channel-name-cell">
                    <strong title={row.name}>{row.name}</strong>
                    <span className={statusClass(row.statusView)}>{statusLabel(row.statusView)}</span>
                  </div>
                </td>
                <td>{row.accountId}</td>
                <td>{row.user}</td>
                <td>{row.billing}</td>
                <td className="partner-cell">
                  <span title={row.partner}>{row.partner}</span>
                </td>
                <td>{row.currency}</td>
                <td>{formatNumber(row.ads)}</td>
                <td>{row.idleDays} 天</td>
                <td>{formatMoney(row.balance)}</td>
                <td>{formatMoney(row.totalSpend)}</td>
                <td>{formatMoney(row.spend)}</td>
                <td>{row.timezone}</td>
                <td>{formatNumber(row.pixels)}</td>
                <td>{formatNumber(row.removedAds)}</td>
                <td className="notes-cell" title={row.notes}>
                  {row.notes}
                </td>
                <td>{formatDate(row.createdAt)}</td>
                <td>
                  <div className="row-actions">
                    {accountActions.map(({ action, label, danger }) => (
                      <button
                        className={danger ? "button danger" : "button secondary"}
                        disabled={busyId === `${row.id}:${action}`}
                        key={action}
                        onClick={() => void runAccountAction(row, action)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {accountRows.length === 0 && !loading ? (
              <tr>
                <td colSpan={17}>暂无 Facebook 广告账户</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-panel">
        <div className="table-header">
          <div>
            <strong>{activeResourceLabel}</strong>
            <br />
            <span className="muted">当前资源子模块清单</span>
          </div>
        </div>
        <table className="channel-resource-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>名称</th>
              <th>外部 ID</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>元数据</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((row) => (
              <tr key={`${row.type}:${row.id}`}>
                <td>{row.type}</td>
                <td>{row.name}</td>
                <td>{row.externalId}</td>
                <td>
                  <span className="pill">{statusLabel(row.status)}</span>
                </td>
                <td>{formatDate(row.updatedAt)}</td>
                <td className="notes-cell" title={row.metadata ?? "-"}>
                  {row.metadata ?? "-"}
                </td>
              </tr>
            ))}
            {resources.length === 0 && !loading ? (
              <tr>
                <td colSpan={6}>暂无资源</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
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
