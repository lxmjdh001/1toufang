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
  creator?: { email: string; profile?: { name?: string | null } | null } | null;
  source?: string;
  languages?: string[];
  adCount?: number;
  rejectedCount?: number;
  rejectionRate?: number;
};

type CopyDraft = {
  name: string;
  primaryText: string;
  headline: string;
  description: string;
  tags: string;
  remarks: string;
  source: string;
  language: string;
};

type AiDraft = {
  product: string;
  audience: string;
  offer: string;
  language: string;
  tone: string;
  source: string;
};

type GeneratedCopy = {
  name: string;
  primaryText: string;
  headline: string;
  description?: string;
  remarks?: string;
  tags?: string[];
};

const emptyDraft: CopyDraft = {
  name: "",
  primaryText: "",
  headline: "",
  description: "",
  tags: "",
  remarks: "",
  source: "manual",
  language: "zh-CN"
};

const emptyAiDraft: AiDraft = {
  product: "",
  audience: "",
  offer: "",
  language: "zh-CN",
  tone: "performance",
  source: "fixed-template"
};

function splitList(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function visibleTags(tags?: string[]) {
  return (tags ?? []).filter((tag) => !tag.startsWith("source:") && !tag.startsWith("lang:"));
}

function joinList(value?: string[]) {
  return visibleTags(value).join(", ");
}

function tagValue(tags: string[], key: string) {
  const prefix = `${key}:`;
  return tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length);
}

function tagValues(tags: string[], key: string) {
  const prefix = `${key}:`;
  return tags.filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length));
}

