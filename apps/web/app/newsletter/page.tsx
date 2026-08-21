import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function NewsletterPage() {
  return <WorkspaceRecordPage module="newsletter" title="Newsletter" description="管理草稿和已发送内容，发送动作先记录状态，后续可接邮件服务。" actions={["send", "archive"]} statusOptions={[{ value: "draft", label: "草稿" }, { value: "sent", label: "已发送" }, { value: "archived", label: "已归档" }]} fields={[{ key: "subject", label: "主题" }, { key: "audience", label: "发送人群" }, { key: "content", label: "正文", type: "textarea" }]} />;
}
