"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../../components/admin-shell";
import { apiRequest } from "../../../lib/api";

type Platform = "META" | "TIKTOK";

type PlatformConfigRow = {
  id: string | null;
  platform: Platform;
  appId: string;
  appSecretMasked: string;
  hasAppSecret: boolean;
  redirectUri: string;
  scopes: string[];
  apiVersion: string;
  apiBaseUrl: string;
  environment: string;
  isEnabled: boolean;
  updatedAt: string | null;
};

type Draft = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes: string;
  apiVersion: string;
  apiBaseUrl: string;
  environment: string;
  isEnabled: boolean;
  clearAppSecret: boolean;
};

const platformMeta: Record<
  Platform,
  {
    title: string;
    appIdLabel: string;
    secretLabel: string;
    defaultScopes: string;
    defaultRedirect: string;
    defaultApiVersion?: string;
    defaultApiBaseUrl?: string;
  }
> = {
  META: {
    title: "Meta / Facebook",
    appIdLabel: "App ID",
    secretLabel: "App Secret",
    defaultScopes: "ads_management, ads_read, business_management, pages_read_engagement",
    defaultRedirect: "http://localhost:4000/api/integrations/meta/callback",
    defaultApiVersion: "v25.0"
  },
  TIKTOK: {
    title: "TikTok",
    appIdLabel: "App ID / Client Key",
    secretLabel: "Client Secret",
    defaultScopes: "user.info.basic, biz.ad",
    defaultRedirect: "http://localhost:4000/api/integrations/tiktok/callback",
    defaultApiBaseUrl: "https://business-api.tiktok.com"
  }
};

function toDraft(row: PlatformConfigRow): Draft {
  const meta = platformMeta[row.platform];
  return {
    appId: row.appId || "",
    appSecret: "",
    redirectUri: row.redirectUri || meta.defaultRedirect,
    scopes: row.scopes.length ? row.scopes.join(", ") : meta.defaultScopes,
    apiVersion: row.apiVersion || meta.defaultApiVersion || "",
    apiBaseUrl: row.apiBaseUrl || meta.defaultApiBaseUrl || "",
    environment: row.environment || "sandbox",
    isEnabled: row.isEnabled,
    clearAppSecret: false
  };
}