function withMetaTags(tags: string[], source: string, language: string) {
  return Array.from(new Set([...visibleTags(tags), `source:${source || "manual"}`, `lang:${language || "zh-CN"}`]));
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatRate(value?: number) {
  return `${Number(value ?? 0).toFixed(2)}%`;
}

function draftFromRow(row: CopywritingRow): CopyDraft {
  return {
    name: row.name,
    primaryText: row.primaryText,
    headline: row.headline,
    description: row.description ?? "",
    tags: joinList(row.tags),
    remarks: row.remarks ?? "",
    source: row.source ?? tagValue(row.tags, "source") ?? "manual",
    language: row.languages?.[0] ?? tagValue(row.tags, "lang") ?? "zh-CN"
  };
}

function buildPayload(draft: CopyDraft) {
  return {
    name: draft.name,
    primaryText: draft.primaryText,
    headline: draft.headline,
    description: draft.description || undefined,
    tags: withMetaTags(splitList(draft.tags), draft.source, draft.language),
    remarks: draft.remarks || undefined
  };
}

function creatorName(row: CopywritingRow) {
  return row.creator?.profile?.name ?? row.creator?.email ?? "-";
}

function sourceName(row: CopywritingRow) {
  return row.source ?? tagValue(row.tags, "source") ?? "manual";
}

function languages(row: CopywritingRow) {
  const values = row.languages?.length ? row.languages : tagValues(row.tags, "lang");
  return values.length ? values : ["zh-CN"];
}

function isRisky(row: CopywritingRow) {
  return Number(row.rejectionRate ?? 0) >= 20;
}

export default function CopywritingsPage() {
  const [rows, setRows] = useState<CopywritingRow[]>([]);
  const [draft, setDraft] = useState<CopyDraft>(emptyDraft);
  const [aiDraft, setAiDraft] = useState<AiDraft>(emptyAiDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selectedCopy = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);
  const taggedCount = useMemo(() => rows.filter((row) => visibleTags(row.tags).length > 0).length, [rows]);
  const totalAds = useMemo(() => rows.reduce((sum, row) => sum + Number(row.adCount ?? 0), 0), [rows]);
  const riskyCount = useMemo(() => rows.filter(isRisky).length, [rows]);
  const languageOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => languages(row)))).sort(),
    [rows]
  );
  const sourceOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => sourceName(row)))).sort(),
    [rows]
  );

  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.headline.toLowerCase().includes(keyword) ||
        row.primaryText.toLowerCase().includes(keyword) ||
        visibleTags(row.tags).some((tag) => tag.toLowerCase().includes(keyword));
      const matchesLanguage = !languageFilter || languages(row).includes(languageFilter);
      const matchesSource = !sourceFilter || sourceName(row) === sourceFilter;
      return matchesKeyword && matchesLanguage && matchesSource;
    });
  }, [languageFilter, rows, searchTerm, sourceFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await apiRequest<CopywritingRow[]>("/copywritings");
      setRows(nextRows);
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id ?? null));
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
    setNotice(null);
    try {
      const row = await apiRequest<CopywritingRow>(editingId ? `/copywritings/${editingId}` : "/copywritings", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "文案已更新" : "文案已创建");
      setSelectedId(row.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存文案失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CopywritingRow) {
    if (!window.confirm(`确认删除文案 ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/copywritings/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除文案失败");
    }
  }

  async function duplicate(row: CopywritingRow) {
    setError(null);
    setNotice(null);
    try {
      const next = await apiRequest<CopywritingRow>(`/copywritings/${row.id}/duplicate`, { method: "POST" });
      setNotice("文案已复制为新记录");
      setSelectedId(next.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制文案失败");
    }
  }

  async function copyText(row: CopywritingRow) {
    await navigator.clipboard.writeText(`${row.headline}\n${row.primaryText}\n${row.description ?? ""}`.trim());
    setNotice("文案内容已复制到剪贴板");
  }

  async function generateCopy() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const generated = await apiRequest<GeneratedCopy>("/copywritings/generate", {
        method: "POST",
        body: JSON.stringify(aiDraft)
      });
      setDraft({
        name: generated.name,
        primaryText: generated.primaryText,
        headline: generated.headline,
        description: generated.description ?? "",
        tags: joinList(generated.tags),
        remarks: generated.remarks ?? "",
        source: tagValue(generated.tags ?? [], "source") ?? aiDraft.source,
        language: tagValue(generated.tags ?? [], "lang") ?? aiDraft.language
      });
      setEditingId(null);
      setNotice("固定模板文案已生成，可继续人工调整后保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成文案失败");
    } finally {
      setGenerating(false);
    }
  }

  function edit(row: CopywritingRow) {
    setEditingId(row.id);
    setSelectedId(row.id);
    setDraft(draftFromRow(row));
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof CopyDraft>(key: K, value: CopyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateAiDraft<K extends keyof AiDraft>(key: K, value: AiDraft[K]) {
    setAiDraft((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="文案库"
      description="维护可复用的主文案、标题、描述、来源、语言和投放效果数据。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={() => void generateCopy()} type="button">
            AI Generate
          </button>
          <button className="button secondary" onClick={resetForm} type="button">
            新增文案
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>文案总数</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>已打标签</span>
          <strong>{taggedCount}</strong>
        </div>
        <div className="metric">
          <span>关联广告</span>
          <strong>{totalAds}</strong>
        </div>
        <div className="metric">
          <span>高拒审风险</span>
          <strong>{riskyCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="split-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>AI Generate</h2>
              <p>当前使用固定模板自动化生成，后续可替换为真实 AI 优化模型。</p>
            </div>
          </div>
          <div className="form">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="aiProduct">产品</label>
                <input id="aiProduct" onChange={(event) => updateAiDraft("product", event.target.value)} value={aiDraft.product} />
              </div>
              <div className="field">
                <label htmlFor="aiAudience">受众</label>
                <input id="aiAudience" onChange={(event) => updateAiDraft("audience", event.target.value)} value={aiDraft.audience} />
              </div>
              <div className="field">
                <label htmlFor="aiOffer">Offer</label>
                <input id="aiOffer" onChange={(event) => updateAiDraft("offer", event.target.value)} value={aiDraft.offer} />
              </div>
              <div className="field">
                <label htmlFor="aiLanguage">语言</label>
                <select id="aiLanguage" onChange={(event) => updateAiDraft("language", event.target.value)} value={aiDraft.language}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                  <option value="es-ES">Español</option>
                  <option value="pt-BR">Português</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="aiTone">语气</label>
                <select id="aiTone" onChange={(event) => updateAiDraft("tone", event.target.value)} value={aiDraft.tone}>
                  <option value="performance">转化导向</option>
                  <option value="premium">品质感</option>
                  <option value="urgent">促销紧迫</option>
                  <option value="native">原生口吻</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="aiSource">来源</label>
                <input id="aiSource" onChange={(event) => updateAiDraft("source", event.target.value)} value={aiDraft.source} />
              </div>
            </div>
            <button className="button primary" disabled={generating} onClick={() => void generateCopy()} type="button">
              {generating ? "生成中..." : "生成并填入表单"}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{editingId ? "编辑文案" : "创建文案"}</h2>
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
                <label htmlFor="copySource">来源</label>
                <input id="copySource" onChange={(event) => updateDraft("source", event.target.value)} value={draft.source} />
              </div>
              <div className="field">
                <label htmlFor="copyLanguage">语言</label>
                <select id="copyLanguage" onChange={(event) => updateDraft("language", event.target.value)} value={draft.language}>
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                  <option value="es-ES">Español</option>
                  <option value="pt-BR">Português</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="copyTags">标签</label>
                <input id="copyTags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="primaryText">内容</label>
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
      </section>

      <section className="panel copy-filter-panel">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="copySearch">搜索</label>
            <input id="copySearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
          </div>
          <div className="field">
            <label htmlFor="copyLanguageFilter">语言</label>
            <select id="copyLanguageFilter" onChange={(event) => setLanguageFilter(event.target.value)} value={languageFilter}>
              <option value="">全部语言</option>
              {languageOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="copySourceFilter">来源</label>
            <select id="copySourceFilter" onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
              <option value="">全部来源</option>
              {sourceOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="copy-layout">
        <section className="table-panel copy-table-panel">
          <table className="copy-table">
            <thead>
              <tr>
                <th>创建者</th>
                <th>标签</th>
                <th>广告数量</th>
                <th>拒审率</th>
                <th>内容</th>
                <th>标题</th>
                <th>描述</th>
                <th>备注</th>
                <th>来源</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr className={selectedCopy?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                  <td>{creatorName(row)}</td>
                  <td>
                    <div className="tag-list">
                      {visibleTags(row.tags).length
                        ? visibleTags(row.tags).map((tag) => <span key={tag}>{tag}</span>)
                        : "-"}
                    </div>
                    <div className="language-list">
                      {languages(row).map((lang) => (
                        <span key={lang}>{lang}</span>
                      ))}
                    </div>
                  </td>
                  <td>{row.adCount ?? 0}</td>
                  <td>
                    <span className={isRisky(row) ? "metric-negative" : "metric-positive"}>{formatRate(row.rejectionRate)}</span>
                  </td>
                  <td className="copy-content-cell">{row.primaryText}</td>
                  <td>{row.headline}</td>
                  <td>{row.description ?? "-"}</td>
                  <td className="notes-cell">{row.remarks ?? "-"}</td>
                  <td>{sourceName(row)}</td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="button secondary" onClick={() => edit(row)} type="button">
                        编辑
                      </button>
                      <button className="button secondary" onClick={() => void duplicate(row)} type="button">
                        复制文案
                      </button>
                      <button className="button secondary" onClick={() => void copyText(row)} type="button">
                        复制内容
                      </button>
                      <button className="button danger" onClick={() => void remove(row)} type="button">
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={11}>暂无文案</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <aside className="copy-preview-panel">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>多语言展示</h2>
                <p>按文案语言标签展示可投放内容。</p>
              </div>
            </div>
            {selectedCopy ? (
              <div className="copy-preview-list">
                {languages(selectedCopy).map((lang) => (
                  <article className="copy-preview-card" key={lang}>
                    <span>{lang}</span>
                    <h3>{selectedCopy.headline}</h3>
                    <p>{selectedCopy.primaryText}</p>
                    {selectedCopy.description ? <small>{selectedCopy.description}</small> : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择文案</div>
            )}
          </section>
        </aside>
      </section>
    </AdminShell>
  );
}
