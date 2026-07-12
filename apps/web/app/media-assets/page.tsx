"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type MediaAssetRow = {
  id: string;
  name: string;
  fileType: string;
  url: string;
  thumbnail?: string | null;
  sizeBytes?: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type MediaDraft = {
  name: string;
  fileType: string;
  url: string;
  thumbnail: string;
  sizeBytes: string;
  tags: string;
};

const emptyDraft: MediaDraft = {
  name: "",
  fileType: "IMAGE",
  url: "",
  thumbnail: "",
  sizeBytes: "",
  tags: ""
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

function toNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function draftFromRow(row: MediaAssetRow): MediaDraft {
  return {
    name: row.name,
    fileType: row.fileType,
    url: row.url,
    thumbnail: row.thumbnail ?? "",
    sizeBytes: row.sizeBytes?.toString() ?? "",
    tags: joinList(row.tags)
  };
}

function buildPayload(draft: MediaDraft) {
  return {
    name: draft.name,
    fileType: draft.fileType,
    url: draft.url,
    thumbnail: draft.thumbnail || undefined,
    sizeBytes: toNumber(draft.sizeBytes),
    tags: splitList(draft.tags)
  };
}

export default function MediaAssetsPage() {
  const [rows, setRows] = useState<MediaAssetRow[]>([]);
  const [draft, setDraft] = useState<MediaDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const imageCount = useMemo(() => rows.filter((row) => row.fileType === "IMAGE").length, [rows]);
  const videoCount = useMemo(() => rows.filter((row) => row.fileType === "VIDEO").length, [rows]);
  const otherCount = rows.length - imageCount - videoCount;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiRequest<MediaAssetRow[]>("/media-assets"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载素材失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest(editingId ? `/media-assets/${editingId}` : "/media-assets", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存素材失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MediaAssetRow) {
    setError(null);
    try {
      await apiRequest(`/media-assets/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除素材失败");
    }
  }

  function edit(row: MediaAssetRow) {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof MediaDraft>(key: K, value: MediaDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="素材库"
      description="统一管理图片、视频、HTML 等广告素材资源。"
      actions={
        <>
          <button className="button secondary" onClick={resetForm} type="button">
            新增素材
          </button>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
        </>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>素材总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>图片</span>
          <strong>{imageCount}</strong>
        </div>
        <div className="metric">
          <span>视频</span>
          <strong>{videoCount}</strong>
        </div>
        <div className="metric">
          <span>其他</span>
          <strong>{otherCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑素材" : "新增素材"}</h2>
            <p>当前先登记素材地址，后续接对象存储上传。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="mediaName">素材名称</label>
              <input id="mediaName" onChange={(event) => updateDraft("name", event.target.value)} required value={draft.name} />
            </div>
            <div className="field">
              <label htmlFor="fileType">类型</label>
              <select id="fileType" onChange={(event) => updateDraft("fileType", event.target.value)} value={draft.fileType}>
                <option value="IMAGE">图片</option>
                <option value="VIDEO">视频</option>
                <option value="HTML">HTML</option>
                <option value="OTHER">其他</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="mediaUrl">素材 URL</label>
              <input id="mediaUrl" onChange={(event) => updateDraft("url", event.target.value)} required value={draft.url} />
            </div>
            <div className="field">
              <label htmlFor="thumbnail">缩略图 URL</label>
              <input id="thumbnail" onChange={(event) => updateDraft("thumbnail", event.target.value)} value={draft.thumbnail} />
            </div>
            <div className="field">
              <label htmlFor="sizeBytes">文件大小</label>
              <input id="sizeBytes" min="0" onChange={(event) => updateDraft("sizeBytes", event.target.value)} type="number" value={draft.sizeBytes} />
            </div>
            <div className="field">
              <label htmlFor="mediaTags">标签</label>
              <input id="mediaTags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
            </div>
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存素材"}
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
              <th>素材</th>
              <th>类型</th>
              <th>地址</th>
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
                  <span className="muted">{row.sizeBytes ? `${row.sizeBytes} bytes` : "-"}</span>
                </td>
                <td>{row.fileType}</td>
                <td>
                  <a href={row.url} rel="noreferrer" target="_blank">
                    打开素材
                  </a>
                </td>
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
                <td colSpan={6}>暂无素材</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
