import { WorkspaceRecordPage } from "../../components/workspace-record-page";

export default function StoresPage() {
  return <WorkspaceRecordPage module="store" title="店铺" description="统一管理店铺信息、平台来源和评论同步入口。" actions={["run"]} fields={[{ key: "platform", label: "平台", type: "select", options: [{ value: "shopify", label: "Shopify" }, { value: "woocommerce", label: "WooCommerce" }, { value: "other", label: "其他" }] }, { key: "url", label: "店铺地址", placeholder: "https://" }, { key: "reviewSync", label: "评论同步", type: "select", options: [{ value: "manual", label: "手动" }, { value: "daily", label: "每天" }] }]} />;
}
