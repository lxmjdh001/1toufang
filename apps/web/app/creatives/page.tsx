"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type MediaAssetRow = {
  id: string;
  name: string;
  fileType: string;
  url: string;
};

type CopywritingRow = {
  id: string;
  name: string;
  headline: string;
};

type CreativeConfig = {
  mediaAssetId?: string;
  copywritingId?: string;
  format?: string;
  callToAction?: string;
  landingPageUrl?: string;
  pageId?: string;
  imageHash?: string;
  objectStorySpec?: Record<string, unknown>;
  tiktokCreatives?: unknown[];
  notes?: string;
};

type CreativeRow = {
  id: string;
  name: string;
  config: CreativeConfig;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
};

type CreativeDraft = {
  name: string;
  mediaAssetId: string;
  copywritingId: string;
  format: string;
  callToAction: string;
  landingPageUrl: string;
  pageId: string;
  imageHash: string;
  objectStorySpecJson: string;
  tiktokCreativesJson: string;
  notes: string;
  tags: string;
  status: string;
};

const emptyDraft: CreativeDraft = {
  name: "",
  mediaAssetId: "",
  copywritingId: "",
  format: "SINGLE_IMAGE",
  callToAction: "SHOP_NOW",
  landingPageUrl: "",
  pageId: "",
  imageHash: "",
  objectStorySpecJson: "",
  tiktokCreativesJson: "",
  notes: "",
  tags: "",
  status: "draft"
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

function formatJson(value: unknown) {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

function parseJsonField(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error(`${label} 不是有效 JSON`);
  }
}

function draftFromRow(row: CreativeRow): CreativeDraft {
  return {
    name: row.name,
    mediaAssetId: row.config.mediaAssetId ?? "",
    copywritingId: row.config.copywritingId ?? "",
    format: row.config.format ?? "SINGLE_IMAGE",
    callToAction: row.config.callToAction ?? "SHOP_NOW",
    landingPageUrl: row.config.landingPageUrl ?? "",
    pageId: row.config.pageId ?? "",
    imageHash: row.config.imageHash ?? "",
    objectStorySpecJson: formatJson(row.config.objectStorySpec),
    tiktokCreativesJson: formatJson(row.config.tiktokCreatives),
    notes: row.config.notes ?? "",
    tags: joinList(row.tags),
    status: row.status
  };
}

function buildPayload(draft: CreativeDraft) {
  return {
    name: draft.name,
    status: draft.status,
    tags: splitList(draft.tags),
    config: {
      mediaAssetId: draft.mediaAssetId || undefined,
      copywritingId: draft.copywritingId || undefined,
      format: draft.format,
      callToAction: draft.callToAction,
      landingPageUrl: draft.landingPageUrl || undefined,
      pageId: draft.pageId || undefined,
      imageHash: draft.imageHash || undefined,
      objectStorySpec: parseJsonField(draft.objectStorySpecJson, "Meta Object Story Spec"),
      tiktokCreatives: parseJsonField(draft.tiktokCreativesJson, "TikTok Creatives"),
      notes: draft.notes || undefined
    }
  };
}

function statusClass(status: string) {
  if (status === "ready") return "pill success";
  if (status === "archived") return "pill danger";
  return "pill warning";
}

export default function CreativesPage() {
  const [rows, setRows] = useState<CreativeRow[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRow[]>([]);
  const [copywritings, setCopywritings] = useState<CopywritingRow[]>([]);
  const [draft, setDraft] = useState<CreativeDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const readyCount = useMemo(() => rows.filter((row) => row.status === "ready").length, [rows]);
  const draftCount = useMemo(() => rows.filter((row) => row.status === "draft").length, [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [creativeRows, mediaRows, copyRows] = await Promise.all([
        apiRequest<CreativeRow[]>("/creatives"),
        apiRequest<MediaAssetRow[]>("/media-assets"),
        apiRequest<CopywritingRow[]>("/copywritings")
      ]);
      setRows(creativeRows);
      setMediaAssets(mediaRows);
      setCopywritings(copyRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载创意失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest(editingId ? `/creatives/${editingId}` : "/creatives", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存创意失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CreativeRow) {
    setError(null);
    try {
      await apiRequest(`/creatives/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除创意失败");
    }
  }

  function edit(row: CreativeRow) {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof CreativeDraft>(key: K, value: CreativeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function mediaName(id?: string) {
    const row = mediaAssets.find((item) => item.id === id);
    return row ? `${row.name} / ${row.fileType}` : "-";
  }

  function copyName(id?: string) {
    const row = copywritings.find((item) => item.id === id);
    return row ? `${row.name} / ${row.headline}` : "-";
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="创意库"
      description="组合素材、文案、落地页和 CTA，形成可复用的广告创意。"
      actions={
        <>
          <button className="button secondary" onClick={resetForm} type="button">
            新增创意
          </button>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
        </>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>创意总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>可投放</span>
          <strong>{readyCount}</strong>
        </div>
        <div className="metric">
          <span>草稿</span>
          <strong>{draftCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑创意" : "新增创意"}</h2>
            <p>创意会在 Campaign 创建和后续发布中复用。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="creativeName">创意名称</label>
              <input id="creativeName" onChange={(event) => updateDraft("name", event.target.value)} required value={draft.name} />
            </div>
            <div className="field">
              <label htmlFor="creativeMedia">素材</label>
              <select id="creativeMedia" onChange={(event) => updateDraft("mediaAssetId", event.target.value)} value={draft.mediaAssetId}>
                <option value="">不选择</option>
                {mediaAssets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} / {row.fileType}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="creativeCopy">文案</label>
              <select id="creativeCopy" onChange={(event) => updateDraft("copywritingId", event.target.value)} value={draft.copywritingId}>
                <option value="">不选择</option>
                {copywritings.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} / {row.headline}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="creativeFormat">格式</label>
              <select id="creativeFormat" onChange={(event) => updateDraft("format", event.target.value)} value={draft.format}>
                <option value="SINGLE_IMAGE">单图</option>
                <option value="VIDEO">视频</option>
                <option value="CAROUSEL">轮播</option>
                <option value="COLLECTION">合集</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="callToAction">CTA</label>
              <select id="callToAction" onChange={(event) => updateDraft("callToAction", event.target.value)} value={draft.callToAction}>
                <option value="SHOP_NOW">立即购买</option>
                <option value="LEARN_MORE">了解更多</option>
                <option value="SIGN_UP">注册</option>
                <option value="DOWNLOAD">下载</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="creativeStatus">状态</label>
              <select id="creativeStatus" onChange={(event) => updateDraft("status", event.target.value)} value={draft.status}>
                <option value="draft">草稿</option>
                <option value="ready">可投放</option>
                <option value="archived">归档</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="landingPageUrl">落地页 URL</label>
              <input id="landingPageUrl" onChange={(event) => updateDraft("landingPageUrl", event.target.value)} value={draft.landingPageUrl} />
            </div>
            <div className="field">
              <label htmlFor="metaPageId">Meta Page ID</label>
              <input id="metaPageId" onChange={(event) => updateDraft("pageId", event.target.value)} value={draft.pageId} />
            </div>
            <div className="field">
              <label htmlFor="metaImageHash">Meta Image Hash</label>
              <input id="metaImageHash" onChange={(event) => updateDraft("imageHash", event.target.value)} value={draft.imageHash} />
            </div>
            <div className="field">
              <label htmlFor="creativeTags">标签</label>
              <input id="creativeTags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
            </div>
          </div>
          <div className="split-grid">
            <div className="field">
              <label htmlFor="objectStorySpecJson">Meta Object Story Spec JSON</label>
              <textarea
                id="objectStorySpecJson"
                onChange={(event) => updateDraft("objectStorySpecJson", event.target.value)}
                value={draft.objectStorySpecJson}
              />
            </div>
            <div className="field">
              <label htmlFor="tiktokCreativesJson">TikTok Creatives JSON</label>
              <textarea
                id="tiktokCreativesJson"
                onChange={(event) => updateDraft("tiktokCreativesJson", event.target.value)}
                value={draft.tiktokCreativesJson}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="creativeNotes">备注</label>
            <textarea id="creativeNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存创意"}
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
              <th>创意</th>
              <th>状态</th>
              <th>素材</th>
              <th>文案</th>
              <th>格式/CTA</th>
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
                  <span className="muted">{row.config.landingPageUrl ?? "-"}</span>
                </td>
                <td>
                  <span className={statusClass(row.status)}>{row.status}</span>
                </td>
                <td>{mediaName(row.config.mediaAssetId)}</td>
                <td>{copyName(row.config.copywritingId)}</td>
                <td>
                  <strong>{row.config.format ?? "-"}</strong>
                  <br />
                  <span className="muted">
                    {row.config.callToAction ?? "-"} / {row.config.pageId ? `Page ${row.config.pageId}` : "未配 Page"}
                  </span>
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
                <td colSpan={8}>暂无创意</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
