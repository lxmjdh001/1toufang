"use client";

import {
  IconBell,
  IconChevronDown,
  IconGallery,
  IconGlobe,
  IconHome,
  IconLanguage,
  IconSearch,
  IconSend,
  IconSetting
} from "@douyinfe/semi-icons";
import { Avatar, Button, Layout, Nav, Spin } from "@douyinfe/semi-ui-19";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { apiRequest, clearAuthTokens, getAccessToken } from "../lib/api";

type AdminShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

type Me = {
  email: string;
  currentTeamId?: string | null;
  permissionCodes?: string[];
  profile?: { name?: string | null } | null;
  employeeAccounts?: Array<{
    employeeNo: string;
    role?: { name: string } | null;
    team?: { id: string; name: string } | null;
  }> | null;
  teamMemberships?: Array<{
    teamId: string;
    role?: { name: string } | null;
    team: { id: string; name: string };
  }> | null;
};

type SearchItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  updatedAt: string;
};

type SearchResponse = {
  query: string;
  items: SearchItem[];
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "danger" | string;
  actionHref?: string | null;
  createdAt: string;
};

type NotificationResponse = {
  unread: number;
  items: NotificationItem[];
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
    label: "控制面板",
    icon: <IconHome />,
    links: [
      { href: "/dashboard", label: "控制面板", permissions: ["reports.view"] }
    ]
  },
  {
    key: "campaigns",
    label: "广告系列",
    icon: <IconSend />,
    links: [{ href: "/campaigns", label: "广告系列", permissions: ["campaigns.create"] }]
  },
  {
    key: "channels",
    label: "渠道",
    icon: <IconGlobe />,
    links: [
      { href: "/integrations", label: "渠道授权", permissions: ["ad_accounts.view"] },
      { href: "/channels/facebook", label: "Facebook", permissions: ["ad_accounts.view"] },
      { href: "/channels/tiktok", label: "TikTok", permissions: ["ad_accounts.view"] },
      { href: "/ad-accounts", label: "广告账户", permissions: ["ad_accounts.view"] },
      { href: "/platform-assets", label: "渠道资产", permissions: ["ad_accounts.view"] }
    ]
  },
  {
    key: "media",
    label: "素材库",
    icon: <IconGallery />,
    links: [
      { href: "/media-assets", label: "素材库", permissions: ["media.manage"] },
      { href: "/copywritings", label: "文案库", permissions: ["copywriting.manage"] },
      { href: "/creatives", label: "创意库", permissions: ["media.manage", "copywriting.manage"] }
    ]
  },
  {
    key: "resources",
    label: "资源",
    icon: <IconSetting />,
    links: [
      { href: "/strategies", label: "策略模板", permissions: ["strategies.manage"] },
      { href: "/targetings", label: "受众库", permissions: ["targeting.manage"] },
      { href: "/landing-pages", label: "落地页", permissions: ["campaigns.create"] },
      { href: "/offers", label: "推广项目", permissions: ["campaigns.create"] },
      { href: "/domains", label: "域名", permissions: ["campaigns.create"] },
      { href: "/pwa-apps", label: "PWA 应用", permissions: ["campaigns.create"] },
      { href: "/demands", label: "需求池", permissions: ["campaigns.create"] }
    ]
  },
  {
    key: "reports",
    label: "报告",
    icon: <IconHome />,
    links: [
      { href: "/analytics", label: "访客分析", permissions: ["reports.view"] },
      { href: "/conversions", label: "转化事件", permissions: ["reports.view"] }
    ]
  },
  {
    key: "system",
    label: "系统管理",
    icon: <IconSetting />,
    links: [
      { href: "/admin/users", label: "系统用户", permissions: ["users.manage"] },
      { href: "/admin/teams", label: "团队管理", permissions: ["users.manage"] },
      { href: "/admin/employees", label: "员工管理", permissions: ["employees.manage"] },
      { href: "/admin/permissions", label: "权限角色", permissions: ["roles.manage"] },
      { href: "/admin/platform-configs", label: "开发者密钥", permissions: ["system.config.manage"] }
    ]
  }
];

