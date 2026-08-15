"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type Platform = "META" | "TIKTOK";
type ViewKey = "default" | "standard" | "ai_generated";

type TargetingConfig = {
  type?: string;
  source?: string;
  audienceSize?: string;
  countries?: string[];
  regions?: string[];
  cities?: string[];
  languages?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: string[];
  interests?: string[];
  demographics?: string[];
  educationLevels?: string[];
  interestCategories?: string[];
  behaviors?: string[];
  excludedInterests?: string[];
  customAudiences?: string[];
  excludedCustomAudiences?: string[];
  deviceType?: string;
  operatingSystems?: string[];
  mobileDeviceTypes?: string[];
  wifiOnly?: boolean;
  placementPlatforms?: string[];
  facebookPlacements?: string[];
  instagramPlacements?: string[];
  audienceNetworkPlacements?: string[];
  messengerPlacements?: string[];
  whatsappPlacements?: string[];
  threadsPlacements?: string[];
  customAudienceFileName?: string;
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

type OptionItem = {
  value: string;
  label: string;
  audienceSize?: number;
};

type OptionKind = "countries" | "regions" | "cities" | "languages" | "interests" | "demographics" | "behaviors";

type TargetingOptionsResponse = {
  source: "official" | "fallback" | string;
  items: OptionItem[];
  message?: string;
};

type TargetingEstimateResponse = {
  source: "official" | "fallback" | string;
  estimate?: unknown;
  message?: string;
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
  audienceSize: string;
  countries: string;
  regions: string;
  cities: string;
  languages: string;
  ageMin: string;
  ageMax: string;
  genders: string[];
  interests: string;
  demographics: string[];
  educationLevels: string[];
  interestCategories: string[];
  behaviors: string[];
  excludedInterests: string;
  customAudiences: string;
  excludedCustomAudiences: string[];
  deviceType: string;
  operatingSystems: string[];
  mobileDeviceTypes: string[];
  wifiOnly: boolean;
  placementPlatforms: string[];
  facebookPlacements: string[];
  instagramPlacements: string[];
  audienceNetworkPlacements: string[];
  messengerPlacements: string[];
  whatsappPlacements: string[];
  threadsPlacements: string[];
  customAudienceFileName: string;
  notes: string;
  tags: string;
};

const emptyDraft: TargetingDraft = {
  platform: "META",
  name: "",
  type: "standard",
  source: "manual",
  audienceSize: "",
  countries: "US",
  regions: "",
  cities: "",
  languages: "en",
  ageMin: "18",
  ageMax: "65",
  genders: ["ALL"],
  interests: "",
  demographics: [],
  educationLevels: [],
  interestCategories: [],
  behaviors: [],
  excludedInterests: "",
  customAudiences: "",
  excludedCustomAudiences: [],
  deviceType: "all",
  operatingSystems: [],
  mobileDeviceTypes: [],
  wifiOnly: false,
  placementPlatforms: ["facebook", "instagram"],
  facebookPlacements: [],
  instagramPlacements: [],
  audienceNetworkPlacements: [],
  messengerPlacements: [],
  whatsappPlacements: [],
  threadsPlacements: [],
  customAudienceFileName: "",
  notes: "",
  tags: "standard"
};

const genderOptions = [
  { value: "ALL", label: "全部" },
  { value: "MALE", label: "男" },
  { value: "FEMALE", label: "女" }
];

const ageOptions = Array.from({ length: 48 }, (_, index) => String(index + 18)).concat("65+");
const tiktokAgeMinOptions = ["18", "25", "35", "45", "55"];
const tiktokAgeMaxOptions = ["24", "34", "44", "54", "65+"];

const demographicOptions = [
  { value: "education", label: "学历" },
  { value: "financial", label: "Financial" },
  { value: "life_events", label: "生活纪事" },
  { value: "parents", label: "父母" }
];

const educationLevelOptions = [
  { value: "high_school", label: "高中" },
  { value: "college", label: "大学" },
  { value: "associate_degree", label: "副学士" },
  { value: "bachelor_degree", label: "学士" },
  { value: "master_degree", label: "硕士" },
  { value: "doctorate_degree", label: "博士" }
];

const interestCategoryOptions = [
  { value: "shopping", label: "购物" },
  { value: "travel", label: "旅行" },
  { value: "automotive", label: "汽车" },
  { value: "gaming", label: "游戏" },
  { value: "beauty", label: "美妆" }
];

const behaviorOptions = [
  { value: "engaged_shoppers", label: "已互动购物者" },
  { value: "frequent_travelers", label: "频繁旅行者" },
  { value: "device_users", label: "设备用户" },
  { value: "business_decision_makers", label: "商务决策者" }
];

const excludedAudienceOptions = [
  { value: "page_engaged", label: "页面已经互动" },
  { value: "lead_form_opened", label: "潜在客户表单已打开" }
];

const deviceOptions = [
  { value: "all", label: "全部设备" },
  { value: "mobile", label: "移动设备" },
  { value: "desktop", label: "桌面设备" }
];

const operatingSystemOptions = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" }
];

