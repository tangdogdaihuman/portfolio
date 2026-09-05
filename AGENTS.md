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
- 移动端动效性能的设计决策（极光 canvas 降帧降分辨率、粗指针玻璃模糊降载、桌面零改动）记录在 `.trae/documents/mobile-performance-optimization.md`，改 `components/aurora-canvas.tsx` 或玻璃样式前先读。

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
- e2e 基建：`playwright.config.ts` 自动起 dev server（127.0.0.1:3000），注入临时 `file:./e2e.db` SQLite + 假 R2 环境变量；`fullyParallel: false`；共享 helper 在 `e2e/admin-api.ts`；10 个 spec（portfolio / home-gallery / r2-delete / upload-policy / audit-regressions / theme-toggle / desktop-cursor / mobile-hero-effects / work-form-state / smoke-settings.spec.js）。
- 端口冲突：dev 与 e2e 固定 3000 端口，与本机 UE MCP（localhost:3000）冲突；UE 编辑器开着时手动起 dev 用 `npx next dev -p 3001`，跑 e2e 前先确认 3000 空闲。

## 数据与迁移
- `lib/db.ts` 的 `db` 是 `Proxy`；首次 DB 访问自动 `runMigrations()`。
- **`lib/schema.ts` 是 schema 单一来源**：`BASE_SCHEMA_SQL` + `COLUMN_PATCHES` + `RECORDED_MIGRATIONS`。`lib/db.ts` 和 `scripts/push-schema.ts` 都引用它；`test:schema` 会验证这一点。改 schema 只改 `lib/schema.ts` 一处。
- `tags`、`software` 在库里是逗号字符串；`lib/db.ts` 的 `tagsToArray()` / `tagsToString()` 负责转换。`lib/work-mappers.ts` 的 `rowToWork()` 统一做 DB 行到类型的映射。
- 公共类型在 `lib/types.ts`（前台 `home-client.tsx` 也从这里导入 `Work`）；改 API 返回字段只动 `lib/types.ts` + `lib/work-mappers.ts` 两处。
- 数据表：`works`、`work_images`（work_id 仅建索引 `idx_work_images_work_id_sort`，无外键约束，关联由 API 维护）、`intro`、`details`、`detail_sections`、`schema_migrations`、`audit_logs`、`r2_delete_jobs`、`visits`、`rate_limits`、`verification_codes`。
- `works.software` 字段与 `tags` 一样是逗号串，API 返回数组。
- `COLUMN_PATCHES` 共 7 条后期 patch 列（`work_date`、`software`、`image_size`、`media_type`、`intro.tagline`、`works.size_weight` 等，见 `lib/schema.ts`）。
- **缓存与新鲜度**：`app/page.tsx`、`app/work/[id]/page.tsx` 以及被首页轮询的三个公开 GET（`/api/works`、`/api/intro`、`/api/detail-sections`）统一 `revalidate: 300` 并挂 `works` / `work:<id>` / `intro` / `detail-sections` 标签。个人站内容每周才变，写路由全都做了 `revalidateTag`，所以长 TTL 不影响新鲜度，只是让低流量站不再频繁把冷实例的迁移+查询全跑一遍。
- **服务端取数失败必须抛错，不要 catch 成空值返回**：`unstable_cache` 会把 catch 分支的返回值当成功结果缓存住（30 秒起），一次数据库抖动就变成全站空作品集；抛错会走 `app/error.tsx`，且 ISR 期间会继续供出上一份好数据。

