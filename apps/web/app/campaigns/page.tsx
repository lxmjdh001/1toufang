"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";

type AdAccountRow = {
  id: string;
  platform: Platform;
  name: string;
  externalId: string;
};

type StrategyRow = {
  id: string;
  platform: Platform;
  name: string;
};

type TargetingRow = {
  id: string;
  platform: Platform;
  name: string;
};

type CreativeRow = {
  id: string;
  name: string;
  status: string;
};

type CampaignConfig = {
  adAccountId?: string;
  strategyId?: string;
  targetingId?: string;
  adCreativeId?: string;
  budget?: number;
  notes?: string;
};

type PublishTaskRow = {
  id: string;
  status: string;
  attempts: number;
  errorMessage?: string | null;
  createdAt: string;
  finishedAt?: string | null;
};

type PlatformIdMappingRow = {
  id: string;
  objectType: string;
  localKey: string;
  externalId: string;
  name?: string | null;
};

type PreflightIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

type PreflightResult = {
  ready: boolean;
  dryRun: boolean;
  platform: Platform;
  issues: PreflightIssue[];
};

type CampaignRow = {
  id: string;
  platform: Platform;
  name: string;
  status: string;
  config: CampaignConfig;
  createdAt: string;
  updatedAt: string;
  createdBy?: { email: string; profile?: { name?: string | null } | null } | null;
  publishTasks?: PublishTaskRow[];
  platformIdMappings?: PlatformIdMappingRow[];
};

type CampaignDraft = {
  platform: Platform;
  name: string;
  adAccountId: string;
  strategyId: string;
  targetingId: string;
  adCreativeId: string;
  budget: string;
  notes: string;
};

const emptyDraft: CampaignDraft = {
  platform: "META",
  name: "",
  adAccountId: "",
  strategyId: "",
  targetingId: "",
  adCreativeId: "",
  budget: "",
  notes: ""
};

function toNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function statusClass(status: string) {
  if (["ACTIVE", "PUBLISHED"].includes(status)) return "pill success";
  if (["FAILED", "PARTIALLY_FAILED"].includes(status)) return "pill danger";
  if (["CREATING", "DRAFT"].includes(status)) return "pill warning";
  return "pill";
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountRow[]>([]);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [targetings, setTargetings] = useState<TargetingRow[]>([]);
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [preflightResults, setPreflightResults] = useState<Record<string, PreflightResult>>({});

  const filteredAdAccounts = useMemo(
    () => adAccounts.filter((row) => row.platform === draft.platform),
    [adAccounts, draft.platform]
  );
  const filteredStrategies = useMemo(
    () => strategies.filter((row) => row.platform === draft.platform),
    [draft.platform, strategies]
  );
  const filteredTargetings = useMemo(
    () => targetings.filter((row) => row.platform === draft.platform),
    [draft.platform, targetings]
  );
  const draftCount = useMemo(() => campaigns.filter((row) => row.status === "DRAFT").length, [campaigns]);
  const metaCount = useMemo(() => campaigns.filter((row) => row.platform === "META").length, [campaigns]);
  const tiktokCount = campaigns.length - metaCount;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [campaignRows, adAccountRows, strategyRows, targetingRows, creativeRows] = await Promise.all([
        apiRequest<CampaignRow[]>("/campaigns"),
        apiRequest<AdAccountRow[]>("/ad-accounts"),
        apiRequest<StrategyRow[]>("/strategies"),
        apiRequest<TargetingRow[]>("/targetings"),
        apiRequest<CreativeRow[]>("/creatives")
      ]);
      setCampaigns(campaignRows);
      setAdAccounts(adAccountRows);
      setStrategies(strategyRows);
      setTargetings(targetingRows);
      setCreatives(creativeRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Campaign 数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          platform: draft.platform,
          name: draft.name,
          adAccountId: draft.adAccountId,
          strategyId: draft.strategyId || undefined,
          targetingId: draft.targetingId || undefined,
          adCreativeId: draft.adCreativeId || undefined,
          budget: toNumber(draft.budget),
          notes: draft.notes || undefined
        })
      });
      setNotice("Campaign 草稿已保存");
      setDraft(emptyDraft);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 Campaign 草稿失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CampaignRow) {
    setError(null);
    try {
      await apiRequest(`/campaigns/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除 Campaign 失败");
    }
  }

  async function publish(row: CampaignRow) {
    setPublishingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const task = await apiRequest<PublishTaskRow>(`/campaigns/${row.id}/publish`, { method: "POST" });
      setNotice(task.status === "SUCCEEDED" ? "发布任务已完成" : `发布任务状态：${task.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交发布失败");
    } finally {
      setPublishingId(null);
    }
  }

  async function retryPublish(row: CampaignRow) {
    setPublishingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const task = await apiRequest<PublishTaskRow>(`/campaigns/${row.id}/retry-publish`, { method: "POST" });
      setNotice(task.status === "SUCCEEDED" ? "重试发布已完成" : `重试发布状态：${task.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试发布失败");
    } finally {
      setPublishingId(null);
    }
  }

  async function preflight(row: CampaignRow) {
    setCheckingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<PreflightResult>(`/campaigns/${row.id}/preflight`);
      setPreflightResults((current) => ({ ...current, [row.id]: result }));
      setNotice(result.ready ? "发布预检通过" : "发布预检存在阻断项");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布预检失败");
    } finally {
      setCheckingId(null);
    }
  }

  function updateDraft<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changePlatform(platform: Platform) {
    setDraft((current) => ({
      ...current,
      platform,
      adAccountId: "",
      strategyId: "",
      targetingId: "",
      adCreativeId: ""
    }));
  }

  function adAccountName(id?: string) {
    const row = adAccounts.find((item) => item.id === id);
    return row ? `${row.name} / ${row.externalId}` : "-";
  }

  function strategyName(id?: string) {
    return strategies.find((item) => item.id === id)?.name ?? "-";
  }

  function targetingName(id?: string) {
    return targetings.find((item) => item.id === id)?.name ?? "-";
  }

  function creativeName(id?: string) {
    return creatives.find((item) => item.id === id)?.name ?? "-";
  }

  function latestTask(row: CampaignRow) {
    return row.publishTasks?.[0] ?? null;
  }

  function campaignMappings(row: CampaignRow) {
    return [...(row.platformIdMappings ?? [])].sort((left, right) =>
      `${left.objectType}:${left.localKey}`.localeCompare(`${right.objectType}:${right.localKey}`)
    );
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="Campaign 草稿"
      description="组合广告账户、策略模板和受众模板，生成待发布的跨平台 Campaign 草稿。"
      actions={
        <button className="button secondary" onClick={load} type="button">
          刷新
        </button>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>Campaign</span>
          <strong>{campaigns.length}</strong>
        </div>
        <div className="metric">
          <span>草稿</span>
          <strong>{draftCount}</strong>
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
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>新建 Campaign 草稿</h2>
            <p>草稿保存后先进入本地队列，后续发布时再调用官方广告 API。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="campaignPlatform">平台</label>
              <select id="campaignPlatform" onChange={(event) => changePlatform(event.target.value as Platform)} value={draft.platform}>
                <option value="META">Meta</option>
                <option value="TIKTOK">TikTok</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignName">Campaign 名称</label>
              <input
                id="campaignName"
                onChange={(event) => updateDraft("name", event.target.value)}
                required
                value={draft.name}
              />
            </div>
            <div className="field">
              <label htmlFor="campaignAdAccount">广告账户</label>
              <select
                disabled={filteredAdAccounts.length === 0}
                id="campaignAdAccount"
                onChange={(event) => updateDraft("adAccountId", event.target.value)}
                required
                value={draft.adAccountId}
              >
                <option value="">选择广告账户</option>
                {filteredAdAccounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} / {row.externalId}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignStrategy">策略模板</label>
              <select id="campaignStrategy" onChange={(event) => updateDraft("strategyId", event.target.value)} value={draft.strategyId}>
                <option value="">不选择</option>
                {filteredStrategies.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignTargeting">受众模板</label>
              <select id="campaignTargeting" onChange={(event) => updateDraft("targetingId", event.target.value)} value={draft.targetingId}>
                <option value="">不选择</option>
                {filteredTargetings.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignCreative">创意</label>
              <select
                id="campaignCreative"
                onChange={(event) => updateDraft("adCreativeId", event.target.value)}
                value={draft.adCreativeId}
              >
                <option value="">不选择</option>
                {creatives.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignBudget">预算</label>
              <input
                id="campaignBudget"
                min="0"
                onChange={(event) => updateDraft("budget", event.target.value)}
                step="0.01"
                type="number"
                value={draft.budget}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="campaignNotes">备注</label>
            <textarea id="campaignNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <button className="button primary" disabled={saving || filteredAdAccounts.length === 0} type="submit">
            {saving ? "保存中..." : "保存草稿"}
          </button>
        </form>
      </section>

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>平台</th>
              <th>状态</th>
              <th>广告账户</th>
              <th>策略/受众</th>
              <th>预算</th>
              <th>发布任务</th>
              <th>官方 ID</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <br />
                  <span className="muted">{row.config.notes ?? "-"}</span>
                </td>
                <td>{row.platform}</td>
                <td>
                  <span className={statusClass(row.status)}>{row.status}</span>
                </td>
                <td>{adAccountName(row.config.adAccountId)}</td>
                <td>
                  <strong>{strategyName(row.config.strategyId)}</strong>
                  <br />
                  <span className="muted">
                    {targetingName(row.config.targetingId)} / {creativeName(row.config.adCreativeId)}
                  </span>
                </td>
                <td>{row.config.budget ?? "-"}</td>
                <td>
                  {latestTask(row) ? (
                    <>
                      <span className={statusClass(latestTask(row)?.status ?? "")}>{latestTask(row)?.status}</span>
                      <br />
                      <span className="muted">
                        {latestTask(row)?.errorMessage ??
                          `${latestTask(row)?.attempts ?? 0} 次 / ${formatDate(latestTask(row)?.finishedAt ?? latestTask(row)?.createdAt ?? row.updatedAt)}`}
                      </span>
                    </>
                  ) : (
                    "-"
                  )}
                  {preflightResults[row.id] ? (
                    <div className={`preflight-result ${preflightResults[row.id].ready ? "success" : "warning"}`}>
                      <strong>{preflightResults[row.id].ready ? "预检通过" : "预检提示"}</strong>
                      {preflightResults[row.id].issues.length ? (
                        <ul>
                          {preflightResults[row.id].issues.map((issue) => (
                            <li key={`${issue.code}:${issue.message}`}>
                              {issue.severity === "error" ? "阻断" : "提示"}：{issue.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td>
                  {campaignMappings(row).length ? (
                    <div className="mapping-list">
                      {campaignMappings(row).map((mapping) => (
                        <div key={mapping.id}>
                          <strong>{mapping.objectType}</strong>
                          <span>{mapping.externalId}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{formatDate(row.updatedAt)}</td>
                <td>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      disabled={checkingId === row.id}
                      onClick={() => void preflight(row)}
                      type="button"
                    >
                      {checkingId === row.id ? "预检中..." : "预检"}
                    </button>
                    {row.status === "FAILED" ? (
                      <button
                        className="button primary"
                        disabled={publishingId === row.id}
                        onClick={() => void retryPublish(row)}
                        type="button"
                      >
                        {publishingId === row.id ? "重试中..." : "重试发布"}
                      </button>
                    ) : (
                      <button
                        className="button primary"
                        disabled={publishingId === row.id || row.status === "CREATING"}
                        onClick={() => void publish(row)}
                        type="button"
                      >
                        {publishingId === row.id ? "发布中..." : "提交发布"}
                      </button>
                    )}
                    <button className="button danger" onClick={() => void remove(row)} type="button">
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && !loading ? (
              <tr>
                <td colSpan={10}>暂无 Campaign 草稿</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