export function AdminShell({ title, description, actions, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(() => getCachedMe(getAccessToken()));
  const [authChecked, setAuthChecked] = useState(() => Boolean(getCachedMe(getAccessToken())));
  const [openKeys, setOpenKeys] = useState<Array<string | number>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationsAcknowledged, setNotificationsAcknowledged] = useState(false);
  const [language, setLanguage] = useState("ZH");

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
    () => {
      const granted = new Set(me?.permissionCodes ?? []);
      return sections
        .map((section) => ({
          itemKey: section.key,
          text: section.label,
          icon: section.icon,
          items: section.links
            .filter((link) => link.permissions.every((permission) => granted.has(permission)))
            .map((link) => ({
              itemKey: link.href,
              text: link.label
            }))
        }))
        .filter((section) => section.items.length > 0);
    },
    [me?.permissionCodes]
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

    const granted = new Set(me.permissionCodes ?? []);
    for (const link of sections
      .flatMap((section) => section.links)
      .filter((item) => item.permissions.every((permission) => granted.has(permission)))) {
      router.prefetch(link.href);
    }
  }, [authChecked, me, router]);

  useEffect(() => {
    const stored = window.localStorage.getItem("wzzads-language");
    if (stored === "EN" || stored === "ZH") {
      setLanguage(stored);
    }
  }, []);

  useEffect(() => {
    if (!authChecked || !me) return;

    let active = true;
    apiRequest<NotificationResponse>("/reports/notifications")
      .then((response) => {
        if (!active) return;
        setNotifications(response.items);
        setNotificationsAcknowledged(response.unread === 0);
      })
      .catch(() => {
        if (active) setNotifications([]);
      });

    return () => {
      active = false;
    };
  }, [authChecked, me]);

  useEffect(() => {
    if (!authChecked || !me) return;
    const keyword = searchTerm.trim();

    if (!keyword) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      apiRequest<SearchResponse>(`/reports/search?q=${encodeURIComponent(keyword)}`)
        .then((response) => {
          if (!active) return;
          setSearchResults(response.items);
          setSearchOpen(true);
        })
        .catch(() => {
          if (active) setSearchResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authChecked, me, searchTerm]);

  function logout() {
    clearMeCache();
    clearAuthTokens();
    router.replace("/login");
  }

  function openSearchItem(item: SearchItem) {
    setSearchOpen(false);
    setSearchTerm("");
    router.push(item.href);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const first = searchResults[0];
    if (first) {
      openSearchItem(first);
    }
  }

  function toggleLanguage() {
    const nextLanguage = language === "ZH" ? "EN" : "ZH";
    setLanguage(nextLanguage);
    window.localStorage.setItem("wzzads-language", nextLanguage);
  }

  const currentEmployee = me?.employeeAccounts?.find(
    (employee) => !me?.currentTeamId || employee.team?.id === me.currentTeamId
  );
  const currentMembership =
    me?.teamMemberships?.find((membership) => membership.teamId === me.currentTeamId) ?? me?.teamMemberships?.[0];
  const accountName = me?.profile?.name ?? me?.email ?? "Account";
  const teamName = currentEmployee?.team?.name ?? currentMembership?.team.name ?? "个人工作区";
  const roleName = currentEmployee?.role?.name ?? currentMembership?.role?.name;
  const unreadCount = notificationsAcknowledged
    ? 0
    : notifications.filter((item) => item.severity !== "info").length;

  if (!authChecked && !me) {
    return (
      <main className="admin-loading">
        <Spin size="large" />
        <div className="brand">WzzAds</div>
        <p>正在进入中后台...</p>
      </main>
    );
  }

  return (
    <Layout className="semi-admin-layout">
      <Layout.Sider className="semi-admin-sider">
        <div className="semi-admin-brand">
          <div className="semi-admin-logo">WZ</div>
          <div>
            <strong>WzzAds</strong>
            <span>广告运营中台</span>
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
          <div className="semi-admin-header-left">
            <form className="global-search" onSubmit={submitSearch}>
              <IconSearch />
              <input
                aria-label="全局搜索"
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)}
                onChange={(event) => setSearchTerm(event.target.value)}
                onFocus={() => {
                  if (searchTerm.trim()) setSearchOpen(true);
                }}
                placeholder="搜索投放计划 / 账户 / 素材"
                value={searchTerm}
              />
              {searching ? <span className="global-search-status">搜索中</span> : null}
              {searchOpen && searchTerm.trim() ? (
                <div className="global-search-popover">
                  {searchResults.length ? (
                    searchResults.map((item) => (
                      <button
                        className="global-search-item"
                        key={`${item.type}-${item.id}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          openSearchItem(item);
                        }}
                        type="button"
                      >
                        <span className="pill">{item.type}</span>
                        <strong>{item.title}</strong>
                        <small>{item.description || item.href}</small>
                      </button>
                    ))
                  ) : (
                    <div className="global-search-empty">{searching ? "正在搜索..." : "没有匹配结果"}</div>
                  )}
                </div>
              ) : null}
            </form>
          </div>
          <div className="semi-admin-header-right">
            <button className="header-tool language-tool" onClick={toggleLanguage} title="语言切换" type="button">
              <IconLanguage />
              <span>{language}</span>
              <IconChevronDown />
            </button>
            <div className="notification-wrap">
              <button
                className="header-tool icon-tool"
                onClick={() => {
                  setNotificationOpen((current) => !current);
                  setNotificationsAcknowledged(true);
                }}
                title="通知"
                type="button"
              >
                <IconBell />
                {unreadCount ? <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
              </button>
              {notificationOpen ? (
                <div className="notification-popover">
                  <div className="notification-head">
                    <strong>通知</strong>
                    <button onClick={() => setNotificationsAcknowledged(true)} type="button">
                      全部已读
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.length ? (
                      notifications.map((item) => (
                        <button
                          className={`notification-item ${item.severity}`}
                          key={item.id}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setNotificationOpen(false);
                            if (item.actionHref) router.push(item.actionHref);
                          }}
                          type="button"
                        >
                          <strong>{item.title}</strong>
                          <span>{item.message}</span>
                        </button>
                      ))
                    ) : (
                      <div className="notification-empty">暂无通知</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="semi-admin-account">
              <Avatar size="small" color="blue">
                {accountName.slice(0, 1).toUpperCase()}
              </Avatar>
              <div>
                <strong>{accountName}</strong>
                <span>
                  {teamName}
                  {roleName ? ` / ${roleName}` : ""}
                  {currentEmployee?.employeeNo ? ` / ${currentEmployee.employeeNo}` : ""}
                </span>
              </div>
            </div>
            <Button theme="borderless" onClick={logout} type="tertiary">
              退出登录
            </Button>
          </div>
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
