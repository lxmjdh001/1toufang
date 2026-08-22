"use client";

import {
  IconBell,
  IconChevronDown,
  IconGallery,
  IconGlobe,
  IconHome,
  IconSearch,
  IconSend,
  IconSetting
} from "@douyinfe/semi-icons";
import { Avatar, Spin } from "@douyinfe/semi-ui-19";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { apiRequest, clearAuthTokens, getAccessToken } from "../lib/api";

type AdminShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  pageMode?: "default" | "dashboard";
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
      { href: "/platform-assets", label: "渠道资产", permissions: ["ad_accounts.view"] },
      { href: "/vcc", label: "虚拟卡", permissions: ["campaigns.create"] }
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
      { href: "/demands", label: "需求池", permissions: ["campaigns.create"] },
      { href: "/stores", label: "店铺", permissions: ["campaigns.create"] },
      { href: "/tools", label: "工具", permissions: ["campaigns.create"] },
      { href: "/optimizers", label: "优化器", permissions: ["campaigns.create"] },
      { href: "/copilot", label: "Copilot", permissions: ["campaigns.create"] },
      { href: "/newsletter", label: "Newsletter", permissions: ["campaigns.create"] }
    ]
  },
  {
    key: "reports",
    label: "报告",
    icon: <IconHome />,
    links: [
      { href: "/analytics", label: "访客分析", permissions: ["reports.view"] },
      { href: "/conversions", label: "转化事件", permissions: ["reports.view"] },
      { href: "/billings", label: "账单", permissions: ["campaigns.create"] }
    ]
  },
  {
    key: "referral",
    label: "推广返佣",
    icon: <IconSend />,
    links: [
      { href: "/referral-links", label: "推荐链接", permissions: ["campaigns.create"] },
      { href: "/commissions", label: "佣金", permissions: ["campaigns.create"] },
      { href: "/withdrawals", label: "提现", permissions: ["campaigns.create"] }
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

type PeerSubmenu = {
  label: string;
  href: string;
  permissions?: string[];
};

type PeerSubmenuGroup = {
  label?: string;
  items: PeerSubmenu[];
};

const peerMainNav = [
  { key: "workspace", label: "控制面板", href: "/dashboard", icon: <IconHome /> },
  { key: "campaigns", label: "广告系列", href: "/campaigns", icon: <IconSend /> },
  { key: "channels", label: "渠道", href: "/channels/facebook", icon: <IconGlobe /> },
  { key: "media", label: "素材库", href: "/media-assets", icon: <IconGallery /> },
  { key: "resources", label: "资源", href: "/strategies", icon: <IconSetting /> },
  { key: "reports", label: "报告", href: "/analytics", icon: <IconHome /> },
  { key: "referral", label: "推广返佣", href: "/referral-links", icon: <IconSend /> },
  { key: "system", label: "系统管理", href: "/admin/users", icon: <IconSetting />, permissions: ["users.manage"] }
];

const peerSubmenus: Record<string, PeerSubmenuGroup[]> = {
  workspace: [{ items: [{ label: "控制面板", href: "/dashboard", permissions: ["reports.view"] }] }],
  campaigns: [{ items: [{ label: "广告系列", href: "/campaigns", permissions: ["campaigns.create"] }] }],
  channels: [
    {
      label: "Facebook",
      items: [
        { label: "广告账户", href: "/channels/facebook?resource=ad_accounts", permissions: ["ad_accounts.view"] },
        { label: "商务管理平台", href: "/channels/facebook?resource=business_managers", permissions: ["ad_accounts.view"] },
        { label: "主页", href: "/channels/facebook?resource=pages", permissions: ["ad_accounts.view"] },
        { label: "像素", href: "/channels/facebook?resource=pixels", permissions: ["ad_accounts.view"] },
        { label: "应用", href: "/channels/facebook?resource=apps", permissions: ["ad_accounts.view"] }
      ]
    },
    {
      label: "TikTok",
      items: [
        { label: "账户", href: "/channels/tiktok?resource=accounts", permissions: ["ad_accounts.view"] },
        { label: "商务中心", href: "/channels/tiktok?resource=business_centers", permissions: ["ad_accounts.view"] },
        { label: "广告主", href: "/channels/tiktok?resource=advertisers", permissions: ["ad_accounts.view"] },
        { label: "Catalog", href: "/channels/tiktok?resource=catalogs", permissions: ["ad_accounts.view"] },
        { label: "Feed", href: "/channels/tiktok?resource=feeds", permissions: ["ad_accounts.view"] },
        { label: "商品", href: "/channels/tiktok?resource=products", permissions: ["ad_accounts.view"] },
        { label: "App", href: "/channels/tiktok?resource=apps", permissions: ["ad_accounts.view"] }
      ]
    },
    {
      label: "资产",
      items: [
        { label: "渠道授权", href: "/integrations", permissions: ["ad_accounts.view"] },
        { label: "广告账户总览", href: "/ad-accounts", permissions: ["ad_accounts.view"] },
        { label: "渠道资产", href: "/platform-assets", permissions: ["ad_accounts.view"] }
      ]
    }
  ],
  media: [
    {
      items: [
        { label: "素材库", href: "/media-assets", permissions: ["media.manage"] },
        { label: "文案库", href: "/copywritings", permissions: ["copywriting.manage"] },
        { label: "创意库", href: "/creatives", permissions: ["media.manage", "copywriting.manage"] }
      ]
    }
  ],
  resources: [
    {
      items: [
        { label: "策略模板", href: "/strategies", permissions: ["strategies.manage"] },
        { label: "受众库", href: "/targetings", permissions: ["targeting.manage"] },
        { label: "落地页", href: "/landing-pages", permissions: ["campaigns.create"] },
        { label: "推广项目", href: "/offers", permissions: ["campaigns.create"] },
        { label: "域名", href: "/domains", permissions: ["campaigns.create"] },
        { label: "需求池", href: "/demands", permissions: ["campaigns.create"] },
        { label: "店铺", href: "/stores", permissions: ["campaigns.create"] },
        { label: "工具", href: "/tools", permissions: ["campaigns.create"] },
        { label: "优化器", href: "/optimizers", permissions: ["campaigns.create"] },
        { label: "Copilot", href: "/copilot", permissions: ["campaigns.create"] },
        { label: "Newsletter", href: "/newsletter", permissions: ["campaigns.create"] }
      ]
    }
  ],
  reports: [
    {
      items: [
        { label: "Analytics", href: "/analytics", permissions: ["reports.view"] },
        { label: "Conversions", href: "/conversions", permissions: ["reports.view"] },
        { label: "账单", href: "/billings", permissions: ["campaigns.create"] }
      ]
    }
  ],
  referral: [
    {
      items: [
        { label: "推荐链接", href: "/referral-links", permissions: ["campaigns.create"] },
        { label: "佣金", href: "/commissions", permissions: ["campaigns.create"] },
        { label: "提现", href: "/withdrawals", permissions: ["campaigns.create"] }
      ]
    }
  ],
  system: [
    {
      items: [
        { label: "系统用户", href: "/admin/users", permissions: ["users.manage"] },
        { label: "团队管理", href: "/admin/teams", permissions: ["users.manage"] },
        { label: "员工管理", href: "/admin/employees", permissions: ["employees.manage"] },
        { label: "权限角色", href: "/admin/permissions", permissions: ["roles.manage"] },
        { label: "开发者密钥", href: "/admin/platform-configs", permissions: ["system.config.manage"] }
      ]
    }
  ]
};

function hrefPath(href: string) {
  return href.split("?")[0];
}

function isPeerSubmenuActive(href: string, pathname: string) {
  const [path, query] = href.split("?");
  if (path !== pathname) return false;
  const expectedResource = query ? new URLSearchParams(query).get("resource") : null;
  if (!expectedResource) return true;
  const currentResource =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("resource") : null;
  if (currentResource) return currentResource === expectedResource;
  if (path === "/channels/facebook") return expectedResource === "ad_accounts";
  if (path === "/channels/tiktok") return expectedResource === "advertisers";
  return false;
}

export function AdminShell({ title, description, actions, children, pageMode = "default" }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(() => getCachedMe(getAccessToken()));
  const [authChecked, setAuthChecked] = useState(() => Boolean(getCachedMe(getAccessToken())));
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsAcknowledged, setNotificationsAcknowledged] = useState(false);
  const [language, setLanguage] = useState("ZH");

  const activeSectionKey = useMemo(
    () =>
      sections.find((section) =>
        section.links.some((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
      )?.key ?? "workspace",
    [pathname]
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
  const grantedPermissions = new Set(me?.permissionCodes ?? []);
  const visibleMainNav = peerMainNav.filter(
    (item) => !item.permissions || item.permissions.every((permission) => grantedPermissions.has(permission))
  );
  const visibleSubmenuGroups = (peerSubmenus[activeSectionKey] ?? [])
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permissions || item.permissions.every((permission) => grantedPermissions.has(permission))
      )
    }))
    .filter((group) => group.items.length > 0);
  const showSubmenu = pageMode !== "dashboard" && activeSectionKey !== "workspace" && visibleSubmenuGroups.length > 0;

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
    <div className="peer-admin-layout">
      <header className="peer-global-header">
        <div className="peer-brand" onClick={() => router.push("/dashboard")} role="button" tabIndex={0}>
          <div className="semi-admin-logo">WZ</div>
          <div>
            <strong>WzzAds</strong>
            <span>广告运营中台</span>
          </div>
        </div>
        <nav aria-label="主导航" className="peer-global-nav">
          {visibleMainNav.map((item) => (
            <button
              className={`peer-global-nav-item ${activeSectionKey === item.key ? "active" : ""}`}
              key={item.key}
              onClick={() => {
                router.prefetch(item.href);
                router.push(item.href);
              }}
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="peer-header-tools">
          <form className="global-search peer-global-search" onSubmit={submitSearch}>
              <IconSearch />
              <input
                aria-label="全局搜索"
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)}
                onChange={(event) => setSearchTerm(event.target.value)}
                onFocus={() => {
                  if (searchTerm.trim()) setSearchOpen(true);
                }}
                placeholder="搜索"
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
          <button className="header-tool language-tool" onClick={toggleLanguage} title={`语言：${language}`} type="button">
              <IconGlobe />
              <IconChevronDown />
          </button>
          <div className="notification-wrap">
            <button
              className="header-tool icon-tool"
              onClick={() => {
                setNotificationOpen((current) => !current);
                setAccountOpen(false);
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
          <div className="peer-account-wrap">
            <button
              aria-expanded={accountOpen}
              className="peer-account-button"
              onClick={() => {
                setAccountOpen((current) => !current);
                setNotificationOpen(false);
              }}
              title={`${accountName} / ${teamName}${roleName ? ` / ${roleName}` : ""}`}
              type="button"
            >
              <Avatar size="small" color="blue">
                {accountName.slice(0, 1).toUpperCase()}
              </Avatar>
            </button>
            {accountOpen ? (
              <div className="peer-account-popover">
                <strong>{accountName}</strong>
                <span>
                  {teamName}
                  {roleName ? ` / ${roleName}` : ""}
                  {currentEmployee?.employeeNo ? ` / ${currentEmployee.employeeNo}` : ""}
                </span>
                <button onClick={logout} type="button">退出登录</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className={`admin-content semi-admin-content ${pageMode === "dashboard" ? "peer-dashboard-content" : ""}`}>
        {pageMode !== "dashboard" ? (
          <div className="peer-breadcrumb">
            <button onClick={() => router.push("/dashboard")} type="button">控制台</button>
            <span>/</span>
            <span>{peerMainNav.find((item) => item.key === activeSectionKey)?.label ?? "工作区"}</span>
            <span>/</span>
            <strong>{title}</strong>
          </div>
        ) : null}
          <div className="page-heading semi-page-heading">
            <div>
              <h1>{title}</h1>
              {description ? <p>{description}</p> : null}
            </div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </div>
          <div className={`peer-page-layout ${showSubmenu ? "" : "without-submenu"}`}>
            {showSubmenu ? (
              <aside aria-label="页面导航" className="peer-submenu">
                {visibleSubmenuGroups.map((group, index) => (
                  <div className="peer-submenu-group" key={`${group.label ?? "group"}-${index}`}>
                    {group.label ? <div className="peer-submenu-label">{group.label}</div> : null}
                    <div className="peer-submenu-items">
                      {group.items.map((item) => {
                        const active = isPeerSubmenuActive(item.href, pathname);
                        return (
                          <button
                            className={`peer-submenu-item ${active ? "active" : ""}`}
                            key={item.href}
                            onClick={() => {
                              router.prefetch(hrefPath(item.href));
                              router.push(item.href);
                            }}
                            type="button"
                          >
                            <span>{item.label}</span>
                            {active ? <i aria-hidden="true" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </aside>
            ) : null}
            <section className="peer-page-content">{children}</section>
          </div>
        </main>
    </div>
  );
}