const mobileDeviceTypeOptions = [
  { value: "android_smartphone", label: "安卓智能手机" },
  { value: "android_tablet", label: "安卓平板" },
  { value: "iphone", label: "iPhone" },
  { value: "ipad", label: "iPad" },
  { value: "ipod", label: "iPod" }
];

const placementPlatformOptions = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "audience_network", label: "Audience Network" },
  { value: "messenger", label: "Messenger" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "threads", label: "Threads" }
];

const tiktokPlacementOptions = [
  { value: "PLACEMENT_TIKTOK", label: "TikTok" },
  { value: "PLACEMENT_PANGLE", label: "Pangle" },
  { value: "PLACEMENT_GLOBAL_APP_BUNDLE", label: "Global App Bundle" }
];

const facebookPlacementOptions = [
  { value: "facebook_reels_overlay", label: "Facebook Reels 插播位" },
  { value: "facebook_reels_inline", label: "Facebook Reels 内嵌广告" },
  { value: "facebook_search", label: "Facebook 搜索结果" },
  { value: "facebook_stories", label: "Facebook 快拍" },
  { value: "facebook_reels", label: "Facebook Reels" },
  { value: "facebook_feed", label: "Facebook 动态" },
  { value: "facebook_profile_feed", label: "Facebook 主页动态" },
  { value: "facebook_marketplace", label: "Facebook Marketplace" },
  { value: "facebook_business_explore", label: "探索 Facebook 商家" },
  { value: "facebook_notifications", label: "Facebook 通知" }
];

const childPlacementOptions: Record<string, Array<{ value: string; label: string }>> = {
  instagram: [
    { value: "instagram_feed", label: "Instagram 动态" },
    { value: "instagram_stories", label: "Instagram 快拍" },
    { value: "instagram_reels", label: "Instagram Reels" },
    { value: "instagram_explore", label: "Instagram 探索" },
    { value: "instagram_search", label: "Instagram 搜索结果" }
  ],
  audience_network: [
    { value: "audience_network_native", label: "原生/横幅/插屏" },
    { value: "audience_network_rewarded", label: "激励视频" },
    { value: "audience_network_instream", label: "插播视频" }
  ],
  messenger: [
    { value: "messenger_inbox", label: "Messenger 收件箱" },
    { value: "messenger_stories", label: "Messenger 快拍" },
    { value: "messenger_sponsored_messages", label: "赞助消息" }
  ],
  whatsapp: [
    { value: "whatsapp_status", label: "WhatsApp 状态" },
    { value: "whatsapp_channels", label: "WhatsApp 频道" }
  ],
  threads: [
    { value: "threads_feed", label: "Threads 动态" }
  ]
};

const placementFieldByPlatform: Record<
  string,
  "facebookPlacements" | "instagramPlacements" | "audienceNetworkPlacements" | "messengerPlacements" | "whatsappPlacements" | "threadsPlacements"
> = {
  facebook: "facebookPlacements",
  instagram: "instagramPlacements",
  audience_network: "audienceNetworkPlacements",
  messenger: "messengerPlacements",
  whatsapp: "whatsappPlacements",
  threads: "threadsPlacements"
};

