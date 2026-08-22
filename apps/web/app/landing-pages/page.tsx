"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type CopywritingRow = {
  id: string;
  name: string;
  headline: string;
};

type CreativeRow = {
  id: string;
  name: string;
  status: string;
};

type LandingPageConfig = {
  positioning?: string;
  direction?: string;
  copywritingId?: string;
  adCreativeId?: string;
  description?: string;
  notes?: string;
  active?: boolean;
};

type LandingPageRow = {
  id: string;
  name: string;
  url: string;
  status: string;
  config?: LandingPageConfig | null;
  usageCount?: number;
  creator?: { email: string; profile?: { name?: string | null } | null } | null;
  createdAt: string;
  updatedAt: string;
};

type LandingPageDraft = {
  name: string;
  positioning: string;
  direction: string;
  url: string;
  status: string;
  copywritingId: string;
  adCreativeId: string;
  description: string;
  notes: string;
  active: boolean;
};

const emptyDraft: LandingPageDraft = {
  name: "",
  positioning: "",
  direction: "",
  url: "",
  status: "ready",
  copywritingId: "",
  adCreativeId: "",
  description: "",
  notes: "",
  active: true
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function creatorName(row: LandingPageRow) {
  return row.creator?.profile?.name ?? row.creator?.email ?? "-";
}

function statusClass(status: string, active?: boolean) {
  if (!active || status === "inactive" || status === "archived") return "pill danger";
  if (status === "ready" || status === "active") return "pill success";
  return "pill warning";
}

function draftFromRow(row: LandingPageRow): LandingPageDraft {
  return {
    name: row.name,
    positioning: row.config?.positioning ?? "",
    direction: row.config?.direction ?? "",
    url: row.url,
    status: row.status,
    copywritingId: row.config?.copywritingId ?? "",
    adCreativeId: row.config?.adCreativeId ?? "",
    description: row.config?.description ?? "",
    notes: row.config?.notes ?? "",
    active: row.config?.active ?? row.status !== "inactive"
  };
}

function buildPayload(draft: LandingPageDraft) {
  return {
    name: draft.name,
    url: draft.url,
    status: draft.active ? draft.status : "inactive",
    config: {
      positioning: draft.positioning || undefined,
      direction: draft.direction || undefined,
      copywritingId: draft.copywritingId || undefined,
      adCreativeId: draft.adCreativeId || undefined,
      description: draft.description || undefined,
      notes: draft.notes || undefined,
      active: draft.active
    }
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function LandingPagesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const createMode = pathname.endsWith("/create");
  const [editParam, setEditParam] = useState<string | null>(null);
  const [rows, setRows] = useState<LandingPageRow[]>([]);
  const [copywritings, setCopywritings] = useState<CopywritingRow[]>([]);
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [draft, setDraft] = useState<LandingPageDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeCount = useMemo(() => rows.filter((row) => row.config?.active ?? row.status !== "inactive").length, [rows]);
  const usedCount = useMemo(() => rows.filter((row) => Number(row.usageCount ?? 0) > 0).length, [rows]);
  const selectedPage = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.url.toLowerCase().includes(keyword) ||
        row.config?.positioning?.toLowerCase().includes(keyword) ||
        row.config?.direction?.toLowerCase().includes(keyword);
      const matchesStatus = !statusFilter || row.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [rows, searchTerm, statusFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pageRows, copyRows, creativeRows] = await Promise.all([
        apiRequest<LandingPageRow[]>("/landing-pages"),
        apiRequest<CopywritingRow[]>("/copywritings"),
        apiRequest<CreativeRow[]>("/creatives")
      ]);
      setRows(pageRows);
      setCopywritings(copyRows);
      setCreatives(creativeRows);
      setSelectedId((current) => (current && pageRows.some((row) => row.id === current) ? current : pageRows[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Money Pages 失败");
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
      const row = await apiRequest<LandingPageRow>(editingId ? `/landing-pages/${editingId}` : "/landing-pages", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "Money Page 已更新" : "Money Page 已创建");
      setSelectedId(row.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 Money Page 失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: LandingPageRow) {
    if (!window.confirm(`确认删除 Money Page ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/landing-pages/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除 Money Page 失败");
    }
  }

  async function toggleActive(row: LandingPageRow) {
    setError(null);
    setNotice(null);
    const active = !(row.config?.active ?? row.status !== "inactive");
    try {
      await apiRequest(`/landing-pages/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: active ? "ready" : "inactive",
          config: { ...(row.config ?? {}), active }
        })
      });
      setNotice(active ? "Money Page 已激活" : "Money Page 已停用");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新激活状态失败");
    }
  }

  function edit(row: LandingPageRow) {
    if (!createMode) {
      router.push(`/landing-pages/create?edit=${encodeURIComponent(row.id)}`);
      return;
    }
    setEditingId(row.id);
    setSelectedId(row.id);
    setDraft(draftFromRow(row));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof LandingPageDraft>(key: K, value: LandingPageDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function copyName(id?: string) {
    const row = copywritings.find((item) => item.id === id);
    return row ? `${row.name} / ${row.headline}` : "-";
  }

  function creativeName(id?: string) {
    const row = creatives.find((item) => item.id === id);
    return row ? `${row.name} / ${row.status}` : "-";
  }

  function exportCsv() {
    const headers = ["创建者", "名称", "定位", "方向", "地址", "状态", "文案", "广告创意", "描述", "备注", "使用数", "创建时间"];
    const lines = visibleRows.map((row) =>
      [
        creatorName(row),
        row.name,
        row.config?.positioning,
        row.config?.direction,
        row.url,
        row.status,
        copyName(row.config?.copywritingId),
        creativeName(row.config?.adCreativeId),
        row.config?.description,
        row.config?.notes,
        row.usageCount ?? 0,
        formatDate(row.createdAt)
      ].map(csvCell)
    );
    const blob = new Blob([`\ufeff${[headers.map(csvCell), ...lines].map((line) => line.join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "money-pages.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setEditParam(new URLSearchParams(window.location.search).get("edit"));
  }, []);

  useEffect(() => {
    if (!createMode || !editParam || editingId || !rows.length) return;
    const row = rows.find((item) => item.id === editParam);
    if (!row) return;
    setEditingId(row.id);
    setSelectedId(row.id);
    setDraft(draftFromRow(row));
  }, [createMode, editParam, editingId, rows]);

  return (
    <AdminShell
      title={createMode ? "创建 Landing Page" : "落地页"}
      description={createMode ? "配置 Campaign 承接页、定位方向和创意关联。" : undefined}
      breadcrumbs={[{ label: "Landing Pages", href: "/landing-pages" }, { label: createMode ? "创建" : "列表" }]}
      actions={
        <div className="button-row">
          {createMode ? <a className="button secondary" href="/landing-pages">返回列表</a> : <a className="button primary" href="/landing-pages/create">创建 Landing Page</a>}
          <button className="button secondary" onClick={exportCsv} type="button">
            导出
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <div className={`landing-page-resource ${createMode ? "is-create" : "is-list"}`}>
      <section className="metric-grid compact-metrics landing-summary">
        <div className="metric metric-strong">
          <span>Money Pages</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>激活状态</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="metric">
          <span>已用于广告系列</span>
          <strong>{usedCount}</strong>
        </div>
        <div className="metric">
          <span>筛选结果</span>
          <strong>{visibleRows.length}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel landing-create-panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑 Money Page" : "创建 Landing Page"}</h2>
            <p>落地页会在广告系列创建时作为承接页选择。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pageName">名称</label>
              <input id="pageName" onChange={(event) => updateDraft("name", event.target.value)} required value={draft.name} />
            </div>
            <div className="field">
              <label htmlFor="pagePositioning">定位</label>
              <input id="pagePositioning" onChange={(event) => updateDraft("positioning", event.target.value)} value={draft.positioning} />
            </div>
            <div className="field">
              <label htmlFor="pageDirection">方向</label>
              <input id="pageDirection" onChange={(event) => updateDraft("direction", event.target.value)} value={draft.direction} />
            </div>
            <div className="field">
              <label htmlFor="pageUrl">地址</label>
              <input id="pageUrl" onChange={(event) => updateDraft("url", event.target.value)} required value={draft.url} />
            </div>
            <div className="field">
              <label htmlFor="pageStatus">状态</label>
              <select id="pageStatus" onChange={(event) => updateDraft("status", event.target.value)} value={draft.status}>
                <option value="ready">可投放</option>
                <option value="draft">草稿</option>
                <option value="testing">测试中</option>
                <option value="archived">已归档</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pageCopy">文案</label>
              <select id="pageCopy" onChange={(event) => updateDraft("copywritingId", event.target.value)} value={draft.copywritingId}>
                <option value="">不选择</option>
                {copywritings.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} / {row.headline}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pageCreative">广告创意</label>
              <select id="pageCreative" onChange={(event) => updateDraft("adCreativeId", event.target.value)} value={draft.adCreativeId}>
                <option value="">不选择</option>
                {creatives.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} / {row.status}
                  </option>
                ))}
              </select>
            </div>
            <label className="check-field" htmlFor="pageActive">
              <input checked={draft.active} id="pageActive" onChange={(event) => updateDraft("active", event.target.checked)} type="checkbox" />
              <span>激活</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="pageDescription">描述</label>
            <textarea id="pageDescription" onChange={(event) => updateDraft("description", event.target.value)} value={draft.description} />
          </div>
          <div className="field">
            <label htmlFor="pageNotes">备注</label>
            <textarea id="pageNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存 Money Page"}
            </button>
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="money-page-layout landing-list-layout">
        <div>
          <section className="panel money-filter-panel">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pageSearch">搜索</label>
                <input id="pageSearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
              </div>
              <div className="field">
                <label htmlFor="pageStatusFilter">状态</label>
                <select id="pageStatusFilter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                  <option value="">全部状态</option>
                  <option value="ready">可投放</option>
                  <option value="draft">草稿</option>
                  <option value="testing">测试中</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">已归档</option>
                </select>
              </div>
            </div>
          </section>

          <section className="table-panel money-page-table-panel">
            <table className="money-page-table">
              <thead>
                <tr>
                  <th>创建者</th>
                  <th>名称</th>
                  <th>定位</th>
                  <th>方向</th>
                  <th>地址</th>
                  <th>状态</th>
                  <th>文案</th>
                  <th>广告创意</th>
                  <th>描述</th>
                  <th>备注</th>
                  <th>使用数</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const active = row.config?.active ?? row.status !== "inactive";
                  return (
                    <tr className={selectedPage?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                      <td>{creatorName(row)}</td>
                      <td>
                        <strong>{row.name}</strong>
                        <br />
                        <span className="muted">{row.id.slice(-8)}</span>
                      </td>
                      <td>{row.config?.positioning ?? "-"}</td>
                      <td>{row.config?.direction ?? "-"}</td>
                      <td>
                        <a href={row.url} rel="noreferrer" target="_blank">
                          {row.url}
                        </a>
                      </td>
                      <td>
                        <span className={statusClass(row.status, active)}>{active ? row.status : "inactive"}</span>
                      </td>
                      <td>{copyName(row.config?.copywritingId)}</td>
                      <td>{creativeName(row.config?.adCreativeId)}</td>
                      <td className="notes-cell">{row.config?.description ?? "-"}</td>
                      <td className="notes-cell">{row.config?.notes ?? "-"}</td>
                      <td>{row.usageCount ?? 0}</td>
                      <td>{formatDate(row.createdAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="button secondary" onClick={() => edit(row)} type="button">
                            编辑
                          </button>
                          <button className="button secondary" onClick={() => void toggleActive(row)} type="button">
                            {active ? "停用" : "激活"}
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
                    <td colSpan={13}>暂无 Money Pages</td>
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
                <h2>落地页详情</h2>
                <p>查看承接页状态和广告系列使用情况。</p>
              </div>
            </div>
            {selectedPage ? (
              <div className="strategy-detail">
                <div className="detail-list">
                  <div>
                    <span>名称</span>
                    <strong>{selectedPage.name}</strong>
                  </div>
                  <div>
                    <span>地址</span>
                    <strong>{selectedPage.url}</strong>
                  </div>
                  <div>
                    <span>定位 / 方向</span>
                    <strong>{selectedPage.config?.positioning ?? "-"} / {selectedPage.config?.direction ?? "-"}</strong>
                  </div>
                  <div>
                    <span>状态</span>
                    <strong>{selectedPage.config?.active ?? selectedPage.status !== "inactive" ? selectedPage.status : "inactive"}</strong>
                  </div>
                  <div>
                    <span>已用于广告系列</span>
                    <strong>{selectedPage.usageCount ?? 0}</strong>
                  </div>
                </div>
                <div className="button-row">
                  <a className="button primary" href={selectedPage.url} rel="noreferrer" target="_blank">
                    打开页面
                  </a>
                  <button className="button secondary" onClick={() => edit(selectedPage)} type="button">
                    编辑
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择落地页</div>
            )}
          </section>
        </aside>
      </section>
      </div>
    </AdminShell>
  );
}
