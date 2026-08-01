"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type DemandConfig = {
  owner?: string;
  dueDate?: string;
  source?: string;
  landingPageId?: string;
  offerId?: string;
  pwaAppId?: string;
  expectedOutput?: string;
  notes?: string;
};

type BindingRow = {
  id: string;
  name?: string;
  url?: string;
  startUrl?: string;
};

type DemandRow = {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  description?: string | null;
  tags: string[];
  config?: DemandConfig | null;
  ageDays?: number;
  overdue?: boolean;
  bindings?: {
    landingPage?: BindingRow | null;
    offer?: BindingRow | null;
    pwaApp?: BindingRow | null;
  };
  creator?: { email: string; profile?: { name?: string | null } | null } | null;
  createdAt: string;
  updatedAt: string;
};

type LandingPageRow = {
  id: string;
  name: string;
  url: string;
  status: string;
};

type OfferRow = {
  id: string;
  name: string;
  url: string;
  status: string;
};

type PwaRow = {
  id: string;
  name: string;
  startUrl: string;
  status: string;
};

type DemandDraft = {
  title: string;
  type: string;
  priority: string;
  status: string;
  owner: string;
  dueDate: string;
  source: string;
  landingPageId: string;
  offerId: string;
  pwaAppId: string;
  tags: string;
  description: string;
  expectedOutput: string;
  notes: string;
};

type StatusView = "all" | "backlog" | "planned" | "in_progress" | "review" | "done" | "rejected";

const emptyDraft: DemandDraft = {
  title: "",
  type: "creative",
  priority: "normal",
  status: "backlog",
  owner: "",
  dueDate: "",
  source: "",
  landingPageId: "",
  offerId: "",
  pwaAppId: "",
  tags: "",
  description: "",
  expectedOutput: "",
  notes: ""
};

const statusTabs: Array<{ key: StatusView; label: string }> = [
  { key: "all", label: "全部" },
  { key: "backlog", label: "Backlog" },
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
  { key: "rejected", label: "Rejected" }
];

