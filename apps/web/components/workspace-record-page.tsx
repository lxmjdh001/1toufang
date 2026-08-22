"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  { value: "pending", label: "待处理" },
  { value: "running", label: "执行中" },
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
  if (["active", "sent", "running", "approved", "paid"].includes(status)) return "pill success";
  if (["paused", "pending"].includes(status)) return "pill warning";
  if (["archived", "failed", "rejected"].includes(status)) return "pill danger";
  return "pill";
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    submit: "提交审核",
    run: "执行",
    send: "发送",
    fetch_reviews: "同步评论",
    activate: "启用",
    pause: "暂停",
    approve: "通过",
    reject: "驳回",
    pay: "标记已支付",
    archive: "归档",
    restore: "恢复"
  };
  return labels[action] ?? action;
}

function workflowSteps(module: string) {
  const steps: Record<string, string[]> = {
    optimizer: ["配置规则", "启用规则", "执行规则", "查看结果"],
    copilot: ["配置助手", "保存草稿", "启用助手", "关联页面"],
    store: ["添加店铺", "配置同步", "启用店铺", "同步评论"],
    tool: ["选择工具", "填写来源", "启用任务", "执行并查看结果"],
    newsletter: ["创建草稿", "填写内容", "发送", "归档"],
    billing: ["创建账单", "核对金额", "标记支付", "归档"],
    "referral-link": ["创建链接", "设置佣金", "启用推广", "查看归因"],
    commission: ["生成佣金", "审核确认", "执行支付", "完成结算"],
    withdrawal: ["提交申请", "审核申请", "执行打款", "完成提现"],
    vcc: ["填写申请", "提交审核", "审核开通", "启用或停用"]
  };
  return steps[module] ?? ["新建配置", "保存", "执行", "查看结果"];
}

function actionAvailable(module: string, status: string, action: string) {
  const allowed: Record<string, Record<string, string[]>> = {
    optimizer: { activate: ["draft", "paused"], pause: ["active"], run: ["active"] },
    copilot: { activate: ["draft", "paused"], pause: ["active"] },
    store: { activate: ["draft", "paused"], pause: ["active"], fetch_reviews: ["active"] },
    tool: { activate: ["draft", "paused"], pause: ["active"], run: ["active"] },
    newsletter: { send: ["draft"], archive: ["draft", "sent"] },
    billing: { pay: ["pending", "failed"], archive: ["paid", "failed"] },
    "referral-link": { activate: ["draft", "paused"], pause: ["active"], archive: ["draft", "paused", "active"] },
    commission: { approve: ["pending"], reject: ["pending"], pay: ["approved"] },
    withdrawal: { approve: ["pending"], reject: ["pending"], pay: ["approved"] },
    vcc: { submit: ["draft"], approve: ["pending"], activate: ["paused"], pause: ["active"] }
  };
  return allowed[module]?.[action]?.includes(status) ?? true;
}

