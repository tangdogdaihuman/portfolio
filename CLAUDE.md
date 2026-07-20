# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

唐子航个人 CG 作品集 — Next.js 16 App Router + Tailwind v4 + Turso(libsql) + Cloudflare R2。域名 `tangzihang.top`，Vercel 部署，Cloudflare CDN 代理。

## 命令

```bash
npm run dev              # next dev
npm run build            # next build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run db:push          # 手动推送 schema（lib/db.ts 已自迁移，通常不需要）
npm run test:schema      # 校验 lib/schema.ts 是唯一 schema 来源
npm run test:smoke       # HTTP 冒烟（首页/API/管理端 CRUD 链路）
npm run test:smoke:prod  # 同上，针对生产环境
npm run test:e2e         # Playwright（自动起本地 dev + 临时 SQLite DB）
```

CI 验证顺序：`lint` → `typecheck` → `test:schema` → `build` → `test:e2e`。PR 和 push master 触发。

## 架构

```
app/page.tsx → components/home-client.tsx（首页纯客户端，fetch + 5min 轮询 + visibilitychange 刷新 30s 节流）
app/admin/page.tsx → components/admin/admin-page-client.tsx（后台 SPA：5 个标签页，子组件在 components/admin/）
app/api/**/route.ts（REST API，写操作先 requireSameOrigin(req) → requireAuth(req)）
app/work/[id]/page.tsx（作品详情页，SSR + generateMetadata OG 标签）
lib/schema.ts — 数据库 schema 单一来源（BASE_SCHEMA_SQL + COLUMN_PATCHES + RECORDED_MIGRATIONS）
lib/db.ts    — Turso 延迟初始化(Proxy) + 首次访问自动 runMigrations()
lib/auth.ts  — HMAC-SHA256 cookie 签发/验证
lib/r2.ts              — S3Client + deleteFromR2()
lib/r2-delete-jobs.ts  — enqueueR2DeleteInTransaction() 事务内排队 + processR2DeleteJobs() 清理
lib/image.ts — Sharp 800px webp q85
proxy.ts     — Next 16 proxy（不是 middleware），拦截 /admin/:path*，验证 cookie 或 ?key= 参数
```

### API 安全层

`lib/api-response.ts`：`ok(data)` / `fail(code, msg, status)` 统一返回格式。
`lib/api-security.ts`：`requireSameOrigin()` 检查 Origin 头；`rateLimit()` 按 IP 令牌桶限流。
`lib/idempotency-store.ts`：内存幂等缓存，防重复提交。
`lib/audit-log.ts`：写入 `audit_logs` 表。
`lib/monitoring.ts`：`reportApiError()` / `reportMetric()` 结构化日志，可选 webhook 推送。

## 数据模型

**`lib/schema.ts` 是 schema 唯一真相来源。** 改表结构只改这个文件。`lib/db.ts` 和 `scripts/push-schema.ts` 都引用它，`test:schema` 验证这一点。

核心表：
- `works` — id, title, description, tags(逗号串), software(逗号串), image_url, thumb_url, pinned, sort_order, work_date, image_size, size_weight, created_at, updated_at
- `work_images` — id, work_id(关联 works.id，由 API 维护), image_url, thumb_url, media_type, sort_order, image_size, created_at
- `intro` — id(固定=1), content, tagline, updated_at
- `details` — id(固定=1), content, updated_at
- `detail_sections` — id, title, content, sort_order, created_at, updated_at
- `schema_migrations` — version, applied_at（迁移记录）
- `audit_logs` — id, scope, actor, path, method, meta, created_at
- `r2_delete_jobs` — id, urls_json, attempts, next_run_at, last_error, created_at

`tags` 和 `software` 在库内存逗号字符串，API 层通过 `tagsToArray()`/`tagsToString()` 转换返回数组。`lib/work-mappers.ts` 的 `rowToWork()` 统一做 DB 行 → TypeScript 类型映射。

`intro.tagline`、`works.software`、`works.size_weight`、`work_images.media_type` 是后期 COLUMN_PATCHES 加的列。

## 图片上传流（预签名，绕过 Vercel 4.5MB 限制）

1. `POST /api/upload/presigned` → 拿到 `{uploadUrl, originalKey}`
2. `PUT` 直传原图到 R2
3. `POST /api/upload/process` → 服务端下载 → Sharp 缩略图 → 上传 R2 → 返回 `{imageUrl, thumbUrl}`

