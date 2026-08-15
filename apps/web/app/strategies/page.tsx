"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";

type StrategyConfig = {
  objective?: string;
  budgetType?: string;
  budgetAmount?: number;
  budgetScope?: string;
  dailyBudget?: number;
  bidStrategy?: string;
  bidAmount?: number;
  callToAction?: string;
  conversionTarget?: string;
  campaignType?: string;
  optimizationGoal?: string;
  billingEvent?: string;
  placementMode?: string;
  namingRule?: string;
  version?: number;
  versionHistory?: unknown[];
};

type StrategyRow = {
  id: string;
  platform: Platform;
  name: string;
  notes?: string | null;
  config: StrategyConfig;
  version?: number;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: { email: string; profile?: { name?: string | null } | null } | null;
};

type StrategyDraft = {
  platform: Platform;
  name: string;
  objective: string;
  budgetType: string;
  budgetAmount: string;
  bidStrategy: string;
  bidAmount: string;
  callToAction: string;
  conversionTarget: string;
  campaignType: string;
  optimizationGoal: string;
  billingEvent: string;
  placementMode: string;
  namingRule: string;
  notes: string;
};

const emptyDraft: StrategyDraft = {
  platform: "META",
  name: "",
  objective: "SALES",
  budgetType: "CAMPAIGN_DAILY",
  budgetAmount: "50",
  bidStrategy: "HIGHEST_VOLUME",
  bidAmount: "",
  callToAction: "LEARN_MORE",
  conversionTarget: "WEBSITE",
  campaignType: "STANDARD",
  optimizationGoal: "CONVERSATIONS",
  billingEvent: "IMPRESSIONS",
  placementMode: "AUTO",
  namingRule: "{platform}-{objective}-{date}",
  notes: ""
};

const budgetTypeOptions = [
  { value: "CAMPAIGN_LIFETIME", label: "广告系列总预算", amountLabel: "总预算" },
  { value: "CAMPAIGN_DAILY", label: "广告系列日预算", amountLabel: "每日预算" },
  { value: "ADSET_DAILY", label: "广告组预算", amountLabel: "每日预算" }
];

const bidStrategyOptions = [
  { value: "HIGHEST_VOLUME", label: "最大数量" },
  { value: "COST_PER_RESULT_GOAL", label: "单次成效费用目标" },
  { value: "BID_CAP", label: "竞价最高上限" }
];

const objectiveOptions = [
  { value: "AWARENESS", label: "知名度" },
  { value: "TRAFFIC", label: "流量" },
  { value: "ENGAGEMENT", label: "互动" },
  { value: "LEADS", label: "潜在客户" },
  { value: "APP_PROMOTION", label: "应用推广" },
  { value: "SALES", label: "销量" }
];

const callToActionOptions = [
  { value: "LEARN_MORE", label: "了解更多" },
  { value: "SHOP_NOW", label: "立即购买" },
  { value: "ORDER_NOW", label: "立即订购" },
  { value: "SIGN_UP", label: "注册" },
  { value: "DOWNLOAD", label: "下载" },
  { value: "CONTACT_US", label: "联系我们" },
  { value: "MESSAGE", label: "发送消息" },
  { value: "WHATSAPP_MESSAGE", label: "发送 WhatsApp 消息" },
  { value: "INSTALL_MOBILE_APP", label: "安装移动应用" },
  { value: "PLAY_GAME", label: "玩游戏" }
];

const leadConversionTargets = [
  { value: "FORM", label: "表单" },
  { value: "WEBSITE", label: "网站" }
];

const optimizationByObjective: Record<string, Array<{ value: string; label: string }>> = {
  APP_PROMOTION: [
    { value: "TRAFFIC", label: "流量" },
    { value: "INSTALL", label: "安装" },
    { value: "CONVERSION", label: "转化" },
    { value: "VALUE", label: "价值" }
  ],
  SALES: [
    { value: "TRAFFIC", label: "流量" },
    { value: "CONVERSATIONS", label: "对话" },
    { value: "VALUE", label: "价值" }
  ],
  LEADS: [
    { value: "LEAD", label: "潜在客户" },
    { value: "QUALITY_LEAD", label: "优质潜在客户" }
  ]
};

const campaignTypeOptions = [
  { value: "STANDARD", label: "标准" },
  { value: "ADVANTAGE_PLUS", label: "Advantage+" }
];

