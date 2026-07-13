"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";

type StrategyConfig = {
  objective?: string;
  budgetType?: string;
  dailyBudget?: number;
  bidStrategy?: string;
  bidAmount?: number;
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
  dailyBudget: string;
  bidStrategy: string;
  bidAmount: string;
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
  budgetType: "DAILY",
  dailyBudget: "50",
  bidStrategy: "LOWEST_COST",
  bidAmount: "",
  optimizationGoal: "PURCHASE",
  billingEvent: "IMPRESSIONS",
  placementMode: "AUTO",
  namingRule: "{platform}-{objective}-{date}",
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

function draftFromRow(row: StrategyRow): StrategyDraft {
  return {
    platform: row.platform,
    name: row.name,
    objective: row.config.objective ?? "SALES",
    budgetType: row.config.budgetType ?? "DAILY",
    dailyBudget: row.config.dailyBudget?.toString() ?? "",
    bidStrategy: row.config.bidStrategy ?? "LOWEST_COST",
    bidAmount: row.config.bidAmount?.toString() ?? "",
    optimizationGoal: row.config.optimizationGoal ?? "PURCHASE",
    billingEvent: row.config.billingEvent ?? "IMPRESSIONS",
    placementMode: row.config.placementMode ?? "AUTO",
    namingRule: row.config.namingRule ?? "",
    notes: row.notes ?? ""
  };
}

function buildPayload(draft: StrategyDraft) {
  return {
    platform: draft.platform,
    name: draft.name,
    notes: draft.notes || undefined,
    config: {
      objective: draft.objective,
      budgetType: draft.budgetType,
      dailyBudget: toNumber(draft.dailyBudget),
      bidStrategy: draft.bidStrategy,
      bidAmount: toNumber(draft.bidAmount),
      optimizationGoal: draft.optimizationGoal,
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
      resetForm();
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
    setDraft((current) => ({ ...current, [key]: value }));
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
            创建 Strategy
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
          <span>已用于 Campaign</span>
          <strong>{usedCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑 Strategy" : "创建 Strategy"}</h2>
            <p>策略保存后可以在 Campaign 创建页直接引用。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="strategyPlatform">Channel</label>
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
              <label htmlFor="strategyName">名称</label>
              <input
                id="strategyName"
                onChange={(event) => updateDraft("name", event.target.value)}
                required
                value={draft.name}
              />
            </div>
            <div className="field">
              <label htmlFor="objective">投放目标</label>
              <select id="objective" onChange={(event) => updateDraft("objective", event.target.value)} value={draft.objective}>
                <option value="SALES">销售转化</option>
                <option value="LEADS">线索收集</option>
                <option value="TRAFFIC">访问流量</option>
                <option value="APP_PROMOTION">应用推广</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="budgetType">预算类型</label>
              <select id="budgetType" onChange={(event) => updateDraft("budgetType", event.target.value)} value={draft.budgetType}>
                <option value="DAILY">日预算</option>
                <option value="LIFETIME">总预算</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="dailyBudget">默认预算</label>
              <input
                id="dailyBudget"
                min="0"
                onChange={(event) => updateDraft("dailyBudget", event.target.value)}
                step="0.01"
                type="number"
                value={draft.dailyBudget}
              />
            </div>
            <div className="field">
              <label htmlFor="bidStrategy">出价策略</label>
              <select id="bidStrategy" onChange={(event) => updateDraft("bidStrategy", event.target.value)} value={draft.bidStrategy}>
                <option value="LOWEST_COST">最低成本</option>
                <option value="COST_CAP">成本上限</option>
                <option value="BID_CAP">出价上限</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="bidAmount">出价/成本上限</label>
              <input
                id="bidAmount"
                min="0"
                onChange={(event) => updateDraft("bidAmount", event.target.value)}
                step="0.01"
                type="number"
                value={draft.bidAmount}
              />
            </div>
            <div className="field">
              <label htmlFor="optimizationGoal">优化目标</label>
              <select
                id="optimizationGoal"
                onChange={(event) => updateDraft("optimizationGoal", event.target.value)}
                value={draft.optimizationGoal}
              >
                <option value="PURCHASE">购买</option>
                <option value="LEAD">线索</option>
                <option value="CLICK">点击</option>
                <option value="INSTALL">安装</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="billingEvent">计费事件</label>
              <select id="billingEvent" onChange={(event) => updateDraft("billingEvent", event.target.value)} value={draft.billingEvent}>
                <option value="IMPRESSIONS">展示</option>
                <option value="CLICKS">点击</option>
                <option value="CONVERSIONS">转化</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="placementMode">版位</label>
              <select id="placementMode" onChange={(event) => updateDraft("placementMode", event.target.value)} value={draft.placementMode}>
                <option value="AUTO">自动版位</option>
                <option value="MANUAL">手动版位</option>
              </select>
            </div>
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
                <label htmlFor="strategyPlatformFilter">Channel</label>
                <select id="strategyPlatformFilter" onChange={(event) => setPlatformFilter(event.target.value)} value={platformFilter}>
                  <option value="">全部 Channel</option>
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
                  <th>Channel</th>
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
                    <td>{row.platform}</td>
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
                          创建 Campaign
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
                <h2>Strategy 详情</h2>
                <p>查看策略版本、配置和 Campaign 使用入口。</p>
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
                    <span>Channel</span>
                    <strong>{selectedStrategy.platform}</strong>
                  </div>
                  <div>
                    <span>版本</span>
                    <strong>v{versionOf(selectedStrategy)}</strong>
                  </div>
                  <div>
                    <span>已用于 Campaign</span>
                    <strong>{selectedStrategy.usageCount ?? 0}</strong>
                  </div>
                </div>
                <div className="strategy-config-grid">
                  <span>Objective：{selectedStrategy.config.objective ?? "-"}</span>
                  <span>Budget：{selectedStrategy.config.budgetType ?? "-"} / {selectedStrategy.config.dailyBudget ?? "-"}</span>
                  <span>Bid：{selectedStrategy.config.bidStrategy ?? "-"} / {selectedStrategy.config.bidAmount ?? "-"}</span>
                  <span>Optimization：{selectedStrategy.config.optimizationGoal ?? "-"}</span>
                  <span>Billing：{selectedStrategy.config.billingEvent ?? "-"}</span>
                  <span>Placement：{selectedStrategy.config.placementMode ?? "-"}</span>
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
                    用此策略创建 Campaign
                  </a>
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">请选择 Strategy</div>
            )}
          </section>
        </aside>
      </section>
    </AdminShell>
  );
}
