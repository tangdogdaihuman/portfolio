# AGENTS.md

## 项目概述
个人作品集网站。前台：个人介绍 + 可增删改的作品展示。后台：密钥链接登录后可编辑所有内容。部署到 Vercel，所有人可看，仅管理员可改。

## 前端交互要求
- **作品展示**：垂直滚动浏览，缩略图渐进加载（lazy load），点击打开灯箱查看原图
- **分类标签**：作品支持分类标签，前台可按标签筛选
- **排序置顶**：作品可手动排序、置顶（pinned）
- **响应式**：必须适配移动端（手机竖屏为主），Tailwind responsive class
- **个人介绍**：后台可编辑，前端以优雅排版展示（支持换行/段落）

## 技术栈
| 层 | 选型 | 原因 |
|---|---|---|
| 框架 | Next.js 14+ App Router | 全栈一体，LLM 支持最好 |
| 数据库 | Turso (libsql) | SQLite 兼容，serverless 友好，Vercel 上不丢数据 |
| 图片存储 | Cloudflare R2 (S3 协议) | 免费 10GB，无流量费，存超大原图 |
| 图片处理 | Sharp | 上传时自动生成缩略图+转 webp |
| 认证 | 密钥 URL 参数 → httpOnly cookie | 单管理员，最简单安全 |
| 校验 | Zod | 所有 API 入参必须校验 |
| 样式 | Tailwind CSS | |
| 部署 | Vercel | git push 自动部署 |
| 包管理 | npm | |

## 目录结构
```
app/
  layout.tsx
  page.tsx                # 首页：个人介绍 + 作品网格
  work/[id]/page.tsx      # 单作品详情
  admin/
    page.tsx              # 后台面板（检查 cookie，无则跳登录）
    layout.tsx            # 后台布局
  api/
    works/route.ts        # GET 列表, POST 新增
    works/[id]/route.ts   # GET 单件, PUT 编辑, DELETE 删除
    intro/route.ts        # GET 内容, PUT 更新
    upload/route.ts       # POST 上传图片 → R2
    auth/login/route.ts   # POST 验证密钥 → set cookie
lib/
  db.ts                   # Turso 客户端
  r2.ts                   # S3 客户端 (Cloudflare R2)
  auth.ts                 # cookie 签发/验证
  image.ts                # Sharp 缩略图生成
proxy.ts                  # Next.js 16 proxy（替代 middleware）处理 /admin 密钥登录
```

## 数据模型
```sql
-- works 作品表
id          TEXT PRIMARY KEY    -- cuid
title       TEXT NOT NULL
description TEXT NOT NULL
tags        TEXT DEFAULT ''     -- 逗号分隔的标签，如 "角色,场景,3D"
image_url   TEXT NOT NULL       -- R2 原图链接
thumb_url   TEXT NOT NULL       -- R2 缩略图链接（800px）
pinned      INTEGER DEFAULT 0  -- 0普通 1置顶，置顶作品排最前
sort_order  INTEGER DEFAULT 0  -- 手动排序（数字越大越靠前）
created_at  TEXT DEFAULT (datetime('now'))
updated_at  TEXT DEFAULT (datetime('now'))

-- intro 个人介绍（单行表）
id      INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1)  -- 永远只一行
content TEXT NOT NULL DEFAULT ''
updated_at TEXT DEFAULT (datetime('now'))
```

## 认证流
1. 管理员访问 `/admin?key=XXXXXXXX`
2. 服务端对比 `ADMIN_SECRET_KEY` 环境变量
3. 匹配则签发 httpOnly secure cookie（jwt 或随机 token）
4. 后续 `/admin/*` 和 `/api/*` 写操作校验 cookie
5. cookie 有效期 7 天

## 图片上载流
1. 前端选图 → POST `/api/upload` (multipart/form-data)
2. 服务端用 Sharp: 生成 800px webp 缩略图, 原图保留
3. 两者上传到 R2，获得公开 URL
4. 返回 `{ imageUrl, thumbUrl }` 给前端保存到作品

## 命令
```bash
npm run dev        # 本地开发
npm run build      # 生产构建
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run db:push    # 推送 schema 到 Turso
```

## 环境变量 (.env.local，不入库)
```
DATABASE_URL=           # libsql://xxx.turso.io
DATABASE_AUTH_TOKEN=    # Turso auth token
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=          # https://pub-xxx.r2.dev 或自定义域名
ADMIN_SECRET_KEY=       # 管理员密钥（足够长随机字符串）
```

## 安全要点
- 所有 `/api/*` 写操作必须校验 cookie，否则 401
- Zod schema 校验所有请求体，拒绝多余字段
- `next.config.js` 的 `images.remotePatterns` 只允许 R2 域名
- 上传接口限制文件类型（image/*）和大小（max 50MB）
- 速率限制：`/api/auth/login` 每分钟最多 5 次
- CSP 头配置

## 约束 & 易错点
- **Vercel 无本地文件系统**，绝对不能 `fs.writeFile`，所有文件存 R2
- **Vercel body 限制 4.5MB**，大图不能走 API route 中转。用 R2 presigned URL 直传或 Uploadthing 方案
- **Turso 用 HTTP 协议**，不是 WebSocket。用 `@libsql/client` 包，别用 `better-sqlite3`
- **服务端代码**（db、r2、fs、Sharp）严禁出现在 `'use client'` 组件中
- **Next.js Image 组件**需要配置 `next.config.js` 的 `images.remotePatterns` 允许 R2 域名
- 本项目代码水平目标用户为 0，代码中不要过度抽象，保持平铺直叙

## 建议后续完善
- [ ] 后台拖拽排序（@dnd-kit，替代手动输入排序数字）
- [ ] 静态生成作品页（`generateStaticParams`）提升首屏速度
- [ ] 简易访问统计
- [ ] sitemap.xml + SEO meta
- [ ] 留言/联系表单（可选）

## Git 注意事项
当前 git 仓库初始化在 `C:\` 根目录（错误），会追踪整个系统盘。应在项目目录内重新 `git init`。
