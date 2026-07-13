"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";
type ViewKey = "default" | "standard" | "ai_generated";

type TargetingConfig = {
  type?: string;
  source?: string;
  countries?: string[];
  regions?: string[];
  cities?: string[];
  languages?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  interests?: string[];
  excludedInterests?: string[];
  customAudiences?: string[];
  notes?: string;
};

type TargetingMetrics = {
  campaigns: number;
  spend: number;
  impressions: number;
  clicks: number;
  event1: number;
  event2: number;
  event3: number;
  cpc: number;
  ctr: number;
  conversions: number;
  revenue: number;
};

type TargetingRow = {
  id: string;
  platform: Platform;
  name: string;
  config: TargetingConfig;
  tags: string[];
  view?: ViewKey;
  metrics?: TargetingMetrics;
  createdAt: string;
  updatedAt: string;
  createdBy?: { email: string; profile?: { name?: string | null } | null } | null;
};

type TargetingDraft = {
  platform: Platform;
  name: string;
  type: string;
  source: string;
  countries: string;
  regions: string;
  cities: string;
  languages: string;
  ageMin: string;
  ageMax: string;
  genders: string[];
  interests: string;
  excludedInterests: string;
  customAudiences: string;
  notes: string;
  tags: string;
};

const emptyDraft: TargetingDraft = {
  platform: "META",
  name: "",
  type: "standard",
  source: "manual",
  countries: "US",
  regions: "",
  cities: "",
  languages: "en",
  ageMin: "18",
  ageMax: "65",
  genders: [],
  interests: "",
  excludedInterests: "",
  customAudiences: "",
  notes: "",
  tags: "standard"
};

const viewTabs: Array<{ key: ViewKey; label: string }> = [
  { key: "default", label: "默认" },
  { key: "standard", label: "标准" },
  { key: "ai_generated", label: "AI Generated" }
];

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

function formatNumber(value?: number) {
  return Intl.NumberFormat("zh-CN").format(Number(value ?? 0));
}

function formatMoney(value?: number) {
  return Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(value ?? 0));
}

function draftFromRow(row: TargetingRow): TargetingDraft {
  return {
    platform: row.platform,
    name: row.name,
    type: row.config.type ?? "standard",
    source: row.config.source ?? (row.view === "ai_generated" ? "ai-generated" : "manual"),
    countries: joinList(row.config.countries),
    regions: joinList(row.config.regions),
    cities: joinList(row.config.cities),
    languages: joinList(row.config.languages),
    ageMin: row.config.ageMin?.toString() ?? "",
    ageMax: row.config.ageMax?.toString() ?? "",
    genders: row.config.genders ?? [],
    interests: joinList(row.config.interests),
    excludedInterests: joinList(row.config.excludedInterests),
    customAudiences: joinList(row.config.customAudiences),
    notes: row.config.notes ?? "",
    tags: joinList(row.tags)
  };
}

function buildPayload(draft: TargetingDraft) {
  const tags = Array.from(new Set([...splitList(draft.tags), draft.type, draft.source === "ai-generated" ? "ai-generated" : ""])).filter(Boolean);
  return {
    platform: draft.platform,
    name: draft.name,
    tags,
    config: {
      type: draft.type,
      source: draft.source,
      countries: splitList(draft.countries),
      regions: splitList(draft.regions),
      cities: splitList(draft.cities),
      languages: splitList(draft.languages),
      ageMin: toNumber(draft.ageMin),
      ageMax: toNumber(draft.ageMax),
      genders: draft.genders,
      interests: splitList(draft.interests),
      excludedInterests: splitList(draft.excludedInterests),
      customAudiences: splitList(draft.customAudiences),
      notes: draft.notes || undefined
    }
  };
}

function viewOf(row: TargetingRow): ViewKey {
  if (row.view) return row.view;
  if (row.tags.some((tag) => tag.toLowerCase().includes("ai")) || row.config.source === "ai-generated") return "ai_generated";
  if (row.tags.includes("standard") || row.config.type === "standard") return "standard";
  return "default";
}

function creatorName(row: TargetingRow) {
  return row.createdBy?.profile?.name ?? row.createdBy?.email ?? "-";
}

