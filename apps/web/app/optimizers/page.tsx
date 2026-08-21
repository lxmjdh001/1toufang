import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function OptimizersPage() {
  return <WorkspaceRecordPage module="optimizer" title="优化器" description="按数据间隔和条件自动执行暂停、启动、预算调整等固定规则。" actions={["run", "activate", "pause"]} fields={[{ key: "level", label: "执行等级", type: "select", options: [{ value: "campaign", label: "广告系列" }, { value: "adset", label: "广告组" }, { value: "ad", label: "广告" }] }, { key: "interval", label: "数据间隔", placeholder: "24 小时" }, { key: "frequency", label: "执行频率", placeholder: "每 1 小时" }, { key: "condition", label: "筛选条件", placeholder: "ROAS < 1" }, { key: "action", label: "执行动作", type: "select", options: [{ value: "pause", label: "停止" }, { value: "start", label: "开始" }, { value: "increase_budget", label: "增加预算" }, { value: "decrease_budget", label: "减少预算" }] }]} />;
}
