"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type ViewMode = "cards" | "list";

type MediaAssetRow = {
  id: string;
  name: string;
  fileType: string;
  url: string;
  thumbnail?: string | null;
};

type CopywritingRow = {
  id: string;
  name: string;
  headline: string;
  primaryText?: string;
};

type CreativeMetric = {
  campaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
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
  metrics?: CreativeMetric;
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

function formatNumber(value?: number) {
  return Intl.NumberFormat("zh-CN").format(Number(value ?? 0));
}

function formatMoney(value?: number) {
  return Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(value ?? 0));
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
  if (status === "archived" || status.includes("reject") || status.includes("fail")) return "pill danger";
  return "pill warning";
}

function emptyMetric(): CreativeMetric {
  return { campaigns: 0, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, ctr: 0, cpc: 0, cpa: 0, roas: 0 };
}

export default function CreativesPage() {
  const [rows, setRows] = useState<CreativeRow[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRow[]>([]);
  const [copywritings, setCopywritings] = useState<CopywritingRow[]>([]);
  const [draft, setDraft] = useState<CreativeDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [tagFilter, setTagFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const readyCount = useMemo(() => rows.filter((row) => row.status === "ready").length, [rows]);
  const draftCount = useMemo(() => rows.filter((row) => row.status === "draft").length, [rows]);
  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(), [rows]);
  const totalMetric = useMemo(
    () =>
      rows.reduce((current, row) => {
        const metric = row.metrics ?? emptyMetric();
        current.campaigns += metric.campaigns;
        current.spend += metric.spend;
        current.impressions += metric.impressions;
        current.clicks += metric.clicks;
        current.conversions += metric.conversions;
        current.revenue += metric.revenue;
        return current;
      }, emptyMetric()),
    [rows]
  );

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const media = mediaAssets.find((item) => item.id === row.config.mediaAssetId);
      const copy = copywritings.find((item) => item.id === row.config.copywritingId);
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.config.format?.toLowerCase().includes(keyword) ||
        row.tags.some((tag) => tag.toLowerCase().includes(keyword)) ||
        media?.name.toLowerCase().includes(keyword) ||
        copy?.headline.toLowerCase().includes(keyword);
      const matchesTag = !tagFilter || row.tags.includes(tagFilter);
      const matchesStatus = !statusFilter || row.status === statusFilter;
      return matchesKeyword && matchesTag && matchesStatus;
    });
  }, [copywritings, mediaAssets, rows, searchTerm, statusFilter, tagFilter]);

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id));

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
      setSelectedIds((current) => current.filter((id) => creativeRows.some((row) => row.id === id)));
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
    setNotice(null);
    try {
      await apiRequest(editingId ? `/creatives/${editingId}` : "/creatives", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "创意已更新" : "创意已创建");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存创意失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CreativeRow) {
    if (!window.confirm(`确认删除创意 ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/creatives/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      setSelectedIds((current) => current.filter((id) => id !== row.id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除创意失败");
    }
  }

  async function duplicate(row: CreativeRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/creatives/${row.id}/duplicate`, { method: "POST" });
      setNotice("创意已复制为草稿");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制创意失败");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkTag(ids = selectedIds, tags = splitList(newTag)) {
    if (!ids.length) {
      setError("请先选择创意");
      return;
    }
    if (!tags.length) {
      setError("请输入标签");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<{ affected: number }>("/creatives/bulk-tags", {
        method: "POST",
        body: JSON.stringify({ ids, tags })
      });
      setNotice(`已为 ${result.affected} 个创意打标`);
      setNewTag("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打标失败");
    }
  }

  function edit(row: CreativeRow) {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof CreativeDraft>(key: K, value: CreativeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleVisibleRows() {
    setSelectedIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleRows.some((row) => row.id === id));
      return Array.from(new Set([...current, ...visibleRows.map((row) => row.id)]));
    });
  }

  function media(row: CreativeRow) {
    return mediaAssets.find((item) => item.id === row.config.mediaAssetId);
  }

  function copy(row: CreativeRow) {
    return copywritings.find((item) => item.id === row.config.copywritingId);
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
        <div className="button-row">
          <button className="button primary" onClick={resetForm} type="button">
            New ad creative
          </button>
          <button className="button secondary" onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")} type="button">
            {viewMode === "cards" ? "列表展示" : "卡片展示"}
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
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
        <div className="metric">
          <span>消耗 / 转化</span>
          <strong>
            {formatMoney(totalMetric.spend)} / {formatNumber(totalMetric.conversions)}
          </strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑创意" : "New ad creative"}</h2>
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
                <option value="rejected">拒审</option>
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

      <section className="panel creative-toolbar">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="creativeSearch">搜索</label>
            <input id="creativeSearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
          </div>
          <div className="field">
            <label htmlFor="creativeTagFilter">标签筛选</label>
            <select id="creativeTagFilter" onChange={(event) => setTagFilter(event.target.value)} value={tagFilter}>
              <option value="">全部标签</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="creativeStatusFilter">状态</label>
            <select id="creativeStatusFilter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="ready">可投放</option>
              <option value="rejected">拒审</option>
              <option value="archived">归档</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="creativeNewTag">Create Tag / 批量打标</label>
            <div className="inline-control">
              <input id="creativeNewTag" onChange={(event) => setNewTag(event.target.value)} value={newTag} />
              <button className="button secondary" onClick={() => void bulkTag()} type="button">
                应用
              </button>
            </div>
          </div>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={toggleVisibleRows} type="button">
            {allVisibleSelected ? "取消全选" : "选择当前结果"}
          </button>
          <span className="muted">已选择 {selectedIds.length} 个创意</span>
        </div>
      </section>

      {viewMode === "cards" ? (
        <section className="creative-card-grid">
          {visibleRows.map((row) => {
            const rowMedia = media(row);
            const rowCopy = copy(row);
            const metric = row.metrics ?? emptyMetric();
            return (
              <article className={`creative-card ${selectedIds.includes(row.id) ? "selected" : ""}`} key={row.id}>
                <button className="creative-select" onClick={() => toggleRow(row.id)} type="button">
                  {selectedIds.includes(row.id) ? "已选" : "选择"}
                </button>
                <div className="creative-thumb">
                  {rowMedia?.fileType === "IMAGE" ? (
                    <img alt={rowMedia.name} src={rowMedia.thumbnail || rowMedia.url} />
                  ) : rowMedia?.fileType === "VIDEO" ? (
                    <video src={rowMedia.url} />
                  ) : (
                    <span>{row.config.format ?? "Creative"}</span>
                  )}
                </div>
                <div className="creative-card-body">
                  <div>
                    <h3>{row.name}</h3>
                    <span className={statusClass(row.status)}>{row.status}</span>
                  </div>
                  <p>{rowCopy?.headline ?? row.config.landingPageUrl ?? "未关联文案"}</p>
                  <div className="tag-list">
                    {row.tags.length ? row.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>未打标签</span>}
                  </div>
                  <div className="creative-metrics">
                    <span>Spend {formatMoney(metric.spend)}</span>
                    <span>CTR {formatMoney(metric.ctr)}%</span>
                    <span>CV {formatNumber(metric.conversions)}</span>
                  </div>
                  <div className="row-actions">
                    <button className="button secondary" onClick={() => edit(row)} type="button">
                      编辑
                    </button>
                    <button className="button secondary" disabled={busyId === row.id} onClick={() => void duplicate(row)} type="button">
                      复制
                    </button>
                    <button className="button secondary" onClick={() => void bulkTag([row.id])} type="button">
                      标签
                    </button>
                    <button className="button danger" onClick={() => void remove(row)} type="button">
                      删除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {visibleRows.length === 0 && !loading ? <div className="empty-state">暂无创意</div> : null}
        </section>
      ) : (
        <section className="table-panel">
          <table className="creative-table">
            <thead>
              <tr>
                <th>选择</th>
                <th>创意</th>
                <th>状态</th>
                <th>素材</th>
                <th>文案</th>
                <th>格式/CTA</th>
                <th>标签</th>
                <th>广告数</th>
                <th>消耗</th>
                <th>曝光</th>
                <th>点击</th>
                <th>CTR</th>
                <th>CPC</th>
                <th>转化</th>
                <th>ROAS</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const metric = row.metrics ?? emptyMetric();
                return (
                  <tr key={row.id}>
                    <td>
                      <input checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} type="checkbox" />
                    </td>
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
                      <span className="muted">{row.config.callToAction ?? "-"}</span>
                    </td>
                    <td>
                      <div className="tag-list">
                        {row.tags.length ? row.tags.map((tag) => <span key={tag}>{tag}</span>) : "-"}
                      </div>
                    </td>
                    <td>{formatNumber(metric.campaigns)}</td>
                    <td>{formatMoney(metric.spend)}</td>
                    <td>{formatNumber(metric.impressions)}</td>
                    <td>{formatNumber(metric.clicks)}</td>
                    <td>{formatMoney(metric.ctr)}%</td>
                    <td>{formatMoney(metric.cpc)}</td>
                    <td>{formatNumber(metric.conversions)}</td>
                    <td>{formatMoney(metric.roas)}</td>
                    <td>{formatDate(row.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="button secondary" onClick={() => edit(row)} type="button">
                          编辑
                        </button>
                        <button className="button secondary" disabled={busyId === row.id} onClick={() => void duplicate(row)} type="button">
                          复制
                        </button>
                        <button className="button secondary" onClick={() => void bulkTag([row.id])} type="button">
                          标签
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
                  <td colSpan={17}>暂无创意</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      )}
    </AdminShell>
  );
}