## 上传与存储约束
- 图片上传固定走 `lib/upload-client.ts` 的 `uploadImageToR2()`：`POST /api/upload/presigned` → `PUT` 原图到 R2 → `POST /api/upload/process` 生成 webp 缩略图。视频文件跳过 process 步，缩略图直接用原图 URL。
- `/api/upload/process` 要求 `originalKey` 必须以 `originals/` 开头。
- 上传限制：图片 50MB / 视频 500MB，定义在 `lib/upload-policy.ts`（e2e `upload-policy.spec.ts` 有覆盖）。
- 面向 Vercel/R2；不要引入本地文件持久化，服务端不依赖可写磁盘。
- `Sharp`、`@libsql/client`、R2/S3、`crypto` 只能留在服务端文件，不能混进 `'use client'`。
- **R2 删除是异步的**：删除作品/图片时在事务内调用 `enqueueR2DeleteInTransaction()` 写入 `r2_delete_jobs` 表；`processR2DeleteJobs()` 由 cron（`/api/cron/r2-delete`）按退避重试处理，也在多个写路由内联同步调用做 opportunistic 清理。`enqueueR2Delete()` 由 `/api/upload/cleanup` 与整批被拒的上传载荷调用；删除前一定先用 `findReferencedUrls()` 复核库内引用，所以整批 URL 可以安全入队。
- **媒体 URL 只在 `lib/media-url.ts` 一处解释**：`normalizeMediaUrl()` 在 `lib/work-mappers.ts` 的行映射出口把历史 `*.r2.dev` 地址统一成 `R2_PUBLIC_URL` 的域名（库里数据不需要改写）；`mediaUrlToKey()`/`urlToKey()` 按 `originals/`、`thumbnails/` 前缀 + 自有域名解析对象键。新增图片字段务必走 mapper，别在组件里自己拼域名；判定"自有域名"时记得把 `R2_PUBLIC_URL` 本身算进去，否则删除会被静默跳过。
- **上传对象必须带 `CacheControl: IMMUTABLE_CACHE_CONTROL`**（`public, max-age=31536000, immutable`）：对象键是一次性 cuid 永不覆写；没有这个头，Cloudflare 对 R2 自定义域名不会做边缘缓存（实测一直 `cf-cache-status: DYNAMIC`）。另需在 Cloudflare **zone 的 Cache Rules** 里建规则开启边缘缓存（R2 面板里没有缓存开关）：匹配 Hostname equals `cdn.tangzihang.top`（只圈图片子域，主站 HTML 由 Vercel ISR 自管），Then 设 Cache eligibility = Eligible for cache、Edge TTL = Override origin 30 天（存量对象没有 Cache-Control 头，靠 override 才能命中）。
- **作品至少保留一张图片**：`DELETE /api/works/images/[imageId]` 在事务内先 `COUNT(*)`，删到最后一张返回 409。不要退回成"删除后把 `works.image_url` 写成空串"——空串能过 NOT NULL，会让首页与 OG 变成空封面，而后台没有补图入口。

## 鉴权与后台
- `/admin` 保护依赖 `proxy.ts`，不是 `middleware.ts`。Next 16 下别改回 middleware。
- `/admin?key=...` 支持书签登录（URL 可重复使用，每次访问重发 7 天 `admin_token` cookie）；`proxy.ts` 验证 `ADMIN_SECRET_KEY` 后签发 cookie。`/admin/login` 与 `/api/auth/login` 显式放行。
- `ADMIN_SECRET_KEY` 缺失时，`proxy.ts` 对 `/admin` 路径返回 503；非 admin 路径放行。排查"本地后台打不开"先查此变量。
- API 写操作约定：先 `requireSameOrigin(req)` → 再 `requireAuth(req)`；返回值非空时直接返回该 `NextResponse`。
- 写路由成功后必须调 `revalidatePath("/")`（作品类再加 `revalidatePath(`/work/${id}`)`）+ `revalidateTag`，新增写路由照做。
- 乐观并发控制：更新类接口（`works/[id]`、`works/[id]/save`、`works/reorder`）接受 `expectedUpdatedAt`，与库中 `updated_at` 不匹配返回 409；e2e 有覆盖。该字段是 `.min(1).optional()`，空串会被判 400，客户端在没有版本号时应**省略该字段**而不是传空串。
- **`updated_at` 的推进表达式只能用 `strftime('%Y-%m-%d %H:%M:%f', ...)`**（见 `lib/db.ts` 的 `TOUCH_WORK_UPDATED_AT_SQL`）：`datetime()` 会静默截断毫秒，同秒内 bump 不出更大值；而 `'+1 millisecond'` 不是合法的 SQLite 修饰符单位（毫秒要写成 `'+0.001 seconds'`），且标量 `MAX()` 任一参数为 NULL 就整体返回 NULL，会把 `updated_at` 写空撞 NOT NULL。
- **写完要回给客户端的新版本号必须在同一事务里读回**（或 `RETURNING`）。条件 UPDATE 之后再单独 `SELECT updated_at` 会在并发写交错时把别人会话的时间戳发回去，导致下一次保存通过校验却覆盖对方的修改。
- 可选 Upstash Redis 做跨实例限流（`lib/rate-limit-store.ts`）；未配置时默认走 Turso `rate_limits` 表。
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
- 画廊状态用可判别分支：`loadingWorks`（重试中且无内容）/ `works.length === 0`（作品集为空或加载失败）/ `filtered.length === 0`（筛选无匹配，带清除筛选入口）/ 正常网格；"已有内容但更新失败"另在网格上方独立提示。别把 error 和 empty 塞进同一个分支。
- 中文字体策略：正文走设备自带字体（`--font-body` 里 `PingFang SC`/`Microsoft YaHei` 优先，零下载）；标题中文 `Noto Serif SC` 仍走 `app/layout.tsx` 的外部 `<link>`，只请求 400/700/800。**`next/font` 在 Next 16 下无法自托管中文切片**——其 `font-data.json` 里 CJK 字体没有中文子集名，`subsets: ["chinese-simplified"]` 通不过类型检查；要彻底自托管得另写构建期拉取脚本。
- framer-motion：`layoutId`/`layout`/`drag` 需要投影特性，`domAnimation` 不含它们。首页与详情页灯箱统一用 `<LazyMotion features={loadMotionFeatures}>`（`components/motion-features.ts`，异步取 `domMax`）；从根入口 import `motion` 会把完整特性包拉进首屏。
- 自定义光标：纯 DOM 操作，不触发 React 渲染。滚动时隐藏但必须在停手 ~140ms 后自动恢复（原生光标已被隐藏，不能等下一次 mousemove 才回来）；文本输入框与 `cursor-zoom-in` 处保留原生光标并隐藏光点，`app/globals.css` 里那组 `hide-native-cursor` 例外规则别退回成 `cursor: none !important`。
- Tailwind v4 没有 `tailwind.config.*`；主题变量在 `app/globals.css` 的 `@theme inline`，PostCSS 只配 `@tailwindcss/postcss`。
- 代码不加注释；新增代码英文命名。
- `app/admin/page.tsx` 表单状态用对象整体替换，别用函数式 `setState`；不可变更新逻辑集中在 `components/admin/work-form-state.ts`。
- 子目录约定：`components/admin/AGENTS.md`（禁引 server-only 模块、保持表单对象替换风格）、`app/work/AGENTS.md`（详情页数据读取保持服务端，不加客户端 fetch）。改对应目录前先读。

