"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type PlatformAssetRow = {
  id: string;
  platform: "META" | "TIKTOK";
  type:
    | "BUSINESS_CENTER"
    | "FACEBOOK_PAGE"
    | "PIXEL"
    | "TIKTOK_ADVERTISER"
    | "TIKTOK_APP"
    | "CATALOG"
    | "PRODUCT_FEED";
  externalId: string;
  name: string;
  status?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
};

type SyncResult = {
  integrations: number;
  adAccounts: number;
  assets: number;
  errors: Array<{ platform: string; integrationId: string; message: string }>;
};

const typeLabels: Record<PlatformAssetRow["type"], string> = {
  BUSINESS_CENTER: "Business Center",
  FACEBOOK_PAGE: "Facebook Page",
  PIXEL: "Pixel",
  TIKTOK_ADVERTISER: "TikTok Advertiser",
  TIKTOK_APP: "TikTok App",
  CATALOG: "Catalog",
  PRODUCT_FEED: "Product Feed"
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

export default function PlatformAssetsPage() {
  const [rows, setRows] = useState<PlatformAssetRow[]>([]);
  const [platform, setPlatform] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const metaCount = useMemo(() => rows.filter((row) => row.platform === "META").length, [rows]);
  const tiktokCount = rows.length - metaCount;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (platform) params.set("platform", platform);
      if (type) params.set("type", type);
      setRows(await apiRequest<PlatformAssetRow[]>(`/platform-assets${params.size ? `?${params.toString()}` : ""}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载渠道资产失败");
    } finally {
      setLoading(false);
    }
  }

  async function syncAssets() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<SyncResult>("/platform-assets/sync", { method: "POST" });
      setNotice(
        `已同步 ${result.integrations} 个授权连接，更新 ${result.adAccounts} 个广告账户、${result.assets} 个渠道资产${
          result.errors.length ? `；${result.errors.length} 个连接同步失败` : ""
        }`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步渠道资产失败");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="渠道资产"
      description="展示从 Meta 和 TikTok 官方接口同步到本地的 Page、Pixel、Business Center 和 Advertiser。"
      actions={
        <div className="button-row">
          <button className="button primary" disabled={syncing} onClick={() => void syncAssets()} type="button">
            {syncing ? "同步中..." : "同步官方资产"}
          </button>
          <button className="button secondary" onClick={() => void load()} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>渠道资产</span>
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
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel form">
        <div className="panel-heading">
          <div>
            <h2>筛选</h2>
            <p>按平台和资产类型查看可投放资产。</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="platform">平台</label>
            <select id="platform" value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="">全部平台</option>
              <option value="META">Meta</option>
              <option value="TIKTOK">TikTok</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="type">资产类型</label>
            <select id="type" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">全部类型</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={() => void load()} type="button">
            应用筛选
          </button>
        </div>
      </section>

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>平台</th>
              <th>类型</th>
              <th>名称</th>
              <th>外部 ID</th>
              <th>状态</th>
              <th>最近同步</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.platform}</td>
                <td>{typeLabels[row.type]}</td>
                <td>{row.name}</td>
                <td>{row.externalId}</td>
                <td>
                  <span className={row.status === "synced" ? "pill success" : "pill"}>{row.status ?? "-"}</span>
                </td>
                <td>{formatDate(row.lastSyncedAt ?? row.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={6}>暂无渠道资产</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
