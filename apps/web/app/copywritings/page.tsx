"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type CopywritingRow = {
  id: string;
  name: string;
  primaryText: string;
  headline: string;
  description?: string | null;
  tags: string[];
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
};

type CopyDraft = {
  name: string;
  primaryText: string;
  headline: string;
  description: string;
  tags: string;
  remarks: string;
};

const emptyDraft: CopyDraft = {
  name: "",
  primaryText: "",
  headline: "",
  description: "",
  tags: "",
  remarks: ""
};

function splitList(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value?: string[]) {
  return (value ?? []).join(", ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function draftFromRow(row: CopywritingRow): CopyDraft {
  return {
    name: row.name,
    primaryText: row.primaryText,
    headline: row.headline,
    description: row.description ?? "",
    tags: joinList(row.tags),
    remarks: row.remarks ?? ""
  };
}

function buildPayload(draft: CopyDraft) {
  return {
    name: draft.name,
    primaryText: draft.primaryText,
    headline: draft.headline,
    description: draft.description || undefined,
    tags: splitList(draft.tags),
    remarks: draft.remarks || undefined
  };
}

export default function CopywritingsPage() {
  const [rows, setRows] = useState<CopywritingRow[]>([]);
  const [draft, setDraft] = useState<CopyDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const taggedCount = useMemo(() => rows.filter((row) => row.tags.length > 0).length, [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiRequest<CopywritingRow[]>("/copywritings"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载文案失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest(editingId ? `/copywritings/${editingId}` : "/copywritings", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存文案失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CopywritingRow) {
    setError(null);
    try {
      await apiRequest(`/copywritings/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除文案失败");
    }
  }

  function edit(row: CopywritingRow) {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof CopyDraft>(key: K, value: CopyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="文案库"
      description="维护可复用的主文案、标题、描述和投放备注。"
      actions={
        <>
          <button className="button secondary" onClick={resetForm} type="button">
            新增文案
          </button>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
        </>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>文案总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>已打标签</span>
          <strong>{taggedCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑文案" : "新增文案"}</h2>
            <p>文案会在创意组合和 Campaign 创建中复用。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="copyName">文案名称</label>
              <input id="copyName" onChange={(event) => updateDraft("name", event.target.value)} required value={draft.name} />
            </div>
            <div className="field">
              <label htmlFor="headline">标题</label>
              <input id="headline" onChange={(event) => updateDraft("headline", event.target.value)} required value={draft.headline} />
            </div>
            <div className="field">
              <label htmlFor="copyDescription">描述</label>
              <input id="copyDescription" onChange={(event) => updateDraft("description", event.target.value)} value={draft.description} />
            </div>
            <div className="field">
              <label htmlFor="copyTags">标签</label>
              <input id="copyTags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="primaryText">主文案</label>
            <textarea id="primaryText" onChange={(event) => updateDraft("primaryText", event.target.value)} required value={draft.primaryText} />
          </div>
          <div className="field">
            <label htmlFor="copyRemarks">备注</label>
            <textarea id="copyRemarks" onChange={(event) => updateDraft("remarks", event.target.value)} value={draft.remarks} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存文案"}
            </button>
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>文案</th>
              <th>主文案</th>
              <th>描述</th>
              <th>标签</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <br />
                  <span className="muted">{row.headline}</span>
                </td>
                <td>{row.primaryText}</td>
                <td>{row.description ?? "-"}</td>
                <td>
                  <span className="tag-list">
                    {row.tags.length
                      ? row.tags.map((tag) => (
                          <span className="pill" key={tag}>
                            {tag}
                          </span>
                        ))
                      : "-"}
                  </span>
                </td>
                <td>{formatDate(row.updatedAt)}</td>
                <td>
                  <div className="button-row">
                    <button className="button secondary" onClick={() => edit(row)} type="button">
                      编辑
                    </button>
                    <button className="button danger" onClick={() => void remove(row)} type="button">
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={6}>暂无文案</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
