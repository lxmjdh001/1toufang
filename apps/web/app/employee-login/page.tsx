"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthCard } from "../../components/auth-card";
import { ApiError, apiRequest, getAccessToken, saveAuthTokens } from "../../lib/api";

const statusMessages: Record<string, string> = {
  pending_review: "账号仍在审核中，暂时不能使用员工号登录。",
  rejected: "注册申请已被驳回，请联系管理员重新开通。",
  suspended: "账号已暂停，请联系管理员处理。",
  disabled: "账号已禁用，请联系管理员处理。",
  locked: "账号已锁定，请联系管理员解锁。"
};

export default function EmployeeLoginPage() {
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
        user: { employeeNo?: string; teamId?: string };
      }>("/auth/employee-login", {
        method: "POST",
        body: JSON.stringify({
          employeeNo: form.get("employeeNo"),
          password: form.get("password")
        })
      });
      saveAuthTokens(data.accessToken, data.refreshToken);
      setResult("员工号登录成功，正在进入中后台...");
      window.location.assign("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.code && statusMessages[err.code]) {
        setError(statusMessages[err.code]);
      } else {
        setError(err instanceof Error ? err.message : "员工号登录失败");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="员工号登录"
      subtitle="投手、优化师、运营和财务可使用员工号进入对应权限空间。"
      footer={
        <>
          普通账号？ <Link href="/login">使用邮箱登录</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="employeeNo">员工号</label>
          <input autoComplete="username" id="employeeNo" name="employeeNo" placeholder="TF000001" required />
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
          {loading ? "登录中..." : "员工号登录"}
        </button>
      </form>
    </AuthCard>
  );
}