function parseScopes(value: string) {
  return value
    .split(/[\n,]/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

export default function PlatformConfigsPage() {
  const [rows, setRows] = useState<PlatformConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<Platform, Draft>>>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Partial<Record<Platform, string>>>({});
  const [revealPasswords, setRevealPasswords] = useState<Partial<Record<Platform, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState<Platform | null>(null);
  const [revealingPlatform, setRevealingPlatform] = useState<Platform | null>(null);

  const configuredCount = useMemo(() => rows.filter((row) => row.appId && row.hasAppSecret).length, [rows]);
  const enabledCount = useMemo(() => rows.filter((row) => row.isEnabled).length, [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<PlatformConfigRow[]>("/platform-configs");
      setRows(data);
      setDrafts(
        data.reduce<Partial<Record<Platform, Draft>>>((next, row) => {
          next[row.platform] = toDraft(row);
          return next;
        }, {})
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载开发者配置失败");
    } finally {
      setLoading(false);
    }
  }

  async function save(platform: Platform, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = drafts[platform];
    if (!draft) return;

    setSavingPlatform(platform);
    setError(null);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        appId: draft.appId,
        redirectUri: draft.redirectUri,
        scopes: parseScopes(draft.scopes),
        apiVersion: draft.apiVersion,
        apiBaseUrl: draft.apiBaseUrl,
        environment: draft.environment,
        isEnabled: draft.isEnabled,
        clearAppSecret: draft.clearAppSecret
      };
      if (draft.appSecret.trim()) {
        payload.appSecret = draft.appSecret.trim();
      }

      await apiRequest(`/platform-configs/${platform}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setRevealedSecrets((current) => ({ ...current, [platform]: undefined }));
      setMessage(`${platformMeta[platform].title} 配置已保存`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存开发者配置失败");
    } finally {
      setSavingPlatform(null);
    }
  }

  async function reveal(platform: Platform) {
    const password = revealPasswords[platform]?.trim();
    if (!password) {
      setError("请输入当前管理员密码");
      return;
    }

    setRevealingPlatform(platform);
    setError(null);
    setMessage(null);
    try {
      const result = await apiRequest<{ appSecret: string }>(`/platform-configs/${platform}/reveal-secret`, {
        method: "POST",
        body: JSON.stringify({ password })
      });
      setRevealedSecrets((current) => ({ ...current, [platform]: result.appSecret }));
      setRevealPasswords((current) => ({ ...current, [platform]: "" }));
      setMessage(`${platformMeta[platform].title} 密钥已显示`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查看密钥失败");
    } finally {
      setRevealingPlatform(null);
    }
  }

  function patchDraft(platform: Platform, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [platform]: {
        ...current[platform],
        ...patch
      } as Draft
    }));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminShell
      title="开发者密钥"
      description="配置 Meta 和 TikTok 开发者应用，用于 OAuth 授权、Token 换取和后续广告发布。"
      actions={
        <button className="button secondary" onClick={load} type="button">
          刷新
        </button>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>平台配置</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="metric">
          <span>密钥完整</span>
          <strong>{configuredCount}</strong>
        </div>
        <div className="metric">
          <span>已启用</span>
          <strong>{enabledCount}</strong>
        </div>
      </section>

      {loading ? <div className="notice success">加载中...</div> : null}
      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="split-grid">
        {rows.map((row) => {
          const meta = platformMeta[row.platform];
          const draft = drafts[row.platform] ?? toDraft(row);
          const revealedSecret = revealedSecrets[row.platform];

          return (
            <form className="panel form" key={row.platform} onSubmit={(event) => void save(row.platform, event)}>
              <div className="panel-heading">
                <div>
                  <h2>{meta.title}</h2>
                  <p>
                    <span className={row.isEnabled ? "pill success" : "pill warning"}>
                      {row.isEnabled ? "已启用" : "未启用"}
                    </span>{" "}
                    <span className={row.hasAppSecret ? "pill success" : "pill"}>
                      {row.hasAppSecret ? "已保存密钥" : "未保存密钥"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`${row.platform}-appId`}>{meta.appIdLabel}</label>
                  <input
                    id={`${row.platform}-appId`}
                    onChange={(event) => patchDraft(row.platform, { appId: event.target.value })}
                    value={draft.appId}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${row.platform}-environment`}>环境</label>
                  <select
                    id={`${row.platform}-environment`}
                    onChange={(event) => patchDraft(row.platform, { environment: event.target.value })}
                    value={draft.environment}
                  >
                    <option value="sandbox">Sandbox / 测试</option>
                    <option value="production">Production / 正式</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor={`${row.platform}-appSecret`}>{meta.secretLabel}</label>
                <input
                  autoComplete="new-password"
                  id={`${row.platform}-appSecret`}
                  onChange={(event) => patchDraft(row.platform, { appSecret: event.target.value })}
                  placeholder={row.hasAppSecret ? `当前：${row.appSecretMasked}` : "首次保存需要填写"}
                  type="password"
                  value={draft.appSecret}
                />
              </div>

              <div className="secret-preview">
                <span>{revealedSecret ? revealedSecret : row.appSecretMasked || "未保存"}</span>
                {revealedSecret ? (
                  <button
                    className="button secondary"
                    onClick={() => setRevealedSecrets((current) => ({ ...current, [row.platform]: undefined }))}
                    type="button"
                  >
                    收起
                  </button>
                ) : null}
              </div>

              {row.hasAppSecret && !revealedSecret ? (
                <div className="inline-fields secret-reveal">
                  <label htmlFor={`${row.platform}-password`}>管理员密码</label>
                  <div className="button-row">
                    <input
                      autoComplete="current-password"
                      id={`${row.platform}-password`}
                      onChange={(event) =>
                        setRevealPasswords((current) => ({ ...current, [row.platform]: event.target.value }))
                      }
                      type="password"
                      value={revealPasswords[row.platform] ?? ""}
                    />
                    <button
                      className="button secondary"
                      disabled={revealingPlatform === row.platform}
                      onClick={() => void reveal(row.platform)}
                      type="button"
                    >
                      {revealingPlatform === row.platform ? "验证中..." : "查看密钥"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="field">
                <label htmlFor={`${row.platform}-redirectUri`}>OAuth Redirect URI</label>
                <input
                  id={`${row.platform}-redirectUri`}
                  onChange={(event) => patchDraft(row.platform, { redirectUri: event.target.value })}
                  value={draft.redirectUri}
                />
              </div>

              <div className="field">
                <label htmlFor={`${row.platform}-scopes`}>Scopes</label>
                <textarea
                  id={`${row.platform}-scopes`}
                  onChange={(event) => patchDraft(row.platform, { scopes: event.target.value })}
                  value={draft.scopes}
                />
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`${row.platform}-apiVersion`}>API Version</label>
                  <input
                    id={`${row.platform}-apiVersion`}
                    onChange={(event) => patchDraft(row.platform, { apiVersion: event.target.value })}
                    placeholder={meta.defaultApiVersion}
                    value={draft.apiVersion}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${row.platform}-apiBaseUrl`}>API Base URL</label>
                  <input
                    id={`${row.platform}-apiBaseUrl`}
                    onChange={(event) => patchDraft(row.platform, { apiBaseUrl: event.target.value })}
                    placeholder={meta.defaultApiBaseUrl}
                    value={draft.apiBaseUrl}
                  />
                </div>
              </div>

              <label className="checkbox-row compact">
                <input
                  checked={draft.isEnabled}
                  onChange={(event) => patchDraft(row.platform, { isEnabled: event.target.checked })}
                  type="checkbox"
                />
                <strong>启用配置</strong>
              </label>

              {row.hasAppSecret ? (
                <label className="checkbox-row compact">
                  <input
                    checked={draft.clearAppSecret}
                    onChange={(event) => patchDraft(row.platform, { clearAppSecret: event.target.checked })}
                    type="checkbox"
                  />
                  <strong>清空已保存密钥</strong>
                </label>
              ) : null}

              <div className="button-row">
                <button className="button primary" disabled={savingPlatform === row.platform} type="submit">
                  {savingPlatform === row.platform ? "保存中..." : "保存配置"}
                </button>
                <span className="muted">更新：{formatDate(row.updatedAt)}</span>
              </div>
            </form>
          );
        })}
      </section>
    </AdminShell>
  );
}
