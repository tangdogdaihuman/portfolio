# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

唐子航个人 CG 作品集 — Next.js 16 App Router + Tailwind v4 + Turso(libsql) + Cloudflare R2。域名 `tangzihang.top`，Vercel 部署，Cloudflare CDN 代理。

## 命令

```bash
npm run dev        # next dev
npm run build      # next build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run db:push    # 手动推送 schema（lib/db.ts 已自迁移，通常不需要）
```

无 test 脚本。验证顺序：`lint` → `typecheck` → `build`。

## 架构

```
app/page.tsx → components/home-client.tsx（首页纯客户端，fetch + 30s 轮询 + visibilitychange 刷新）
app/admin/page.tsx（后台单文件：作品管理/编辑/介绍/详情分段/存储统计）
app/api/**/route.ts（REST API，写操作统一先 await requireAuth(req)）
lib/db.ts    — Turso 延迟初始化(Proxy) + 首次访问自动 ALTER TABLE 迁移
lib/auth.ts  — HMAC-SHA256 cookie 签发/验证
lib/r2.ts    — S3Client + deleteFromR2()
lib/image.ts — Sharp 800px webp q85
proxy.ts     — Next 16 proxy（不是 middleware），拦截 /admin/*，验证 cookie 或 ?key= 参数
```

## 数据模型

`works`（id, title, description, tags 逗号字符串, image_url, thumb_url, pinned, sort_order, work_date, image_size, crop_x, crop_y）→ `work_images`（work_id 外键，级联删除）。`intro` / `details` / `detail_sections` 各为单行/多行内容表。

API 层 `tags` 用 `tagsToArray()`/`tagsToString()` 转换，库里存逗号字符串。

## 图片上传流（预签名，绕过 Vercel 4.5MB 限制）

1. `POST /api/upload/presigned` → 拿到 `{uploadUrl, originalKey}`
2. `PUT` 直传原图到 R2
3. `POST /api/upload/process` → 服务端下载 → Sharp 缩略图 → 上传 R2 → 返回 `{imageUrl, thumbUrl}`

`originalKey` 必须以 `originals/` 开头。

## 认证

- `/admin` 受 `proxy.ts` 保护；`/admin/login` 和 `/api/auth/login` 放行
- 支持 `/admin?key=...` 一次性书签登录
- `ADMIN_SECRET_KEY` 缺失时 proxy 直接放行（本地开发常见）

## 关键约束

- **永不使用 `fs.writeFile`**：Vercel 无可写磁盘
- Sharp、`@libsql/client`、R2/S3、`crypto` 只能在服务端，禁止混入 `'use client'`
- Tailwind v4 无 `tailwind.config.ts`，主题变量在 `app/globals.css` 的 `@theme inline`
- Framer Motion：`spring` 统一 `damping: 28 stiffness: 200`
- `proxy.ts` 不要改回 middleware（Next 16 约定）
- 表单状态用对象整体替换，别用函数式 `setState`

## 易漏点

- `scripts/push-schema.ts` 不是完整 schema 真相（缺 `details`、`detail_sections`、`crop_x/y`），改 schema 同步检查 `lib/db.ts`
- `components/home-client.tsx` 本地重新定义了 `Work` 类型，和 `lib/types.ts` 不同源——改返回字段要同步两边
- 删除作品/图片时要同时清 R2，检查 `app/api/works/[id]/route.ts` 和图片删除路由
- `components/lightbox.tsx` 和 `components/work-grid.tsx` 是死代码，前端逻辑全在 `home-client.tsx`
