import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function CopilotPage() {
  return <WorkspaceRecordPage module="copilot" title="Copilot" description="管理固定规则助手和客户页面关联，AI 能力可在后续版本接入。" actions={["activate", "pause"]} fields={[{ key: "shortDescription", label: "简短描述" }, { key: "basePrompt", label: "基础指令", type: "textarea" }, { key: "autoReply", label: "自动回复", type: "textarea" }, { key: "moderation", label: "内容处理", type: "select", options: [{ value: "none", label: "不处理" }, { value: "bad", label: "删除不良内容" }, { value: "all", label: "删除全部内容" }] }]} />;
}