function valueText(value: unknown) {
  if (value === undefined || value === null || value === "") return "未设置";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function actionSummary(row: WorkspaceRecord) {
  const config = row.config ?? {};
  const lastRunAt = valueText(config.lastRunAt);
  const lastReviewSyncAt = valueText(config.lastReviewSyncAt);
  const sentAt = valueText(config.sentAt);
  if (lastReviewSyncAt !== "未设置") return `评论同步：${formatDate(String(lastReviewSyncAt))}`;
  if (lastRunAt !== "未设置") return `最近执行：${formatDate(String(lastRunAt))}`;
  if (sentAt !== "未设置") return `发送时间：${formatDate(String(sentAt))}`;
  return "尚未执行动作";
}

export function WorkspaceRecordPage({
  module,
  title,
  description,
  fields,
  statusOptions = defaultStatuses,
  actions = []
}: WorkspaceRecordPageProps) {
  const pathname = usePathname();
  const router = useRouter();
  const createMode = pathname.endsWith("/create");
  const basePath = createMode ? pathname.slice(0, -"/create".length) || "/" : pathname;
  const [editParam, setEditParam] = useState<string | null>(null);
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

  useEffect(() => {
    setEditParam(new URLSearchParams(window.location.search).get("edit"));
  }, []);

  useEffect(() => {
    if (!createMode || editingId) return;
    if (!editParam) {
      startCreate();
      return;
    }
    const row = rows.find((item) => item.id === editParam);
    if (row) startEdit(row);
  }, [createMode, editParam, editingId, rows]);

  function startCreate() {
    if (!createMode) {
      router.push(`${basePath}/create`);
      return;
    }
    const next: Record<string, string> = { name: "", status: statusOptions[0]?.value ?? "draft" };
    for (const field of fields) next[field.key] = "";
    setEditingId("new");
    setDraft(next);
    setError(null);
    setNotice(null);
  }

  function startEdit(row: WorkspaceRecord) {
    if (!createMode) {
      router.push(`${basePath}/create?edit=${encodeURIComponent(row.id)}`);
      return;
    }
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
      if (createMode) router.push(basePath);
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
    <AdminShell
      title={createMode ? `${editingId === "new" ? "创建" : "编辑"}${title}` : title}
      description={createMode ? description : undefined}
      breadcrumbs={[{ label: title, href: basePath }, { label: createMode ? (editingId === "new" ? "创建" : "编辑") : "列表" }]}
      actions={createMode ? <a className="button secondary" href={basePath}>返回列表</a> : <button className="button primary" onClick={startCreate} type="button">创建{title}</button>}
    >

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="workspace-resource-layout workspace-peer-list">
        <section className="table-panel workspace-table-panel">
          <div className="table-header">
            <div><strong>{title}</strong><span className="muted">共 {visibleRows.length} 条</span></div>
            <div className="workspace-toolbar">
              <input aria-label="搜索" onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或配置" value={query} />
              <select aria-label="状态筛选" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                <option value="">全部状态</option>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button className="button small" type="button">切换显示字段</button>
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
                      <td><div className="workspace-summary">{fields.slice(0, 3).map((field) => <span key={field.key}>{field.label}：{valueText(row.config?.[field.key])}</span>)}<span>{actionSummary(row)}</span></div></td>
                      <td><span className={statusClass(row.status)}>{statusLabel(row.status, statusOptions)}</span></td>
                      <td className="workspace-nowrap">{formatDate(row.updatedAt)}</td>
                      <td><div className="workspace-row-actions"><button className="button small" onClick={() => startEdit(row)} type="button">编辑</button><button className="button small" disabled={busyId === row.id} onClick={() => runAction(row.id, "duplicate")} type="button">复制</button>{actions.filter((action) => actionAvailable(module, row.status, action)).map((action) => <button className="button small" disabled={busyId === row.id} key={action} onClick={() => runAction(row.id, action)} type="button">{actionLabel(action)}</button>)}<button className="button small danger-button" disabled={busyId === row.id} onClick={() => remove(row.id)} type="button">删除</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-pagination workspace-pagination"><span>第 {page} / {pageCount} 页</span><button className="button small" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">上一页</button><button className="button small" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} type="button">下一页</button></div>
        </section>

        {createMode && editingId ? <aside className="panel workspace-editor"><div className="panel-heading"><div><h3>{editingId === "new" ? `新建${title}` : `编辑${title}`}</h3><p>配置保存后会立即对当前团队生效。</p></div><a className="button small" href={basePath}>关闭</a></div><form className="form" onSubmit={save}><label className="field"><span>名称</span><input onChange={(event) => updateDraft("name", event.target.value)} value={draft.name ?? ""} /></label><label className="field"><span>状态</span><select onChange={(event) => updateDraft("status", event.target.value)} value={draft.status ?? "draft"}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{fields.map((field) => <label className="field" key={field.key}><span>{field.label}</span>{field.type === "textarea" ? <textarea onChange={(event) => updateDraft(field.key, event.target.value)} placeholder={field.placeholder} rows={4} value={draft[field.key] ?? ""} /> : field.type === "select" ? <select onChange={(event) => updateDraft(field.key, event.target.value)} value={draft[field.key] ?? ""}><option value="">请选择</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input onChange={(event) => updateDraft(field.key, event.target.value)} placeholder={field.placeholder} type={field.type ?? "text"} value={draft[field.key] ?? ""} />}</label>)}<div className="page-actions"><a className="button" href={basePath}>取消</a><button className="button primary" disabled={saving} type="submit">{saving ? "保存中..." : "保存"}</button></div></form></aside> : null}
      </div>
    </AdminShell>
  );
}