const countryOptions = [
  { value: "US", label: "美国 / United States" },
  { value: "CA", label: "加拿大 / Canada" },
  { value: "GB", label: "英国 / United Kingdom" },
  { value: "AU", label: "澳大利亚 / Australia" },
  { value: "SG", label: "新加坡 / Singapore" },
  { value: "MY", label: "马来西亚 / Malaysia" },
  { value: "TH", label: "泰国 / Thailand" },
  { value: "VN", label: "越南 / Vietnam" },
  { value: "JP", label: "日本 / Japan" },
  { value: "KR", label: "韩国 / Korea" },
  { value: "BR", label: "巴西 / Brazil" },
  { value: "MX", label: "墨西哥 / Mexico" }
];

const regionOptions = [
  { value: "California", label: "加州 / California" },
  { value: "Texas", label: "德州 / Texas" },
  { value: "New York", label: "纽约州 / New York" },
  { value: "Florida", label: "佛罗里达 / Florida" },
  { value: "Ontario", label: "安大略 / Ontario" },
  { value: "England", label: "英格兰 / England" },
  { value: "Tokyo", label: "东京 / Tokyo" },
  { value: "Seoul", label: "首尔 / Seoul" }
];

const cityOptions = [
  { value: "Los Angeles", label: "洛杉矶 / Los Angeles" },
  { value: "New York", label: "纽约 / New York" },
  { value: "London", label: "伦敦 / London" },
  { value: "Toronto", label: "多伦多 / Toronto" },
  { value: "Singapore", label: "新加坡 / Singapore" },
  { value: "Bangkok", label: "曼谷 / Bangkok" },
  { value: "Ho Chi Minh City", label: "胡志明市 / Ho Chi Minh City" },
  { value: "Tokyo", label: "东京 / Tokyo" },
  { value: "Seoul", label: "首尔 / Seoul" },
  { value: "Sydney", label: "悉尼 / Sydney" }
];

const languageOptions = [
  { value: "en", label: "英语 / English" },
  { value: "zh", label: "中文 / Chinese" },
  { value: "es", label: "西班牙语 / Spanish" },
  { value: "pt", label: "葡萄牙语 / Portuguese" },
  { value: "ja", label: "日语 / Japanese" },
  { value: "ko", label: "韩语 / Korean" },
  { value: "th", label: "泰语 / Thai" },
  { value: "vi", label: "越南语 / Vietnamese" },
  { value: "fr", label: "法语 / French" },
  { value: "de", label: "德语 / German" }
];

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

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatAudienceEstimate(value: unknown) {
  const estimate = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const lower = numericValue(estimate.users_lower_bound ?? estimate.lower_bound);
  const upper = numericValue(estimate.users_upper_bound ?? estimate.upper_bound);
  if (lower !== undefined && upper !== undefined && lower >= 0 && upper >= 0) {
    return `${formatNumber(lower)} - ${formatNumber(upper)} 人`;
  }

  const monthly = numericValue(estimate.estimate_mau);
  if (monthly !== undefined) return `约 ${formatNumber(monthly)} 人（月活）`;

  const daily = numericValue(estimate.estimate_dau);
  if (daily !== undefined) return `约 ${formatNumber(daily)} 人（日活）`;

  const users = numericValue(estimate.users ?? estimate.reach);
  return users !== undefined ? `约 ${formatNumber(users)} 人` : null;
}

