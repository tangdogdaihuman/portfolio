# AGENTS.md

## 项目定位
- 唐子航个人 CG 作品集网站；单应用 Next.js 16 App Router 项目。
- 运行栈：React 19、TypeScript strict、Tailwind v4、Framer Motion、Turso(libsql)、Cloudflare R2、Sharp、Zod。

## 先看哪里
- 前台入口 `app/page.tsx`（服务端 `unstable_cache` 抓取初始数据）→ `components/home-client.tsx`（筛选、排序、展示）；5 分钟轮询、`visibilitychange` 刷新（30s 节流）、自定义光标等 hooks 在 `components/home-hooks.ts`（`useHomeDataRefresh` / `useCustomCursor`）。
- 作品详情页 `app/work/[id]/page.tsx`。
- 后台入口 `app/admin/page.tsx`（含 `admin/login`、`admin/totp-setup` 子路由）；子组件在 `components/admin/`。
- API 在 `app/api/**/route.ts`；数据库/鉴权封装在 `lib/db.ts`、`lib/auth.ts`、`proxy.ts`。
- SEO 已就绪：`app/sitemap.ts`、`app/robots.ts`、详情页 `generateMetadata` OG 标签；404 在 `app/not-found.tsx`。

## 开发命令
```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:push
npm run test:schema      # 校验 db.ts 和 push-schema.ts 是否共用一个 schema 源
npm run test:smoke       # HTTP 冒烟（首页 / API / 管理端 CRUD 链路）
npm run test:e2e         # Playwright（自动起本地 dev + 临时 SQLite）
npm run test:smoke:prod  # 对线上 tangzihang.top 跑冒烟（SMOKE_ALLOW_WRITES 控制是否写）
```
- 验证顺序：`lint` → `typecheck` → `test:schema` → `build` → `test:e2e`（CI 执行的顺序）。
- `db:push` 用 `.env.local` 直连 Turso；实际线上 db.ts 首次访问时自动迁移，通常不需要手动跑。
- 单跑测试：`npx playwright test e2e/portfolio.spec.ts` 跑单个文件；`npm run test:e2e -- -g "用例名"` 按名过滤；`SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke` 指定 smoke 目标。
- e2e 基建：`playwright.config.ts` 自动起 dev server（127.0.0.1:3000），注入临时 `file:./e2e.db` SQLite + 假 R2 环境变量；`fullyParallel: false`；共享 helper 在 `e2e/admin-api.ts`；8 个 spec（portfolio / r2-delete / upload-policy / theme-toggle / desktop-cursor / mobile-hero-effects / work-form-state / smoke-settings.spec.js）。

## 数据与迁移
- `lib/db.ts` 的 `db` 是 `Proxy`；首次 DB 访问自动 `runMigrations()`。
- **`lib/schema.ts` 是 schema 单一来源**：`BASE_SCHEMA_SQL` + `COLUMN_PATCHES` + `RECORDED_MIGRATIONS`。`lib/db.ts` 和 `scripts/push-schema.ts` 都引用它；`test:schema` 会验证这一点。改 schema 只改 `lib/schema.ts` 一处。
- `tags`、`software` 在库里是逗号字符串；`lib/db.ts` 的 `tagsToArray()` / `tagsToString()` 负责转换。`lib/work-mappers.ts` 的 `rowToWork()` 统一做 DB 行到类型的映射。
- 公共类型在 `lib/types.ts`（前台 `home-client.tsx` 也从这里导入 `Work`）；改 API 返回字段只动 `lib/types.ts` + `lib/work-mappers.ts` 两处。
- 数据表：`works`、`work_images`（work_id 仅建索引 `idx_work_images_work_id_sort`，无外键约束，关联由 API 维护）、`intro`、`details`、`detail_sections`、`schema_migrations`、`audit_logs`、`r2_delete_jobs`、`visits`、`rate_limits`、`verification_codes`。
- `works.software` 字段与 `tags` 一样是逗号串，API 返回数组。
- `COLUMN_PATCHES` 共 7 条后期 patch 列（`work_date`、`software`、`image_size`、`media_type`、`intro.tagline`、`works.size_weight` 等，见 `lib/schema.ts`）。

## 上传与存储约束
- 图片上传固定走 `lib/upload-client.ts` 的 `uploadImageToR2()`：`POST /api/upload/presigned` → `PUT` 原图到 R2 → `POST /api/upload/process` 生成 webp 缩略图。视频文件跳过 process 步，缩略图直接用原图 URL。
- `/api/upload/process` 要求 `originalKey` 必须以 `originals/` 开头。
- 上传限制：图片 50MB / 视频 500MB，定义在 `lib/upload-policy.ts`（e2e `upload-policy.spec.ts` 有覆盖）。
- 面向 Vercel/R2；不要引入本地文件持久化，服务端不依赖可写磁盘。
- `Sharp`、`@libsql/client`、R2/S3、`crypto` 只能留在服务端文件，不能混进 `'use client'`。
- **R2 删除是异步的**：删除作品/图片时在事务内调用 `enqueueR2DeleteInTransaction()` 写入 `r2_delete_jobs` 表；`processR2DeleteJobs()` 由 cron（`/api/cron/r2-delete`）按退避重试处理，也在多个写路由内联同步调用做 opportunistic 清理。`enqueueR2Delete()` 仅 `/api/upload/cleanup` 直接调用。

