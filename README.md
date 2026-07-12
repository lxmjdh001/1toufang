# WzzAds

TikTok + Meta/Facebook 一键投放运营中台。

## 当前进度

已完成第一批基础骨架：

- pnpm monorepo
- Next.js Web
- Semi Design 中后台 UI
- NestJS API
- Prisma/PostgreSQL schema
- 注册申请
- 注册审核开通
- 邮箱登录
- 员工号登录
- SaaS 中后台布局
- 用户审核与用户状态管理
- 员工号管理
- 角色/权限管理页面
- 角色/权限/数据范围基础模型
- 登录日志和操作日志模型
- JWT 鉴权和权限守卫
- Meta/TikTok 渠道授权基础模块
- 广告账户基础模块
- 策略模板管理
- 受众库管理
- Campaign 草稿管理
- 素材库管理
- 文案库管理
- 创意库管理

## 本地启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备数据库

需要 PostgreSQL 和 Redis。

如果本机有 Docker：

```bash
docker compose -f docker/docker-compose.yml up -d
```

如果没有 Docker，请手动创建 PostgreSQL 数据库：

```text
postgresql://postgres:postgres@localhost:5432/one_toufang?schema=public
```

### 3. 生成 Prisma Client

```bash
pnpm db:generate
```

### 4. 执行数据库迁移

```bash
pnpm --filter @1toufang/database prisma migrate dev --schema prisma/schema.prisma --name init
```

### 5. 初始化本地管理员

```bash
pnpm --filter @1toufang/database db:seed
```

默认本地账号：

```text
邮箱：admin@wzzads.local
员工号：TF000001
密码：Admin123456!
```

### 6. 启动开发服务

```bash
pnpm dev:api
pnpm dev:web
```

默认地址：

- Web: http://localhost:3000
- Web 备用端口: http://localhost:3001
- API: http://localhost:4000/api
- Swagger: http://localhost:4000/api/docs

如果 `3000` 被其他本地项目占用，可以启动到 `3001`：

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/api pnpm --filter @1toufang/web exec next dev --webpack -p 3001
```

## 当前页面

- 首页：http://localhost:3000
- 邮箱登录：http://localhost:3000/login
- 员工号登录：http://localhost:3000/employee-login
- 注册申请：http://localhost:3000/register
- 工作台：http://localhost:3000/dashboard
- 用户审核：http://localhost:3000/admin/users
- 员工管理：http://localhost:3000/admin/employees
- 权限角色：http://localhost:3000/admin/permissions
- 渠道授权：http://localhost:3000/integrations
- 广告账户：http://localhost:3000/ad-accounts
- 策略模板：http://localhost:3000/strategies
- 受众库：http://localhost:3000/targetings
- Campaign 草稿：http://localhost:3000/campaigns
- 素材库：http://localhost:3000/media-assets
- 文案库：http://localhost:3000/copywritings
- 创意库：http://localhost:3000/creatives

## 当前 API 模块

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/employee-login`
- `GET /api/admin/users`
- `GET /api/admin/employees`
- `GET /api/permissions`
- `GET /api/permissions/roles`
- `GET /api/integrations`
- `GET /api/ad-accounts`
- `GET /api/strategies`
- `POST /api/strategies`
- `PATCH /api/strategies/:id`
- `DELETE /api/strategies/:id`
- `GET /api/targetings`
- `POST /api/targetings`
- `PATCH /api/targetings/:id`
- `DELETE /api/targetings/:id`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `PATCH /api/campaigns/:id`
- `DELETE /api/campaigns/:id`
- `GET /api/media-assets`
- `POST /api/media-assets`
- `PATCH /api/media-assets/:id`
- `DELETE /api/media-assets/:id`
- `GET /api/copywritings`
- `POST /api/copywritings`
- `PATCH /api/copywritings/:id`
- `DELETE /api/copywritings/:id`
- `GET /api/creatives`
- `POST /api/creatives`
- `PATCH /api/creatives/:id`
- `DELETE /api/creatives/:id`

## 常用校验

```bash
pnpm typecheck
pnpm build
```

## 当前注意事项

- 当前管理接口已经接入 JWT Guard 和权限码校验。
- 前端已接入 Semi Design；当前先迁移全局后台外壳，页面内部表格/表单会继续逐步替换为 Semi 组件。
- OAuth token exchange 还没有接入真实 Meta/TikTok API，当前先提供 OAuth URL 和本地资源管理骨架。
- 如果本机没有启动 PostgreSQL，则只能完成构建校验，不能执行迁移和 API 联调。
