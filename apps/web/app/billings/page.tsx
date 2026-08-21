import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function BillingsPage() {
  return <WorkspaceRecordPage module="billing" title="账单" description="查看工作区账单记录、金额和结算周期。" actions={["pay", "archive"]} statusOptions={[{ value: "pending", label: "待结算" }, { value: "paid", label: "已支付" }, { value: "failed", label: "失败" }, { value: "archived", label: "已归档" }]} fields={[{ key: "amount", label: "金额", type: "number" }, { key: "currency", label: "币种", placeholder: "USD" }, { key: "period", label: "账期" }, { key: "reference", label: "关联单号" }]} />;
}
