"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type OfferSource = "original" | "generated";

type OfferConfig = {
  imageUrl?: string;
  positioning?: string;
  network?: string;
  country?: string;
  category?: string;
  source?: OfferSource;
  notes?: string;
  active?: boolean;
  duplicatedFrom?: string;
};

type OfferRow = {
  id: string;
  name: string;
  url: string;
  price?: string | number | null;
  status: string;
  config?: OfferConfig | null;
  view?: OfferSource;
  usageCount?: number;
  creator?: { email: string; profile?: { name?: string | null } | null } | null;
  createdAt: string;
  updatedAt: string;
};

type OfferDraft = {
  name: string;
  imageUrl: string;
  positioning: string;
  price: string;
  url: string;
  status: string;
  network: string;
  country: string;
  category: string;
  source: OfferSource;
  notes: string;
  active: boolean;
};

const emptyDraft: OfferDraft = {
  name: "",
  imageUrl: "",
  positioning: "",
  price: "",
  url: "",
  status: "ready",
  network: "",
  country: "",
  category: "",
  source: "original",
  notes: "",
  active: true
};

const offerTemplates: OfferDraft[] = [
  {
    name: "Premium Trial Bundle",
    imageUrl: "",
    positioning: "高客单订阅试用，适合欧美 25-44 岁兴趣人群",
    price: "39.9",
    url: "https://example.com/offers/premium-trial",
    status: "ready",
    network: "Direct",
    country: "US",
    category: "Subscription",
    source: "generated",
    notes: "固定模型生成：优先匹配 Broad + 低门槛试用链路。",
    active: true
  },
  {
    name: "Beauty Starter Kit",
    imageUrl: "",
    positioning: "女性美妆套装，适合短视频素材和达人风格创意",
    price: "24.5",
    url: "https://example.com/offers/beauty-kit",
    status: "ready",
    network: "Affiliate",
    country: "US / CA",
    category: "Beauty",
    source: "generated",
    notes: "固定模型生成：适合素材多角度拆分测试。",
    active: true
  },
  {
    name: "Smart Home Gadget",
    imageUrl: "",
    positioning: "家居效率类小工具，适合 Meta 兴趣包和 TikTok 爆款素材",
    price: "31",
    url: "https://example.com/offers/smart-home",
    status: "testing",
    network: "Network",
    country: "US / UK",
    category: "Gadget",
    source: "generated",
    notes: "固定模型生成：先小预算验证 CTR，再放量。",
    active: true
  }
];

const viewTabs: Array<{ key: "all" | OfferSource; label: string }> = [
  { key: "all", label: "全部" },
  { key: "original", label: "Original" },
  { key: "generated", label: "Generated" }
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(amount);
}

function creatorName(row: OfferRow) {
  return row.creator?.profile?.name ?? row.creator?.email ?? "-";
}

function offerView(row: OfferRow): OfferSource {
  return row.view ?? row.config?.source ?? "original";
}

function statusClass(status: string, active?: boolean) {
  if (!active || status === "inactive" || status === "archived") return "pill danger";
  if (status === "ready" || status === "active") return "pill success";
  if (status === "testing" || status === "draft") return "pill warning";
  return "pill";
}

function draftFromRow(row: OfferRow): OfferDraft {
  return {
    name: row.name,
    imageUrl: row.config?.imageUrl ?? "",
    positioning: row.config?.positioning ?? "",
    price: row.price === null || row.price === undefined ? "" : String(row.price),
    url: row.url,
    status: row.status,
    network: row.config?.network ?? "",
    country: row.config?.country ?? "",
    category: row.config?.category ?? "",
    source: offerView(row),
    notes: row.config?.notes ?? "",
    active: row.config?.active ?? row.status !== "inactive"
  };
}

