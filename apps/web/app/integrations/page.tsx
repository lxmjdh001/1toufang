"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../components/admin-shell";
import { apiRequest } from "../../lib/api";

type IntegrationRow = {
  id: string;
  platform: "META" | "TIKTOK";
  externalId: string;
  name: string;
  status: string;
  createdAt: string;
};

type OAuthResponse = {
  platform: string;
  configured: boolean;
  url: string;
  state: string;
};

type OAuthNotice = {
  type: "success" | "error";
  text: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function IntegrationsPage() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [oauth, setOauth] = useState<OAuthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<OAuthNotice | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const metaCount = useMemo(() => rows.filter((row) => row.platform === "META").length, [rows]);
  const tiktokCount = rows.length - metaCount;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiRequest<IntegrationRow[]>("/integrations"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载渠道授权失败");
    } finally {
      setLoading(false);
    }
  }

  async function createOAuth(platform: "meta" | "tiktok") {
    setError(null);
    setOauthNotice(null);
    setCopyNotice(null);
    try {
      const returnUrl = `${window.location.origin}/integrations`;
      setOauth(
        await apiRequest<OAuthResponse>(
          `/integrations/${platform}/oauth-url?returnUrl=${encodeURIComponent(returnUrl)}`
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成授权链接失败");
    }
  }

  async function copyOAuthUrl() {
    if (!oauth?.url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(oauth.url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = oauth.url;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyNotice("授权链接已复制");
    } catch {
      setCopyNotice("复制失败，请手动选中链接复制。");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("oauth");
    if (oauthStatus === "success") {
      setOauthNotice({
        type: "success",
        text: `${params.get("platform") ?? "渠道"} 授权成功，连接已保存`
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (oauthStatus === "error") {
      setOauthNotice({
        type: "error",
        text: params.get("message") ?? "渠道授权失败"
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
    void load();
  }, []);

  return (
    <AdminShell
      title="渠道授权"
      description="集中管理 Meta 和 TikTok 的渠道连接，为广告账户同步与投放发布提供授权基础。"
      actions={
        <button className="button secondary" onClick={load} type="button">
          刷新
        </button>
      }
    >
      <section className="metric-grid">
        <div className="metric">
          <span>全部连接</span>
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
      {oauthNotice ? <div className={`notice ${oauthNotice.type}`}>{oauthNotice.text}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>OAuth 授权</h2>
              <p>生成渠道授权入口，连接开发者应用和业务账户。</p>
            </div>
          </div>
          <div className="button-row">
            <button className="button primary" onClick={() => void createOAuth("meta")} type="button">
              Meta 授权
            </button>
            <button className="button primary" onClick={() => void createOAuth("tiktok")} type="button">
              TikTok 授权
            </button>
          </div>
          {oauth ? (
            <div className={oauth.configured ? "notice success" : "notice warning"}>
              <strong>{oauth.platform}</strong> / {oauth.configured ? "授权链接已生成" : "开发者应用未配置"}
              <br />
              {oauth.configured ? "授权链接已生成。" : <a href="/admin/platform-configs">去配置开发者密钥</a>}
            </div>
          ) : null}
      </section>

      <section className="table-panel">
        <table>
          <thead>
            <tr>
              <th>平台</th>
              <th>名称</th>
              <th>外部 ID</th>
              <th>状态</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.platform}</td>
                <td>{row.name}</td>
                <td>{row.externalId}</td>
                <td>
                  <span className={row.status === "active" ? "pill success" : "pill"}>{row.status}</span>
                </td>
                <td>{formatDate(row.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={5}>暂无连接</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {oauth?.configured ? (
        <div className="oauth-link-backdrop" role="presentation">
          <section aria-labelledby="oauthLinkTitle" className="oauth-link-modal" role="dialog">
            <div className="oauth-link-head">
              <h2 id="oauthLinkTitle">Connect {oauth.platform === "TIKTOK" ? "TikTok" : "Meta"}</h2>
              <button aria-label="关闭授权链接" onClick={() => setOauth(null)} type="button">
                ×
              </button>
            </div>
            <div className="field">
              <label htmlFor="oauthAuthorizationLink">Authorization Link</label>
              <input
                id="oauthAuthorizationLink"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={oauth.url}
              />
            </div>
            {copyNotice ? <div className="notice success compact-notice">{copyNotice}</div> : null}
            <div className="button-row">
              <button className="button primary" onClick={() => void copyOAuthUrl()} type="button">
                复制授权链接
              </button>
              <a className="button secondary" href={oauth.url} rel="noreferrer" target="_blank">
                打开授权页
              </a>
              <button className="button secondary" onClick={() => setOauth(null)} type="button">
                取消
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AdminShell>
  );
}