`originalKey` 必须以 `originals/` 开头。上传限制：图像 50MB，视频 500MB（`lib/upload-policy.ts`）。客户端统一走 `lib/upload-client.ts` 的 `uploadImageToR2()`。

## R2 删除（异步）

删除作品/图片时不直接删 R2 文件，而是在事务内调用 `enqueueR2DeleteInTransaction()` 写入 `r2_delete_jobs` 表。由外部 cron（`GET /api/cron/r2-delete?limit=20`，`CRON_SECRET` 认证）按回退重试策略异步清理。`.github/workflows/r2-delete-cron.yml` 每 15 分钟触发一次。

## 认证（三种登录方式共存）

`/admin` 受 `proxy.ts` 保护；`/admin/login` 和 `/api/auth/login` 放行。登录页支持三 Tab 切换：

| 方式 | 路由 | 实现 |
|------|------|------|
| TOTP 动态口令 | `{token}` → `verifyTotp()` | `lib/totp.ts`（otplib），30 秒刷新，离线可用。密钥 `TOTP_SECRET` 存 `.env.local`，通过 `app/admin/totp-setup/` 扫码绑定 |
| 邮箱验证码 | `{code}` → `verifyCode()` | `lib/email.ts`（nodemailer） + `lib/verification-codes.ts`（内存存储），仅允许 `1193662756@qq.com`。`app/api/auth/send-code/` 发送，30s 间隔限流 |
| 管理密钥 | `{key}` → `timingSafeEqual` | 原有 `ADMIN_SECRET_KEY` |

- `ADMIN_SECRET_KEY` 缺失时 `/admin` 返回 503。排查"本地后台打不开"先查此变量
- 支持 `/admin?key=...` 一次性书签登录，验证后签发 `admin_token` cookie
- QQ 邮箱 SMTP 直连真实 IP（`120.232.69.34`）绕过本地 DNS 污染，见 `lib/email.ts`

## 关键约束

- **永不使用 `fs.writeFile`**：Vercel 无可写磁盘
- Sharp、`@libsql/client`、R2/S3、`crypto`、`nodemailer`、`otplib` 只能在服务端，禁止混入 `'use client'`
- Tailwind v4 无 `tailwind.config.ts`，主题变量在 `app/globals.css` 的 `@theme inline`，PostCSS 只配 `@tailwindcss/postcss`
- Framer Motion：`spring` 统一 `damping: 28 stiffness: 200`
- `proxy.ts` 不要改回 middleware（Next 16 约定）
- 表单状态用对象整体替换，别用函数式 `setState`（`components/admin/work-form-state.ts` 管理不可变更新）
- 验证码存储在进程内存（`lib/verification-codes.ts`），重启丢失；生产多实例需改为 Upstash
- `lib/email.ts` 的 QQ SMTP 使用硬编码真实 IP 绕过 DNS 污染，修改邮件配置时勿恢复为域名解析

## 环境变量

必填（见 `.env.example`）：`DATABASE_URL`、`DATABASE_AUTH_TOKEN`、R2 五件套（`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET_NAME`、`R2_PUBLIC_URL`）、`ADMIN_SECRET_KEY`。

邮箱验证码新增（可选，不与 TOTP 冲突）：`EMAIL_HOST`、`EMAIL_PORT`(587)、`EMAIL_USER`(1193662756@qq.com)、`EMAIL_PASS`（QQ 邮箱授权码，非 QQ 密码）。

TOTP 新增（可选）：`TOTP_SECRET`，通过 `npx tsx scripts/generate-totp.ts` 生成或访问 `/admin/totp-setup` 扫码获取。

可选：`CRON_SECRET`、`UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`、`MONITORING_WEBHOOK_URL`、`NEXT_PUBLIC_BASE_URL`。

## 易漏点

- 改 schema 只改 `lib/schema.ts`，别直接改 `lib/db.ts` 或 `scripts/push-schema.ts`
- 删除作品/图片走异步 R2 清理（`r2_delete_jobs` + cron retry），不是同步删。改删除逻辑时检查 `app/api/works/[id]/route.ts` 和图片删除路由
- `lib/types.ts` 的 `Work` 类型是公共类型，`home-client.tsx` 从它导入——改返回字段只需改 `lib/types.ts` 和 `lib/work-mappers.ts`
- 首页轮询间隔是 **5 分钟**（300000ms），`visibilitychange` 刷新有 30s 节流
- 编辑操作有乐观并发控制：发送 `expectedUpdatedAt`，不匹配返回 409
