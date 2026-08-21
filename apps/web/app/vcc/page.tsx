import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function VccPage() {
  return <WorkspaceRecordPage module="vcc" title="虚拟卡" description="先管理申请、额度和审核状态，真实发卡能力后续接入支付服务。" actions={["approve", "activate", "pause"]} statusOptions={[{ value: "draft", label: "申请草稿" }, { value: "pending", label: "待审核" }, { value: "active", label: "已开通" }, { value: "paused", label: "已停用" }]} fields={[{ key: "cardType", label: "卡类型", type: "select", options: [{ value: "virtual", label: "虚拟卡" }, { value: "physical", label: "实体卡" }] }, { key: "limit", label: "额度", type: "number" }, { key: "currency", label: "币种", placeholder: "USD" }, { key: "notes", label: "备注", type: "textarea" }]} />;
}
