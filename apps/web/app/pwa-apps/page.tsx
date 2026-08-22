"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type PwaConfig = {
  shortName?: string;
  iconUrl?: string;
  themeColor?: string;
  backgroundColor?: string;
  displayMode?: string;
  orientation?: string;
  landingPageId?: string;
  offerId?: string;
  domainId?: string;
  installPrompt?: boolean;
  notes?: string;
  active?: boolean;
};

type BindingRow = {
  id: string;
  name?: string;
  url?: string;
  domain?: string;
};

type PwaRow = {
  id: string;
  name: string;
  startUrl: string;
  status: string;
  config?: PwaConfig | null;
  usageCount?: number;
  bindings?: {
    landingPage?: BindingRow | null;
    offer?: BindingRow | null;
    domain?: BindingRow | null;
  };
  manifestPreview?: Record<string, unknown>;
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

type DomainRow = {
  id: string;
  domain: string;
  status: string;
};

type PwaDraft = {
  name: string;
  shortName: string;
  iconUrl: string;
  startUrl: string;
  status: string;
  themeColor: string;
  backgroundColor: string;
  displayMode: string;
  orientation: string;
  landingPageId: string;
  offerId: string;
  domainId: string;
  installPrompt: boolean;
  notes: string;
  active: boolean;
};

type FieldKey =
  | "icon"
  | "name"
  | "status"
  | "startUrl"
  | "landingPage"
  | "offer"
  | "domain"
  | "display"
  | "colors"
  | "usageCount"
  | "updatedAt"
  | "notes";

const emptyDraft: PwaDraft = {
  name: "",
  shortName: "",
  iconUrl: "",
  startUrl: "",
  status: "draft",
  themeColor: "#2563eb",
  backgroundColor: "#ffffff",
  displayMode: "standalone",
  orientation: "portrait",
  landingPageId: "",
  offerId: "",
  domainId: "",
  installPrompt: true,
  notes: "",
  active: true
};

const fieldOptions: Array<{ key: FieldKey; label: string }> = [
  { key: "icon", label: "图标" },
  { key: "name", label: "名称" },
  { key: "status", label: "状态" },
  { key: "startUrl", label: "启动地址" },
  { key: "landingPage", label: "Money Page" },
  { key: "offer", label: "Offer" },
  { key: "domain", label: "域名" },
  { key: "display", label: "显示模式" },
  { key: "colors", label: "颜色" },
  { key: "usageCount", label: "使用数" },
  { key: "updatedAt", label: "更新时间" },
  { key: "notes", label: "备注" }
];

const defaultFields: FieldKey[] = [
  "icon",
  "name",
  "status",
  "startUrl",
  "landingPage",
  "offer",
  "domain",
  "display",
  "colors",
  "usageCount",
  "updatedAt"
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function creatorName(row: PwaRow) {
  return row.creator?.profile?.name ?? row.creator?.email ?? "-";
}

function statusClass(status: string, active?: boolean) {
  if (!active || status === "inactive" || status === "archived") return "pill danger";
  if (status === "active" || status === "published") return "pill success";
  if (status === "draft" || status === "testing") return "pill warning";
  return "pill";
}

function draftFromRow(row: PwaRow): PwaDraft {
  return {
    name: row.name,
    shortName: row.config?.shortName ?? "",
    iconUrl: row.config?.iconUrl ?? "",
    startUrl: row.startUrl,
    status: row.status,
    themeColor: row.config?.themeColor ?? "#2563eb",
    backgroundColor: row.config?.backgroundColor ?? "#ffffff",
    displayMode: row.config?.displayMode ?? "standalone",
    orientation: row.config?.orientation ?? "portrait",
    landingPageId: row.config?.landingPageId ?? "",
    offerId: row.config?.offerId ?? "",
    domainId: row.config?.domainId ?? "",
    installPrompt: row.config?.installPrompt ?? true,
    notes: row.config?.notes ?? "",
    active: row.config?.active ?? row.status !== "inactive"
  };
}

function buildPayload(draft: PwaDraft) {
  return {
    name: draft.name,
    startUrl: draft.startUrl,
    status: draft.active ? draft.status : "inactive",
    config: {
      shortName: draft.shortName || undefined,
      iconUrl: draft.iconUrl || undefined,
      themeColor: draft.themeColor || undefined,
      backgroundColor: draft.backgroundColor || undefined,
      displayMode: draft.displayMode || undefined,
      orientation: draft.orientation || undefined,
      landingPageId: draft.landingPageId || undefined,
      offerId: draft.offerId || undefined,
      domainId: draft.domainId || undefined,
      installPrompt: draft.installPrompt,
      notes: draft.notes || undefined,
      active: draft.active
    }
  };
}

function manifestFromRow(row: PwaRow) {
  return (
    row.manifestPreview ?? {
      name: row.name,
      short_name: row.config?.shortName ?? row.name.slice(0, 12),
      start_url: row.startUrl,
      display: row.config?.displayMode ?? "standalone",
      orientation: row.config?.orientation ?? "portrait",
      theme_color: row.config?.themeColor ?? "#2563eb",
      background_color: row.config?.backgroundColor ?? "#ffffff"
    }
  );
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function PwaAppsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const createMode = pathname.endsWith("/create");
  const [editParam, setEditParam] = useState<string | null>(null);
  const [rows, setRows] = useState<PwaRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [draft, setDraft] = useState<PwaDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bindingFilter, setBindingFilter] = useState("");
  const [visibleFields, setVisibleFields] = useState<FieldKey[]>(defaultFields);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const activeCount = useMemo(() => rows.filter((row) => row.config?.active ?? row.status !== "inactive").length, [rows]);
  const publishedCount = useMemo(() => rows.filter((row) => row.status === "published" || row.status === "active").length, [rows]);
  const boundCount = useMemo(
    () => rows.filter((row) => row.config?.landingPageId || row.config?.offerId || row.config?.domainId).length,
    [rows]
  );
  const selectedPwa = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const active = row.config?.active ?? row.status !== "inactive";
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.startUrl.toLowerCase().includes(keyword) ||
        row.config?.shortName?.toLowerCase().includes(keyword) ||
        row.config?.notes?.toLowerCase().includes(keyword) ||
        landingPageName(row.config?.landingPageId).toLowerCase().includes(keyword) ||
        offerName(row.config?.offerId).toLowerCase().includes(keyword) ||
        domainName(row.config?.domainId).toLowerCase().includes(keyword);
      const matchesStatus = !statusFilter || (statusFilter === "inactive" ? !active : row.status === statusFilter);
      const matchesBinding =
        !bindingFilter ||
        (bindingFilter === "landingPage" && Boolean(row.config?.landingPageId)) ||
        (bindingFilter === "offer" && Boolean(row.config?.offerId)) ||
        (bindingFilter === "domain" && Boolean(row.config?.domainId)) ||
        (bindingFilter === "unbound" && !row.config?.landingPageId && !row.config?.offerId && !row.config?.domainId);
      return matchesKeyword && matchesStatus && matchesBinding;
    });
  }, [bindingFilter, rows, searchTerm, statusFilter]);

  const statusOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(), [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pwaRows, pageRows, offerRows, domainRows] = await Promise.all([
        apiRequest<PwaRow[]>("/pwa-apps"),
        apiRequest<LandingPageRow[]>("/landing-pages"),
        apiRequest<OfferRow[]>("/offers"),
        apiRequest<DomainRow[]>("/domains")
      ]);
      setRows(pwaRows);
      setLandingPages(pageRows);
      setOffers(offerRows);
      setDomains(domainRows);
      setSelectedId((current) => (current && pwaRows.some((row) => row.id === current) ? current : pwaRows[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 PWA 失败");
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
      const row = await apiRequest<PwaRow>(editingId ? `/pwa-apps/${editingId}` : "/pwa-apps", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "PWA 已更新" : "PWA 已创建");
      setSelectedId(row.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 PWA 失败");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(row: PwaRow) {
    setDuplicatingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const nextRow = await apiRequest<PwaRow>(`/pwa-apps/${row.id}/duplicate`, { method: "POST" });
      setSelectedId(nextRow.id);
      setNotice("PWA 已复制为草稿");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制 PWA 失败");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function toggleActive(row: PwaRow) {
    setError(null);
    setNotice(null);
    const active = !(row.config?.active ?? row.status !== "inactive");
    try {
      await apiRequest(`/pwa-apps/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: active ? "active" : "inactive",
          config: { ...(row.config ?? {}), active }
        })
      });
      setNotice(active ? "PWA 已激活" : "PWA 已停用");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新 PWA 状态失败");
    }
  }

  async function remove(row: PwaRow) {
    if (!window.confirm(`确认删除 PWA ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/pwa-apps/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除 PWA 失败");
    }
  }

  function edit(row: PwaRow) {
    if (!createMode) {
      router.push(`/pwa-apps/create?edit=${encodeURIComponent(row.id)}`);
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

  function updateDraft<K extends keyof PwaDraft>(key: K, value: PwaDraft[K]) {
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

  function offerName(id?: string) {
    return offers.find((item) => item.id === id)?.name ?? "-";
  }

  function domainName(id?: string) {
    return domains.find((item) => item.id === id)?.domain ?? "-";
  }

  function exportCsv() {
    const headers = ["创建者", "名称", "短名称", "启动地址", "状态", "Money Page", "Offer", "域名", "显示模式", "方向", "主题色", "背景色", "使用数", "备注", "创建时间"];
    const lines = visibleRows.map((row) =>
      [
        creatorName(row),
        row.name,
        row.config?.shortName,
        row.startUrl,
        row.config?.active ?? row.status !== "inactive" ? row.status : "inactive",
        landingPageName(row.config?.landingPageId),
        offerName(row.config?.offerId),
        domainName(row.config?.domainId),
        row.config?.displayMode,
        row.config?.orientation,
        row.config?.themeColor,
        row.config?.backgroundColor,
        row.usageCount ?? 0,
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
    link.download = "pwa-apps.csv";
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
      title={createMode ? "创建 PWA" : "PWA"}
      description={createMode ? "配置 PWA Manifest、承接页、Offer 和域名绑定。" : undefined}
      breadcrumbs={[{ label: "PWA", href: "/pwa-apps" }, { label: createMode ? "创建" : "列表" }]}
      actions={
        <div className="button-row">
          {createMode ? <a className="button secondary" href="/pwa-apps">返回列表</a> : <a className="button primary" href="/pwa-apps/create">创建 PWA</a>}
          <button className="button secondary" onClick={exportCsv} type="button">
            导出
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <div className={`pwa-resource-page ${createMode ? "is-create" : "is-list"}`}>
      <section className="metric-grid compact-metrics pwa-summary">
        <div className="metric metric-strong">
          <span>PWA 应用总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>激活</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="metric">
          <span>已发布 / 已启用</span>
          <strong>{publishedCount}</strong>
        </div>
        <div className="metric">
          <span>已绑定承接资源</span>
          <strong>{boundCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel pwa-create-panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑 PWA" : "创建 PWA"}</h2>
            <p>先维护应用清单和承接资源，后续可接入自动打包、发布和站点缓存策略。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pwaName">名称</label>
              <input id="pwaName" onChange={(event) => updateDraft("name", event.target.value)} required value={draft.name} />
            </div>
            <div className="field">
              <label htmlFor="pwaShortName">短名称</label>
              <input id="pwaShortName" onChange={(event) => updateDraft("shortName", event.target.value)} value={draft.shortName} />
            </div>
            <div className="field">
              <label htmlFor="pwaIconUrl">图标地址</label>
              <input id="pwaIconUrl" onChange={(event) => updateDraft("iconUrl", event.target.value)} value={draft.iconUrl} />
            </div>
            <div className="field">
              <label htmlFor="pwaStartUrl">启动地址</label>
              <input id="pwaStartUrl" onChange={(event) => updateDraft("startUrl", event.target.value)} required value={draft.startUrl} />
            </div>
            <div className="field">
              <label htmlFor="pwaStatus">状态</label>
              <select id="pwaStatus" onChange={(event) => updateDraft("status", event.target.value)} value={draft.status}>
                <option value="draft">草稿</option>
                <option value="testing">测试中</option>
                <option value="published">已发布</option>
                <option value="active">已启用</option>
                <option value="archived">已归档</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pwaDisplay">显示模式</label>
              <select id="pwaDisplay" onChange={(event) => updateDraft("displayMode", event.target.value)} value={draft.displayMode}>
                <option value="standalone">Standalone</option>
                <option value="fullscreen">Fullscreen</option>
                <option value="minimal-ui">Minimal UI</option>
                <option value="browser">Browser</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pwaOrientation">方向</label>
              <select id="pwaOrientation" onChange={(event) => updateDraft("orientation", event.target.value)} value={draft.orientation}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
                <option value="any">Any</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pwaThemeColor">主题色</label>
              <div className="color-input-row">
                <input id="pwaThemeColor" onChange={(event) => updateDraft("themeColor", event.target.value)} type="color" value={draft.themeColor} />
                <input onChange={(event) => updateDraft("themeColor", event.target.value)} value={draft.themeColor} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pwaBackgroundColor">背景色</label>
              <div className="color-input-row">
                <input
                  id="pwaBackgroundColor"
                  onChange={(event) => updateDraft("backgroundColor", event.target.value)}
                  type="color"
                  value={draft.backgroundColor}
                />
                <input onChange={(event) => updateDraft("backgroundColor", event.target.value)} value={draft.backgroundColor} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pwaLandingPage">落地页</label>
              <select id="pwaLandingPage" onChange={(event) => updateDraft("landingPageId", event.target.value)} value={draft.landingPageId}>
                <option value="">不绑定</option>
                {landingPages.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pwaOffer">推广项目</label>
              <select id="pwaOffer" onChange={(event) => updateDraft("offerId", event.target.value)} value={draft.offerId}>
                <option value="">不绑定</option>
                {offers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pwaDomain">域名</label>
              <select id="pwaDomain" onChange={(event) => updateDraft("domainId", event.target.value)} value={draft.domainId}>
                <option value="">不绑定</option>
                {domains.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.domain}
                  </option>
                ))}
              </select>
            </div>
            <label className="check-field" htmlFor="pwaInstallPrompt">
              <input
                checked={draft.installPrompt}
                id="pwaInstallPrompt"
                onChange={(event) => updateDraft("installPrompt", event.target.checked)}
                type="checkbox"
              />
              <span>启用安装提示</span>
            </label>
            <label className="check-field" htmlFor="pwaActive">
              <input checked={draft.active} id="pwaActive" onChange={(event) => updateDraft("active", event.target.checked)} type="checkbox" />
              <span>激活</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="pwaNotes">备注</label>
            <textarea id="pwaNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存 PWA"}
            </button>
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel channel-filter-panel pwa-filter-panel">
        <div className="panel-heading">
          <div>
            <h2>筛选与字段</h2>
            <p>按名称、启动地址、绑定资源和状态筛选，并控制列表字段展示。</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pwaSearch">搜索</label>
            <input id="pwaSearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
          </div>
          <div className="field">
            <label htmlFor="pwaStatusFilter">状态</label>
            <select id="pwaStatusFilter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="">全部状态</option>
              <option value="inactive">Inactive</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pwaBindingFilter">绑定</label>
            <select id="pwaBindingFilter" onChange={(event) => setBindingFilter(event.target.value)} value={bindingFilter}>
              <option value="">全部绑定</option>
                  <option value="landingPage">已绑定落地页</option>
                  <option value="offer">已绑定推广项目</option>
              <option value="domain">已绑定域名</option>
              <option value="unbound">未绑定</option>
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

      <section className="money-page-layout pwa-layout pwa-list-layout">
        <div>
          <section className="table-panel money-page-table-panel">
            <table className="money-page-table pwa-table">
              <thead>
                <tr>
                  {visibleFields.includes("icon") ? <th>图标</th> : null}
                  {visibleFields.includes("name") ? <th>名称</th> : null}
                  {visibleFields.includes("status") ? <th>状态</th> : null}
                  {visibleFields.includes("startUrl") ? <th>启动地址</th> : null}
                  {visibleFields.includes("landingPage") ? <th>落地页</th> : null}
                  {visibleFields.includes("offer") ? <th>推广项目</th> : null}
                  {visibleFields.includes("domain") ? <th>域名</th> : null}
                  {visibleFields.includes("display") ? <th>显示模式</th> : null}
                  {visibleFields.includes("colors") ? <th>颜色</th> : null}
                  {visibleFields.includes("usageCount") ? <th>使用数</th> : null}
                  {visibleFields.includes("updatedAt") ? <th>更新时间</th> : null}
                  {visibleFields.includes("notes") ? <th>备注</th> : null}
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const active = row.config?.active ?? row.status !== "inactive";
                  return (
                    <tr className={selectedPwa?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                      {visibleFields.includes("icon") ? (
                        <td>
                          <div className="offer-thumb">
                            {row.config?.iconUrl ? <img alt={row.name} src={row.config.iconUrl} /> : <span>{row.name.slice(0, 1).toUpperCase()}</span>}
                          </div>
                        </td>
                      ) : null}
                      {visibleFields.includes("name") ? (
                        <td>
                          <strong>{row.name}</strong>
                          <br />
                          <span className="muted">{row.config?.shortName || row.id.slice(-8)}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("status") ? (
                        <td>
                          <span className={statusClass(row.status, active)}>{active ? row.status : "inactive"}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("startUrl") ? (
                        <td>
                          <a href={row.startUrl} rel="noreferrer" target="_blank">
                            {row.startUrl}
                          </a>
                        </td>
                      ) : null}
                      {visibleFields.includes("landingPage") ? <td>{landingPageName(row.config?.landingPageId)}</td> : null}
                      {visibleFields.includes("offer") ? <td>{offerName(row.config?.offerId)}</td> : null}
                      {visibleFields.includes("domain") ? <td>{domainName(row.config?.domainId)}</td> : null}
                      {visibleFields.includes("display") ? (
                        <td>
                          {row.config?.displayMode ?? "standalone"}
                          <br />
                          <span className="muted">{row.config?.orientation ?? "portrait"}</span>
                        </td>
                      ) : null}
                      {visibleFields.includes("colors") ? (
                        <td>
                          <div className="color-chip-row">
                            <span className="color-chip" style={{ background: row.config?.themeColor ?? "#2563eb" }} />
                            <span className="color-chip" style={{ background: row.config?.backgroundColor ?? "#ffffff" }} />
                          </div>
                        </td>
                      ) : null}
                      {visibleFields.includes("usageCount") ? <td>{row.usageCount ?? 0}</td> : null}
                      {visibleFields.includes("updatedAt") ? <td>{formatDate(row.updatedAt)}</td> : null}
                      {visibleFields.includes("notes") ? <td className="notes-cell">{row.config?.notes ?? "-"}</td> : null}
                      <td>
                        <div className="row-actions">
                          <button className="button secondary" onClick={() => edit(row)} type="button">
                            编辑
                          </button>
                          <button className="button secondary" disabled={duplicatingId === row.id} onClick={() => void duplicate(row)} type="button">
                            {duplicatingId === row.id ? "复制中" : "复制"}
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
                    <td colSpan={Math.max(visibleFields.length + 1, 1)}>暂无 PWA</td>
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
                <h2>PWA 详情</h2>
                <p>查看 Manifest 预览和绑定资源。</p>
              </div>
            </div>
            {selectedPwa ? (
              <div className="strategy-detail">
                <div className="offer-detail-hero">
                  <div className="offer-thumb large">
                    {selectedPwa.config?.iconUrl ? (
                      <img alt={selectedPwa.name} src={selectedPwa.config.iconUrl} />
                    ) : (
                      <span>{selectedPwa.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <strong>{selectedPwa.name}</strong>
                    <small>{selectedPwa.config?.shortName ?? "未设置短名称"}</small>
                  </div>
                </div>
                <div className="detail-list">
                  <div>
                    <span>创建者</span>
                    <strong>{creatorName(selectedPwa)}</strong>
                  </div>
                  <div>
                    <span>启动地址</span>
                    <strong>{selectedPwa.startUrl}</strong>
                  </div>
                  <div>
                    <span>状态</span>
                    <strong>{selectedPwa.config?.active ?? selectedPwa.status !== "inactive" ? selectedPwa.status : "inactive"}</strong>
                  </div>
                  <div>
                    <span>落地页 / 推广项目</span>
                    <strong>
                      {landingPageName(selectedPwa.config?.landingPageId)} / {offerName(selectedPwa.config?.offerId)}
                    </strong>
                  </div>
                  <div>
                    <span>域名</span>
                    <strong>{domainName(selectedPwa.config?.domainId)}</strong>
                  </div>
                  <div>
                    <span>已用于广告系列</span>
                    <strong>{selectedPwa.usageCount ?? 0}</strong>
                  </div>
                </div>
                <pre className="manifest-preview">{JSON.stringify(manifestFromRow(selectedPwa), null, 2)}</pre>
                <div className="button-row">
                  <a className="button primary" href={selectedPwa.startUrl} rel="noreferrer" target="_blank">
                    打开地址
                  </a>
                  <button className="button secondary" onClick={() => edit(selectedPwa)} type="button">
                    编辑
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择 PWA</div>
            )}
          </section>
        </aside>
      </section>
      </div>
    </AdminShell>
  );
}
