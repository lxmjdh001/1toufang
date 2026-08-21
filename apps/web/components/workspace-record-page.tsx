"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "./admin-shell";
import { apiRequest } from "../lib/api";

export type WorkspaceField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

export type WorkspaceRecordPageProps = {
  module: string;
  title: string;
  description: string;
  fields: WorkspaceField[];
  statusOptions?: Array<{ value: string; label: string }>;
  actions?: string[];
};

type WorkspaceRecord = {
  id: string;
  module: string;
  name: string;
  status: string;
  config?: Record<string, unknown> | null;
  updatedAt: string;
  createdBy?: { email: string; profile?: { name?: string | null } | null } | null;
};

const defaultStatuses = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "已启用" },
  { value: "paused", label: "已暂停" },
  { value: "archived", label: "已归档" }
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(status: string, options: Array<{ value: string; label: string }>) {
  return options.find((item) => item.value === status)?.label ?? status;
}

function statusClass(status: string) {
  if (["active", "sent", "running"].includes(status)) return "pill success";
  if (["paused", "pending"].includes(status)) return "pill warning";
  if (["archived", "failed"].includes(status)) return "pill danger";
  return "pill";
}

function valueText(value: unknown) {
  if (value === undefined || value === null || value === "") return "未设置";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

export function WorkspaceRecordPage({
  module,
  title,
  description,
  fields,
  statusOptions = defaultStatuses,
  actions = []
}: WorkspaceRecordPageProps) {
  const [rows, setRows] = useState<WorkspaceRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pageSize = 20;

  const visibleRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      const values = Object.values(row.config ?? {}).map(valueText).join(" ").toLowerCase();
      return (
        (!keyword || `${row.name} ${values}`.toLowerCase().includes(keyword)) &&
        (!statusFilter || row.status === statusFilter)
      );
    });
  }, [query, rows, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pagedRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiRequest<WorkspaceRecord[]>(`/workspace-records?module=${encodeURIComponent(module)}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [module]);

  function startCreate() {
    const next: Record<string, string> = { name: "", status: statusOptions[0]?.value ?? "draft" };
    for (const field of fields) next[field.key] = "";
    setEditingId("new");
    setDraft(next);
    setError(null);
    setNotice(null);
  }

  function startEdit(row: WorkspaceRecord) {
    const next: Record<string, string> = { name: row.name, status: row.status };
    for (const field of fields) next[field.key] = valueText(row.config?.[field.key]) === "未设置" ? "" : valueText(row.config?.[field.key]);
    setEditingId(row.id);
    setDraft(next);
    setError(null);
    setNotice(null);
  }

  function updateDraft(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name?.trim()) {
      setError("请填写名称");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const config = Object.fromEntries(fields.map((field) => [field.key, draft[field.key] || undefined]));
      const payload = { name: draft.name.trim(), status: draft.status || "draft", config };
      if (editingId === "new") {
        await apiRequest("/workspace-records", { method: "POST", body: JSON.stringify({ module, ...payload }) });
        setNotice("已创建");
      } else {
        await apiRequest(`/workspace-records/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setNotice("已保存");
      }
      setEditingId(null);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(id: string, action: string) {
    setBusyId(id);
    setError(null);
    try {
      await apiRequest(`/workspace-records/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      setNotice(action === "duplicate" ? "已复制一份记录" : "操作已执行");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("确认删除这条记录吗？")) return;
    setBusyId(id);
    try {
      await apiRequest(`/workspace-records/${id}`, { method: "DELETE" });
      setNotice("已删除");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title={title} description={description} actions={<button className="button primary" onClick={startCreate} type="button">+ 新建</button>}>
      <div className="metric-grid compact-metrics workspace-metrics">
        <div className="metric"><span>全部</span><strong>{rows.length}</strong><small>当前工作区记录</small></div>
        <div className="metric"><span>已启用</span><strong>{rows.filter((row) => row.status === "active").length}</strong><small>正在执行或可用</small></div>
        <div className="metric"><span>草稿</span><strong>{rows.filter((row) => row.status === "draft").length}</strong><small>待继续配置</small></div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="workspace-resource-layout">
        <section className="table-panel workspace-table-panel">
          <div className="table-header">
            <div><strong>{title}</strong><span className="muted">共 {visibleRows.length} 条</span></div>
            <div className="workspace-toolbar">
              <input aria-label="搜索" onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或配置" value={query} />
              <select aria-label="状态筛选" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                <option value="">全部状态</option>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          {loading ? <div className="empty-state">正在加载...</div> : pagedRows.length === 0 ? <div className="empty-state">暂无记录，点击右上角新建</div> : (
            <div className="workspace-table-scroll">
              <table className="workspace-table">
                <thead><tr><th>名称</th><th>配置摘要</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id}>
                      <td><strong className="workspace-nowrap">{row.name}</strong><small className="muted workspace-nowrap">{row.createdBy?.profile?.name ?? row.createdBy?.email ?? "-"}</small></td>
                      <td><div className="workspace-summary">{fields.slice(0, 3).map((field) => <span key={field.key}>{field.label}：{valueText(row.config?.[field.key])}</span>)}</div></td>
                      <td><span className={statusClass(row.status)}>{statusLabel(row.status, statusOptions)}</span></td>
                      <td className="workspace-nowrap">{formatDate(row.updatedAt)}</td>
                      <td><div className="workspace-row-actions"><button className="button small" onClick={() => startEdit(row)} type="button">编辑</button><button className="button small" disabled={busyId === row.id} onClick={() => runAction(row.id, "duplicate")} type="button">复制</button>{actions.includes("run") ? <button className="button small" disabled={busyId === row.id} onClick={() => runAction(row.id, "run")} type="button">执行</button> : null}<button className="button small danger-button" disabled={busyId === row.id} onClick={() => remove(row.id)} type="button">删除</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-pagination workspace-pagination"><span>第 {page} / {pageCount} 页</span><button className="button small" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">上一页</button><button className="button small" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} type="button">下一页</button></div>
        </section>

        {editingId ? <aside className="panel workspace-editor"><div className="panel-heading"><div><h3>{editingId === "new" ? `新建${title}` : `编辑${title}`}</h3><p>配置保存后会立即对当前团队生效。</p></div><button className="button small" onClick={() => setEditingId(null)} type="button">关闭</button></div><form className="form" onSubmit={save}><label className="field"><span>名称</span><input onChange={(event) => updateDraft("name", event.target.value)} value={draft.name ?? ""} /></label><label className="field"><span>状态</span><select onChange={(event) => updateDraft("status", event.target.value)} value={draft.status ?? "draft"}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{fields.map((field) => <label className="field" key={field.key}><span>{field.label}</span>{field.type === "textarea" ? <textarea onChange={(event) => updateDraft(field.key, event.target.value)} placeholder={field.placeholder} rows={4} value={draft[field.key] ?? ""} /> : field.type === "select" ? <select onChange={(event) => updateDraft(field.key, event.target.value)} value={draft[field.key] ?? ""}><option value="">请选择</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input onChange={(event) => updateDraft(field.key, event.target.value)} placeholder={field.placeholder} type={field.type ?? "text"} value={draft[field.key] ?? ""} />}</label>)}<div className="page-actions"><button className="button" onClick={() => setEditingId(null)} type="button">取消</button><button className="button primary" disabled={saving} type="submit">{saving ? "保存中..." : "保存"}</button></div></form></aside> : null}
      </div>
    </AdminShell>
  );
}
