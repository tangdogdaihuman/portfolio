# AGENTS.md

## 项目定位
- 唐子航个人 CG 作品集网站；单应用 Next.js 16 App Router 项目，不是 monorepo。
- 运行栈：React 19、TypeScript strict、Tailwind v4、Framer Motion、Turso(libsql)、Cloudflare R2、Sharp、Zod。

## 先看哪里
- 前台入口只有 `app/page.tsx` -> `components/home-client.tsx`。
- 后台入口是 `app/admin/page.tsx`；作品管理、介绍编辑、详情分段编辑、存储统计都堆在这一个大客户端组件里。
- API 主要在 `app/api/**/route.ts`；数据库和鉴权封装分别在 `lib/db.ts`、`lib/auth.ts`、`proxy.ts`。

## 开发命令
```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:push
```
- 没有 test 脚本；常用验证顺序是 `npm run lint` -> `npm run typecheck` -> `npm run build`。
- `db:push` 运行 `scripts/push-schema.ts`，它会用 `.env.local` 直连 Turso。

## 数据与迁移
- `lib/db.ts` 里的 `db` 是 `Proxy`；首次访问时会后台触发 `runMigrations()`，所以很多 schema 变更是“代码内自迁移”，不是独立 migration 文件。
- `initializeDb()` 和 `scripts/push-schema.ts` 不是当前 schema 的完整真相：例如代码里已有 `details`、`detail_sections`、`crop_x/crop_y`，但 `db:push` 还没完全覆盖这些列/表。改 schema 时要同时检查 `lib/db.ts` 和 `scripts/push-schema.ts`，别只改一处。
- `tags` 在库里是逗号字符串；API 层统一用 `tagsToArray()` / `tagsToString()` 转换。

## 上传与存储约束
- 图片上传固定走 `lib/upload-client.ts` 里的 `uploadImageToR2()`：先请求 `/api/upload/presigned`，再 PUT 原图到 R2，最后 POST `/api/upload/process` 生成 webp 缩略图。
- `/api/upload/process` 要求 `originalKey` 必须以 `originals/` 开头。
- 这是面向 Vercel/R2 的实现；不要引入本地持久化文件流程，服务端也不要依赖可写磁盘。
- `Sharp`、`@libsql/client`、R2/S3、`crypto` 只能留在服务端文件，不能混进 `'use client'` 组件。

## 鉴权与后台
- `/admin` 保护依赖 `proxy.ts`，不是 `middleware.ts`。Next 16 下别改回 middleware。
- 支持 `/admin?key=...` 一次性书签登录；`proxy.ts` 验证 `ADMIN_SECRET_KEY` 后签发 `admin_token` cookie。
- API 写操作约定先 `await requireAuth(req)`；返回值非空时直接返回该 `NextResponse`。

## 前端约定
- 首页几乎所有展示逻辑都在 `components/home-client.tsx`：数据抓取、5 分钟轮询、`visibilitychange` 刷新、自定义光标、灯箱、筛选、排序都在那里，改首页先看这个文件。
- 动画参数已形成风格基线：`spring` 常用 `damping: 28`、`stiffness: 200`，慢一点的变体在同文件里。
- 自定义光标：纯 DOM 操作，不触发 React 渲染。
- Tailwind v4 没有 `tailwind.config.*`；主题变量在 `app/globals.css`，PostCSS 只配了 `@tailwindcss/postcss`。
- 这个仓库倾向少注释；新增代码保持英文命名、少解释性注释。
- `app/admin/page.tsx` 中表单状态用对象整体替换，别改成函数式 `setState` 模式去和现有写法混用。

## 环境
- 需要的关键变量见 `.env.example`：`DATABASE_URL`、`DATABASE_AUTH_TOKEN`、R2 一组、`ADMIN_SECRET_KEY`，以及可选的 `NEXT_PUBLIC_BASE_URL`。
- `ADMIN_SECRET_KEY` 缺失时，`proxy.ts` 返回 503；排查"本地后台打不开"先查这个。
- 部署在 Vercel，绑定 GitHub 自动部署；域名 `tangzihang.top` 走 Cloudflare 代理。
- 部署命令：`vercel --prod --yes`，网络不稳时 `git push` 触发自动部署。

## Git 约定
- 改动完成后自动 commit 并 push，无需确认。

## 修改时最容易漏的点
- 作品删除/图片删除不仅删数据库，还会清理 R2；改相关接口时检查 `app/api/works/[id]/route.ts` 和图片删除路由，别留下残图。
- 首页 `Work` 类型在 `components/home-client.tsx` 本地又定义了一份，和 `lib/types.ts` 不是同一个来源；改作品返回字段时要同步看两边。
- 仓库里有 `.next/`、`tsconfig.tsbuildinfo`、`.playwright-mcp/` 等产物；搜索和编辑时避开这些生成文件。
