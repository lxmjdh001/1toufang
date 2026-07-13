"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";
type ViewKey = "default" | "favorite" | "learning" | "stopped" | "unprofitable" | "rejected";
type GroupKey = "none" | "team" | "user" | "project" | "page" | "tag" | "status" | "createDate";
type BulkAction =
  | "retry_publish"
  | "stop_selected"
  | "start_selected"
  | "delete_selected"
  | "modify_daily_budget"
  | "update_config";

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
  config?: {
    objective?: string;
    dailyBudget?: number;
    namingRule?: string;
  };
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

type PlatformAssetRow = {
  id: string;
  platform: Platform;
  type: string;
  externalId: string;
  name: string;
  status?: string | null;
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
  price?: string | number | null;
  status: string;
};

type DomainRow = {
  id: string;
  domain: string;
  status: string;
};

type CampaignMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  event1: number;
  event2: number;
  event3: number;
  result: number;
  conversions: number;
  profit: number;
  revenue?: number;
  ctr?: number;
  cpc?: number;
  cpa?: number;
  roas?: number;
};

type CampaignConfig = {
  adAccountId?: string;
  strategyId?: string;
  targetingId?: string;
  adCreativeId?: string;
  budget?: number;
  dailyBudget?: number;
  tags?: string[];
  project?: string;
  pageAssetId?: string;
  landingPageId?: string;
  offerId?: string;
  domainId?: string;
  customDomain?: string;
  adSetupMode?: string;
  existingPostId?: string;
  splitTest?: boolean;
  optimizerIds?: string[];
  aiAssistantIds?: string[];
  lifecycleStatus?: string;
  favorite?: boolean;
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
  metrics: CampaignMetrics;
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
  tags: string;
  project: string;
  pageAssetId: string;
  landingPageId: string;
  offerId: string;
  domainId: string;
  customDomain: string;
  adSetupMode: "EXISTING_POST" | "EXISTING_CREATIVE" | "CREATE_CREATIVE";
  existingPostId: string;
  splitTest: boolean;
  optimizerIds: string;
  aiAssistantIds: string;
  lifecycleStatus: string;
  notes: string;
};

type CampaignGroup = {
  key: string;
  label: string;
  rows: CampaignRow[];
};

type BulkResult = {
  action: BulkAction;
  affected: number;
  results?: Array<{ id: string; ok: boolean; status?: string; message?: string }>;
};

const emptyDraft: CampaignDraft = {
  platform: "META",
  name: "",
  adAccountId: "",
  strategyId: "",
  targetingId: "",
  adCreativeId: "",
  budget: "",
  tags: "",
  project: "",
  pageAssetId: "",
  landingPageId: "",
  offerId: "",
  domainId: "",
  customDomain: "",
  adSetupMode: "EXISTING_CREATIVE",
  existingPostId: "",
  splitTest: false,
  optimizerIds: "",
  aiAssistantIds: "",
  lifecycleStatus: "",
  notes: ""
};

const viewTabs: Array<{ key: ViewKey; label: string }> = [
  { key: "default", label: "默认" },
  { key: "favorite", label: "收藏" },
  { key: "learning", label: "学习" },
  { key: "stopped", label: "停止" },
  { key: "unprofitable", label: "非盈利" },
  { key: "rejected", label: "被驳回" }
];

const groupOptions: Array<{ key: GroupKey; label: string }> = [
  { key: "none", label: "不分组" },
  { key: "team", label: "Team" },
  { key: "user", label: "User" },
  { key: "project", label: "Project" },
  { key: "page", label: "Page" },
  { key: "tag", label: "Tag" },
  { key: "status", label: "Status" },
  { key: "createDate", label: "Create Date" }
];

function toNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseList(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function formatDateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatNumber(value?: number) {
  return Intl.NumberFormat("zh-CN").format(Math.round(Number(value ?? 0)));
}

function formatMoney(value?: number) {
  return Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(Number(value ?? 0));
}

function statusClass(status: string) {
  if (["ACTIVE", "PUBLISHED", "SUCCEEDED"].includes(status)) return "pill success";
  if (["FAILED", "PARTIALLY_FAILED", "rejected"].includes(status)) return "pill danger";
  if (["CREATING", "DRAFT", "RUNNING", "PENDING"].includes(status)) return "pill warning";
  return "pill";
}

function userName(row: CampaignRow) {
  return row.createdBy?.profile?.name ?? row.createdBy?.email ?? "-";
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function createEmptyMetrics(): CampaignMetrics {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    event1: 0,
    event2: 0,
    event3: 0,
    result: 0,
    conversions: 0,
    profit: 0
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountRow[]>([]);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [targetings, setTargetings] = useState<TargetingRow[]>([]);
  const [creatives, setCreatives] = useState<CreativeRow[]>([]);
  const [platformAssets, setPlatformAssets] = useState<PlatformAssetRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft);
  const [activeView, setActiveView] = useState<ViewKey>("default");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBudget, setBulkBudget] = useState("");
  const [bulkLandingPageId, setBulkLandingPageId] = useState("");
  const [bulkOfferId, setBulkOfferId] = useState("");
  const [bulkOptimizerIds, setBulkOptimizerIds] = useState("");
  const [bulkAiAssistantIds, setBulkAiAssistantIds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<"save" | "continue">("save");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [appliedStrategyId, setAppliedStrategyId] = useState<string | null>(null);
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
  const filteredPageAssets = useMemo(
    () =>
      platformAssets.filter((row) => {
        if (row.platform !== draft.platform) return false;
        return draft.platform === "META"
          ? row.type === "FACEBOOK_PAGE"
          : row.type === "TIKTOK_ADVERTISER" || row.type === "TIKTOK_APP";
      }),
    [draft.platform, platformAssets]
  );

  const viewCounts = useMemo(
    () =>
      Object.fromEntries(
        viewTabs.map((tab) => [tab.key, campaigns.filter((row) => matchesView(row, tab.key)).length])
      ) as Record<ViewKey, number>,
    [campaigns]
  );

  const visibleCampaigns = useMemo(
    () => campaigns.filter((row) => matchesView(row, activeView)),
    [activeView, campaigns]
  );

  const visibleIds = useMemo(() => Array.from(new Set(visibleCampaigns.map((row) => row.id))), [visibleCampaigns]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const summary = useMemo(
    () =>
      visibleCampaigns.reduce(
        (current, row) => ({
          spend: current.spend + row.metrics.spend,
          impressions: current.impressions + row.metrics.impressions,
          clicks: current.clicks + row.metrics.clicks,
          linkClicks: current.linkClicks + row.metrics.linkClicks,
          event1: current.event1 + row.metrics.event1,
          event2: current.event2 + row.metrics.event2,
          event3: current.event3 + row.metrics.event3,
          result: current.result + row.metrics.result,
          conversions: current.conversions + row.metrics.conversions,
          profit: current.profit + row.metrics.profit
        }),
        createEmptyMetrics()
      ),
    [visibleCampaigns]
  );

  const groupedCampaigns = useMemo(() => groupCampaigns(visibleCampaigns, groupBy), [groupBy, visibleCampaigns]);
  const selectedCount = selectedIds.length;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [
        campaignRows,
        adAccountRows,
        strategyRows,
        targetingRows,
        creativeRows,
        assetRows,
        landingPageRows,
        offerRows,
        domainRows
      ] = await Promise.all([
        apiRequest<CampaignRow[]>("/campaigns"),
        apiRequest<AdAccountRow[]>("/ad-accounts"),
        apiRequest<StrategyRow[]>("/strategies"),
        apiRequest<TargetingRow[]>("/targetings"),
        apiRequest<CreativeRow[]>("/creatives"),
        apiRequest<PlatformAssetRow[]>("/platform-assets"),
        apiRequest<LandingPageRow[]>("/landing-pages"),
        apiRequest<OfferRow[]>("/offers"),
        apiRequest<DomainRow[]>("/domains")
      ]);
      setCampaigns(campaignRows);
      setAdAccounts(adAccountRows);
      setStrategies(strategyRows);
      setTargetings(targetingRows);
      setCreatives(creativeRows);
      setPlatformAssets(assetRows);
      setLandingPages(landingPageRows);
      setOffers(offerRows);
      setDomains(domainRows);
      setSelectedIds((current) => current.filter((id) => campaignRows.some((row) => row.id === id)));
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
    setNotice(null);
    try {
      await apiRequest("/campaigns", {
        method: "POST",
        body: JSON.stringify(buildPayload(draft))
      });
      setNotice(saveMode === "continue" ? "Campaign 草稿已保存，可以继续创建" : "Campaign 草稿已保存");
      setDraft((current) => (saveMode === "continue" ? carryDraft(current) : emptyDraft));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 Campaign 草稿失败");
    } finally {
      setSaving(false);
      setSaveMode("save");
    }
  }

  async function remove(row: CampaignRow) {
    if (!window.confirm(`确认删除 ${row.name}？`)) return;
    setError(null);
    try {
      await apiRequest(`/campaigns/${row.id}`, { method: "DELETE" });
      setSelectedIds((current) => current.filter((id) => id !== row.id));
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

  async function runBulkAction(action: BulkAction, payload: Record<string, unknown> = {}) {
    if (!selectedIds.length) {
      setError("请先选择 Campaign");
      return false;
    }
    if (action === "delete_selected" && !window.confirm(`确认删除 ${selectedIds.length} 个 Campaign？`)) return false;

    setBusyAction(action);
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<BulkResult>("/campaigns/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, action, ...payload })
      });
      const failed = result.results?.filter((item) => !item.ok).length ?? 0;
      setNotice(`已处理 ${result.affected} 个 Campaign${failed ? `，${failed} 个失败` : ""}`);
      setSelectedIds([]);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量操作失败");
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function modifyBulkBudget() {
    const dailyBudget = toNumber(bulkBudget);
    if (dailyBudget == null) {
      setError("请输入有效的每日预算");
      return;
    }
    if (await runBulkAction("modify_daily_budget", { dailyBudget })) {
      setBulkBudget("");
    }
  }

  async function updateBulkConfig(config: Record<string, unknown>, successText: string) {
    if (await runBulkAction("update_config", { config })) {
      setNotice(successText);
    }
  }

  async function toggleFavorite(row: CampaignRow) {
    setError(null);
    try {
      await apiRequest<BulkResult>("/campaigns/bulk", {
        method: "POST",
        body: JSON.stringify({
          ids: [row.id],
          action: "update_config",
          config: { favorite: !row.config.favorite }
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新收藏失败");
    }
  }

  async function modifyRowBudget(row: CampaignRow) {
    const nextValue = window.prompt("新的每日预算", String(row.config.dailyBudget ?? row.config.budget ?? ""));
    if (nextValue === null) return;
    const dailyBudget = toNumber(nextValue);
    if (dailyBudget == null) {
      setError("请输入有效的每日预算");
      return;
    }

    setError(null);
    try {
      await apiRequest(`/campaigns/${row.id}/budget`, {
        method: "PATCH",
        body: JSON.stringify({ dailyBudget })
      });
      setNotice("每日预算已更新");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改预算失败");
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
      pageAssetId: ""
    }));
  }

  function randName() {
    const strategy = strategies.find((row) => row.id === draft.strategyId);
    const objective = strategy?.config?.objective ?? "SALE";
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    updateDraft("name", `WZZ-${draft.platform}-${objective}-${date}-${suffix}`);
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleVisibleRows() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function adAccountName(id?: string) {
    const row = adAccounts.find((item) => item.id === id);
    return row ? `${row.name} / ${row.externalId}` : "-";
  }

  function pageName(id?: string) {
    const row = platformAssets.find((item) => item.id === id);
    return row ? `${row.name} / ${row.externalId}` : "-";
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

  function latestTask(row: CampaignRow) {
    return row.publishTasks?.[0] ?? null;
  }

  function exportCsv() {
    const headers = [
      "ID",
      "名称",
      "创建者",
      "标签",
      "状态",
      "主页",
      "广告账户",
      "每日预算",
      "消耗",
      "曝光量",
      "点击量",
      "链接点击量",
      "事件1",
      "事件2",
      "事件3",
      "成效",
      "转化",
      "效益",
      "备注"
    ];
    const lines = visibleCampaigns.map((row) =>
      [
        row.id,
        row.name,
        userName(row),
        row.config.tags?.join(", "),
        row.status,
        pageName(row.config.pageAssetId),
        adAccountName(row.config.adAccountId),
        row.config.dailyBudget ?? row.config.budget ?? "",
        row.metrics.spend,
        row.metrics.impressions,
        row.metrics.clicks,
        row.metrics.linkClicks,
        row.metrics.event1,
        row.metrics.event2,
        row.metrics.event3,
        row.metrics.result,
        row.metrics.conversions,
        row.metrics.profit,
        row.config.notes
      ].map(csvCell)
    );
    const csv = [headers.map(csvCell), ...lines].map((line) => line.join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campaigns-${activeView}-${formatDateKey(new Date().toISOString())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildPayload(current: CampaignDraft) {
    const budget = toNumber(current.budget);
    return {
      platform: current.platform,
      name: current.name,
      adAccountId: current.adAccountId,
      strategyId: current.strategyId || undefined,
      targetingId: current.targetingId || undefined,
      adCreativeId: current.adCreativeId || undefined,
      budget,
      tags: parseList(current.tags),
      project: current.project || undefined,
      pageAssetId: current.pageAssetId || undefined,
      landingPageId: current.landingPageId || undefined,
      offerId: current.offerId || undefined,
      domainId: current.domainId || undefined,
      customDomain: current.customDomain || undefined,
      adSetupMode: current.adSetupMode,
      existingPostId: current.existingPostId || undefined,
      splitTest: current.splitTest,
      optimizerIds: parseList(current.optimizerIds),
      aiAssistantIds: parseList(current.aiAssistantIds),
      lifecycleStatus: current.lifecycleStatus || undefined,
      notes: current.notes || undefined
    };
  }

  function carryDraft(current: CampaignDraft): CampaignDraft {
    return {
      ...emptyDraft,
      platform: current.platform,
      adAccountId: current.adAccountId,
      strategyId: current.strategyId,
      targetingId: current.targetingId,
      budget: current.budget,
      tags: current.tags,
      project: current.project,
      pageAssetId: current.pageAssetId,
      landingPageId: current.landingPageId,
      offerId: current.offerId,
      domainId: current.domainId,
      customDomain: current.customDomain,
      adSetupMode: current.adSetupMode,
      splitTest: current.splitTest,
      optimizerIds: current.optimizerIds,
      aiAssistantIds: current.aiAssistantIds
    };
  }

  function matchesView(row: CampaignRow, view: ViewKey) {
    if (view === "default") return true;
    if (view === "favorite") return Boolean(row.config.favorite);
    if (view === "learning") return row.config.lifecycleStatus === "learning";
    if (view === "stopped") return row.status === "PAUSED" || row.config.lifecycleStatus === "stopped";
    if (view === "unprofitable") return row.metrics.profit < 0;
    return row.status === "FAILED" || row.status === "PARTIALLY_FAILED" || row.config.lifecycleStatus === "rejected";
  }

  function groupCampaigns(rows: CampaignRow[], key: GroupKey): CampaignGroup[] {
    if (key === "none") return [{ key: "all", label: "全部 Campaign", rows }];

    const groups = new Map<string, CampaignRow[]>();
    for (const row of rows) {
      const labels =
        key === "tag" ? row.config.tags?.filter(Boolean) ?? [] : [groupLabel(row, key)].filter(Boolean);
      const normalizedLabels = labels.length ? labels : ["未打标签"];
      for (const label of normalizedLabels) {
        const list = groups.get(label) ?? [];
        list.push(row);
        groups.set(label, list);
      }
    }

    return Array.from(groups.entries())
      .map(([label, groupRows]) => ({ key: label, label, rows: groupRows }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }

  function groupLabel(row: CampaignRow, key: GroupKey) {
    if (key === "team") return "当前团队";
    if (key === "user") return userName(row);
    if (key === "project") return row.config.project || "未设置 Project";
    if (key === "page") return pageName(row.config.pageAssetId);
    if (key === "status") return row.status;
    if (key === "createDate") return formatDateKey(row.createdAt);
    return "全部 Campaign";
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const strategyId = new URLSearchParams(window.location.search).get("strategyId");
    if (!strategyId || appliedStrategyId === strategyId || !strategies.length) return;

    const strategy = strategies.find((row) => row.id === strategyId);
    if (!strategy) return;

    setDraft((current) => ({
      ...current,
      platform: strategy.platform,
      strategyId: strategy.id,
      budget: current.budget || strategy.config?.dailyBudget?.toString() || ""
    }));
    setAppliedStrategyId(strategyId);
    setNotice(`已带入策略：${strategy.name}`);
  }, [appliedStrategyId, strategies]);

  return (
    <AdminShell
      title="Campaign"
      description="统一管理 Meta 和 TikTok 的 Campaign 创建、投放状态、预算与运营指标。"
      actions={
        <div className="button-row">
          <button className="button secondary" onClick={exportCsv} type="button">
            Export
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid compact-metrics">
        <div className="metric metric-strong">
          <span>总消耗</span>
          <strong>{formatMoney(summary.spend)}</strong>
        </div>
        <div className="metric">
          <span>曝光</span>
          <strong>{formatNumber(summary.impressions)}</strong>
        </div>
        <div className="metric">
          <span>点击</span>
          <strong>{formatNumber(summary.clicks)}</strong>
        </div>
        <div className="metric">
          <span>成效</span>
          <strong>{formatNumber(summary.result)}</strong>
          <small>转化 {formatNumber(summary.conversions)} / 效益 {formatMoney(summary.profit)}</small>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>新建 Campaign</h2>
            <p>Campaign 保存后进入发布队列，可先预检再提交官方渠道。</p>
          </div>
          <button className="button secondary" onClick={randName} type="button">
            Rand name
          </button>
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
              <label htmlFor="campaignStrategy">Campaign Strategy</label>
              <select id="campaignStrategy" onChange={(event) => updateDraft("strategyId", event.target.value)} value={draft.strategyId}>
                <option value="">不选择</option>
                {filteredStrategies.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field campaign-name-field">
              <label htmlFor="campaignName">Campaign 名称</label>
              <input
                id="campaignName"
                onChange={(event) => updateDraft("name", event.target.value)}
                required
                value={draft.name}
              />
            </div>
            <div className="field">
              <label htmlFor="campaignProject">Project</label>
              <input id="campaignProject" onChange={(event) => updateDraft("project", event.target.value)} value={draft.project} />
            </div>
            <div className="field">
              <label htmlFor="campaignTags">Tags</label>
              <input id="campaignTags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
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
              <label htmlFor="campaignPage">Page</label>
              <select id="campaignPage" onChange={(event) => updateDraft("pageAssetId", event.target.value)} value={draft.pageAssetId}>
                <option value="">不选择</option>
                {filteredPageAssets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} / {row.externalId}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignLandingPage">Money page</label>
              <select
                id="campaignLandingPage"
                onChange={(event) => updateDraft("landingPageId", event.target.value)}
                value={draft.landingPageId}
              >
                <option value="">不选择</option>
                {landingPages.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignOffer">Offer</label>
              <select id="campaignOffer" onChange={(event) => updateDraft("offerId", event.target.value)} required value={draft.offerId}>
                <option value="">选择 Offer</option>
                {offers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignDomain">Custom Domain</label>
              <select id="campaignDomain" onChange={(event) => updateDraft("domainId", event.target.value)} value={draft.domainId}>
                <option value="">不选择</option>
                {domains.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.domain}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignCustomDomain">自定义域名</label>
              <input
                id="campaignCustomDomain"
                onChange={(event) => updateDraft("customDomain", event.target.value)}
                value={draft.customDomain}
              />
            </div>
            <div className="field">
              <label htmlFor="campaignAdSetup">Ad setup</label>
              <select
                id="campaignAdSetup"
                onChange={(event) => updateDraft("adSetupMode", event.target.value as CampaignDraft["adSetupMode"])}
                value={draft.adSetupMode}
              >
                <option value="EXISTING_POST">Existing post</option>
                <option value="EXISTING_CREATIVE">Existing creative</option>
                <option value="CREATE_CREATIVE">Create creative</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignPostId">Existing post ID</label>
              <input
                id="campaignPostId"
                onChange={(event) => updateDraft("existingPostId", event.target.value)}
                value={draft.existingPostId}
              />
            </div>
            <div className="field">
              <label htmlFor="campaignCreative">Ad creatives</label>
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
              <label htmlFor="campaignTargeting">Targeting</label>
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
              <label htmlFor="campaignBudget">每日预算</label>
              <input
                id="campaignBudget"
                min="0"
                onChange={(event) => updateDraft("budget", event.target.value)}
                step="0.01"
                type="number"
                value={draft.budget}
              />
            </div>
            <div className="field">
              <label htmlFor="campaignLifecycle">状态视图</label>
              <select
                id="campaignLifecycle"
                onChange={(event) => updateDraft("lifecycleStatus", event.target.value)}
                value={draft.lifecycleStatus}
              >
                <option value="">默认</option>
                <option value="learning">学习</option>
                <option value="stopped">停止</option>
                <option value="rejected">被驳回</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="campaignOptimizers">Optimizers</label>
              <input
                id="campaignOptimizers"
                onChange={(event) => updateDraft("optimizerIds", event.target.value)}
                value={draft.optimizerIds}
              />
            </div>
            <div className="field">
              <label htmlFor="campaignAssistants">AI Assistants</label>
              <input
                id="campaignAssistants"
                onChange={(event) => updateDraft("aiAssistantIds", event.target.value)}
                value={draft.aiAssistantIds}
              />
            </div>
            <label className="check-field" htmlFor="campaignSplitTest">
              <input
                checked={draft.splitTest}
                id="campaignSplitTest"
                onChange={(event) => updateDraft("splitTest", event.target.checked)}
                type="checkbox"
              />
              <span>Split test</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="campaignNotes">Notes 富文本备注</label>
            <textarea id="campaignNotes" onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </div>
          <div className="campaign-form-actions">
            <button
              className="button primary"
              disabled={saving || filteredAdAccounts.length === 0}
              onClick={() => setSaveMode("save")}
              type="submit"
            >
              {saving && saveMode === "save" ? "保存中..." : "Save"}
            </button>
            <button
              className="button secondary"
              disabled={saving || filteredAdAccounts.length === 0}
              onClick={() => setSaveMode("continue")}
              type="submit"
            >
              {saving && saveMode === "continue" ? "保存中..." : "Save and create another"}
            </button>
          </div>
        </form>
      </section>

      <section className="campaign-board">
        <div className="campaign-toolbar">
          <div className="status-tabs" role="tablist">
            {viewTabs.map((tab) => (
              <button
                className={`status-tab ${activeView === tab.key ? "active" : ""}`}
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                type="button"
              >
                <span>{tab.label}</span>
                <strong>{viewCounts[tab.key]}</strong>
              </button>
            ))}
          </div>
          <div className="field compact-field">
            <label htmlFor="campaignGroupBy">分组</label>
            <select id="campaignGroupBy" onChange={(event) => setGroupBy(event.target.value as GroupKey)} value={groupBy}>
              {groupOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bulk-panel">
          <div>
            <strong>已选择 {selectedCount} 个 Campaign</strong>
            <span>批量发布、启停、预算和内容配置</span>
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={!selectedCount || Boolean(busyAction)}
              onClick={() => void runBulkAction("retry_publish")}
              type="button"
            >
              Retry publish
            </button>
            <button
              className="button secondary"
              disabled={!selectedCount || Boolean(busyAction)}
              onClick={() => void runBulkAction("stop_selected")}
              type="button"
            >
              Stop selected
            </button>
            <button
              className="button secondary"
              disabled={!selectedCount || Boolean(busyAction)}
              onClick={() => void runBulkAction("start_selected")}
              type="button"
            >
              Start selected
            </button>
            <button
              className="button danger"
              disabled={!selectedCount || Boolean(busyAction)}
              onClick={() => void runBulkAction("delete_selected")}
              type="button"
            >
              Delete selected
            </button>
          </div>
          <div className="bulk-config-grid">
            <div className="field">
              <label htmlFor="bulkBudget">Modify daily budget</label>
              <div className="inline-control">
                <input
                  id="bulkBudget"
                  min="0"
                  onChange={(event) => setBulkBudget(event.target.value)}
                  step="0.01"
                  type="number"
                  value={bulkBudget}
                />
                <button className="button secondary" disabled={!selectedCount || Boolean(busyAction)} onClick={() => void modifyBulkBudget()} type="button">
                  应用
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="bulkLandingPage">Switch money pages</label>
              <div className="inline-control">
                <select id="bulkLandingPage" onChange={(event) => setBulkLandingPageId(event.target.value)} value={bulkLandingPageId}>
                  <option value="">选择 Money page</option>
                  {landingPages.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={!selectedCount || !bulkLandingPageId || Boolean(busyAction)}
                  onClick={() => void updateBulkConfig({ landingPageId: bulkLandingPageId }, "Money page 已切换")}
                  type="button"
                >
                  应用
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="bulkOffer">Switch offers</label>
              <div className="inline-control">
                <select id="bulkOffer" onChange={(event) => setBulkOfferId(event.target.value)} value={bulkOfferId}>
                  <option value="">选择 Offer</option>
                  {offers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={!selectedCount || !bulkOfferId || Boolean(busyAction)}
                  onClick={() => void updateBulkConfig({ offerId: bulkOfferId }, "Offer 已切换")}
                  type="button"
                >
                  应用
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="bulkOptimizers">Set Optimizers</label>
              <div className="inline-control">
                <input id="bulkOptimizers" onChange={(event) => setBulkOptimizerIds(event.target.value)} value={bulkOptimizerIds} />
                <button
                  className="button secondary"
                  disabled={!selectedCount || Boolean(busyAction)}
                  onClick={() => void updateBulkConfig({ optimizerIds: parseList(bulkOptimizerIds) }, "优化师已关联")}
                  type="button"
                >
                  应用
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="bulkAssistants">Link AI Assistants</label>
              <div className="inline-control">
                <input id="bulkAssistants" onChange={(event) => setBulkAiAssistantIds(event.target.value)} value={bulkAiAssistantIds} />
                <button
                  className="button secondary"
                  disabled={!selectedCount || Boolean(busyAction)}
                  onClick={() => void updateBulkConfig({ aiAssistantIds: parseList(bulkAiAssistantIds) }, "AI Assistants 已关联")}
                  type="button"
                >
                  应用
                </button>
              </div>
            </div>
          </div>
        </div>

        <section className="table-panel campaign-table-panel">
          <table className="campaign-table">
            <thead>
              <tr>
                <th className="checkbox-cell">
                  <input checked={allVisibleSelected} onChange={toggleVisibleRows} type="checkbox" />
                </th>
                <th>ID</th>
                <th>名称</th>
                <th>创建者</th>
                <th>标签</th>
                <th>状态</th>
                <th>主页</th>
                <th>广告账户</th>
                <th>每日预算</th>
                <th>消耗</th>
                <th>曝光量</th>
                <th>点击量</th>
                <th>链接点击量</th>
                <th>事件1</th>
                <th>事件2</th>
                <th>事件3</th>
                <th>成效</th>
                <th>转化</th>
                <th>效益</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            {groupedCampaigns.map((group) => (
              <tbody key={group.key}>
                {groupBy !== "none" ? (
                  <tr className="group-row">
                    <td colSpan={21}>
                      {group.label} <span>{group.rows.length} 个 Campaign</span>
                    </td>
                  </tr>
                ) : null}
                {group.rows.map((row) => (
                  <tr key={`${group.key}:${row.id}`}>
                    <td className="checkbox-cell">
                      <input checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} type="checkbox" />
                    </td>
                    <td>
                      <span className="mono-id">{row.id.slice(-8)}</span>
                      <br />
                      <span className="muted">{row.platform}</span>
                    </td>
                    <td className="campaign-name-cell">
                      <strong>{row.name}</strong>
                      <div className="muted">
                        {landingPageName(row.config.landingPageId)} / {offerName(row.config.offerId)}
                      </div>
                      {row.config.splitTest ? <span className="pill info">Split test</span> : null}
                    </td>
                    <td>{userName(row)}</td>
                    <td>
                      <div className="tag-list">
                        {(row.config.tags?.length ? row.config.tags : ["未打标签"]).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={statusClass(row.status)}>{row.status}</span>
                      {row.config.lifecycleStatus ? (
                        <>
                          <br />
                          <span className="muted">{row.config.lifecycleStatus}</span>
                        </>
                      ) : null}
                      {latestTask(row) ? (
                        <div className="task-summary">
                          <span className={statusClass(latestTask(row)?.status ?? "")}>{latestTask(row)?.status}</span>
                          <small>{latestTask(row)?.errorMessage ?? `${latestTask(row)?.attempts ?? 0} 次`}</small>
                        </div>
                      ) : null}
                      {preflightResults[row.id] ? (
                        <div className={`preflight-result ${preflightResults[row.id].ready ? "success" : "warning"}`}>
                          <strong>{preflightResults[row.id].ready ? "预检通过" : "预检提示"}</strong>
                          {preflightResults[row.id].issues.slice(0, 2).map((issue) => (
                            <small key={`${issue.code}:${issue.message}`}>{issue.message}</small>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {pageName(row.config.pageAssetId)}
                      <br />
                      <span className="muted">{domainName(row.config.domainId)}</span>
                    </td>
                    <td>{adAccountName(row.config.adAccountId)}</td>
                    <td>{formatMoney(row.config.dailyBudget ?? row.config.budget)}</td>
                    <td>{formatMoney(row.metrics.spend)}</td>
                    <td>{formatNumber(row.metrics.impressions)}</td>
                    <td>{formatNumber(row.metrics.clicks)}</td>
                    <td>{formatNumber(row.metrics.linkClicks)}</td>
                    <td>{formatNumber(row.metrics.event1)}</td>
                    <td>{formatNumber(row.metrics.event2)}</td>
                    <td>{formatNumber(row.metrics.event3)}</td>
                    <td>{formatNumber(row.metrics.result)}</td>
                    <td>{formatNumber(row.metrics.conversions)}</td>
                    <td>
                      <span className={row.metrics.profit < 0 ? "metric-negative" : "metric-positive"}>
                        {formatMoney(row.metrics.profit)}
                      </span>
                    </td>
                    <td className="notes-cell">{row.config.notes ?? "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="button secondary" onClick={() => void toggleFavorite(row)} type="button">
                          {row.config.favorite ? "取消收藏" : "收藏"}
                        </button>
                        <button className="button secondary" onClick={() => void modifyRowBudget(row)} type="button">
                          改预算
                        </button>
                        <button
                          className="button secondary"
                          disabled={checkingId === row.id}
                          onClick={() => void preflight(row)}
                          type="button"
                        >
                          {checkingId === row.id ? "预检中" : "预检"}
                        </button>
                        {row.status === "FAILED" ? (
                          <button
                            className="button primary"
                            disabled={publishingId === row.id}
                            onClick={() => void retryPublish(row)}
                            type="button"
                          >
                            {publishingId === row.id ? "重试中" : "重试发布"}
                          </button>
                        ) : (
                          <button
                            className="button primary"
                            disabled={publishingId === row.id || row.status === "CREATING"}
                            onClick={() => void publish(row)}
                            type="button"
                          >
                            {publishingId === row.id ? "发布中" : "提交发布"}
                          </button>
                        )}
                        <button className="button danger" onClick={() => void remove(row)} type="button">
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            {visibleCampaigns.length === 0 && !loading ? (
              <tbody>
                <tr>
                  <td colSpan={21}>暂无 Campaign</td>
                </tr>
              </tbody>
            ) : null}
          </table>
        </section>
      </section>
    </AdminShell>
  );
}
