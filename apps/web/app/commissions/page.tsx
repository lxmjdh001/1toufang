import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function CommissionsPage() {
  return <WorkspaceRecordPage module="commission" title="佣金" description="查看推广佣金记录，按周期、金额和状态管理结算数据。" statusOptions={[{ value: "pending", label: "待确认" }, { value: "approved", label: "已确认" }, { value: "paid", label: "已支付" }, { value: "rejected", label: "已驳回" }]} fields={[{ key: "period", label: "统计周期" }, { key: "amount", label: "佣金金额", type: "number" }, { key: "source", label: "来源链接" }, { key: "notes", label: "备注", type: "textarea" }]} />;
}