function buildPayload(draft: OfferDraft) {
  const price = draft.price.trim() ? Number(draft.price) : undefined;
  return {
    name: draft.name,
    url: draft.url,
    price: Number.isFinite(price) ? price : undefined,
    status: draft.active ? draft.status : "inactive",
    config: {
      imageUrl: draft.imageUrl || undefined,
      positioning: draft.positioning || undefined,
      network: draft.network || undefined,
      country: draft.country || undefined,
      category: draft.category || undefined,
      source: draft.source,
      notes: draft.notes || undefined,
      active: draft.active
    }
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

export default function OffersPage() {
  const pathname = usePathname();
  const router = useRouter();
  const createMode = pathname.endsWith("/create");
  const [editParam, setEditParam] = useState<string | null>(null);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [draft, setDraft] = useState<OfferDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"all" | OfferSource>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const originalCount = useMemo(() => rows.filter((row) => offerView(row) === "original").length, [rows]);
  const generatedCount = useMemo(() => rows.filter((row) => offerView(row) === "generated").length, [rows]);
  const readyCount = useMemo(
    () => rows.filter((row) => (row.config?.active ?? row.status !== "inactive") && (row.status === "ready" || row.status === "active")).length,
    [rows]
  );
  const usedCount = useMemo(() => rows.filter((row) => Number(row.usageCount ?? 0) > 0).length, [rows]);
  const selectedOffer = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesView = activeView === "all" || offerView(row) === activeView;
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.url.toLowerCase().includes(keyword) ||
        row.config?.positioning?.toLowerCase().includes(keyword) ||
        row.config?.network?.toLowerCase().includes(keyword) ||
        row.config?.country?.toLowerCase().includes(keyword) ||
        row.config?.category?.toLowerCase().includes(keyword);
      const matchesStatus = !statusFilter || row.status === statusFilter;
      return matchesView && matchesKeyword && matchesStatus;
    });
  }, [activeView, rows, searchTerm, statusFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await apiRequest<OfferRow[]>("/offers");
      setRows(nextRows);
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Offers 失败");
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
      const row = await apiRequest<OfferRow>(editingId ? `/offers/${editingId}` : "/offers", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "Offer 已更新" : "Offer 已创建");
      setSelectedId(row.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 Offer 失败");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(row: OfferRow) {
    setDuplicatingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const nextRow = await apiRequest<OfferRow>(`/offers/${row.id}/duplicate`, { method: "POST" });
      setSelectedId(nextRow.id);
      setNotice("Offer 已复制为草稿");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制 Offer 失败");
    } finally {
      setDuplicatingId(null);
    }
  }

  async function toggleActive(row: OfferRow) {
    setError(null);
    setNotice(null);
    const active = !(row.config?.active ?? row.status !== "inactive");
    try {
      await apiRequest(`/offers/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: active ? "ready" : "inactive",
          config: { ...(row.config ?? {}), active }
        })
      });
      setNotice(active ? "Offer 已激活" : "Offer 已停用");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新 Offer 状态失败");
    }
  }

  async function remove(row: OfferRow) {
    if (!window.confirm(`确认删除 Offer ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/offers/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除 Offer 失败");
    }
  }

  function edit(row: OfferRow) {
    if (!createMode) {
      router.push(`/offers/create?edit=${encodeURIComponent(row.id)}`);
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

  function updateDraft<K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyTemplate(template: OfferDraft) {
    setEditingId(null);
    setDraft(template);
    setActiveView("generated");
    setNotice("已填充 Generated Offer 模板，检查后保存即可。");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportCsv() {
    const headers = ["创建者", "视图", "图片", "名称", "定位", "价格", "地址", "状态", "Network", "国家", "分类", "使用数", "备注", "创建时间"];
    const lines = visibleRows.map((row) =>
      [
        creatorName(row),
        offerView(row),
        row.config?.imageUrl,
        row.name,
        row.config?.positioning,
        row.price,
        row.url,
        row.config?.active ?? row.status !== "inactive" ? row.status : "inactive",
        row.config?.network,
        row.config?.country,
        row.config?.category,
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
    link.download = "offers.csv";
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
      title={createMode ? "创建 Offer" : "推广项目"}
      description={createMode ? "配置产品 Offer、跳转地址、价格和 Campaign 关联。" : undefined}
      breadcrumbs={[{ label: "Offers", href: "/offers" }, { label: createMode ? "创建" : "列表" }]}
      actions={
        <div className="button-row">
          {createMode ? <a className="button secondary" href="/offers">返回列表</a> : <a className="button primary" href="/offers/create">创建 Offer</a>}
          <button className="button secondary" onClick={exportCsv} type="button">
            导出
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <div className={`offer-resource-page ${createMode ? "is-create" : "is-list"}`}>
      <section className="metric-grid compact-metrics offer-summary">
        <div className="metric metric-strong">
          <span>推广项目总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>原始 / 模板</span>
          <strong>
            {originalCount} / {generatedCount}
          </strong>
        </div>
        <div className="metric">
          <span>可投放</span>
          <strong>{readyCount}</strong>
        </div>
        <div className="metric">
          <span>已用于广告系列</span>
          <strong>{usedCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel offer-network-panel">
        <div className="panel-heading">
          <div>
          <h2>查找联盟与推广项目</h2>
          <p>先用固定模型模板填充推广项目，后续可以替换为真实联盟网络或 AI 推荐。</p>
          </div>
        </div>
        <div className="offer-network-grid">
          {offerTemplates.map((template) => (
            <button className="offer-network-item" key={template.name} onClick={() => applyTemplate(template)} type="button">
              <span className="pill success">{template.network}</span>
              <strong>{template.name}</strong>
              <small>
                {template.category} / {template.country} / ${formatMoney(template.price)}
              </small>
              <em>{template.positioning}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="panel offer-create-panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑 Offer" : "创建 Offer"}</h2>
          <p>创建广告系列时会从这里选择推广项目。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="offerName">名称</label>
              <input id="offerName" onChange={(event) => updateDraft("name", event.target.value)} required value={draft.name} />
            </div>
            <div className="field">
              <label htmlFor="offerImage">图片地址</label>
              <input id="offerImage" onChange={(event) => updateDraft("imageUrl", event.target.value)} value={draft.imageUrl} />
            </div>
            <div className="field">
              <label htmlFor="offerPositioning">定位</label>
              <input id="offerPositioning" onChange={(event) => updateDraft("positioning", event.target.value)} value={draft.positioning} />
            </div>
            <div className="field">
              <label htmlFor="offerPrice">价格</label>
              <input
                id="offerPrice"
                min="0"
                onChange={(event) => updateDraft("price", event.target.value)}
                step="0.01"
                type="number"
                value={draft.price}
              />
            </div>
            <div className="field">
              <label htmlFor="offerUrl">地址</label>
              <input id="offerUrl" onChange={(event) => updateDraft("url", event.target.value)} required value={draft.url} />
            </div>
            <div className="field">
              <label htmlFor="offerStatus">状态</label>
              <select id="offerStatus" onChange={(event) => updateDraft("status", event.target.value)} value={draft.status}>
                <option value="ready">可投放</option>
                <option value="testing">测试中</option>
                <option value="draft">草稿</option>
                <option value="archived">已归档</option>
              </select>
            </div>
            <div className="field">
                <label htmlFor="offerNetwork">联盟网络</label>
              <input id="offerNetwork" onChange={(event) => updateDraft("network", event.target.value)} value={draft.network} />
            </div>
            <div className="field">
              <label htmlFor="offerCountry">国家/地区</label>
              <input id="offerCountry" onChange={(event) => updateDraft("country", event.target.value)} value={draft.country} />
            </div>
            <div className="field">
              <label htmlFor="offerCategory">分类</label>
              <input id="offerCategory" onChange={(event) => updateDraft("category", event.target.value)} value={draft.category} />
            </div>
            <div className="field">
              <label htmlFor="offerSource">视图</label>
              <select id="offerSource" onChange={(event) => updateDraft("source", event.target.value as OfferSource)} value={draft.source}>
                <option value="original">原始项目</option>
                <option value="generated">模板生成</option>
              </select>
            </div>
            <label className="check-field" htmlFor="offerActive">
              <input checked={draft.active} id="offerActive" onChange={(event) => updateDraft("active", event.target.checked)} type="checkbox" />
              <span>激活</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="offerNotes">备注</label>
            <textarea id="offerNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存 Offer"}
            </button>
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="resource-tabs offer-view-tabs">
        {viewTabs.map((tab) => (
          <button className={activeView === tab.key ? "active" : ""} key={tab.key} onClick={() => setActiveView(tab.key)} type="button">
            <span>{tab.label}</span>
            <strong>{tab.key === "all" ? rows.length : tab.key === "original" ? originalCount : generatedCount}</strong>
          </button>
        ))}
      </section>

      <section className="money-page-layout offer-layout offer-list-layout">
        <div>
          <section className="panel money-filter-panel">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="offerSearch">搜索</label>
                <input id="offerSearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
              </div>
              <div className="field">
                <label htmlFor="offerStatusFilter">状态</label>
                <select id="offerStatusFilter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                  <option value="">全部状态</option>
                <option value="ready">可投放</option>
                <option value="testing">测试中</option>
                <option value="draft">草稿</option>
                  <option value="inactive">Inactive</option>
                <option value="archived">已归档</option>
                </select>
              </div>
            </div>
          </section>

          <section className="table-panel money-page-table-panel">
            <table className="money-page-table offer-table">
              <thead>
                <tr>
                  <th>创建者</th>
                  <th>图片</th>
                  <th>名称</th>
                  <th>视图</th>
                  <th>定位</th>
                  <th>价格</th>
                  <th>地址</th>
                  <th>状态</th>
                  <th>Network</th>
                  <th>国家</th>
                  <th>分类</th>
                  <th>使用数</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const active = row.config?.active ?? row.status !== "inactive";
                  return (
                    <tr className={selectedOffer?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                      <td>{creatorName(row)}</td>
                      <td>
                        <div className="offer-thumb">
                          {row.config?.imageUrl ? <img alt={row.name} src={row.config.imageUrl} /> : <span>{row.name.slice(0, 1).toUpperCase()}</span>}
                        </div>
                      </td>
                      <td>
                        <strong>{row.name}</strong>
                        <br />
                        <span className="muted">{row.id.slice(-8)}</span>
                      </td>
                      <td>
                        <span className={offerView(row) === "generated" ? "pill warning" : "pill"}>{offerView(row)}</span>
                      </td>
                      <td className="notes-cell">{row.config?.positioning ?? "-"}</td>
                      <td>${formatMoney(row.price)}</td>
                      <td>
                        <a href={row.url} rel="noreferrer" target="_blank">
                          {row.url}
                        </a>
                      </td>
                      <td>
                        <span className={statusClass(row.status, active)}>{active ? row.status : "inactive"}</span>
                      </td>
                      <td>{row.config?.network ?? "-"}</td>
                      <td>{row.config?.country ?? "-"}</td>
                      <td>{row.config?.category ?? "-"}</td>
                      <td>{row.usageCount ?? 0}</td>
                      <td>{formatDate(row.updatedAt)}</td>
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
                    <td colSpan={14}>暂无 Offers</td>
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
                <h2>推广项目详情</h2>
                <p>查看产品状态和广告系列使用情况。</p>
              </div>
            </div>
            {selectedOffer ? (
              <div className="strategy-detail">
                <div className="offer-detail-hero">
                  <div className="offer-thumb large">
                    {selectedOffer.config?.imageUrl ? (
                      <img alt={selectedOffer.name} src={selectedOffer.config.imageUrl} />
                    ) : (
                      <span>{selectedOffer.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <strong>{selectedOffer.name}</strong>
                    <small>
                      {selectedOffer.config?.network ?? "Network 未设置"} / {selectedOffer.config?.country ?? "国家未设置"}
                    </small>
                  </div>
                </div>
                <div className="detail-list">
                  <div>
                    <span>视图</span>
                    <strong>{offerView(selectedOffer)}</strong>
                  </div>
                  <div>
                    <span>价格</span>
                    <strong>${formatMoney(selectedOffer.price)}</strong>
                  </div>
                  <div>
                    <span>定位</span>
                    <strong>{selectedOffer.config?.positioning ?? "-"}</strong>
                  </div>
                  <div>
                    <span>状态</span>
                    <strong>{selectedOffer.config?.active ?? selectedOffer.status !== "inactive" ? selectedOffer.status : "inactive"}</strong>
                  </div>
                  <div>
                    <span>已用于广告系列</span>
                    <strong>{selectedOffer.usageCount ?? 0}</strong>
                  </div>
                </div>
                <div className="button-row">
                  <a className="button primary" href={selectedOffer.url} rel="noreferrer" target="_blank">
                    打开地址
                  </a>
                  <button className="button secondary" onClick={() => edit(selectedOffer)} type="button">
                    编辑
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择推广项目</div>
            )}
          </section>
        </aside>
      </section>
      </div>
    </AdminShell>
  );
}