const billingEventOptions = [
  { value: "IMPRESSIONS", label: "展示" },
  { value: "CLICKS", label: "点击" },
  { value: "CONVERSIONS", label: "转化" }
];

const placementModeOptions = [
  { value: "AUTO", label: "自动版位" },
  { value: "MANUAL", label: "手动版位" }
];

function optionLabel(options: Array<{ value: string; label: string }>, value?: string) {
  return options.find((option) => option.value === value)?.label ?? value ?? "-";
}

function platformLabel(platform: Platform) {
  return platform === "META" ? "Meta" : "TikTok";
}

function optimizationLabel(objective?: string, value?: string) {
  return optionLabel(optimizationByObjective[objective ?? ""] ?? [], value);
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

function normalizeBudgetType(value?: string) {
  if (value === "LIFETIME") return "CAMPAIGN_LIFETIME";
  if (value === "DAILY") return "CAMPAIGN_DAILY";
  return value ?? "CAMPAIGN_DAILY";
}

function normalizeBidStrategy(value?: string) {
  if (value === "LOWEST_COST") return "HIGHEST_VOLUME";
  if (value === "COST_CAP") return "COST_PER_RESULT_GOAL";
  return value ?? "HIGHEST_VOLUME";
}

function draftFromRow(row: StrategyRow): StrategyDraft {
  return {
    platform: row.platform,
    name: row.name,
    objective: row.config.objective ?? "SALES",
    budgetType: normalizeBudgetType(row.config.budgetType),
    budgetAmount: (row.config.budgetAmount ?? row.config.dailyBudget)?.toString() ?? "",
    bidStrategy: normalizeBidStrategy(row.config.bidStrategy),
    bidAmount: row.config.bidAmount?.toString() ?? "",
    callToAction: row.config.callToAction ?? "LEARN_MORE",
    conversionTarget: row.config.conversionTarget ?? "WEBSITE",
    campaignType: row.config.campaignType ?? "STANDARD",
    optimizationGoal: row.config.optimizationGoal ?? "PURCHASE",
    billingEvent: row.config.billingEvent ?? "IMPRESSIONS",
    placementMode: row.config.placementMode ?? "AUTO",
    namingRule: row.config.namingRule ?? "",
    notes: row.notes ?? ""
  };
}

function buildPayload(draft: StrategyDraft) {
  const budgetAmount = toNumber(draft.budgetAmount);
  const bidAmount = draft.bidStrategy === "BID_CAP" ? toNumber(draft.bidAmount) : undefined;
  const hasObjectiveChildren = draft.callToAction === "DOWNLOAD";
  return {
    platform: draft.platform,
    name: draft.name,
    notes: draft.notes || undefined,
    config: {
      objective: draft.objective,
      budgetType: draft.budgetType,
      budgetScope: draft.budgetType === "ADSET_DAILY" ? "AD_SET" : "CAMPAIGN",
      budgetAmount,
      dailyBudget: budgetAmount,
      bidStrategy: draft.bidStrategy,
      bidAmount,
      callToAction: draft.callToAction,
      conversionTarget: hasObjectiveChildren && draft.objective === "LEADS" ? draft.conversionTarget : undefined,
      campaignType: hasObjectiveChildren && ["APP_PROMOTION", "SALES"].includes(draft.objective) ? draft.campaignType : undefined,
      optimizationGoal: hasObjectiveChildren ? draft.optimizationGoal : undefined,
      billingEvent: draft.billingEvent,
      placementMode: draft.placementMode,
      namingRule: draft.namingRule
    }
  };
}

function creatorName(row: StrategyRow) {
  return row.createdBy?.profile?.name ?? row.createdBy?.email ?? "-";
}

function versionOf(row: StrategyRow) {
  return row.version ?? row.config.version ?? 1;
}

export default function StrategiesPage() {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [draft, setDraft] = useState<StrategyDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const metaCount = useMemo(() => rows.filter((row) => row.platform === "META").length, [rows]);
  const tiktokCount = rows.length - metaCount;
  const usedCount = useMemo(() => rows.filter((row) => Number(row.usageCount ?? 0) > 0).length, [rows]);
  const selectedStrategy = useMemo(() => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null, [rows, selectedId]);
  const activeBudgetType = useMemo(
    () => budgetTypeOptions.find((option) => option.value === draft.budgetType) ?? budgetTypeOptions[1],
    [draft.budgetType]
  );
  const activeObjectiveLabel = objectiveOptions.find((option) => option.value === draft.objective)?.label ?? "广告系列目标";
  const activeOptimizationOptions = optimizationByObjective[draft.objective] ?? [];
  const canShowObjectiveChildren = draft.callToAction === "DOWNLOAD";
  const showConversionTarget = canShowObjectiveChildren && draft.objective === "LEADS";
  const showOptimizationGoal = canShowObjectiveChildren && activeOptimizationOptions.length > 0;
  const showCampaignType =
    canShowObjectiveChildren &&
    ((draft.objective === "APP_PROMOTION" && draft.optimizationGoal === "INSTALL") ||
      (draft.objective === "SALES" && draft.optimizationGoal === "CONVERSATIONS"));
  const showBidAmount = draft.bidStrategy === "BID_CAP";
  const visibleRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesPlatform = !platformFilter || row.platform === platformFilter;
      const matchesKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.config.objective?.toLowerCase().includes(keyword) ||
        row.config.optimizationGoal?.toLowerCase().includes(keyword) ||
        row.notes?.toLowerCase().includes(keyword);
      return matchesPlatform && matchesKeyword;
    });
  }, [platformFilter, rows, searchTerm]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const nextRows = await apiRequest<StrategyRow[]>("/strategies");
      setRows(nextRows);
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载策略模板失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const action = submitter instanceof HTMLButtonElement ? submitter.value : "save";
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const row = await apiRequest<StrategyRow>(editingId ? `/strategies/${editingId}` : "/strategies", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(editingId ? "策略已更新并生成新版本" : "策略已创建");
      setSelectedId(row.id);
      if (action === "create_another" && !editingId) {
        setDraft({ ...emptyDraft, platform: draft.platform });
      } else {
        resetForm();
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存策略模板失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: StrategyRow) {
    if (!window.confirm(`确认删除策略 ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/strategies/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      if (selectedId === row.id) setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除策略模板失败");
    }
  }

  async function duplicate(row: StrategyRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const next = await apiRequest<StrategyRow>(`/strategies/${row.id}/duplicate`, { method: "POST" });
      setNotice("策略已复制");
      setSelectedId(next.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "复制策略失败");
    } finally {
      setBusyId(null);
    }
  }

  function edit(row: StrategyRow) {
    setEditingId(row.id);
    setSelectedId(row.id);
    setDraft(draftFromRow(row));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  function updateDraft<K extends keyof StrategyDraft>(key: K, value: StrategyDraft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };

      if (key === "objective") {
        const options = optimizationByObjective[String(value)] ?? [];
        next.optimizationGoal = options[0]?.value ?? "";
        next.conversionTarget = String(value) === "LEADS" ? next.conversionTarget || "WEBSITE" : "";
        next.campaignType = ["APP_PROMOTION", "SALES"].includes(String(value)) ? next.campaignType || "STANDARD" : "";
      }

      if (key === "bidStrategy" && value !== "BID_CAP") {
        next.bidAmount = "";
      }

      if (key === "callToAction" && value !== "DOWNLOAD") {
        next.conversionTarget = "";
        next.optimizationGoal = "";
        next.campaignType = "";
      }

      if (key === "callToAction" && value === "DOWNLOAD") {
        const options = optimizationByObjective[next.objective] ?? [];
        next.optimizationGoal = options[0]?.value ?? next.optimizationGoal;
        next.conversionTarget = next.objective === "LEADS" ? next.conversionTarget || "WEBSITE" : next.conversionTarget;
      }

      if (key === "optimizationGoal") {
        const needsCampaignType =
          (next.objective === "APP_PROMOTION" && value === "INSTALL") ||
          (next.objective === "SALES" && value === "CONVERSATIONS");
        next.campaignType = needsCampaignType ? next.campaignType || "STANDARD" : "";
      }

      return next;
    });
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="策略模板"
      description="沉淀 Meta 和 TikTok 的预算、版位、出价、命名规则等投放模板。"
      actions={
        <div className="button-row">
          <button className="button primary" onClick={resetForm} type="button">
            创建策略
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>模板总数</span>
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
        <div className="metric">
          <span>已用于投放计划</span>
          <strong>{usedCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑策略" : "创建策略"}</h2>
            <p>策略保存后可以在投放计划创建页直接引用。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-section-heading">
            <h3>基础信息</h3>
          </div>
          <div className="form-grid strategy-rule-grid">
            <div className="field">
              <label htmlFor="strategyPlatform">投放平台</label>
              <select
                id="strategyPlatform"
                onChange={(event) => updateDraft("platform", event.target.value as Platform)}
                value={draft.platform}
              >
                <option value="META">Meta</option>
                <option value="TIKTOK">TikTok</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="strategyName">策略名称</label>
              <input
                id="strategyName"
                onChange={(event) => updateDraft("name", event.target.value)}
                required
                value={draft.name}
              />
            </div>
          </div>

          <div className="form-section-heading">
            <h3>预算类型</h3>
          </div>
          <div className="form-grid strategy-rule-grid">
            <div className="field">
              <label htmlFor="budgetType">预算类型</label>
              <select id="budgetType" onChange={(event) => updateDraft("budgetType", event.target.value)} value={draft.budgetType}>
                {budgetTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="budgetAmount">{activeBudgetType.amountLabel}</label>
              <div className="currency-input">
                <span>$</span>
                <input
                  id="budgetAmount"
                  min="0"
                  onChange={(event) => updateDraft("budgetAmount", event.target.value)}
                  step="0.01"
                  type="number"
                  value={draft.budgetAmount}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="bidStrategy">广告竞价策略</label>
              <select id="bidStrategy" onChange={(event) => updateDraft("bidStrategy", event.target.value)} value={draft.bidStrategy}>
                {bidStrategyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {showBidAmount ? (
              <div className="field">
                <label htmlFor="bidAmount">竞价金额</label>
                <div className="currency-input">
                  <span>$</span>
                  <input
                    id="bidAmount"
                    min="0"
                    onChange={(event) => updateDraft("bidAmount", event.target.value)}
                    step="0.01"
                    type="number"
                    value={draft.bidAmount}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="form-section-heading">
            <h3>广告系列目标</h3>
            <span>{activeObjectiveLabel}</span>
          </div>
          <div className="form-grid strategy-rule-grid">
            <div className="field">
              <label htmlFor="objective">广告系列目标</label>
              <select id="objective" onChange={(event) => updateDraft("objective", event.target.value)} value={draft.objective}>
                {objectiveOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="callToAction">行动号召</label>
              <select id="callToAction" onChange={(event) => updateDraft("callToAction", event.target.value)} value={draft.callToAction}>
                {callToActionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {showConversionTarget ? (
              <div className="field">
                <label htmlFor="conversionTarget">转化目标</label>
                <select
                  id="conversionTarget"
                  onChange={(event) => updateDraft("conversionTarget", event.target.value)}
                  value={draft.conversionTarget}
                >
                  {leadConversionTargets.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {showOptimizationGoal ? (
              <div className="field">
                <label htmlFor="optimizationGoal">优化目标</label>
                <select
                  id="optimizationGoal"
                  onChange={(event) => updateDraft("optimizationGoal", event.target.value)}
                  value={draft.optimizationGoal}
                >
                  {activeOptimizationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {showCampaignType ? (
              <div className="field">
                <label htmlFor="campaignType">系列类型</label>
                <select id="campaignType" onChange={(event) => updateDraft("campaignType", event.target.value)} value={draft.campaignType}>
                  {campaignTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="billingEvent">计费事件</label>
              <select id="billingEvent" onChange={(event) => updateDraft("billingEvent", event.target.value)} value={draft.billingEvent}>
                {billingEventOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="placementMode">版位</label>
              <select id="placementMode" onChange={(event) => updateDraft("placementMode", event.target.value)} value={draft.placementMode}>
                {placementModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-section-heading">
            <h3>命名与备注</h3>
          </div>
          <div className="form-grid strategy-rule-grid">
            <div className="field">
              <label htmlFor="namingRule">命名规则</label>
              <input
                id="namingRule"
                onChange={(event) => updateDraft("namingRule", event.target.value)}
                value={draft.namingRule}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="strategyNotes">备注</label>
            <textarea id="strategyNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="button-row">
            <button className="button primary" disabled={saving} type="submit">
              {saving ? "保存中..." : editingId ? "保存新版本" : "保存模板"}
            </button>
            {!editingId ? (
              <button className="button secondary" disabled={saving} type="submit" value="create_another">
                创建并创建另一个
              </button>
            ) : null}
            {editingId ? (
              <button className="button secondary" onClick={resetForm} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="strategy-layout">
        <div>
          <section className="panel strategy-filter-panel">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="strategySearch">搜索</label>
                <input id="strategySearch" onChange={(event) => setSearchTerm(event.target.value)} value={searchTerm} />
              </div>
              <div className="field">
                <label htmlFor="strategyPlatformFilter">投放平台</label>
                <select id="strategyPlatformFilter" onChange={(event) => setPlatformFilter(event.target.value)} value={platformFilter}>
                  <option value="">全部平台</option>
                  <option value="META">Meta</option>
                  <option value="TIKTOK">TikTok</option>
                </select>
              </div>
            </div>
          </section>

          <section className="table-panel strategy-table-panel">
            <table className="strategy-table">
              <thead>
                <tr>
                  <th>创建者</th>
                  <th>投放平台</th>
                  <th>名称</th>
                  <th>版本</th>
                  <th>使用数</th>
                  <th>创建时间</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr className={selectedStrategy?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelectedId(row.id)}>
                    <td>{creatorName(row)}</td>
                    <td>{platformLabel(row.platform)}</td>
                    <td>
                      <strong>{row.name}</strong>
                      <br />
                      <span className="muted">{row.config.objective ?? "-"} / {row.config.optimizationGoal ?? "-"}</span>
                    </td>
                    <td>v{versionOf(row)}</td>
                    <td>{row.usageCount ?? 0}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{formatDate(row.updatedAt)}</td>
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
                        <a className="button primary" href={`/campaigns?strategyId=${row.id}`}>
                          创建投放计划
                        </a>
                        <button className="button danger" onClick={() => void remove(row)} type="button">
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8}>暂无策略模板</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="strategy-detail-panel">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>策略详情</h2>
                <p>查看策略版本、配置和投放计划使用入口。</p>
              </div>
            </div>
            {selectedStrategy ? (
              <div className="strategy-detail">
                <div className="detail-list">
                  <div>
                    <span>名称</span>
                    <strong>{selectedStrategy.name}</strong>
                  </div>
                  <div>
                    <span>创建者</span>
                    <strong>{creatorName(selectedStrategy)}</strong>
                  </div>
                  <div>
                    <span>投放平台</span>
                    <strong>{platformLabel(selectedStrategy.platform)}</strong>
                  </div>
                  <div>
                    <span>版本</span>
                    <strong>v{versionOf(selectedStrategy)}</strong>
                  </div>
                  <div>
                    <span>已用于投放计划</span>
                    <strong>{selectedStrategy.usageCount ?? 0}</strong>
                  </div>
                </div>
                <div className="strategy-config-grid">
                  <span>投放目标：{optionLabel(objectiveOptions, selectedStrategy.config.objective)}</span>
                  <span>预算：{optionLabel(budgetTypeOptions, normalizeBudgetType(selectedStrategy.config.budgetType))} / {selectedStrategy.config.budgetAmount ?? selectedStrategy.config.dailyBudget ?? "-"}</span>
                  <span>竞价：{optionLabel(bidStrategyOptions, normalizeBidStrategy(selectedStrategy.config.bidStrategy))} / {selectedStrategy.config.bidAmount ?? "-"}</span>
                  <span>行动号召：{optionLabel(callToActionOptions, selectedStrategy.config.callToAction)}</span>
                  <span>转化位置：{optionLabel(leadConversionTargets, selectedStrategy.config.conversionTarget)}</span>
                  <span>优化目标：{optimizationLabel(selectedStrategy.config.objective, selectedStrategy.config.optimizationGoal)}</span>
                  <span>系列类型：{optionLabel(campaignTypeOptions, selectedStrategy.config.campaignType)}</span>
                  <span>计费事件：{optionLabel(billingEventOptions, selectedStrategy.config.billingEvent)}</span>
                  <span>版位：{optionLabel(placementModeOptions, selectedStrategy.config.placementMode)}</span>
                </div>
                <div className="notice success">
                  <strong>命名规则</strong>
                  <br />
                  {selectedStrategy.config.namingRule ?? "-"}
                </div>
                <div className="button-row">
                  <button className="button secondary" onClick={() => edit(selectedStrategy)} type="button">
                    编辑
                  </button>
                  <button className="button secondary" onClick={() => void duplicate(selectedStrategy)} type="button">
                    复制
                  </button>
                  <a className="button primary" href={`/campaigns?strategyId=${selectedStrategy.id}`}>
                    用此策略创建投放计划
                  </a>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择策略</div>
            )}
          </section>
        </aside>
      </section>
    </AdminShell>
  );
}