function emptyMetrics(): TargetingMetrics {
  return { campaigns: 0, spend: 0, impressions: 0, clicks: 0, event1: 0, event2: 0, event3: 0, cpc: 0, ctr: 0, conversions: 0, revenue: 0 };
}

export default function TargetingsPage() {
  const [rows, setRows] = useState<TargetingRow[]>([]);
  const [draft, setDraft] = useState<TargetingDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("default");
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const metaCount = useMemo(() => rows.filter((row) => row.platform === "META").length, [rows]);
  const tiktokCount = rows.length - metaCount;
  const selectedTargeting = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);
  const viewCounts = useMemo(
    () => Object.fromEntries(viewTabs.map((tab) => [tab.key, rows.filter((row) => viewOf(row) === tab.key).length])) as Record<ViewKey, number>,
    [rows]
  );

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesView = viewOf(row) === activeView;
      const matchesPlatform = !platformFilter || row.platform === platformFilter;
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.tags.some((tag) => tag.toLowerCase().includes(keyword)) ||
        joinList(row.config.countries).toLowerCase().includes(keyword) ||
        joinList(row.config.cities).toLowerCase().includes(keyword) ||
        joinList(row.config.interests).toLowerCase().includes(keyword);
      return matchesView && matchesPlatform && matchesKeyword;
    });
  }, [activeView, platformFilter, rows, searchTerm]);

  const summary = useMemo(
    () =>
      visibleRows.reduce((current, row) => {
        const metric = row.metrics ?? emptyMetrics();
        current.campaigns += metric.campaigns;
        current.spend += metric.spend;
        current.impressions += metric.impressions;
        current.clicks += metric.clicks;
        current.event1 += metric.event1;
        current.event2 += metric.event2;
        current.event3 += metric.event3;
        current.conversions += metric.conversions;
        current.revenue += metric.revenue;
        return current;
      }, emptyMetrics()),
    [visibleRows]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await apiRequest<TargetingRow[]>("/targetings");
      setRows(nextRows);
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载受众配置失败");
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
      const row = await apiRequest<TargetingRow>(editingId ? `/targetings/${editingId}` : "/targetings", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "受众已更新" : "受众已创建");
      setSelectedId(row.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存受众配置失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: TargetingRow) {
    if (!window.confirm(`确认删除受众 ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/targetings/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除受众配置失败");
    }
  }

  async function duplicate(row: TargetingRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const next = await apiRequest<TargetingRow>(`/targetings/${row.id}/duplicate`, { method: "POST" });
      setNotice("受众已复制");
      setSelectedId(next.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制受众失败");
    } finally {
      setBusyId(null);
    }
  }

  function edit(row: TargetingRow) {
    setEditingId(row.id);
    setSelectedId(row.id);
    setDraft(draftFromRow(row));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof TargetingDraft>(key: K, value: TargetingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleGender(value: string) {
    setDraft((current) => ({
      ...current,
      genders: current.genders.includes(value)
        ? current.genders.filter((item) => item !== value)
        : [...current.genders, value]
    }));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="受众库"
      description="统一维护兴趣、人群包、排除项、地域语言等可复用受众配置，并回流投放效果。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={resetForm} type="button">
            创建 Targeting
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>受众配置</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>Meta / TikTok</span>
          <strong>{metaCount} / {tiktokCount}</strong>
        </div>
        <div className="metric">
          <span>当前视图消耗</span>
          <strong>{formatMoney(summary.spend)}</strong>
        </div>
        <div className="metric">
          <span>点击 / 转化</span>
          <strong>{formatNumber(summary.clicks)} / {formatNumber(summary.conversions)}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑受众" : "创建 Targeting"}</h2>
            <p>受众模板会作为后续一键创建 Ad Group/Ad Set 的默认定向规则。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="targetingPlatform">平台</label>
              <select id="targetingPlatform" onChange={(event) => updateDraft("platform", event.target.value as Platform)} value={draft.platform}>
                <option value="META">Meta</option>
                <option value="TIKTOK">TikTok</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="targetingName">名称</label>
              <input id="targetingName" onChange={(event) => updateDraft("name", event.target.value)} required value={draft.name} />
            </div>
            <div className="field">
              <label htmlFor="targetingType">类型</label>
              <select id="targetingType" onChange={(event) => updateDraft("type", event.target.value)} value={draft.type}>
                <option value="default">默认</option>
                <option value="standard">标准</option>
                <option value="lookalike">Lookalike</option>
                <option value="retargeting">Retargeting</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="targetingSource">来源</label>
              <select id="targetingSource" onChange={(event) => updateDraft("source", event.target.value)} value={draft.source}>
                <option value="manual">Manual</option>
                <option value="ai-generated">AI Generated</option>
                <option value="imported">Imported</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="countries">国家</label>
              <input id="countries" onChange={(event) => updateDraft("countries", event.target.value)} value={draft.countries} />
            </div>
            <div className="field">
              <label htmlFor="regions">地区</label>
              <input id="regions" onChange={(event) => updateDraft("regions", event.target.value)} value={draft.regions} />
            </div>
            <div className="field">
              <label htmlFor="cities">城市</label>
              <input id="cities" onChange={(event) => updateDraft("cities", event.target.value)} value={draft.cities} />
            </div>
            <div className="field">
              <label htmlFor="languages">语言</label>
              <input id="languages" onChange={(event) => updateDraft("languages", event.target.value)} value={draft.languages} />
            </div>
            <div className="field">
              <label htmlFor="ageMin">最小年龄</label>
              <input id="ageMin" min="13" onChange={(event) => updateDraft("ageMin", event.target.value)} type="number" value={draft.ageMin} />
            </div>
            <div className="field">
              <label htmlFor="ageMax">最大年龄</label>
              <input id="ageMax" min="13" onChange={(event) => updateDraft("ageMax", event.target.value)} type="number" value={draft.ageMax} />
            </div>
            <div className="field">
              <label htmlFor="interests">兴趣词</label>
              <input id="interests" onChange={(event) => updateDraft("interests", event.target.value)} value={draft.interests} />
            </div>
            <div className="field">
              <label htmlFor="excludedInterests">排除兴趣</label>
              <input id="excludedInterests" onChange={(event) => updateDraft("excludedInterests", event.target.value)} value={draft.excludedInterests} />
            </div>
            <div className="field">
              <label htmlFor="customAudiences">人群包</label>
              <input id="customAudiences" onChange={(event) => updateDraft("customAudiences", event.target.value)} value={draft.customAudiences} />
            </div>
            <div className="field">
              <label htmlFor="tags">标签</label>
              <input id="tags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
            </div>
          </div>
          <div className="field">
            <label>性别</label>
            <div className="button-row">
              {[
                ["ALL", "不限"],
                ["MALE", "男"],
                ["FEMALE", "女"]
              ].map(([value, label]) => (
                <label className="check-field inline-check" key={value}>
                  <input checked={draft.genders.includes(value)} onChange={() => toggleGender(value)} type="checkbox" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="targetingNotes">备注</label>
            <textarea id="targetingNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存修改" : "保存受众"}
            </button>
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="targeting-layout">
        <div>
          <section className="panel targeting-filter-panel">
            <div className="campaign-toolbar">
              <div className="status-tabs">
                {viewTabs.map((tab) => (
                  <button className={`status-tab ${activeView === tab.key ? "active" : ""}`} key={tab.key} onClick={() => setActiveView(tab.key)} type="button">
                    <span>{tab.label}</span>
                    <strong>{viewCounts[tab.key]}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="targetingSearch">搜索</label>
                <input id="targetingSearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
              </div>
              <div className="field">
                <label htmlFor="targetingPlatformFilter">平台</label>
                <select id="targetingPlatformFilter" onChange={(event) => setPlatformFilter(event.target.value)} value={platformFilter}>
                  <option value="">全部平台</option>
                  <option value="META">Meta</option>
                  <option value="TIKTOK">TikTok</option>
                </select>
              </div>
            </div>
          </section>

          <section className="table-panel targeting-table-panel">
            <table className="targeting-table">
              <thead>
                <tr>
                  <th>创建者</th>
                  <th>名称</th>
                  <th>类型</th>
                  <th>国家</th>
                  <th>地区</th>
                  <th>城市</th>
                  <th>消耗</th>
                  <th>曝光量</th>
                  <th>点击量</th>
                  <th>事件1</th>
                  <th>事件2</th>
                  <th>事件3</th>
                  <th>CPC</th>
                  <th>CTR</th>
                  <th>转化</th>
                  <th>备注</th>
                  <th>标签</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const metric = row.metrics ?? emptyMetrics();
                  return (
                    <tr className={selectedTargeting?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                      <td>{creatorName(row)}</td>
                      <td>
                        <strong>{row.name}</strong>
                        <br />
                        <span className="muted">{row.platform}</span>
                      </td>
                      <td>{row.config.type ?? viewOf(row)}</td>
                      <td>{joinList(row.config.countries) || "-"}</td>
                      <td>{joinList(row.config.regions) || "-"}</td>
                      <td>{joinList(row.config.cities) || "-"}</td>
                      <td>{formatMoney(metric.spend)}</td>
                      <td>{formatNumber(metric.impressions)}</td>
                      <td>{formatNumber(metric.clicks)}</td>
                      <td>{formatNumber(metric.event1)}</td>
                      <td>{formatNumber(metric.event2)}</td>
                      <td>{formatNumber(metric.event3)}</td>
                      <td>{formatMoney(metric.cpc)}</td>
                      <td>{formatMoney(metric.ctr)}%</td>
                      <td>{formatNumber(metric.conversions)}</td>
                      <td className="notes-cell">{row.config.notes ?? "-"}</td>
                      <td>
                        <div className="tag-list">
                          {row.tags.length ? row.tags.map((tag) => <span key={tag}>{tag}</span>) : "-"}
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="button secondary" onClick={() => setSelectedId(row.id)} type="button">
                            查看
                          </button>
                          <button className="button secondary" onClick={() => edit(row)} type="button">
                            编辑
                          </button>
                          <button className="button secondary" disabled={busyId === row.id} onClick={() => void duplicate(row)} type="button">
                            复制
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
                    <td colSpan={18}>暂无受众配置</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="targeting-detail-panel">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>受众详情</h2>
                <p>查看定向条件和投放效果回流。</p>
              </div>
            </div>
            {selectedTargeting ? (
              <div className="strategy-detail">
                <div className="detail-list">
                  <div>
                    <span>名称</span>
                    <strong>{selectedTargeting.name}</strong>
                  </div>
                  <div>
                    <span>创建者</span>
                    <strong>{creatorName(selectedTargeting)}</strong>
                  </div>
                  <div>
                    <span>平台 / 视图</span>
                    <strong>{selectedTargeting.platform} / {viewOf(selectedTargeting)}</strong>
                  </div>
                  <div>
                    <span>地域</span>
                    <strong>{joinList(selectedTargeting.config.countries)} {joinList(selectedTargeting.config.regions)} {joinList(selectedTargeting.config.cities)}</strong>
                  </div>
                </div>
                <div className="strategy-config-grid">
                  <span>年龄：{selectedTargeting.config.ageMin ?? "-"} - {selectedTargeting.config.ageMax ?? "-"}</span>
                  <span>性别：{joinList(selectedTargeting.config.genders) || "-"}</span>
                  <span>兴趣：{joinList(selectedTargeting.config.interests) || "-"}</span>
                  <span>排除：{joinList(selectedTargeting.config.excludedInterests) || "-"}</span>
                  <span>人群包：{joinList(selectedTargeting.config.customAudiences) || "-"}</span>
                  <span>Campaign：{selectedTargeting.metrics?.campaigns ?? 0}</span>
                </div>
                <div className="button-row">
                  <button className="button secondary" onClick={() => edit(selectedTargeting)} type="button">
                    编辑
                  </button>
                  <button className="button secondary" onClick={() => void duplicate(selectedTargeting)} type="button">
                    复制
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择受众</div>
            )}
          </section>
        </aside>
      </section>
    </AdminShell>
  );
}
