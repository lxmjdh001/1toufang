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
};

type StrategyRow = {
  id: string;
  platform: Platform;
  name: string;
  notes?: string | null;
  config: StrategyConfig;
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

export default function StrategiesPage() {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [draft, setDraft] = useState<StrategyDraft>(emptyDraft);
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
      setRows(await apiRequest<StrategyRow[]>("/strategies"));
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
    try {
      await apiRequest(editingId ? `/strategies/${editingId}` : "/strategies", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存策略模板失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: StrategyRow) {
    setError(null);
    try {
      await apiRequest(`/strategies/${row.id}`, { method: "DELETE" });
      if (editingId === row.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除策略模板失败");
    }
  }

  function edit(row: StrategyRow) {
    setEditingId(row.id);
    setDraft(draftFromRow(row));
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
        <>
          <button className="button secondary" onClick={resetForm} type="button">
            新建模板
          </button>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
        </>
      }
    >
      <section className="metric-grid">
        <div className="metric">
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
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{editingId ? "编辑模板" : "新增模板"}</h2>
            <p>策略模板会作为后续一键创建 Campaign 的默认投放规则。</p>
          </div>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="strategyPlatform">平台</label>
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
              <label htmlFor="strategyName">模板名称</label>
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
              {saving ? "保存中..." : editingId ? "保存修改" : "保存模板"}
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
              <th>模板名称</th>
              <th>平台</th>
              <th>投放目标</th>
              <th>预算/出价</th>
              <th>优化目标</th>
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
                  <span className="muted">{row.notes || row.config.namingRule || "-"}</span>
                </td>
                <td>{row.platform}</td>
                <td>{row.config.objective ?? "-"}</td>
                <td>
                  <strong>{row.config.dailyBudget ? `${row.config.dailyBudget}` : "-"}</strong>
                  <br />
                  <span className="muted">{row.config.bidStrategy ?? "-"}</span>
                </td>
                <td>{row.config.optimizationGoal ?? "-"}</td>
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
                <td colSpan={7}>暂无策略模板</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
