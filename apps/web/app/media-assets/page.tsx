"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type SortKey = "newest" | "oldest" | "name_asc" | "name_desc";

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
  folderPath: string;
};

const emptyDraft: MediaDraft = {
  name: "",
  fileType: "IMAGE",
  url: "",
  thumbnail: "",
  sizeBytes: "",
  tags: "",
  folderPath: "/"
};

const folderStorageKey = "wzzads-media-folders";

function splitList(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value?: string[]) {
  return (value ?? []).filter((tag) => !tag.startsWith("folder:")).join(", ");
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

function formatBytes(value?: number | null) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeFolder(value?: string) {
  const raw = (value ?? "/").trim().replaceAll("\\", "/");
  const cleaned = raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
  return cleaned ? `/${cleaned}` : "/";
}

function folderPath(row: MediaAssetRow) {
  const tag = row.tags.find((item) => item.startsWith("folder:"));
  return normalizeFolder(tag ? tag.slice("folder:".length) : "/");
}

function folderDepth(path: string) {
  return path === "/" ? 0 : path.split("/").filter(Boolean).length;
}

function folderName(path: string) {
  return path === "/" ? "全部素材" : path.split("/").filter(Boolean).at(-1) ?? path;
}

function parentFolder(path: string) {
  const parts = normalizeFolder(path).split("/").filter(Boolean);
  parts.pop();
  return normalizeFolder(parts.join("/"));
}

function isInsideFolder(path: string, folder: string) {
  const current = normalizeFolder(path);
  const target = normalizeFolder(folder);
  return target === "/" ? true : current === target || current.startsWith(`${target}/`);
}

function tagsWithFolder(tags: string[], folder: string) {
  return Array.from(new Set([...tags.filter((tag) => !tag.startsWith("folder:")), `folder:${normalizeFolder(folder)}`]));
}

function draftFromRow(row: MediaAssetRow): MediaDraft {
  return {
    name: row.name,
    fileType: row.fileType,
    url: row.url,
    thumbnail: row.thumbnail ?? "",
    sizeBytes: row.sizeBytes?.toString() ?? "",
    tags: joinList(row.tags),
    folderPath: folderPath(row)
  };
}

function buildPayload(draft: MediaDraft) {
  return {
    name: draft.name,
    fileType: draft.fileType,
    url: draft.url,
    thumbnail: draft.thumbnail || undefined,
    sizeBytes: toNumber(draft.sizeBytes),
    tags: tagsWithFolder(splitList(draft.tags), draft.folderPath)
  };
}

function detectFileType(file: File) {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.includes("html")) return "HTML";
  return "OTHER";
}

function readStoredFolders() {
  try {
    const value = window.localStorage.getItem(folderStorageKey);
    const folders = value ? (JSON.parse(value) as string[]) : [];
    return folders.map(normalizeFolder).filter((item) => item !== "/");
  } catch {
    return [];
  }
}

function storeFolders(folders: string[]) {
  window.localStorage.setItem(
    folderStorageKey,
    JSON.stringify(Array.from(new Set(folders.map(normalizeFolder).filter((item) => item !== "/"))).sort())
  );
}

