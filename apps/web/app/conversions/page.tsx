"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type ConversionRow = {
  id: string;
  visitorLogId?: string | null;
  requestId?: string | null;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  landingPageId?: string | null;
  offerId?: string | null;
  pwaAppId?: string | null;
  domainId?: string | null;
  eventName: string;
  eventValue?: string | number | null;
  currency?: string | null;
  status: string;
  feedback?: string | null;
  convertedAt: string;
  visitorLog?: {
    ip?: string | null;
    client?: string | null;
    referrer?: string | null;
    visitAt: string;
  } | null;
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

function formatMoney(value?: string | number | null) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function statusClass(status: string) {
  if (status === "confirmed" || status === "success") return "pill success";
  if (status === "rejected" || status === "failed") return "pill danger";
  if (status === "pending") return "pill warning";
  return "pill";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function ConversionsPage() {
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [startDate, setStartDate] = useState(daysAgoKey(13));
  const [endDate, setEndDate] = useState(todayKey());
  const [search, setSearch] = useState("");
  const [landingPageFilter, setLandingPageFilter] = useState("");
  const [offerFilter, setOfferFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const confirmedCount = useMemo(() => rows.filter((row) => row.status === "confirmed" || row.status === "success").length, [rows]);
  const pendingCount = useMemo(() => rows.filter((row) => row.status === "pending").length, [rows]);
  const totalValue = useMemo(() => rows.reduce((sum, row) => sum + Number(row.eventValue ?? 0), 0), [rows]);

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
      const [conversionRows, pageRows, offerRows] = await Promise.all([
        apiRequest<ConversionRow[]>(`/conversions?${params.toString()}`),
        apiRequest<LandingPageRow[]>("/landing-pages"),
        apiRequest<OfferRow[]>("/offers")
      ]);
      setRows(conversionRows);
      setLandingPages(pageRows);
      setOffers(offerRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载转化事件失败");
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
    const headers = ["Request ID", "事件", "金额", "币种", "状态", "Campaign", "广告组", "落地页", "Offer", "IP", "客户端", "反馈", "Converted At"];
    const lines = rows.map((row) =>
      [
        row.requestId,
        row.eventName,
        row.eventValue,
        row.currency,
        row.status,
        row.campaignId,
        row.adSetId,
        landingPageName(row.landingPageId),
        offerName(row.offerId),
        row.visitorLog?.ip,
        row.visitorLog?.client,
        row.feedback,
        formatDate(row.convertedAt)
      ].map(csvCell)
    );
    const blob = new Blob([`\ufeff${[headers.map(csvCell), ...lines].map((line) => line.join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "conversions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="转化事件"
      description="查看站点侧转化记录、事件金额、状态和广告归因。"
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
            导出
          </button>
          <button className="button primary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <div className="report-list-page conversions-page">
      <section className="metric-grid compact-metrics report-summary">
        <div className="metric metric-strong">
          <span>转化总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>已确认</span>
          <strong>{confirmedCount}</strong>
        </div>
        <div className="metric">
          <span>待处理</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric">
          <span>转化金额</span>
          <strong>${formatMoney(totalValue)}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel channel-filter-panel">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="conversionSearch">搜索</label>
            <input id="conversionSearch" onChange={(event) => setSearch(event.target.value)} value={search} />
          </div>
          <div className="field">
            <label htmlFor="conversionLandingPage">落地页</label>
            <select id="conversionLandingPage" onChange={(event) => setLandingPageFilter(event.target.value)} value={landingPageFilter}>
              <option value="">全部</option>
              {landingPages.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="conversionOffer">推广项目</label>
            <select id="conversionOffer" onChange={(event) => setOfferFilter(event.target.value)} value={offerFilter}>
              <option value="">全部</option>
              {offers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-header">
          <div>
            <strong>转化列表</strong>
            <br />
            <span className="muted">最多展示最近 500 条记录</span>
          </div>
          <button className="button small" type="button">切换显示字段</button>
        </div>
        <table className="conversion-table">
          <thead>
            <tr>
              <th>请求编号</th>
              <th>事件</th>
              <th>金额</th>
              <th>状态</th>
              <th>广告系列 / 广告组</th>
              <th>落地页 / 推广项目</th>
              <th>访客</th>
              <th>来源页</th>
              <th>反馈</th>
              <th>转化时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.requestId ?? "-"}</td>
                <td>{row.eventName}</td>
                <td>
                  {row.currency ?? "USD"} {formatMoney(row.eventValue)}
                </td>
                <td>
                  <span className={statusClass(row.status)}>{row.status}</span>
                </td>
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
                <td>
                  {row.visitorLog?.ip ?? "-"}
                  <br />
                  <span className="muted">{row.visitorLog?.client ?? "-"}</span>
                </td>
                <td className="notes-cell">{row.visitorLog?.referrer ?? "-"}</td>
                <td className="notes-cell">{row.feedback ?? "-"}</td>
                <td>{formatDate(row.convertedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={10}>暂无转化事件</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      </div>
    </AdminShell>
  );
}
