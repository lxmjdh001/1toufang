"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthCard } from "../../components/auth-card";
import { apiRequest } from "../../lib/api";

export default function RegisterPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          name: form.get("name"),
          companyName: form.get("companyName"),
          phone: form.get("phone")
        })
      });
      setMessage("注册申请已提交，请等待管理员审核开通。");
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="申请开通"
      subtitle="提交企业与联系人信息，管理员审核通过后开通工作台访问权限。"
      footer={
        <>
          已有账号？ <Link href="/login">去邮箱登录</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">姓名</label>
            <input autoComplete="name" id="name" name="name" placeholder="联系人姓名" required />
          </div>
          <div className="field">
            <label htmlFor="companyName">公司/团队名称</label>
            <input autoComplete="organization" id="companyName" name="companyName" placeholder="公司或投放团队" required />
          </div>
          <div className="field">
            <label htmlFor="email">邮箱</label>
            <input autoComplete="email" id="email" name="email" placeholder="name@company.com" required type="email" />
          </div>
          <div className="field">
            <label htmlFor="phone">联系方式</label>
            <input autoComplete="tel" id="phone" name="phone" placeholder="手机号或企业微信" />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <input autoComplete="new-password" id="password" minLength={8} name="password" placeholder="至少 8 位" required type="password" />
          </div>
        </div>
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        <button className="button primary" disabled={loading} type="submit">
          {loading ? "提交中..." : "提交注册申请"}
        </button>
      </form>
    </AuthCard>
  );
}