export default function MediaAssetsPage() {
  const [rows, setRows] = useState<MediaAssetRow[]>([]);
  const [draft, setDraft] = useState<MediaDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localFolders, setLocalFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState("/");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const imageCount = useMemo(() => rows.filter((row) => row.fileType === "IMAGE").length, [rows]);
  const videoCount = useMemo(() => rows.filter((row) => row.fileType === "VIDEO").length, [rows]);
  const otherCount = rows.length - imageCount - videoCount;
  const selectedAsset = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);

  const folders = useMemo(() => {
    const folderSet = new Set<string>(["/", ...localFolders]);
    for (const row of rows) {
      const path = folderPath(row);
      const parts = path.split("/").filter(Boolean);
      for (let index = 0; index < parts.length; index += 1) {
        folderSet.add(normalizeFolder(parts.slice(0, index + 1).join("/")));
      }
    }
    return Array.from(folderSet).sort((left, right) => {
      if (left === "/") return -1;
      if (right === "/") return 1;
      return left.localeCompare(right, "zh-CN");
    });
  }, [localFolders, rows]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) counts.set(folder, 0);
    for (const row of rows) {
      const path = folderPath(row);
      for (const folder of folders) {
        if (isInsideFolder(path, folder)) counts.set(folder, (counts.get(folder) ?? 0) + 1);
      }
    }
    return counts;
  }, [folders, rows]);

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows
      .filter((row) => {
        const inFolder = isInsideFolder(folderPath(row), activeFolder);
        const inKeyword =
          !keyword ||
          row.name.toLowerCase().includes(keyword) ||
          row.fileType.toLowerCase().includes(keyword) ||
          row.tags.some((tag) => tag.toLowerCase().includes(keyword));
        return inFolder && inKeyword;
      })
      .sort((left, right) => {
        if (sortKey === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        if (sortKey === "name_asc") return left.name.localeCompare(right.name, "zh-CN");
        if (sortKey === "name_desc") return right.name.localeCompare(left.name, "zh-CN");
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  }, [activeFolder, rows, searchTerm, sortKey]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await apiRequest<MediaAssetRow[]>("/media-assets");
      setRows(nextRows);
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id ?? null));
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
    setNotice(null);
    try {
      const asset = await apiRequest<MediaAssetRow>(editingId ? `/media-assets/${editingId}` : "/media-assets", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "素材已更新" : "素材已保存");
      setSelectedId(asset.id);
      rememberFolder(draft.folderPath);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存素材失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MediaAssetRow) {
    if (!window.confirm(`确认删除素材 ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/media-assets/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除素材失败");
    }
  }

  async function updateAssetFolder(row: MediaAssetRow, nextFolder: string) {
    setError(null);
    try {
      await apiRequest(`/media-assets/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tags: tagsWithFolder(row.tags, nextFolder) })
      });
      rememberFolder(nextFolder);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移动素材失败");
    }
  }

  function edit(row: MediaAssetRow) {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
    setSelectedId(row.id);
  }

  function resetForm() {
    setEditingId(null);
    setDraft({ ...emptyDraft, folderPath: activeFolder });
  }

  function updateDraft<K extends keyof MediaDraft>(key: K, value: MediaDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function rememberFolder(path: string) {
    const folder = normalizeFolder(path);
    if (folder === "/") return;
    setLocalFolders((current) => {
      const next = Array.from(new Set([...current, folder])).sort();
      storeFolders(next);
      return next;
    });
  }

  function createFolder() {
    const name = window.prompt("文件夹名称");
    if (!name?.trim()) return;
    const parent = activeFolder === "/" ? "" : activeFolder;
    const next = normalizeFolder(`${parent}/${name}`);
    rememberFolder(next);
    setActiveFolder(next);
    setDraft((current) => ({ ...current, folderPath: next }));
  }

  async function renameFolder(path: string) {
    if (path === "/") return;
    const name = window.prompt("新的文件夹名称", folderName(path));
    if (!name?.trim()) return;
    const nextPath = normalizeFolder(`${parentFolder(path)}/${name}`);
    await replaceFolderPath(path, nextPath);
    setActiveFolder(nextPath);
  }

  async function moveFolder(path: string) {
    if (path === "/") return;
    const target = window.prompt("移动到哪个父文件夹？输入路径，例如 /素材/夏季", parentFolder(path));
    if (target === null) return;
    const nextPath = normalizeFolder(`${normalizeFolder(target)}/${folderName(path)}`);
    await replaceFolderPath(path, nextPath);
    setActiveFolder(nextPath);
  }

  async function deleteFolder(path: string) {
    if (path === "/") return;
    if (!window.confirm(`删除文件夹 ${path}？文件夹内素材会移动到根目录。`)) return;
    setError(null);
    try {
      const affected = rows.filter((row) => isInsideFolder(folderPath(row), path));
      await Promise.all(
        affected.map((row) =>
          apiRequest(`/media-assets/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ tags: tagsWithFolder(row.tags, "/") })
          })
        )
      );
      const nextFolders = localFolders.filter((folder) => !isInsideFolder(folder, path));
      setLocalFolders(nextFolders);
      storeFolders(nextFolders);
      setActiveFolder("/");
      setNotice("文件夹已删除，素材已移动到根目录");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除文件夹失败");
    }
  }

  async function replaceFolderPath(oldPath: string, nextPath: string) {
    setError(null);
    try {
      const affected = rows.filter((row) => isInsideFolder(folderPath(row), oldPath));
      await Promise.all(
        affected.map((row) => {
          const currentFolder = folderPath(row);
          const movedFolder = normalizeFolder(currentFolder.replace(normalizeFolder(oldPath), normalizeFolder(nextPath)));
          return apiRequest(`/media-assets/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify({ tags: tagsWithFolder(row.tags, movedFolder) })
          });
        })
      );
      const nextFolders = Array.from(
        new Set(
          localFolders.map((folder) =>
            isInsideFolder(folder, oldPath) ? normalizeFolder(folder.replace(normalizeFolder(oldPath), normalizeFolder(nextPath))) : folder
          )
        )
      );
      setLocalFolders(nextFolders);
      storeFolders(nextFolders);
      setNotice("文件夹已更新");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新文件夹失败");
    }
  }

  function onUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setDraft((current) => ({
        ...current,
        name: current.name || file.name.replace(/\.[^.]+$/, ""),
        fileType: detectFileType(file),
        url: dataUrl,
        thumbnail: file.type.startsWith("image/") ? dataUrl : current.thumbnail,
        sizeBytes: String(file.size),
        folderPath: activeFolder
      }));
      setUploading(false);
    };
    reader.onerror = () => {
      setError("读取文件失败");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    setLocalFolders(readStoredFolders());
    void load();
  }, []);

  useEffect(() => {
    setDraft((current) => ({ ...current, folderPath: editingId ? current.folderPath : activeFolder }));
  }, [activeFolder, editingId]);

  return (
    <AdminShell
      title="素材库"
      description="统一管理图片、视频、HTML 等广告素材资源，支持文件夹分组、上传、预览和详情管理。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={createFolder} type="button">
            创建文件夹
          </button>
          <button className="button secondary" onClick={resetForm} type="button">
            新增素材
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
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
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="asset-layout">
        <aside className="asset-sidebar">
          <div className="asset-sidebar-head">
            <strong>文件夹</strong>
            <button className="button secondary" onClick={createFolder} type="button">
              新建
            </button>
          </div>
          <div className="folder-tree">
            {folders.map((folder) => (
              <button
                className={activeFolder === folder ? "active" : ""}
                key={folder}
                onClick={() => setActiveFolder(folder)}
                style={{ paddingLeft: `${12 + folderDepth(folder) * 14}px` }}
                type="button"
              >
                <span>{folderName(folder)}</span>
                <strong>{folderCounts.get(folder) ?? 0}</strong>
              </button>
            ))}
          </div>
          {activeFolder !== "/" ? (
            <div className="folder-actions">
              <button className="button secondary" onClick={() => void renameFolder(activeFolder)} type="button">
                重命名
              </button>
              <button className="button secondary" onClick={() => void moveFolder(activeFolder)} type="button">
                移动
              </button>
              <button className="button danger" onClick={() => void deleteFolder(activeFolder)} type="button">
                删除
              </button>
            </div>
          ) : null}
        </aside>

        <div className="asset-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{editingId ? "编辑素材" : "上传/新增素材"}</h2>
                <p>可选择本地文件生成素材，也可以直接登记素材 URL。</p>
              </div>
            </div>
            <form className="form" onSubmit={onSubmit}>
              <div className="upload-drop">
                <input id="mediaUpload" onChange={onUploadFile} type="file" />
                <label htmlFor="mediaUpload">{uploading ? "读取中..." : "选择本地文件上传"}</label>
              </div>
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
                  <label htmlFor="mediaFolder">文件夹</label>
                  <select id="mediaFolder" onChange={(event) => updateDraft("folderPath", event.target.value)} value={draft.folderPath}>
                    {folders.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sizeBytes">文件大小</label>
                  <input
                    id="sizeBytes"
                    min="0"
                    onChange={(event) => updateDraft("sizeBytes", event.target.value)}
                    type="number"
                    value={draft.sizeBytes}
                  />
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
                  <label htmlFor="mediaTags">标签</label>
                  <input id="mediaTags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
                </div>
              </div>
              <div className="button-row">
                <button className="button primary" disabled={saving || uploading} type="submit">
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

          <section className="panel asset-browser">
            <div className="panel-heading">
              <div>
                <h2>{folderName(activeFolder)}</h2>
                <p>搜索、排序并选择素材查看预览。</p>
              </div>
              <div className="asset-controls">
                <input placeholder="搜索素材" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
                <select onChange={(event) => setSortKey(event.target.value as SortKey)} value={sortKey}>
                  <option value="newest">最新</option>
                  <option value="oldest">最老</option>
                  <option value="name_asc">名称 A-Z</option>
                  <option value="name_desc">名称 Z-A</option>
                </select>
              </div>
            </div>
            <div className="media-grid">
              {visibleRows.map((row) => (
                <button
                  className={`media-card ${selectedAsset?.id === row.id ? "active" : ""}`}
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  type="button"
                >
                  <div className="media-thumb">
                    {row.fileType === "IMAGE" ? (
                      <img alt={row.name} src={row.thumbnail || row.url} />
                    ) : row.fileType === "VIDEO" ? (
                      <video src={row.url} />
                    ) : (
                      <span>{row.fileType}</span>
                    )}
                  </div>
                  <strong>{row.name}</strong>
                  <small>
                    {folderPath(row)} / {formatBytes(row.sizeBytes)}
                  </small>
                </button>
              ))}
              {visibleRows.length === 0 && !loading ? <div className="empty-state">暂无素材</div> : null}
            </div>
          </section>
        </div>

        <aside className="asset-detail">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>文件详情</h2>
                <p>预览、移动、编辑和删除选中的素材。</p>
              </div>
            </div>
            {selectedAsset ? (
              <div className="asset-detail-body">
                <div className="asset-preview">
                  {selectedAsset.fileType === "IMAGE" ? (
                    <img alt={selectedAsset.name} src={selectedAsset.thumbnail || selectedAsset.url} />
                  ) : selectedAsset.fileType === "VIDEO" ? (
                    <video controls src={selectedAsset.url} />
                  ) : (
                    <a href={selectedAsset.url} rel="noreferrer" target="_blank">
                      打开素材
                    </a>
                  )}
                </div>
                <div className="detail-list">
                  <div>
                    <span>名称</span>
                    <strong>{selectedAsset.name}</strong>
                  </div>
                  <div>
                    <span>类型</span>
                    <strong>{selectedAsset.fileType}</strong>
                  </div>
                  <div>
                    <span>文件夹</span>
                    <strong>{folderPath(selectedAsset)}</strong>
                  </div>
                  <div>
                    <span>大小</span>
                    <strong>{formatBytes(selectedAsset.sizeBytes)}</strong>
                  </div>
                  <div>
                    <span>创建时间</span>
                    <strong>{formatDate(selectedAsset.createdAt)}</strong>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="detailMoveFolder">移动到</label>
                  <select
                    id="detailMoveFolder"
                    onChange={(event) => void updateAssetFolder(selectedAsset, event.target.value)}
                    value={folderPath(selectedAsset)}
                  >
                    {folders.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="button-row">
                  <a className="button secondary" href={selectedAsset.url} rel="noreferrer" target="_blank">
                    打开
                  </a>
                  <button className="button secondary" onClick={() => edit(selectedAsset)} type="button">
                    编辑
                  </button>
                  <button className="button danger" onClick={() => void remove(selectedAsset)} type="button">
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择素材</div>
            )}
          </div>
        </aside>
      </section>
    </AdminShell>
  );
}
