"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type AdAccountRow = {
  id: string;
  platform: "META" | "TIKTOK";
  externalId: string;
  name: string;
  currency?: string | null;
  timezone?: string | null;
  status?: string | null;
  createdAt: string;
};

type SyncResult = {
  integrations: number;
  adAccounts: number;
  assets: number;
  errors: Array<{ platform: string; integrationId: string; message: string }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function AdAccountsPage() {
  const [rows, setRows] = useState<AdAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  const metaCount = useMemo(() => rows.filter((row) => row.platform === "META").length, [rows]);
  const tiktokCount = rows.length - metaCount;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiRequest<AdAccountRow[]>("/ad-accounts"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载广告账户失败");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/ad-accounts/manual", {
        method: "POST",
        body: JSON.stringify({
          platform: form.get("platform"),
          externalId: form.get("externalId"),
          name: form.get("name"),
          currency: form.get("currency") || undefined,
          timezone: form.get("timezone") || undefined
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建广告账户失败");
    } finally {
      setSaving(false);
    }
  }

  async function syncAll() {
    setSyncingAll(true);
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
      setError(err instanceof Error ? err.message : "同步官方资产失败");
    } finally {
      setSyncingAll(false);
    }
  }

  async function sync(id: string) {
    setError(null);
    try {
      await apiRequest(`/ad-accounts/${id}/sync`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步广告账户失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="广告账户"
      description="维护 Meta 和 TikTok 广告账户资产，用于后续投放创建、同步和数据看板。"
      actions={
        <div className="button-row">
          <button className="button primary" disabled={syncingAll} onClick={() => void syncAll()} type="button">
            {syncingAll ? "同步中..." : "同步官方资产"}
          </button>
          <button className="button secondary" onClick={load} type="button">
            刷新
          </button>
        </div>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>广告账户</span>
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

      <form className="panel form" onSubmit={onSubmit}>
        <div className="panel-heading">
          <div>
            <h2>新增广告账户</h2>
            <p>把可投放的广告账户纳入资产池。</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="platform">平台</label>
            <select id="platform" name="platform" required>
              <option value="META">Meta</option>
              <option value="TIKTOK">TikTok</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="externalId">广告账户 ID</label>
            <input id="externalId" name="externalId" required />
          </div>
          <div className="field">
            <label htmlFor="name">名称</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="currency">币种</label>
            <input id="currency" name="currency" placeholder="USD" />
          </div>
          <div className="field">
            <label htmlFor="timezone">时区</label>
            <input id="timezone" name="timezone" placeholder="Asia/Shanghai" />
          </div>
        </div>
        <div className="button-row">
          <button className="button primary" disabled={saving} type="submit">
            {saving ? "保存中..." : "保存广告账户"}
          </button>
        </div>
      </form>

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>平台</th>
              <th>名称</th>
              <th>广告账户 ID</th>
              <th>币种</th>
              <th>时区</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.platform}</td>
                <td>{row.name}</td>
                <td>{row.externalId}</td>
                <td>{row.currency ?? "-"}</td>
                <td>{row.timezone ?? "-"}</td>
                <td>
                  <span className={row.status === "synced" ? "pill success" : "pill"}>{row.status ?? "-"}</span>
                </td>
                <td>{formatDate(row.createdAt)}</td>
                <td>
                  <button className="button secondary" onClick={() => void sync(row.id)} type="button">
                    同步
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={8}>暂无广告账户</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