## 环境
- 必填变量见 `.env.example`：`DATABASE_URL`、`DATABASE_AUTH_TOKEN`、R2 一组、`ADMIN_SECRET_KEY`。
- 可选：`NEXT_PUBLIC_BASE_URL`、`UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`、`CRON_SECRET`、`MONITORING_WEBHOOK_URL`、`TOTP_SECRET`、`EMAIL_HOST`/`PORT`/`USER`/`PASS`（QQ SMTP 验证码登录）、`SMOKE_BASE_URL`、`SMOKE_ALLOW_WRITES`、`ADMIN_KEY`（smoke 测试优先读，回退到 `ADMIN_SECRET_KEY`）。
- 部署在 Vercel，绑定 GitHub 自动部署；域名 `tangzihang.top` 走 Cloudflare 代理。
- 限流默认走 Turso `rate_limits` 表（多实例共享计数，存储故障时 fail-closed 返回 429 并报监控，防止限流被绕过）；配置了 `UPSTASH_REDIS_REST_*` 才改用 Redis。
- 客户端 IP 统一走 `lib/client-ip.ts` 的 `getClientIp()`（`cf-connecting-ip` → `x-vercel-forwarded-for` → `x-forwarded-for` → `x-real-ip`）。**禁止直接取 `x-forwarded-for` 首值**：Vercel 会把它覆写成直连对端 IP，CF 前置时就是每请求轮换的 CF 边缘节点 IP（2026-08 实测：限流桶键全是 CF IP，登录限流因此失效）。
- 部署命令：`vercel --prod --yes`，网络不稳时 `git push` 触发自动部署。

## Git 约定
- 改动完成后自动 commit 并 push，无需确认。

## 修改时最容易漏的点
- 作品删除/图片删除走异步 R2 清理（`enqueueR2DeleteInTransaction` + cron retry），不是同步删。改相关接口时检查 `app/api/works/[id]/route.ts` 和图片删除路由。
- 仓库里有 `.next/`、`tsconfig.tsbuildinfo`、`.playwright-mcp/`、`test-results/`、`e2e.db*` 等生成产物；搜索和编辑时避开。
- `.github/workflows/ci.yml` 在 push/master 和 PR 上跑 `lint → typecheck → test:schema → build → test:e2e`。
- `.github/workflows/r2-delete-cron.yml` 每 15 分钟触发 R2 清理 cron，部署时需配 GitHub Secrets `CRON_ENDPOINT`、`CRON_SECRET`。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
