import { z } from "zod";

export const userStatusValues = [
  "pending_review",
  "active",
  "rejected",
  "suspended",
  "disabled",
  "locked"
] as const;

export type UserStatusValue = (typeof userStatusValues)[number];

export const loginMethodValues = ["email", "employee_no"] as const;
export type LoginMethodValue = (typeof loginMethodValues)[number];

export const platformValues = ["meta", "tiktok"] as const;
export type PlatformValue = (typeof platformValues)[number];

export const dataScopeValues = [
  "all_teams",
  "team",
  "platform",
  "ad_account",
  "campaign_tag",
  "owner_only"
] as const;

export type DataScopeValue = (typeof dataScopeValues)[number];

export const permissionCodes = [
  "users.review",
  "users.manage",
  "employees.manage",
  "roles.manage",
  "ad_accounts.view",
  "ad_accounts.manage",
  "campaigns.create",
  "campaigns.publish",
  "campaigns.budget.update",
  "campaigns.status.update",
  "campaigns.delete",
  "media.manage",
  "copywriting.manage",
  "targeting.manage",
  "strategies.manage",
  "automation.manage",
  "pixels.manage",
  "finance.view",
  "finance.manage",
  "reports.view",
  "reports.export",
  "audit_logs.view"
] as const;

export type PermissionCode = (typeof permissionCodes)[number];

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  companyName: z.string().min(1),
  phone: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const employeeLoginSchema = z.object({
  employeeNo: z.string().min(1),
  password: z.string().min(1)
});
