"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthCard } from "../../components/auth-card";
import { ApiError, apiRequest, getAccessToken, saveAuthTokens } from "../../lib/api";

const statusMessages: Record<string, string> = {
  rejected: "注册申请已被驳回，请联系管理员重新开通。",
  suspended: "账号已暂停，请联系管理员处理。",
  disabled: "账号已禁用，请联系管理员处理。",
  locked: "账号已锁定，请联系管理员解锁。"
};

export default function LoginPage() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAccessToken()) {
      window.location.replace("/dashboard");
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const data = await apiRequest<{
        accessToken: string;
        refreshToken: string;
        user: { email: string; status: string };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password")
        })
      });
      saveAuthTokens(data.accessToken, data.refreshToken);
      setResult("登录成功，正在进入中后台...");
      window.location.assign("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code === "pending_review") {
        window.location.assign("/pending-review");
        return;
      }
      if (err instanceof ApiError && err.code && statusMessages[err.code]) {
        setError(statusMessages[err.code]);
      } else {
        setError(err instanceof Error ? err.message : "登录失败");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="登录工作台"
      subtitle="使用已审核开通的企业账号进入投放运营中台。"
      footer={
        <>
          员工账号？ <Link href="/employee-login">使用员工号登录</Link>
          <br />
          还没有账号？ <Link href="/register">提交注册申请</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">邮箱</label>
          <input autoComplete="email" id="email" name="email" placeholder="name@company.com" required type="email" />
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input autoComplete="current-password" id="password" name="password" placeholder="请输入登录密码" required type="password" />
        </div>
        {result ? (
          <div className="notice success">
            {result}
            <br />
            <Link href="/dashboard">进入中后台</Link>
          </div>
        ) : null}
        {error ? <div className="notice error">{error}</div> : null}
        <button className="button primary" disabled={loading} type="submit">
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </AuthCard>
  );
}
