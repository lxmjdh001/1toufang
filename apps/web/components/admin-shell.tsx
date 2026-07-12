"use client";

import {
  IconGallery,
  IconGlobe,
  IconHome,
  IconSend,
  IconSetting
} from "@douyinfe/semi-icons";
import { Avatar, Button, Layout, Nav, Spin } from "@douyinfe/semi-ui-19";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { apiRequest, clearAuthTokens, getAccessToken } from "../lib/api";

type AdminShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

type Me = {
  email: string;
  profile?: { name?: string | null } | null;
  employeeAccounts?: Array<{
    employeeNo: string;
    role?: { name: string } | null;
    team?: { name: string } | null;
  }> | null;
};

let cachedToken: string | null = null;
let cachedMe: Me | null = null;
let pendingMeRequest: Promise<Me> | null = null;

function getCachedMe(token: string | null) {
  return token && cachedToken === token ? cachedMe : null;
}

function clearMeCache() {
  cachedToken = null;
  cachedMe = null;
  pendingMeRequest = null;
}

function loadMe(token: string) {
  if (cachedToken !== token) {
    cachedToken = token;
    cachedMe = null;
    pendingMeRequest = null;
  }

  if (cachedMe) return Promise.resolve(cachedMe);

  pendingMeRequest ??= apiRequest<Me>("/auth/me")
    .then((nextMe) => {
      cachedMe = nextMe;
      return nextMe;
    })
    .finally(() => {
      pendingMeRequest = null;
    });

  return pendingMeRequest;
}

const sections = [
  {
    key: "workspace",
    label: "工作台",
    icon: <IconHome />,
    links: [{ href: "/dashboard", label: "数据看板" }]
  },
  {
    key: "assets",
    label: "渠道资产",
    icon: <IconGlobe />,
    links: [
      { href: "/integrations", label: "渠道授权" },
      { href: "/ad-accounts", label: "广告账户" },
      { href: "/platform-assets", label: "渠道资产" }
    ]
  },
  {
    key: "delivery",
    label: "投放中心",
    icon: <IconSend />,
    links: [
      { href: "/campaigns", label: "投放草稿" },
      { href: "/strategies", label: "策略模板" },
      { href: "/targetings", label: "受众库" }
    ]
  },
  {
    key: "creative",
    label: "素材创意",
    icon: <IconGallery />,
    links: [
      { href: "/media-assets", label: "素材库" },
      { href: "/copywritings", label: "文案库" },
      { href: "/creatives", label: "创意库" }
    ]
  },
  {
    key: "system",
    label: "系统管理",
    icon: <IconSetting />,
    links: [
      { href: "/admin/users", label: "用户审核" },
      { href: "/admin/employees", label: "员工管理" },
      { href: "/admin/permissions", label: "权限角色" },
      { href: "/admin/platform-configs", label: "开发者密钥" }
    ]
  }
];

export function AdminShell({ title, description, actions, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(() => getCachedMe(getAccessToken()));
  const [authChecked, setAuthChecked] = useState(() => Boolean(getCachedMe(getAccessToken())));
  const [openKeys, setOpenKeys] = useState<Array<string | number>>([]);

  const activeKey = useMemo(() => {
    const links = sections.flatMap((section) => section.links);
    return links.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))?.href;
  }, [pathname]);

  const activeSectionKey = useMemo(
    () =>
      sections.find((section) =>
        section.links.some((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
      )?.key ?? "workspace",
    [pathname]
  );

  const navItems = useMemo(
    () =>
      sections.map((section) => ({
        itemKey: section.key,
        text: section.label,
        icon: section.icon,
        items: section.links.map((link) => ({
          itemKey: link.href,
          text: link.label
        }))
      })),
    []
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      clearMeCache();
      router.replace("/login");
      return;
    }

    const cached = getCachedMe(token);
    if (cached) {
      setMe(cached);
      setAuthChecked(true);
    } else {
      setMe(null);
      setAuthChecked(false);
    }

    loadMe(token)
      .then((nextMe) => {
        if (getAccessToken() !== token) return;
        setMe(nextMe);
        setAuthChecked(true);
      })
      .catch(() => {
        if (getAccessToken() !== token) return;
        clearMeCache();
        clearAuthTokens();
        router.replace("/login");
      })
      .finally(() => {
        if (getAccessToken() === token) {
          setAuthChecked(true);
        }
      });
  }, [router]);

  useEffect(() => {
    setOpenKeys((current) => {
      if (current.includes(activeSectionKey)) {
        return current;
      }

      return current.length ? [...current, activeSectionKey] : [activeSectionKey];
    });
  }, [activeSectionKey]);

  useEffect(() => {
    if (!authChecked || !me) return;

    for (const link of sections.flatMap((section) => section.links)) {
      router.prefetch(link.href);
    }
  }, [authChecked, me, router]);

  function logout() {
    clearMeCache();
    clearAuthTokens();
    router.replace("/login");
  }

  const currentEmployee = me?.employeeAccounts?.[0];
  const accountName = me?.profile?.name ?? me?.email ?? "Account";

  if (!authChecked && !me) {
    return (
      <main className="admin-loading">
        <Spin size="large" />
        <div className="brand">1Toufang</div>
        <p>正在进入中后台...</p>
      </main>
    );
  }

  return (
    <Layout className="semi-admin-layout">
      <Layout.Sider className="semi-admin-sider">
        <div className="semi-admin-brand">
          <div className="semi-admin-logo">1T</div>
          <div>
            <strong>1Toufang</strong>
            <span>Ads Ops</span>
          </div>
        </div>
        <Nav
          bodyStyle={{ background: "transparent" }}
          className="semi-admin-nav"
          items={navItems}
          limitIndent
          mode="vertical"
          onOpenChange={({ openKeys: nextOpenKeys }) => {
            setOpenKeys(nextOpenKeys ?? []);
          }}
          onSelect={({ itemKey }) => {
            if (typeof itemKey === "string" && itemKey.startsWith("/")) {
              router.prefetch(itemKey);
              router.push(itemKey);
            }
          }}
          openKeys={openKeys}
          selectedKeys={activeKey ? [activeKey] : []}
          subNavMotion
        />
      </Layout.Sider>
      <Layout className="semi-admin-main">
        <Layout.Header className="semi-admin-header">
          <div className="semi-admin-account">
            <Avatar size="small" color="blue">
              {accountName.slice(0, 1).toUpperCase()}
            </Avatar>
            <div>
              <strong>{accountName}</strong>
              <span>
                {currentEmployee?.team?.name ?? "未选择团队"}
                {currentEmployee?.role?.name ? ` / ${currentEmployee.role.name}` : ""}
                {currentEmployee?.employeeNo ? ` / ${currentEmployee.employeeNo}` : ""}
              </span>
            </div>
          </div>
          <Button theme="borderless" onClick={logout} type="tertiary">
            退出登录
          </Button>
        </Layout.Header>
        <Layout.Content className="admin-content semi-admin-content">
          <div className="page-heading semi-page-heading">
            <div>
              <h1>{title}</h1>
              {description ? <p>{description}</p> : null}
            </div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </div>
          {children}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