const typeOptions = [
  { value: "creative", label: "素材需求" },
  { value: "copywriting", label: "文案需求" },
  { value: "product", label: "产品需求" },
  { value: "landing_page", label: "落地页需求" },
  { value: "offer", label: "Offer 需求" },
  { value: "pwa", label: "PWA 需求" },
  { value: "campaign", label: "投放优化" },
  { value: "automation", label: "自动化需求" }
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" }
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function creatorName(row: DemandRow) {
  return row.creator?.profile?.name ?? row.creator?.email ?? "-";
}

function parseList(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusClass(status: string, overdue?: boolean) {
  if (overdue && !["done", "rejected"].includes(status)) return "pill danger";
  if (status === "done") return "pill success";
  if (status === "rejected") return "pill danger";
  if (status === "in_progress" || status === "review") return "pill warning";
  return "pill";
}

function priorityClass(priority: string) {
  if (priority === "urgent") return "pill danger";
  if (priority === "high") return "pill warning";
  if (priority === "low") return "pill";
  return "pill success";
}

function typeLabel(type: string) {
  return typeOptions.find((item) => item.value === type)?.label ?? type;
}

function draftFromRow(row: DemandRow): DemandDraft {
  return {
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: row.status,
    owner: row.config?.owner ?? "",
    dueDate: row.config?.dueDate ?? "",
    source: row.config?.source ?? "",
    landingPageId: row.config?.landingPageId ?? "",
    offerId: row.config?.offerId ?? "",
    pwaAppId: row.config?.pwaAppId ?? "",
    tags: row.tags.join(", "),
    description: row.description ?? "",
    expectedOutput: row.config?.expectedOutput ?? "",
    notes: row.config?.notes ?? ""
  };
}

function buildPayload(draft: DemandDraft) {
  return {
    title: draft.title,
    type: draft.type,
    priority: draft.priority,
    status: draft.status,
    description: draft.description || undefined,
    tags: parseList(draft.tags),
    config: {
      owner: draft.owner || undefined,
      dueDate: draft.dueDate || undefined,
      source: draft.source || undefined,
      landingPageId: draft.landingPageId || undefined,
      offerId: draft.offerId || undefined,
      pwaAppId: draft.pwaAppId || undefined,
      expectedOutput: draft.expectedOutput || undefined,
      notes: draft.notes || undefined
    }
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function DemandsPage() {
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [pwaApps, setPwaApps] = useState<PwaRow[]>([]);
  const [draft, setDraft] = useState<DemandDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<StatusView>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const openCount = useMemo(() => rows.filter((row) => !["done", "rejected"].includes(row.status)).length, [rows]);
  const urgentCount = useMemo(() => rows.filter((row) => row.priority === "urgent" || row.overdue).length, [rows]);
  const doneCount = useMemo(() => rows.filter((row) => row.status === "done").length, [rows]);
  const selectedDemand = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = activeStatus === "all" || row.status === activeStatus;
      const matchesKeyword =
        !keyword ||
        row.title.toLowerCase().includes(keyword) ||
        row.description?.toLowerCase().includes(keyword) ||
        row.tags.some((tag) => tag.toLowerCase().includes(keyword)) ||
        row.config?.owner?.toLowerCase().includes(keyword) ||
        row.config?.source?.toLowerCase().includes(keyword) ||
        landingPageName(row.config?.landingPageId).toLowerCase().includes(keyword) ||
        offerName(row.config?.offerId).toLowerCase().includes(keyword) ||
        pwaName(row.config?.pwaAppId).toLowerCase().includes(keyword);
      const matchesType = !typeFilter || row.type === typeFilter;
      const matchesPriority = !priorityFilter || row.priority === priorityFilter;
      return matchesStatus && matchesKeyword && matchesType && matchesPriority;
    });
  }, [activeStatus, priorityFilter, rows, searchTerm, typeFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [demandRows, pageRows, offerRows, pwaRows] = await Promise.all([
        apiRequest<DemandRow[]>("/demands"),
        apiRequest<LandingPageRow[]>("/landing-pages"),
        apiRequest<OfferRow[]>("/offers"),
        apiRequest<PwaRow[]>("/pwa-apps")
      ]);
      setRows(demandRows);
      setLandingPages(pageRows);
      setOffers(offerRows);
      setPwaApps(pwaRows);
      setSelectedId((current) => (current && demandRows.some((row) => row.id === current) ? current : demandRows[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载需求失败");
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
      const row = await apiRequest<DemandRow>(editingId ? `/demands/${editingId}` : "/demands", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "需求已更新" : "需求已创建");
      setSelectedId(row.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存需求失败");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(row: DemandRow) {
    setDuplicatingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const nextRow = await apiRequest<DemandRow>(`/demands/${row.id}/duplicate`, { method: "POST" });
      setSelectedId(nextRow.id);
      setNotice("需求已复制到 Backlog");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制需求失败");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function moveStatus(row: DemandRow, status: string) {
    setMovingId(row.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/demands/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, config: row.config ?? {} })
      });
      setNotice(`需求已流转到 ${status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "流转状态失败");
    } finally {
      setMovingId(null);
    }
  }

  async function remove(row: DemandRow) {
    if (!window.confirm(`确认删除需求 ${row.title}？`)) return;
    setError(null);
    try {
      await apiRequest(`/demands/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除需求失败");
    }
  }

  function edit(row: DemandRow) {
    setEditingId(row.id);
    setSelectedId(row.id);
    setDraft(draftFromRow(row));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof DemandDraft>(key: K, value: DemandDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function landingPageName(id?: string) {
    return landingPages.find((item) => item.id === id)?.name ?? "-";
  }

  function offerName(id?: string) {
    return offers.find((item) => item.id === id)?.name ?? "-";
  }

  function pwaName(id?: string) {
    return pwaApps.find((item) => item.id === id)?.name ?? "-";
  }

  function exportCsv() {
    const headers = ["创建者", "标题", "类型", "优先级", "状态", "负责人", "截止日期", "来源", "Money Page", "Offer", "PWA", "标签", "描述", "期望产出", "备注", "创建时间"];
    const lines = visibleRows.map((row) =>
      [
        creatorName(row),
        row.title,
        typeLabel(row.type),
        row.priority,
        row.status,
        row.config?.owner,
        row.config?.dueDate,
        row.config?.source,
        landingPageName(row.config?.landingPageId),
        offerName(row.config?.offerId),
        pwaName(row.config?.pwaAppId),
        row.tags.join(" / "),
        row.description,
        row.config?.expectedOutput,
        row.config?.notes,
        formatDate(row.createdAt)
      ].map(csvCell)
    );
    const blob = new Blob([`\ufeff${[headers.map(csvCell), ...lines].map((line) => line.join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "demands.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="需求池"
      description="管理素材、文案、产品、落地页、PWA 和投放优化需求。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={resetForm} type="button">
            创建 Demand
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
          <span>Demands</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>未完成</span>
          <strong>{openCount}</strong>
        </div>
        <div className="metric">
          <span>紧急/逾期</span>
          <strong>{urgentCount}</strong>
        </div>
        <div className="metric">
          <span>Done</span>
          <strong>{doneCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑 Demand" : "创建 Demand"}</h2>
            <p>把素材、产品、落地页和自动化想法收敛到统一需求池。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="demandTitle">标题</label>
              <input id="demandTitle" onChange={(event) => updateDraft("title", event.target.value)} required value={draft.title} />
            </div>
            <div className="field">
              <label htmlFor="demandType">类型</label>
              <select id="demandType" onChange={(event) => updateDraft("type", event.target.value)} value={draft.type}>
                {typeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="demandPriority">优先级</label>
              <select id="demandPriority" onChange={(event) => updateDraft("priority", event.target.value)} value={draft.priority}>
                {priorityOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="demandStatus">状态</label>
              <select id="demandStatus" onChange={(event) => updateDraft("status", event.target.value)} value={draft.status}>
                {statusTabs
                  .filter((item) => item.key !== "all")
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="demandOwner">负责人</label>
              <input id="demandOwner" onChange={(event) => updateDraft("owner", event.target.value)} value={draft.owner} />
            </div>
            <div className="field">
              <label htmlFor="demandDueDate">截止日期</label>
              <input id="demandDueDate" onChange={(event) => updateDraft("dueDate", event.target.value)} type="date" value={draft.dueDate} />
            </div>
            <div className="field">
              <label htmlFor="demandSource">来源</label>
              <input id="demandSource" onChange={(event) => updateDraft("source", event.target.value)} value={draft.source} />
            </div>
            <div className="field">
              <label htmlFor="demandLandingPage">Money Page</label>
              <select id="demandLandingPage" onChange={(event) => updateDraft("landingPageId", event.target.value)} value={draft.landingPageId}>
                <option value="">不关联</option>
                {landingPages.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="demandOffer">Offer</label>
              <select id="demandOffer" onChange={(event) => updateDraft("offerId", event.target.value)} value={draft.offerId}>
                <option value="">不关联</option>
                {offers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="demandPwa">PWA</label>
              <select id="demandPwa" onChange={(event) => updateDraft("pwaAppId", event.target.value)} value={draft.pwaAppId}>
                <option value="">不关联</option>
                {pwaApps.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="demandTags">标签</label>
              <input id="demandTags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="demandDescription">描述</label>
            <textarea id="demandDescription" onChange={(event) => updateDraft("description", event.target.value)} value={draft.description} />
          </div>
          <div className="field">
            <label htmlFor="demandExpectedOutput">期望产出</label>
            <textarea id="demandExpectedOutput" onChange={(event) => updateDraft("expectedOutput", event.target.value)} value={draft.expectedOutput} />
          </div>
          <div className="field">
            <label htmlFor="demandNotes">备注</label>
            <textarea id="demandNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存 Demand"}
            </button>
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="resource-tabs">
        {statusTabs.map((tab) => (
          <button className={activeStatus === tab.key ? "active" : ""} key={tab.key} onClick={() => setActiveStatus(tab.key)} type="button">
            <span>{tab.label}</span>
            <strong>{tab.key === "all" ? rows.length : rows.filter((row) => row.status === tab.key).length}</strong>
          </button>
        ))}
      </section>

      <section className="money-page-layout demand-layout">
        <div>
          <section className="panel money-filter-panel">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="demandSearch">搜索</label>
                <input id="demandSearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
              </div>
              <div className="field">
                <label htmlFor="demandTypeFilter">类型</label>
                <select id="demandTypeFilter" onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
                  <option value="">全部类型</option>
                  {typeOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="demandPriorityFilter">优先级</label>
                <select id="demandPriorityFilter" onChange={(event) => setPriorityFilter(event.target.value)} value={priorityFilter}>
                  <option value="">全部优先级</option>
                  {priorityOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="table-panel money-page-table-panel">
            <table className="money-page-table demand-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>类型</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>负责人</th>
                  <th>截止日期</th>
                  <th>关联资源</th>
                  <th>标签</th>
                  <th>创建者</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr className={selectedDemand?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                    <td>
                      <strong>{row.title}</strong>
                      <br />
                      <span className="muted">{row.description ?? row.id.slice(-8)}</span>
                    </td>
                    <td>{typeLabel(row.type)}</td>
                    <td>
                      <span className={priorityClass(row.priority)}>{row.priority}</span>
                    </td>
                    <td>
                      <span className={statusClass(row.status, row.overdue)}>{row.overdue ? `${row.status} / overdue` : row.status}</span>
                    </td>
                    <td>{row.config?.owner ?? "-"}</td>
                    <td>{row.config?.dueDate ?? "-"}</td>
                    <td>
                      {landingPageName(row.config?.landingPageId)} / {offerName(row.config?.offerId)}
                      <br />
                      <span className="muted">{pwaName(row.config?.pwaAppId)}</span>
                    </td>
                    <td className="notes-cell">{row.tags.length ? row.tags.join(" / ") : "-"}</td>
                    <td>{creatorName(row)}</td>
                    <td>{formatDate(row.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="button secondary" onClick={() => edit(row)} type="button">
                          编辑
                        </button>
                        <button className="button secondary" disabled={movingId === row.id} onClick={() => void moveStatus(row, "in_progress")} type="button">
                          开始
                        </button>
                        <button className="button secondary" disabled={movingId === row.id} onClick={() => void moveStatus(row, "done")} type="button">
                          完成
                        </button>
                        <button className="button secondary" disabled={duplicatingId === row.id} onClick={() => void duplicate(row)} type="button">
                          {duplicatingId === row.id ? "复制中" : "复制"}
                        </button>
                        <button className="button danger" onClick={() => void remove(row)} type="button">
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={11}>暂无需求</td>
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
                <h2>Demand 详情</h2>
                <p>查看需求说明、期望产出和流转信息。</p>
              </div>
            </div>
            {selectedDemand ? (
              <div className="strategy-detail">
                <div className="detail-list">
                  <div>
                    <span>标题</span>
                    <strong>{selectedDemand.title}</strong>
                  </div>
                  <div>
                    <span>类型 / 优先级</span>
                    <strong>
                      {typeLabel(selectedDemand.type)} / {selectedDemand.priority}
                    </strong>
                  </div>
                  <div>
                    <span>状态</span>
                    <strong>{selectedDemand.overdue ? `${selectedDemand.status} / overdue` : selectedDemand.status}</strong>
                  </div>
                  <div>
                    <span>负责人 / 截止日期</span>
                    <strong>
                      {selectedDemand.config?.owner ?? "-"} / {selectedDemand.config?.dueDate ?? "-"}
                    </strong>
                  </div>
                  <div>
                    <span>关联</span>
                    <strong>
                      {landingPageName(selectedDemand.config?.landingPageId)} / {offerName(selectedDemand.config?.offerId)}
                    </strong>
                  </div>
                  <div>
                    <span>PWA</span>
                    <strong>{pwaName(selectedDemand.config?.pwaAppId)}</strong>
                  </div>
                  <div>
                    <span>创建者 / 已存在</span>
                    <strong>
                      {creatorName(selectedDemand)} / {selectedDemand.ageDays ?? 0} 天
                    </strong>
                  </div>
                </div>
                <div className="strategy-config-grid">
                  <span>描述：{selectedDemand.description ?? "-"}</span>
                  <span>期望产出：{selectedDemand.config?.expectedOutput ?? "-"}</span>
                  <span>备注：{selectedDemand.config?.notes ?? "-"}</span>
                  <span>标签：{selectedDemand.tags.length ? selectedDemand.tags.join(" / ") : "-"}</span>
                </div>
                <div className="button-row">
                  <button className="button primary" onClick={() => edit(selectedDemand)} type="button">
                    编辑
                  </button>
                  <button className="button secondary" disabled={movingId === selectedDemand.id} onClick={() => void moveStatus(selectedDemand, "review")} type="button">
                    送审
                  </button>
                  <button className="button secondary" disabled={movingId === selectedDemand.id} onClick={() => void moveStatus(selectedDemand, "done")} type="button">
                    完成
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择需求</div>
            )}
          </section>
        </aside>
      </section>
    </AdminShell>
  );
}
