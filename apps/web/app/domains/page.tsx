"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type DomainConfig = {
  provider?: string;
  registrar?: string;
  dnsStatus?: string;
  sslStatus?: string;
  landingPageId?: string;
  notes?: string;
  purchaseMode?: string;
};

type DomainRow = {
  id: string;
  domain: string;
  status: string;
  config?: DomainConfig | null;
  usageCount?: number;
  dnsStatus?: string;
  sslStatus?: string;
  createdAt: string;
  updatedAt: string;
};

type LandingPageRow = {
  id: string;
  name: string;
  url: string;
  status: string;
};

type DomainDraft = {
  domain: string;
  status: string;
  provider: string;
  registrar: string;
  dnsStatus: string;
  sslStatus: string;
  landingPageId: string;
  notes: string;
};

type FieldKey = "domain" | "provider" | "status" | "dnsStatus" | "sslStatus" | "landingPage" | "usageCount" | "updatedAt" | "notes";

const emptyDraft: DomainDraft = {
  domain: "",
  status: "pending",
  provider: "manual",
  registrar: "",
  dnsStatus: "pending",
  sslStatus: "pending",
  landingPageId: "",
  notes: ""
};

const fieldOptions: Array<{ key: FieldKey; label: string }> = [
  { key: "domain", label: "域名" },
  { key: "provider", label: "服务商" },
  { key: "status", label: "状态" },
  { key: "dnsStatus", label: "DNS" },
  { key: "sslStatus", label: "SSL" },
  { key: "landingPage", label: "Money Page" },
  { key: "usageCount", label: "使用数" },
  { key: "updatedAt", label: "更新时间" },
  { key: "notes", label: "备注" }
];

const defaultFields: FieldKey[] = ["domain", "provider", "status", "dnsStatus", "sslStatus", "landingPage", "usageCount", "updatedAt"];

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (["verified", "active", "issued"].includes(normalized)) return "pill success";
  if (["failed", "expired", "blocked"].includes(normalized)) return "pill danger";
  if (["pending", "purchased", "checking"].includes(normalized)) return "pill warning";
  return "pill";
}

function draftFromRow(row: DomainRow): DomainDraft {
  return {
    domain: row.domain,
    status: row.status,
    provider: row.config?.provider ?? "manual",
    registrar: row.config?.registrar ?? "",
    dnsStatus: row.dnsStatus ?? row.config?.dnsStatus ?? "pending",
    sslStatus: row.sslStatus ?? row.config?.sslStatus ?? "pending",
    landingPageId: row.config?.landingPageId ?? "",
    notes: row.config?.notes ?? ""
  };
}

