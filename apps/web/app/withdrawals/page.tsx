import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function WithdrawalsPage() {
  return <WorkspaceRecordPage module="withdrawal" title="提现" description="管理提现申请、审核状态和收款方式。" actions={["approve", "pay", "reject"]} statusOptions={[{ value: "pending", label: "待审核" }, { value: "approved", label: "已通过" }, { value: "paid", label: "已打款" }, { value: "rejected", label: "已驳回" }]} fields={[{ key: "amount", label: "提现金额", type: "number" }, { key: "method", label: "收款方式", type: "select", options: [{ value: "bank", label: "银行账户" }, { value: "paypal", label: "PayPal" }, { value: "crypto", label: "数字货币" }] }, { key: "account", label: "收款账户" }, { key: "notes", label: "备注", type: "textarea" }]} />;
}
