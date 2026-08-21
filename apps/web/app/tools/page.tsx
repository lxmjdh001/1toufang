import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function ToolsPage() {
  return <WorkspaceRecordPage module="tool" title="工具" description="管理 Mirror 等投放辅助任务，执行结果会记录在工作区。" actions={["run", "activate", "pause"]} fields={[{ key: "toolType", label: "工具类型", type: "select", options: [{ value: "mirror", label: "Mirror" }, { value: "import", label: "批量导入" }] }, { key: "sourceUrl", label: "来源地址" }, { key: "targetUrl", label: "目标地址" }, { key: "notes", label: "备注", type: "textarea" }]} />;
}
