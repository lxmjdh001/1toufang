import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function ReferralLinksPage() {
  return <WorkspaceRecordPage module="referral-link" title="推荐链接" description="生成和管理客户推广链接，统一查看链接状态和归因配置。" actions={["activate", "pause", "archive"]} fields={[{ key: "code", label: "链接代码" }, { key: "landingPage", label: "落地页地址" }, { key: "commissionRate", label: "佣金比例", type: "number" }, { key: "expiresAt", label: "到期时间", type: "text" }]} />;
}
