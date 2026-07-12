import Link from "next/link";
import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className="auth-shell">
      <section className="auth-layout">
        <aside className="auth-brand-panel">
          <Link className="auth-brand" href="/">
            <span>WZ</span>
            <strong>WzzAds</strong>
          </Link>
          <div className="auth-positioning">
            <p>跨渠道广告投放运营中台</p>
            <h2>TikTok 与 Meta 广告账户、资产、发布和报表统一管理。</h2>
          </div>
          <div className="auth-trust-grid">
            <div>
              <strong>OAuth</strong>
              <span>渠道授权与 token 加密存储</span>
            </div>
            <div>
              <strong>RBAC</strong>
              <span>用户审核、员工号和角色权限</span>
            </div>
            <div>
              <strong>Ops</strong>
              <span>发布预检、队列追踪和数据看板</span>
            </div>
          </div>
          <div className="auth-process">
            <span>注册审核</span>
            <i />
            <span>渠道授权</span>
            <i />
            <span>投放发布</span>
          </div>
        </aside>
        <section className="auth-panel">
          <div className="auth-heading">
            <span className="auth-eyebrow">Secure workspace</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </section>
      </section>
    </main>
  );
}
