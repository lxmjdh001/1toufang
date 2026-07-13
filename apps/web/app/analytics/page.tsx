"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type AnalyticsOverview = {
  range: { startDate: string; endDate: string };
  totals: { visitors: number; conversions: number; conversionRate: number };
  series: Array<{ date: string; visitors: number; conversions: number }>;
  landingPages: Array<{ id: string; visits: number; conversions: number }>;
  offers: Array<{ id: string; visits: number; conversions: number }>;
};

type VisitorRow = {
  id: string;
  requestId: string;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  landingPageId?: string | null;
  offerId?: string | null;
  pwaAppId?: string | null;
  domainId?: string | null;
  project?: string | null;
  ip?: string | null;
  client?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  referrer?: string | null;
  event1: number;
  event2: number;
  event3: number;
  clickCost?: string | number | null;
  conversionRate?: string | number | null;
  feedback?: string | null;
  visitAt: string;
  conversionsCount?: number;
};

type LandingPageRow = {
  id: string;
  name: string;
};

type OfferRow = {
  id: string;
  name: string;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoKey(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatNumber(value?: number) {
  return Intl.NumberFormat("zh-CN").format(Number(value ?? 0));
}

function formatRate(value?: number | string | null) {
  const number = Number(value ?? 0);
  return `${Number.isFinite(number) ? number.toFixed(2) : "0.00"}%`;
}

function formatMoney(value?: string | number | null) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [startDate, setStartDate] = useState(daysAgoKey(13));
  const [endDate, setEndDate] = useState(todayKey());
  const [search, setSearch] = useState("");
  const [landingPageFilter, setLandingPageFilter] = useState("");
  const [offerFilter, setOfferFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const maxVisitors = useMemo(() => Math.max(...(overview?.series ?? []).map((row) => row.visitors), 1), [overview?.series]);
  const convertedVisitors = useMemo(() => visitors.filter((row) => Number(row.conversionsCount ?? 0) > 0).length, [visitors]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      if (search.trim()) params.set("search", search.trim());
      if (landingPageFilter) params.set("landingPageId", landingPageFilter);
      if (offerFilter) params.set("offerId", offerFilter);
      const [overviewRow, visitorRows, pageRows, offerRows] = await Promise.all([
        apiRequest<AnalyticsOverview>(`/analytics/overview?${params.toString()}`),
        apiRequest<VisitorRow[]>(`/analytics/visitors?${params.toString()}`),
        apiRequest<LandingPageRow[]>("/landing-pages"),
        apiRequest<OfferRow[]>("/offers")
      ]);
      setOverview(overviewRow);
      setVisitors(visitorRows);
      setLandingPages(pageRows);
      setOffers(offerRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载访客分析失败");
    } finally {
      setLoading(false);
    }
  }

  function landingPageName(id?: string | null) {
    return landingPages.find((row) => row.id === id)?.name ?? id ?? "-";
  }

  function offerName(id?: string | null) {
    return offers.find((row) => row.id === id)?.name ?? id ?? "-";
  }

  function exportCsv() {
    const headers = ["Request ID", "项目", "Campaign", "广告组", "落地页", "Offer", "IP", "客户端", "Referrer", "事件1", "事件2", "事件3", "点击成本", "转化率", "转化数", "反馈", "Visit At"];
    const lines = visitors.map((row) =>
      [
        row.requestId,
        row.project,
        row.campaignId,
        row.adSetId,
        landingPageName(row.landingPageId),
        offerName(row.offerId),
        row.ip,
        row.client ?? row.device,
        row.referrer,
        row.event1,
        row.event2,
        row.event3,
        row.clickCost,
        row.conversionRate,
        row.conversionsCount ?? 0,
        row.feedback,
        formatDate(row.visitAt)
      ].map(csvCell)
    );
    const blob = new Blob([`\ufeff${[headers.map(csvCell), ...lines].map((line) => line.join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "analytics-visitors.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="访客分析"
      description="查看站点侧访问日志、Request ID、来源、事件和转化归因。"
      actions={
        <div className="dashboard-actions">
          <label>
            开始
            <input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
          </label>
          <label>
            结束
            <input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
          </label>
          <button className="button secondary" onClick={exportCsv} type="button">
            Export
          </button>
          <button className="button primary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>访客总数</span>
          <strong>{formatNumber(overview?.totals.visitors)}</strong>
        </div>
        <div className="metric">
          <span>转化事件</span>
          <strong>{formatNumber(overview?.totals.conversions)}</strong>
        </div>
        <div className="metric">
          <span>转化率</span>
          <strong>{formatRate(overview?.totals.conversionRate)}</strong>
        </div>
        <div className="metric">
          <span>有转化访客</span>
          <strong>{formatNumber(convertedVisitors)}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="split-grid">
        <div className="panel dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>访客趋势</h2>
              <p>按天统计访客和转化。</p>
            </div>
          </div>
          <div className="mini-chart">
            {(overview?.series ?? []).map((row) => (
              <div className="bar-row" key={row.date}>
                <span>{row.date.slice(5)}</span>
                <div className="bar-track">
                  <i style={{ width: `${Math.max(4, (row.visitors / maxVisitors) * 100)}%` }} />
                </div>
                <strong>
                  {row.visitors} / {row.conversions}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel dashboard-panel">
          <div className="panel-heading">
            <div>
              <h2>筛选</h2>
              <p>按 Request ID、项目、IP、客户端、落地页和 Offer 查询。</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="visitorSearch">搜索</label>
              <input id="visitorSearch" onChange={(event) => setSearch(event.target.value)} value={search} />
            </div>
            <div className="field">
              <label htmlFor="visitorLandingPage">Money Page</label>
              <select id="visitorLandingPage" onChange={(event) => setLandingPageFilter(event.target.value)} value={landingPageFilter}>
                <option value="">全部</option>
                {landingPages.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="visitorOffer">Offer</label>
              <select id="visitorOffer" onChange={(event) => setOfferFilter(event.target.value)} value={offerFilter}>
                <option value="">全部</option>
                {offers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-header">
          <div>
            <strong>访问日志</strong>
            <br />
            <span className="muted">最多展示最近 500 条记录</span>
          </div>
        </div>
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th>项目</th>
              <th>Campaign / Ad Set</th>
              <th>落地页 / Offer</th>
              <th>IP</th>
              <th>客户端</th>
              <th>Referrer</th>
              <th>事件1/2/3</th>
              <th>点击成本</th>
              <th>转化率</th>
              <th>转化数</th>
              <th>反馈</th>
              <th>Visit At</th>
            </tr>
          </thead>
          <tbody>
            {visitors.map((row) => (
              <tr key={row.id}>
                <td>{row.requestId}</td>
                <td>{row.project ?? "-"}</td>
                <td>
                  {row.campaignId ?? "-"}
                  <br />
                  <span className="muted">{row.adSetId ?? "-"}</span>
                </td>
                <td>
                  {landingPageName(row.landingPageId)}
                  <br />
                  <span className="muted">{offerName(row.offerId)}</span>
                </td>
                <td>{row.ip ?? "-"}</td>
                <td>
                  {row.client ?? "-"}
                  <br />
                  <span className="muted">
                    {[row.device, row.browser, row.os].filter(Boolean).join(" / ") || "-"}
                  </span>
                </td>
                <td className="notes-cell">{row.referrer ?? "-"}</td>
                <td>
                  {row.event1} / {row.event2} / {row.event3}
                </td>
                <td>${formatMoney(row.clickCost)}</td>
                <td>{formatRate(row.conversionRate)}</td>
                <td>{row.conversionsCount ?? 0}</td>
                <td className="notes-cell">{row.feedback ?? "-"}</td>
                <td>{formatDate(row.visitAt)}</td>
              </tr>
            ))}
            {visitors.length === 0 && !loading ? (
              <tr>
                <td colSpan={13}>暂无访问日志</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
