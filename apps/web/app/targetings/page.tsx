"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";

type TargetingConfig = {
  countries?: string[];
  languages?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  interests?: string[];
  excludedInterests?: string[];
  customAudiences?: string[];
};

type TargetingRow = {
  id: string;
  platform: Platform;
  name: string;
  config: TargetingConfig;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: { email: string; profile?: { name?: string | null } | null } | null;
};

type TargetingDraft = {
  platform: Platform;
  name: string;
  countries: string;
  languages: string;
  ageMin: string;
  ageMax: string;
  genders: string[];
  interests: string;
  excludedInterests: string;
  customAudiences: string;
  tags: string;
};

const emptyDraft: TargetingDraft = {
  platform: "META",
  name: "",
  countries: "US",
  languages: "en",
  ageMin: "18",
  ageMax: "65",
  genders: [],
  interests: "",
  excludedInterests: "",
  customAudiences: "",
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

function draftFromRow(row: TargetingRow): TargetingDraft {
  return {
    platform: row.platform,
    name: row.name,
    countries: joinList(row.config.countries),
    languages: joinList(row.config.languages),
    ageMin: row.config.ageMin?.toString() ?? "",
    ageMax: row.config.ageMax?.toString() ?? "",
    genders: row.config.genders ?? [],
    interests: joinList(row.config.interests),
    excludedInterests: joinList(row.config.excludedInterests),
    customAudiences: joinList(row.config.customAudiences),
    tags: joinList(row.tags)
  };
}

function buildPayload(draft: TargetingDraft) {
  return {
    platform: draft.platform,
    name: draft.name,
    tags: splitList(draft.tags),
    config: {
      countries: splitList(draft.countries),
      languages: splitList(draft.languages),
      ageMin: toNumber(draft.ageMin),
      ageMax: toNumber(draft.ageMax),
      genders: draft.genders,
      interests: splitList(draft.interests),
      excludedInterests: splitList(draft.excludedInterests),
      customAudiences: splitList(draft.customAudiences)
    }
  };
}

export default function TargetingsPage() {
  const [rows, setRows] = useState<TargetingRow[]>([]);
  const [draft, setDraft] = useState<TargetingDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const metaCount = useMemo(() => rows.filter((row) => row.platform === "META").length, [rows]);
  const tiktokCount = rows.length - metaCount;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiRequest<TargetingRow[]>("/targetings"));
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
    try {
      await apiRequest(editingId ? `/targetings/${editingId}` : "/targetings", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存受众配置失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: TargetingRow) {
    setError(null);
    try {
      await apiRequest(`/targetings/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除受众配置失败");
    }
  }

  function edit(row: TargetingRow) {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
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
      description="统一维护兴趣、人群包、排除项、地域语言等可复用受众配置。"
      actions={
        <>
          <button className="button secondary" onClick={resetForm} type="button">
            新建受众
          </button>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
        </>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>受众配置</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>Meta</span>
          <strong>{metaCount}</strong>
        </div>
        <div className="metric">
          <span>TikTok</span>
          <strong>{tiktokCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑受众" : "新增受众"}</h2>
            <p>受众模板会作为后续一键创建 Ad Group/Ad Set 的默认定向规则。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="targetingPlatform">平台</label>
              <select
                id="targetingPlatform"
                onChange={(event) => updateDraft("platform", event.target.value as Platform)}
                value={draft.platform}
              >
                <option value="META">Meta</option>
                <option value="TIKTOK">TikTok</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="targetingName">受众名称</label>
              <input
                id="targetingName"
                onChange={(event) => updateDraft("name", event.target.value)}
                required
                value={draft.name}
              />
            </div>
            <div className="field">
              <label htmlFor="countries">国家/地区</label>
              <input id="countries" onChange={(event) => updateDraft("countries", event.target.value)} value={draft.countries} />
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
              <input
                id="excludedInterests"
                onChange={(event) => updateDraft("excludedInterests", event.target.value)}
                value={draft.excludedInterests}
              />
            </div>
            <div className="field">
              <label htmlFor="customAudiences">人群包</label>
              <input
                id="customAudiences"
                onChange={(event) => updateDraft("customAudiences", event.target.value)}
                value={draft.customAudiences}
              />
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
                <label className="checkbox-row compact" key={value}>
                  <input checked={draft.genders.includes(value)} onChange={() => toggleGender(value)} type="checkbox" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
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

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>受众名称</th>
              <th>平台</th>
              <th>地域/语言</th>
              <th>年龄/性别</th>
              <th>兴趣</th>
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
                  <span className="muted">{joinList(row.config.customAudiences) || "-"}</span>
                </td>
                <td>{row.platform}</td>
                <td>
                  <strong>{joinList(row.config.countries) || "-"}</strong>
                  <br />
                  <span className="muted">{joinList(row.config.languages) || "-"}</span>
                </td>
                <td>
                  <strong>
                    {row.config.ageMin ?? "-"} - {row.config.ageMax ?? "-"}
                  </strong>
                  <br />
                  <span className="muted">{joinList(row.config.genders) || "-"}</span>
                </td>
                <td>
                  <span>{joinList(row.config.interests) || "-"}</span>
                  {row.config.excludedInterests?.length ? (
                    <>
                      <br />
                      <span className="muted">排除：{joinList(row.config.excludedInterests)}</span>
                    </>
                  ) : null}
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
                <td colSpan={8}>暂无受众配置</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