function buildPayload(draft: DomainDraft) {
  return {
    domain: draft.domain,
    status: draft.status,
    config: {
      provider: draft.provider || undefined,
      registrar: draft.registrar || undefined,
      dnsStatus: draft.dnsStatus || undefined,
      sslStatus: draft.sslStatus || undefined,
      landingPageId: draft.landingPageId || undefined,
      notes: draft.notes || undefined
    }
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function DomainsPage() {
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [draft, setDraft] = useState<DomainDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dnsFilter, setDnsFilter] = useState("");
  const [sslFilter, setSslFilter] = useState("");
  const [visibleFields, setVisibleFields] = useState<FieldKey[]>(defaultFields);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const verifiedCount = useMemo(() => rows.filter((row) => row.status === "verified" || row.status === "active").length, [rows]);
  const pendingCount = useMemo(() => rows.filter((row) => row.status === "pending" || row.status === "purchased").length, [rows]);
  const usedCount = useMemo(() => rows.filter((row) => Number(row.usageCount ?? 0) > 0).length, [rows]);
  const selectedDomain = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const dnsStatus = row.dnsStatus ?? row.config?.dnsStatus ?? "";
      const sslStatus = row.sslStatus ?? row.config?.sslStatus ?? "";
      const matchesKeyword =
        !keyword ||
        row.domain.toLowerCase().includes(keyword) ||
        row.config?.provider?.toLowerCase().includes(keyword) ||
        row.config?.registrar?.toLowerCase().includes(keyword) ||
        landingPageName(row.config?.landingPageId).toLowerCase().includes(keyword);
      const matchesStatus = !statusFilter || row.status === statusFilter;
      const matchesDns = !dnsFilter || dnsStatus === dnsFilter;
      const matchesSsl = !sslFilter || sslStatus === sslFilter;
      return matchesKeyword && matchesStatus && matchesDns && matchesSsl;
    });
  }, [dnsFilter, rows, searchTerm, sslFilter, statusFilter]);

  const statusOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(), [rows]);
  const dnsOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.dnsStatus ?? row.config?.dnsStatus).filter(Boolean))).sort(), [rows]);
  const sslOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.sslStatus ?? row.config?.sslStatus).filter(Boolean))).sort(), [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [domainRows, pageRows] = await Promise.all([apiRequest<DomainRow[]>("/domains"), apiRequest<LandingPageRow[]>("/landing-pages")]);
      setRows(domainRows);
      setLandingPages(pageRows);
      setSelectedId((current) => (current && domainRows.some((row) => row.id === current) ? current : domainRows[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载域名失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const row = await apiRequest<DomainRow>(editingId ? `/domains/${editingId}` : "/domains", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "域名已更新" : "域名已创建");
      setSelectedId(row.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存域名失败");
    } finally {
      setSaving(false);
    }
  }

  async function buyDomain() {
    if (!draft.domain.trim()) {
      setError("请先填写域名");
      return;
    }
    setBuying(true);
    setError(null);
    setNotice(null);
    try {
      const row = await apiRequest<DomainRow>("/domains/buy", {
        method: "POST",
        body: JSON.stringify({
          ...buildPayload(draft),
          status: draft.status === "verified" ? "purchased" : draft.status
        })
      });
      setSelectedId(row.id);
      setNotice("Buy domain 请求已记录");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交 Buy domain 失败");
    } finally {
      setBuying(false);
    }
  }

  async function markVerified(row: DomainRow) {
    setVerifyingId(row.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/domains/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "verified",
          config: {
            ...(row.config ?? {}),
            dnsStatus: "verified",
            sslStatus: "issued"
          }
        })
      });
      setNotice("域名已标记为解析和 SSL 正常");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新域名状态失败");
    } finally {
      setVerifyingId(null);
    }
  }

  async function remove(row: DomainRow) {
    if (!window.confirm(`确认删除域名 ${row.domain}？`)) return;
    setError(null);
    try {
      await apiRequest(`/domains/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除域名失败");
    }
  }

  function edit(row: DomainRow) {
    setEditingId(row.id);
    setSelectedId(row.id);
    setDraft(draftFromRow(row));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof DomainDraft>(key: K, value: DomainDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleField(key: FieldKey) {
    setVisibleFields((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function landingPageName(id?: string) {
    return landingPages.find((item) => item.id === id)?.name ?? "-";
  }

  function exportCsv() {
    const headers = ["域名", "服务商", "注册商", "状态", "DNS", "SSL", "Money Page", "使用数", "备注", "更新时间"];
    const lines = visibleRows.map((row) =>
      [
        row.domain,
        row.config?.provider,
        row.config?.registrar,
        row.status,
        row.dnsStatus ?? row.config?.dnsStatus,
        row.sslStatus ?? row.config?.sslStatus,
        landingPageName(row.config?.landingPageId),
        row.usageCount ?? 0,
        row.config?.notes,
        formatDate(row.updatedAt)
      ].map(csvCell)
    );
    const blob = new Blob([`\ufeff${[headers.map(csvCell), ...lines].map((line) => line.join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "domains.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="域名"
      description="管理自定义域名、购买请求、DNS/SSL 状态和 Money Page 绑定。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={resetForm} type="button">
            新增域名
          </button>
          <button className="button secondary" onClick={exportCsv} type="button">
            导出
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>域名总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>Verified / Active</span>
          <strong>{verifiedCount}</strong>
        </div>
        <div className="metric">
          <span>Pending / Purchased</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric">
          <span>已用于 Campaign</span>
          <strong>{usedCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑域名" : "Buy domain / 绑定域名"}</h2>
            <p>Buy domain 会记录购买请求；已有域名可直接绑定并维护解析、SSL 状态。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="domainName">域名</label>
              <input id="domainName" onChange={(event) => updateDraft("domain", event.target.value)} required value={draft.domain} />
            </div>
            <div className="field">
              <label htmlFor="domainProvider">服务商</label>
              <input id="domainProvider" onChange={(event) => updateDraft("provider", event.target.value)} value={draft.provider} />
            </div>
            <div className="field">
              <label htmlFor="domainRegistrar">注册商</label>
              <input id="domainRegistrar" onChange={(event) => updateDraft("registrar", event.target.value)} value={draft.registrar} />
            </div>
            <div className="field">
              <label htmlFor="domainStatus">状态</label>
              <select id="domainStatus" onChange={(event) => updateDraft("status", event.target.value)} value={draft.status}>
                <option value="pending">Pending</option>
                <option value="purchased">Purchased</option>
                <option value="verified">Verified</option>
                <option value="active">Active</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="domainDnsStatus">DNS</label>
              <select id="domainDnsStatus" onChange={(event) => updateDraft("dnsStatus", event.target.value)} value={draft.dnsStatus}>
                <option value="pending">Pending</option>
                <option value="checking">Checking</option>
                <option value="verified">Verified</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="domainSslStatus">SSL</label>
              <select id="domainSslStatus" onChange={(event) => updateDraft("sslStatus", event.target.value)} value={draft.sslStatus}>
                <option value="pending">Pending</option>
                <option value="checking">Checking</option>
                <option value="issued">Issued</option>
                <option value="failed">Failed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="domainLandingPage">Money Page</label>
              <select id="domainLandingPage" onChange={(event) => updateDraft("landingPageId", event.target.value)} value={draft.landingPageId}>
                <option value="">不绑定</option>
                {landingPages.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="domainNotes">备注</label>
            <textarea id="domainNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存域名"}
            </button>
            {!editingId ? (
              <button className="button secondary" disabled={buying} onClick={() => void buyDomain()} type="button">
                {buying ? "提交中..." : "Buy domain"}
              </button>
            ) : null}
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel channel-filter-panel">
        <div className="panel-heading">
          <div>
            <h2>筛选与字段</h2>
            <p>按域名、状态、DNS、SSL 筛选，并控制列表字段展示。</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="domainSearch">搜索</label>
            <input id="domainSearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
          </div>
          <div className="field">
            <label htmlFor="domainStatusFilter">状态</label>
            <select id="domainStatusFilter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="">全部状态</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="domainDnsFilter">DNS</label>
            <select id="domainDnsFilter" onChange={(event) => setDnsFilter(event.target.value)} value={dnsFilter}>
              <option value="">全部 DNS</option>
              {dnsOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="domainSslFilter">SSL</label>
            <select id="domainSslFilter" onChange={(event) => setSslFilter(event.target.value)} value={sslFilter}>
              <option value="">全部 SSL</option>
              {sslOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-toggle-list">
          {fieldOptions.map((field) => (
            <label key={field.key}>
              <input checked={visibleFields.includes(field.key)} onChange={() => toggleField(field.key)} type="checkbox" />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="money-page-layout domain-layout">
        <div>
          <section className="table-panel money-page-table-panel">
            <table className="money-page-table domain-table">
              <thead>
                <tr>
                  {visibleFields.includes("domain") ? <th>域名</th> : null}
                  {visibleFields.includes("provider") ? <th>服务商</th> : null}
                  {visibleFields.includes("status") ? <th>状态</th> : null}
                  {visibleFields.includes("dnsStatus") ? <th>DNS</th> : null}
                  {visibleFields.includes("sslStatus") ? <th>SSL</th> : null}
                  {visibleFields.includes("landingPage") ? <th>Money Page</th> : null}
                  {visibleFields.includes("usageCount") ? <th>使用数</th> : null}
                  {visibleFields.includes("updatedAt") ? <th>更新时间</th> : null}
                  {visibleFields.includes("notes") ? <th>备注</th> : null}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const dnsStatus = row.dnsStatus ?? row.config?.dnsStatus ?? "-";
                  const sslStatus = row.sslStatus ?? row.config?.sslStatus ?? "-";
                  return (
                    <tr className={selectedDomain?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                      {visibleFields.includes("domain") ? (
                        <td>
                          <strong>{row.domain}</strong>
                          <br />
                          <span className="muted">{row.id.slice(-8)}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("provider") ? (
                        <td>
                          {row.config?.provider ?? "-"}
                          <br />
                          <span className="muted">{row.config?.registrar ?? "-"}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("status") ? (
                        <td>
                          <span className={statusClass(row.status)}>{row.status}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("dnsStatus") ? (
                        <td>
                          <span className={statusClass(dnsStatus)}>{dnsStatus}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("sslStatus") ? (
                        <td>
                          <span className={statusClass(sslStatus)}>{sslStatus}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("landingPage") ? <td>{landingPageName(row.config?.landingPageId)}</td> : null}
                      {visibleFields.includes("usageCount") ? <td>{row.usageCount ?? 0}</td> : null}
                      {visibleFields.includes("updatedAt") ? <td>{formatDate(row.updatedAt)}</td> : null}
                      {visibleFields.includes("notes") ? <td className="notes-cell">{row.config?.notes ?? "-"}</td> : null}
                      <td>
                        <div className="row-actions">
                          <button className="button secondary" onClick={() => edit(row)} type="button">
                            编辑
                          </button>
                          <button className="button secondary" disabled={verifyingId === row.id} onClick={() => void markVerified(row)} type="button">
                            {verifyingId === row.id ? "检查中" : "标记正常"}
                          </button>
                          <button className="button danger" onClick={() => void remove(row)} type="button">
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={Math.max(visibleFields.length + 1, 1)}>暂无域名</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="money-page-detail-panel">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>域名详情</h2>
                <p>查看解析、SSL 和 Campaign 使用情况。</p>
              </div>
            </div>
            {selectedDomain ? (
              <div className="strategy-detail">
                <div className="detail-list">
                  <div>
                    <span>域名</span>
                    <strong>{selectedDomain.domain}</strong>
                  </div>
                  <div>
                    <span>服务商 / 注册商</span>
                    <strong>
                      {selectedDomain.config?.provider ?? "-"} / {selectedDomain.config?.registrar ?? "-"}
                    </strong>
                  </div>
                  <div>
                    <span>状态</span>
                    <strong>{selectedDomain.status}</strong>
                  </div>
                  <div>
                    <span>DNS / SSL</span>
                    <strong>
                      {selectedDomain.dnsStatus ?? selectedDomain.config?.dnsStatus ?? "-"} / {selectedDomain.sslStatus ?? selectedDomain.config?.sslStatus ?? "-"}
                    </strong>
                  </div>
                  <div>
                    <span>Money Page</span>
                    <strong>{landingPageName(selectedDomain.config?.landingPageId)}</strong>
                  </div>
                  <div>
                    <span>已用于 Campaign</span>
                    <strong>{selectedDomain.usageCount ?? 0}</strong>
                  </div>
                </div>
                <div className="button-row">
                  <a className="button primary" href={`https://${selectedDomain.domain}`} rel="noreferrer" target="_blank">
                    打开域名
                  </a>
                  <button className="button secondary" onClick={() => edit(selectedDomain)} type="button">
                    编辑
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择域名</div>
            )}
          </section>
        </aside>
      </section>
    </AdminShell>
  );
}
