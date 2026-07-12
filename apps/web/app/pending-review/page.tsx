import Link from "next/link";
import { AuthCard } from "../../components/auth-card";

export default function PendingReviewPage() {
  return (
    <AuthCard title="等待审核" subtitle="注册申请已进入管理员审核队列，通过后即可登录工作台。">
      <div className="notice success">账号暂未开通正式访问权限。审核完成后，请返回登录页进入系统。</div>
      <div className="button-row">
        <Link className="button secondary" href="/login">
          返回登录
        </Link>
        <Link className="button secondary" href="/register">
          重新提交
        </Link>
      </div>
    </AuthCard>
  );
}