## 鉴权与后台
- `/admin` 保护依赖 `proxy.ts`，不是 `middleware.ts`。Next 16 下别改回 middleware。
- `/admin?key=...` 支持书签登录（URL 可重复使用，每次访问重发 7 天 `admin_token` cookie）；`proxy.ts` 验证 `ADMIN_SECRET_KEY` 后签发 cookie。`/admin/login` 与 `/api/auth/login` 显式放行。
- `ADMIN_SECRET_KEY` 缺失时，`proxy.ts` 对 `/admin` 路径返回 503；非 admin 路径放行。排查"本地后台打不开"先查此变量。
- API 写操作约定：先 `requireSameOrigin(req)` → 再 `requireAuth(req)`；返回值非空时直接返回该 `NextResponse`。
- 写路由成功后必须调 `revalidatePath("/")`（作品类再加 `revalidatePath(`/work/${id}`)`）+ `revalidateTag`，新增写路由照做。
- 乐观并发控制：更新类接口（`works/[id]`、`works/[id]/save`、`works/reorder`）接受 `expectedUpdatedAt`，与库中 `updated_at` 不匹配返回 409；e2e 有覆盖。
- 可选 Upstash Redis 做跨实例限流（`lib/rate-limit-store.ts`）；未配置时自动用进程内存。
- `app/api/auth/login` 支持三种登录：TOTP、邮箱验证码（QQ SMTP）、管理员密钥；涉及依赖 `nodemailer`、`otplib`、`qrcode`、`@paralleldrive/cuid2`。
- 邮箱验证码仅限 `1193662756@qq.com`，存 Turso `verification_codes` 表（多实例共享）：5 分钟有效期、单码 5 次尝试上限；发送侧双层限流 = `send-code`（3 次/分钟）+ `send-code-cooldown`（1 次/30 秒），都走共享限流存储。TOTP 绑定走 `/admin/totp-setup` 扫码，仓库里没有独立生成脚本。
- `lib/email.ts` 的 QQ SMTP 硬编码真实 IP 绕过本地 DNS 污染，改邮件配置时勿恢复为域名解析。

## API 安全辅助
- `lib/api-response.ts`：`ok(data)` / `fail(code, msg, status)` 统一返回。
- `lib/api-security.ts`：`requireSameOrigin()` 检查 Origin 头；`rateLimit()` 用 IP 做令牌桶。
- `lib/idempotency-store.ts`：内存幂等缓存，防重复提交。
- `lib/monitoring.ts`：`reportApiError()` / `reportMetric()` 结构化日志，可选 webhook。
- `lib/audit-log.ts`：DB 审计日志。

## 前端约定
- 首页 `components/home-client.tsx`：筛选、排序、marquee、hero 等展示逻辑。轮询、`visibilitychange` 刷新（30s 节流）、自定义光标抽到 `components/home-hooks.ts`；初始数据由 `app/page.tsx` 服务端 `unstable_cache` 抓取后通过 props 传入。
- 动画基线：`spring` 常用 `damping: 28`、`stiffness: 200`、`mass: 0.8`。
- 自定义光标：纯 DOM 操作，不触发 React 渲染。
- Tailwind v4 没有 `tailwind.config.*`；主题变量在 `app/globals.css` 的 `@theme inline`，PostCSS 只配 `@tailwindcss/postcss`。
- 代码不加注释；新增代码英文命名。
- `app/admin/page.tsx` 表单状态用对象整体替换，别用函数式 `setState`；不可变更新逻辑集中在 `components/admin/work-form-state.ts`。
- `components/admin/AGENTS.md` 有子目录约定（禁引 server-only 模块、保持表单对象替换风格），改后台组件前先读。

## 环境
- 必填变量见 `.env.example`：`DATABASE_URL`、`DATABASE_AUTH_TOKEN`、R2 一组、`ADMIN_SECRET_KEY`。
- 可选：`NEXT_PUBLIC_BASE_URL`、`UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`、`CRON_SECRET`、`MONITORING_WEBHOOK_URL`、`TOTP_SECRET`、`EMAIL_HOST`/`PORT`/`USER`/`PASS`（QQ SMTP 验证码登录）、`SMOKE_BASE_URL`、`SMOKE_ALLOW_WRITES`、`ADMIN_KEY`（smoke 测试优先读，回退到 `ADMIN_SECRET_KEY`）。
- 部署在 Vercel，绑定 GitHub 自动部署；域名 `tangzihang.top` 走 Cloudflare 代理。
- 限流默认走 Turso `rate_limits` 表（多实例共享计数，DB 故障时降级放行并报监控）；配置了 `UPSTASH_REDIS_REST_*` 才改用 Redis。
- 客户端 IP 统一走 `lib/client-ip.ts` 的 `getClientIp()`（`cf-connecting-ip` → `x-vercel-forwarded-for` → `x-forwarded-for` → `x-real-ip`）。**禁止直接取 `x-forwarded-for` 首值**：Vercel 会把它覆写成直连对端 IP，CF 前置时就是每请求轮换的 CF 边缘节点 IP（2026-08 实测：限流桶键全是 CF IP，登录限流因此失效）。
- 部署命令：`vercel --prod --yes`，网络不稳时 `git push` 触发自动部署。

## Git 约定
- 改动完成后自动 commit 并 push，无需确认。

## 修改时最容易漏的点
- 作品删除/图片删除走异步 R2 清理（`enqueueR2DeleteInTransaction` + cron retry），不是同步删。改相关接口时检查 `app/api/works/[id]/route.ts` 和图片删除路由。
- 仓库里有 `.next/`、`tsconfig.tsbuildinfo`、`.playwright-mcp/` 等生成产物；搜索和编辑时避开。
- `.github/workflows/ci.yml` 在 push/master 和 PR 上跑 `lint → typecheck → test:schema → build → test:e2e`。
- `.github/workflows/r2-delete-cron.yml` 每 15 分钟触发 R2 清理 cron，部署时需配 GitHub Secrets `CRON_ENDPOINT`、`CRON_SECRET`。
