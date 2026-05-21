# AGENTS.md

## 技术栈
Next.js **16** (App Router) · React **19** · Tailwind **v4** (CSS `@theme`, 无 tailwind.config.ts) · Turso (libsql) · Cloudflare R2 (S3) · Sharp · Zod · Framer Motion · TypeScript strict

## 实际目录结构（以代码为准）
```
app/
  layout.tsx                         # 强制暗色, Playfair+Inter 字体, metadata title="Portfolio"
  page.tsx                           # 纯客户端: 直接返回 <HomeClient />
  globals.css                        # Tailwind v4 @theme (暗色调+金色强调), 噪声纹理背景
  admin/
    layout.tsx                       # 后台顶栏（"管理后台" + 回前台链接）
    page.tsx                         # Tab: 作品列表/新增/介绍/存储 (829行, 5个内部组件)
    login/
      page.tsx                       # 密钥输入 → POST /api/auth/login
  api/
    auth/login/route.ts              # POST {key} → setCookie → {ok:true}
    intro/route.ts                   # GET / PUT (需auth)
    works/route.ts                   # GET 列表(含image_count/total_size) / POST 新增
    works/[id]/route.ts              # GET/PUT(部分更新)/DELETE
    works/[id]/images/route.ts       # GET 图片列表 / POST 批量添加 / DELETE 清空
    works/images/[imageId]/route.ts  # DELETE 单张
    upload/route.ts                  # POST multipart 直传 (旧版, ≤4.5MB)
    upload/presigned/route.ts        # POST 生成 R2 presigned PUT URL (5分钟有效)
    upload/process/route.ts          # POST 从R2拉原图→Sharp缩略图→上传R2
components/
  home-client.tsx                    # 实际首页 (294行): Hero/标签筛选/灯箱/介绍/联系
  lightbox.tsx                       # 备用灯箱 (未被使用)
  work-grid.tsx                      # 备用手风琴列表 (未被使用)
lib/
  db.ts                              # Turso 懒初始化 (Proxy单例, 首次访问auto migrate)
  r2.ts                              # S3Client + publicUrl()
  auth.ts                            # base64 token签发/验证, cookie名 admin_token
  image.ts                           # Sharp缩略图 800px webp quality 85
proxy.ts                             # Next.js 16 proxy: /admin/:path* 路由守卫
scripts/push-schema.ts               # 手动建表/加列
```

## 数据模型（实际 schema）
```sql
works (
  id TEXT PK,           -- @paralleldrive/cuid2 生成
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT DEFAULT '',  -- 逗号分隔, API返回时转数组
  image_url TEXT,        -- 封面原图(可为NULL, 优先用work_images)
  thumb_url TEXT,        -- 封面缩略图
  pinned INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  work_date TEXT,        -- 作品日期(ALTER TABLE添加)
  image_size INTEGER DEFAULT 0,  -- 总字节数(ALTER TABLE添加)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)

work_images (
  id TEXT PK,
  work_id TEXT NOT NULL REFERENCES works(id),
  image_url TEXT NOT NULL,
  thumb_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)

intro (
  id INTEGER PK DEFAULT 1 CHECK(id=1),
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
)
```
**注意**: `db.ts` 首次访问时自动执行 ALTER TABLE 添加 `work_date`/`image_size` 列，无需手动执行。

## 图片上载流（两段式，绕过 Vercel 4.5MB 限制）
1. **前端** POST `/api/upload/presigned` `{contentType}` → 获取 `{uploadUrl, originalKey, imageUrl}`
2. **前端** `fetch(uploadUrl, {method:'PUT', body:file})` 直传原图到 R2
3. **前端** POST `/api/upload/process` `{originalKey}` → 服务端下载原图→Sharp生成缩略图→上传R2 → 返回 `{imageUrl, thumbUrl}`
4. 旧版 `/api/upload` (multipart) 仍存在但仅适用于 ≤4.5MB 文件

## 认证流
1. 访问 `/admin?key=XXX` → `proxy.ts` 校验 `ADMIN_SECRET_KEY` → 签发 `admin_token` cookie(7天) → 重定向 `/admin`
2. 或访问 `/admin/login` 输入密钥 → POST `/api/auth/login` → 同上
3. 所有 `/api/*` 写操作调用 `verifyAuthRequest()` 校验 cookie, 失败返回 401
4. proxy.ts 放行 `/admin/login` 和 `/api/auth/login`, 其他 `/admin/*` 需 cookie

## 命令
```bash
npm run dev         # next dev (含 --turbo 默认)
npm run build       # next build
npm run lint        # ESLint (eslint.config.mjs, Next.js flat config)
npm run typecheck   # tsc --noEmit
npm run db:push     # npx tsx scripts/push-schema.ts (手动执行, db.ts 已 auto migrate)
```

## 环境变量 (.env.local，不入库)
见 `.env.example`。必须含: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `R2_*`(5个), `ADMIN_SECRET_KEY`

## 约束 & 易错点
- **Tailwind v4**: 无 `tailwind.config.ts`，颜色/字体在 `globals.css` 的 `@theme inline {}` 中定义
- **next.config.ts** (不是 .js)，`images.remotePatterns` 已配置 `**.r2.cloudflarestorage.com` + `**.r2.dev`
- **Vercel 无本地文件系统**: 禁止 `fs.writeFile`, 所有文件存 R2
- **Vercel body 限制 4.5MB**: 上传必须走 presigned URL 直传 R2, 不走 API route
- **Turso 用 HTTP 协议**: 用 `@libsql/client`, 别用 `better-sqlite3`
- **服务端代码隔离**: Sharp/db/r2/fs 代码严禁出现在 `'use client'` 组件中
- **无 SSR 首页**: `app/page.tsx` → `<HomeClient />` 纯客户端渲染, 数据通过 fetch + 30s 轮询获取
- **未使用的依赖**: `cuid` v3 (项目用 `@paralleldrive/cuid2`); 组件 `lightbox.tsx`, `work-grid.tsx` 未被引用
- **强制暗色模式**: `layout.tsx` `<html className="dark">`, 无亮色切换
- **自定义光标**: `home-client.tsx` 桌面端有跟随光标效果, 触摸设备跳过

## 待办/缺失
- [ ] 作品详情页 (`app/work/[id]/page.tsx`) — 未实现
- [ ] 自定义 404 页面
- [ ] OG 标签 (metadata 仅 `title`/`description`, 无 openGraph)
- [ ] sitemap.xml + robots.txt
- [ ] 图片 alt 文本 + 无障碍 (aria, 键盘导航)
- [ ] 图片懒加载 (首页 grid 无 IntersectionObserver)
- [ ] 速率限制 (`/api/auth/login` 未实现)
- [ ] CSP 头 (未配置)
- [ ] Git 仓库问题：当前初始化在 `C:\` 根目录, 应在项目目录内重新 `git init`
- [ ] README.md 为 create-next-app 默认模板, 需自定义
- [ ] 后台拖拽排序 (当前手动输入 sort_order 数字)