function draftFromRow(row: TargetingRow): TargetingDraft {
  return {
    platform: row.platform,
    name: row.name,
    type: row.config.type ?? "standard",
    source: row.config.source ?? (row.view === "ai_generated" ? "ai-generated" : "manual"),
    audienceSize: row.config.audienceSize ?? "",
    countries: joinList(row.config.countries),
    regions: joinList(row.config.regions),
    cities: joinList(row.config.cities),
    languages: joinList(row.config.languages),
    ageMin: row.config.ageMin?.toString() ?? "",
    ageMax: row.config.ageMax?.toString() ?? "",
    genders: row.config.genders?.length ? row.config.genders : ["ALL"],
    interests: joinList(row.config.interests),
    demographics: row.config.demographics ?? [],
    educationLevels: row.config.educationLevels ?? [],
    interestCategories: row.config.interestCategories ?? [],
    behaviors: row.config.behaviors ?? [],
    excludedInterests: joinList(row.config.excludedInterests),
    customAudiences: joinList(row.config.customAudiences),
    excludedCustomAudiences: row.config.excludedCustomAudiences ?? [],
    deviceType: row.config.deviceType ?? "all",
    operatingSystems: row.config.operatingSystems ?? [],
    mobileDeviceTypes: row.config.mobileDeviceTypes ?? [],
    wifiOnly: Boolean(row.config.wifiOnly),
    placementPlatforms: row.config.placementPlatforms ?? [],
    facebookPlacements: row.config.facebookPlacements ?? [],
    instagramPlacements: row.config.instagramPlacements ?? [],
    audienceNetworkPlacements: row.config.audienceNetworkPlacements ?? [],
    messengerPlacements: row.config.messengerPlacements ?? [],
    whatsappPlacements: row.config.whatsappPlacements ?? [],
    threadsPlacements: row.config.threadsPlacements ?? [],
    customAudienceFileName: row.config.customAudienceFileName ?? "",
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
      audienceSize: draft.audienceSize || undefined,
      countries: splitList(draft.countries),
      regions: splitList(draft.regions),
      cities: splitList(draft.cities),
      languages: splitList(draft.languages),
      ageMin: toNumber(draft.ageMin),
      ageMax: toNumber(draft.ageMax),
      genders: draft.genders,
      interests: splitList(draft.interests),
      demographics: draft.demographics,
      educationLevels: draft.demographics.includes("education") ? draft.educationLevels : [],
      interestCategories: draft.interestCategories,
      behaviors: draft.behaviors,
      excludedInterests: splitList(draft.excludedInterests),
      customAudiences: splitList(draft.customAudiences),
      excludedCustomAudiences: draft.excludedCustomAudiences,
      deviceType: draft.deviceType,
      operatingSystems: draft.operatingSystems,
      mobileDeviceTypes: draft.mobileDeviceTypes,
      wifiOnly: draft.wifiOnly,
      placementPlatforms: draft.placementPlatforms,
      facebookPlacements: draft.placementPlatforms.includes("facebook") ? draft.facebookPlacements : [],
      instagramPlacements: draft.placementPlatforms.includes("instagram") ? draft.instagramPlacements : [],
      audienceNetworkPlacements: draft.placementPlatforms.includes("audience_network") ? draft.audienceNetworkPlacements : [],
      messengerPlacements: draft.placementPlatforms.includes("messenger") ? draft.messengerPlacements : [],
      whatsappPlacements: draft.placementPlatforms.includes("whatsapp") ? draft.whatsappPlacements : [],
      threadsPlacements: draft.placementPlatforms.includes("threads") ? draft.threadsPlacements : [],
      customAudienceFileName: draft.customAudienceFileName || undefined,
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

function SearchableCheckList({
  id,
  label,
  options,
  value,
  placeholder,
  onChange,
  onSearch,
  loading = false
}: {
  id: string;
  label: string;
  options: OptionItem[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = splitList(value);
  const selectedSet = new Set(selected);
  const labelByValue = new Map(options.map((option) => [option.value, option.label]));
  const filteredOptions = options.filter((option) => {
    const keyword = query.trim().toLowerCase();
    return !keyword || option.label.toLowerCase().includes(keyword) || option.value.toLowerCase().includes(keyword);
  });

  function emit(next: string[]) {
    onChange(Array.from(new Set(next)).join(", "));
  }

  function toggle(item: string) {
    emit(selectedSet.has(item) ? selected.filter((valueItem) => valueItem !== item) : [...selected, item]);
  }

  function addCustom() {
    const custom = query.trim();
    if (!custom) return;
    emit([...selected, custom]);
    setQuery("");
  }

  useEffect(() => {
    const keyword = query.trim();
    if (!onSearch || keyword.length < 2) return;
    const timer = window.setTimeout(() => onSearch(keyword), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="field searchable-check-field">
      <label htmlFor={id}>{label}</label>
      <div className="searchable-check-box">
        <div className="searchable-check-input">
          <input
            id={id}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            value={query}
          />
          <button className="button secondary" disabled={!query.trim()} onClick={addCustom} type="button">
            添加
          </button>
        </div>
        <div className="searchable-check-options">
          {loading ? <small className="muted">正在读取官方选项...</small> : null}
          {filteredOptions.slice(0, 8).map((option) => (
            <label className="checkbox-row compact" key={option.value}>
              <input checked={selectedSet.has(option.value)} onChange={() => toggle(option.value)} type="checkbox" />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {selected.length ? (
          <div className="selected-chip-list">
            {selected.map((item) => (
              <button key={item} onClick={() => toggle(item)} type="button">
                {labelByValue.get(item) ?? item} ×
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function downloadAudienceTemplate() {
  const headers = ["email", "phone", "first_name", "last_name", "country", "city", "external_id"];
  const example = ["demo@example.com", "+10000000000", "Demo", "User", "US", "Los Angeles", "user-001"];
  const csv = [headers, example].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "audience-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
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
  const [officialOptions, setOfficialOptions] = useState<Partial<Record<OptionKind, OptionItem[]>>>({});
  const [optionLoading, setOptionLoading] = useState<Partial<Record<OptionKind, boolean>>>({});
  const [optionNotice, setOptionNotice] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

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

  function mergedOptions(kind: OptionKind, fallback: OptionItem[]) {
    const merged = new Map(fallback.map((option) => [option.value, option]));
    for (const option of officialOptions[kind] ?? []) merged.set(option.value, option);
    return Array.from(merged.values());
  }

  async function loadOfficialOptions(kind: OptionKind, query: string) {
    setOptionLoading((current) => ({ ...current, [kind]: true }));
    try {
      const params = new URLSearchParams({ platform: draft.platform, kind, q: query });
      const response = await apiRequest<TargetingOptionsResponse>(`/targetings/options?${params.toString()}`);
      if (response.source === "official") {
        setOfficialOptions((current) => {
          const next = new Map((current[kind] ?? []).map((option) => [option.value, option]));
          for (const option of response.items) next.set(option.value, option);
          return { ...current, [kind]: Array.from(next.values()) };
        });
        setOptionNotice(null);
      } else {
        setOptionNotice(`${draft.platform === "META" ? "Meta" : "TikTok"} 官方定向数据暂不可用，当前仍可使用本地选项。请检查渠道授权和广告账户权限。`);
      }
    } catch {
      setOptionNotice(`${draft.platform === "META" ? "Meta" : "TikTok"} 官方定向数据读取失败，当前仍可使用本地选项。`);
    } finally {
      setOptionLoading((current) => ({ ...current, [kind]: false }));
    }
  }

  async function estimateAudience() {
    setEstimateLoading(true);
    setOptionNotice(null);
    try {
      const payload = buildPayload(draft);
      const response = await apiRequest<TargetingEstimateResponse>("/targetings/estimate", {
        method: "POST",
        body: JSON.stringify({ platform: draft.platform, config: payload.config })
      });
      const formatted = formatAudienceEstimate(response.estimate);
      if (response.source !== "official" || !formatted) {
        setOptionNotice(
          draft.platform === "META"
            ? "暂时无法取得 Meta 受众规模，请检查广告账户授权及 ads_read 权限。"
            : "暂时无法取得 TikTok 受众规模，请检查广告账户授权及 Ads Management 权限。"
        );
        return;
      }
      updateDraft("audienceSize", formatted);
      setNotice("已根据当前定向条件更新官方受众规模");
    } catch (err) {
      setOptionNotice(err instanceof Error ? err.message : "受众规模预估失败");
    } finally {
      setEstimateLoading(false);
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
    setOptionNotice(null);
  }

  function updateDraft<K extends keyof TargetingDraft>(key: K, value: TargetingDraft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "platform") {
        next.ageMin = "18";
        next.ageMax = "65";
        next.placementPlatforms = value === "META" ? ["facebook", "instagram"] : ["PLACEMENT_TIKTOK"];
        next.facebookPlacements = [];
        next.instagramPlacements = [];
        next.audienceNetworkPlacements = [];
        next.messengerPlacements = [];
        next.whatsappPlacements = [];
        next.threadsPlacements = [];
      }
      if (key === "deviceType" && value === "desktop") {
        next.mobileDeviceTypes = [];
        next.wifiOnly = false;
      }
      if (key === "placementPlatforms" && Array.isArray(value) && !value.includes("facebook")) {
        next.facebookPlacements = [];
      }
      return next;
    });
    if (key === "platform") {
      setOfficialOptions({});
      setOptionLoading({});
      setOptionNotice(null);
    }
  }

  function toggleDraftList(
    key:
      | "genders"
      | "demographics"
      | "educationLevels"
      | "interestCategories"
      | "behaviors"
      | "excludedCustomAudiences"
      | "operatingSystems"
      | "mobileDeviceTypes"
      | "placementPlatforms"
      | "facebookPlacements"
      | "instagramPlacements"
      | "audienceNetworkPlacements"
      | "messengerPlacements"
      | "whatsappPlacements"
      | "threadsPlacements",
    value: string
  ) {
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
      ...(key === "placementPlatforms" && current.placementPlatforms.includes(value) && placementFieldByPlatform[value]
        ? { [placementFieldByPlatform[value]]: [] }
        : {})
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
          <div className="form-section-heading">
            <h3>基本设置</h3>
          </div>
          <div className="form-grid targeting-rule-grid">
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
              <label htmlFor="audienceSize">受众预估规模</label>
              <div className="searchable-check-input">
                <input id="audienceSize" placeholder="点击右侧按钮获取官方预估" readOnly value={draft.audienceSize} />
                <button
                  className="button secondary"
                  disabled={estimateLoading}
                  onClick={() => void estimateAudience()}
                  title={`根据当前定向条件读取 ${draft.platform === "META" ? "Meta" : "TikTok"} 官方预估`}
                  type="button"
                >
                  {estimateLoading ? "预估中..." : "官方预估"}
                </button>
              </div>
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
            <SearchableCheckList
              id="countries"
              label="国家"
              loading={optionLoading.countries}
              onChange={(value) => updateDraft("countries", value)}
              onSearch={(query) => void loadOfficialOptions("countries", query)}
              options={mergedOptions("countries", countryOptions)}
              placeholder="中英文搜索国家"
              value={draft.countries}
            />
            <SearchableCheckList
              id="regions"
              label="地区"
              loading={optionLoading.regions}
              onChange={(value) => updateDraft("regions", value)}
              onSearch={(query) => void loadOfficialOptions("regions", query)}
              options={mergedOptions("regions", regionOptions)}
              placeholder="中英文搜索地区"
              value={draft.regions}
            />
            <SearchableCheckList
              id="cities"
              label="城市"
              loading={optionLoading.cities}
              onChange={(value) => updateDraft("cities", value)}
              onSearch={(query) => void loadOfficialOptions("cities", query)}
              options={mergedOptions("cities", cityOptions)}
              placeholder="中英文搜索城市"
              value={draft.cities}
            />
            <SearchableCheckList
              id="languages"
              label="语言"
              loading={optionLoading.languages}
              onChange={(value) => updateDraft("languages", value)}
              onSearch={(query) => void loadOfficialOptions("languages", query)}
              options={mergedOptions("languages", languageOptions)}
              placeholder="中英文搜索语言"
              value={draft.languages}
            />
            <div className="field">
              <label htmlFor="ageMin">最小年龄</label>
              <select id="ageMin" onChange={(event) => updateDraft("ageMin", event.target.value)} value={draft.ageMin}>
                {(draft.platform === "META" ? ageOptions : tiktokAgeMinOptions).map((age) => (
                  <option key={age} value={age.replace("+", "")}>
                    {age}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ageMax">最大年龄</label>
              <select id="ageMax" onChange={(event) => updateDraft("ageMax", event.target.value)} value={draft.ageMax}>
                {(draft.platform === "META" ? ageOptions : tiktokAgeMaxOptions).map((age) => (
                  <option key={age} value={age.replace("+", "")}>
                    {age}
                  </option>
                ))}
              </select>
            </div>
            <SearchableCheckList
              id="interests"
              label="兴趣"
              loading={optionLoading.interests}
              onChange={(value) => updateDraft("interests", value)}
              onSearch={(query) => void loadOfficialOptions("interests", query)}
              options={mergedOptions("interests", [])}
              placeholder={`搜索 ${draft.platform === "META" ? "Meta" : "TikTok"} 官方兴趣`}
              value={draft.interests}
            />
          </div>

          {optionNotice ? <div className="notice warning">{optionNotice}</div> : null}

          <div className="field">
            <label>性别（单选）</label>
            <div className="button-row">
              {genderOptions.map((option) => (
                <label className="check-field inline-check" key={option.value}>
                  <input
                    checked={draft.genders.includes(option.value)}
                    onChange={() => updateDraft("genders", [option.value])}
                    type="radio"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-grid targeting-choice-grid">
            <div className="field">
              <label>人口统计数据（勾选）</label>
              <div className="checkbox-grid compact-option-grid">
                {demographicOptions.map((option) => (
                  <label className="checkbox-row compact" key={option.value}>
                    <input
                      checked={draft.demographics.includes(option.value)}
                      onChange={() => toggleDraftList("demographics", option.value)}
                      type="checkbox"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              {draft.demographics.includes("education") ? (
                <div className="nested-option-block">
                  <strong>教育程度</strong>
                  <div className="checkbox-grid compact-option-grid">
                    {educationLevelOptions.map((option) => (
                      <label className="checkbox-row compact" key={option.value}>
                        <input
                          checked={draft.educationLevels.includes(option.value)}
                          onChange={() => toggleDraftList("educationLevels", option.value)}
                          type="checkbox"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="field">
              <label>兴趣（勾选）</label>
              <div className="checkbox-grid compact-option-grid">
                {interestCategoryOptions.map((option) => (
                  <label className="checkbox-row compact" key={option.value}>
                    <input
                      checked={draft.interestCategories.includes(option.value)}
                      onChange={() => toggleDraftList("interestCategories", option.value)}
                      type="checkbox"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <SearchableCheckList
              id="behaviors"
              label="行为"
              loading={optionLoading.behaviors}
              onChange={(value) => updateDraft("behaviors", splitList(value))}
              onSearch={(query) => void loadOfficialOptions("behaviors", query)}
              options={mergedOptions("behaviors", behaviorOptions)}
              placeholder={`搜索 ${draft.platform === "META" ? "Meta" : "TikTok"} 官方行为`}
              value={joinList(draft.behaviors)}
            />
          </div>

          <div className="form-section-heading">
            <h3>高级设置</h3>
          </div>
          <div className="field">
            <label>排除自定义受众（勾选）</label>
            <div className="checkbox-grid compact-option-grid">
              {excludedAudienceOptions.map((option) => (
                <label className="checkbox-row compact" key={option.value}>
                  <input
                    checked={draft.excludedCustomAudiences.includes(option.value)}
                    onChange={() => toggleDraftList("excludedCustomAudiences", option.value)}
                    type="checkbox"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-grid targeting-rule-grid">
            <div className="field">
              <label htmlFor="deviceType">用户设备（单选）</label>
              <select id="deviceType" onChange={(event) => updateDraft("deviceType", event.target.value)} value={draft.deviceType}>
                {deviceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>用户操作系统（多选）</label>
              <div className="checkbox-grid compact-option-grid">
                {operatingSystemOptions.map((option) => (
                  <label className="checkbox-row compact" key={option.value}>
                    <input
                      checked={draft.operatingSystems.includes(option.value)}
                      onChange={() => toggleDraftList("operatingSystems", option.value)}
                      type="checkbox"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {draft.deviceType !== "desktop" ? (
              <div className="field">
                <label>移动设备明细</label>
                <div className="checkbox-grid compact-option-grid">
                  {mobileDeviceTypeOptions.map((option) => (
                    <label className="checkbox-row compact" key={option.value}>
                      <input
                        checked={draft.mobileDeviceTypes.includes(option.value)}
                        onChange={() => toggleDraftList("mobileDeviceTypes", option.value)}
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  <label className="checkbox-row compact">
                    <input checked={draft.wifiOnly} onChange={(event) => updateDraft("wifiOnly", event.target.checked)} type="checkbox" />
                    <span>仅在连接 WiFi 时</span>
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div className="field">
            <label>广告投放平台（勾选）</label>
            <div className="checkbox-grid compact-option-grid">
              {(draft.platform === "META" ? placementPlatformOptions : tiktokPlacementOptions).map((option) => (
                <label className="checkbox-row compact" key={option.value}>
                  <input
                    checked={draft.placementPlatforms.includes(option.value)}
                    onChange={() => toggleDraftList("placementPlatforms", option.value)}
                    type="checkbox"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          {draft.platform === "META" && draft.placementPlatforms.length ? (
            <div className="form-grid targeting-choice-grid">
              {draft.placementPlatforms.map((platform) => {
                const fieldKey = placementFieldByPlatform[platform];
                const options = platform === "facebook" ? facebookPlacementOptions : (childPlacementOptions[platform] ?? []);
                if (!fieldKey || !options.length) return null;
                const platformLabel = placementPlatformOptions.find((option) => option.value === platform)?.label ?? platform;
                return (
                  <div className="field" key={platform}>
                    <label>{platformLabel} 板块选择（勾选）</label>
                    <div className="checkbox-grid placement-option-grid">
                      {options.map((option) => (
                        <label className="checkbox-row compact" key={option.value}>
                          <input
                            checked={draft[fieldKey].includes(option.value)}
                            onChange={() => toggleDraftList(fieldKey, option.value)}
                            type="checkbox"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="form-section-heading">
            <h3>自定义受众</h3>
          </div>
          <div className="form-grid targeting-rule-grid">
            <div className="field">
              <label htmlFor="customAudiences">自定义受众</label>
              <input id="customAudiences" onChange={(event) => updateDraft("customAudiences", event.target.value)} value={draft.customAudiences} />
            </div>
            <div className="field">
              <label htmlFor="customAudienceFile">受众文件导入</label>
              <input
                id="customAudienceFile"
                onChange={(event) => updateDraft("customAudienceFileName", event.target.files?.[0]?.name ?? "")}
                type="file"
              />
              {draft.customAudienceFileName ? <small className="muted">已选择：{draft.customAudienceFileName}</small> : null}
            </div>
            <div className="field">
              <label>导入模板</label>
              <button className="button secondary" onClick={downloadAudienceTemplate} type="button">
                下载导入模板
              </button>
            </div>
            <div className="field">
              <label htmlFor="excludedInterests">排除兴趣</label>
              <input id="excludedInterests" onChange={(event) => updateDraft("excludedInterests", event.target.value)} value={draft.excludedInterests} />
            </div>
            <div className="field">
              <label htmlFor="tags">标签</label>
              <input id="tags" onChange={(event) => updateDraft("tags", event.target.value)} value={draft.tags} />
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
                  <span>人口统计：{joinList(selectedTargeting.config.demographics) || "-"}</span>
                  <span>教育程度：{joinList(selectedTargeting.config.educationLevels) || "-"}</span>
                  <span>行为：{joinList(selectedTargeting.config.behaviors) || "-"}</span>
                  <span>排除：{joinList(selectedTargeting.config.excludedInterests) || "-"}</span>
                  <span>排除受众：{joinList(selectedTargeting.config.excludedCustomAudiences) || "-"}</span>
                  <span>人群包：{joinList(selectedTargeting.config.customAudiences) || "-"}</span>
                  <span>设备：{selectedTargeting.config.deviceType ?? "-"}</span>
                  <span>系统：{joinList(selectedTargeting.config.operatingSystems) || "-"}</span>
                  <span>投放平台：{joinList(selectedTargeting.config.placementPlatforms) || "-"}</span>
                  <span>Facebook 板块：{joinList(selectedTargeting.config.facebookPlacements) || "-"}</span>
                  <span>Instagram 板块：{joinList(selectedTargeting.config.instagramPlacements) || "-"}</span>
                  <span>Audience Network：{joinList(selectedTargeting.config.audienceNetworkPlacements) || "-"}</span>
                  <span>Messenger：{joinList(selectedTargeting.config.messengerPlacements) || "-"}</span>
                  <span>WhatsApp：{joinList(selectedTargeting.config.whatsappPlacements) || "-"}</span>
                  <span>Threads：{joinList(selectedTargeting.config.threadsPlacements) || "-"}</span>
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
