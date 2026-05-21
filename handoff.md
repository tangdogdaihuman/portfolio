# Handoff — Portfolio 个人作品集网站

## 项目概述
唐子航的个人 CG/游戏美术作品集网站。Next.js 16 App Router + Tailwind v4 + Turso + Cloudflare R2。部署在 Vercel，绑定域名 `tangzihang.top`。

## 待办——下次 AI 从这里开始

- [ ] **域名访问不稳定**：Vercel IP 被 GFW 间歇封锁，已加 Cloudflare CDN 代理（DNS 已切到 CF nameservers），观察是否稳定。若仍不行，考虑切换 Cloudflare Pages 部署
- [ ] **未被引用的死代码**：`components/lightbox.tsx` 和 `components/work-grid.tsx` 已不再使用，可删除
- [ ] 后台编辑作品时，无法拖拽排序+选封面（新增作品页面有，编辑页面缺）
- [ ] 优化图片加载：缩略图用下一代的 `<Image>` 组件替代 `<img>`
- [ ] 继续对照视频方法论引入 Magic UI / Cult UI 组件
- [ ] 添加 SEO（og 标签、sitemap）
- [ ] 自定义 404 页面

## 用户信息
- 姓名：唐子航
- 代码水平：基本为 0，需要简洁直接的解决方案
- GitHub：https://github.com/tangdogdaihuman
- ArtStation：https://www.artstation.com/uuey7
- 邮箱：1193662756@qq.com

## 技术栈
| 层 | 选型 | 备注 |
|---|---|---|
| 框架 | Next.js 16 (App Router) | `force-dynamic` 用于首页 |
| 语言 | TypeScript strict | |
| 样式 | Tailwind v4 | 无 `tailwind.config.ts`，颜色/字体在 `globals.css` 的 `@theme inline` |
| 数据库 | Turso (libsql) | 延迟初始化，首次 DB 访问自动迁移 |
| 图片存储 | Cloudflare R2 (S3) | Free 10GB，预签名 URL 直传绕过 Vercel 4.5MB 限制 |
| 图片处理 | Sharp | 上传时生成 800px webp 缩略图 |
| 认证 | 密钥 → httpOnly cookie | proxy.ts 拦截 `/admin/*` |
| 动画 | Framer Motion | spring 物理引擎 |
| 部署 | Vercel | 绑定 GitHub 自动部署 |
| 域名 | tangzihang.top | Cloudflare 代理 |

## 架构速览
```
app/
  layout.tsx          → Playfair+Inter 字体，暗色主题
  page.tsx            → 纯服务端组件，返回 <HomeClient />
  globals.css         → Tailwind v4 @theme + 噪点纹理 + 自定义动画
  admin/
    layout.tsx        → 后台顶栏
    page.tsx          → 5 个标签页：作品列表/新增/编辑/介绍/容量
    login/
      page.tsx        → 密钥输入表单
  api/
    auth/login/route.ts       → POST 验证密钥 → setCookie
    intro/route.ts            → GET/PUT
    works/route.ts            → GET 列表(含image_count/total_size) / POST 新增
    works/[id]/route.ts       → GET/PUT/DELETE（级联删除 work_images）
    works/[id]/images/route.ts→ GET 列表 / POST 批量添加 / DELETE 清空
    works/images/[imageId]/route.ts → DELETE 单张
    upload/route.ts           → 旧版 multipart 上传（≤4.5MB）
    upload/presigned/route.ts → POST 生成 R2 presigned PUT URL
    upload/process/route.ts   → POST 拉原图→Sharp缩略图→上传R2
components/
  home-client.tsx             → 首页（Hero/标签/Marquee/作品网格/灯箱/About/Contact）
lib/
  db.ts         → Turso 延迟初始化(Proxy) + 首次访问auto migrate
  r2.ts         → S3Client + publicUrl()
  auth.ts       → Cookie 签发/验证
  image.ts      → Sharp 800px webp q85
proxy.ts        → Next.js 16 proxy（替代 middleware），处理 /admin 密钥登录
scripts/push-schema.ts → 手动建表
```

## 数据模型
```sql
works (id TEXT PK, title, description, tags TEXT, image_url, thumb_url, pinned, sort_order, work_date TEXT, image_size, created_at, updated_at)
work_images (id TEXT PK, work_id TEXT, image_url, thumb_url, sort_order, image_size, created_at)
intro (id INTEGER PK DEFAULT 1 CHECK(id=1), content TEXT, updated_at)
```
- `tags`: 逗号分隔，API 返回时转数组
- `image_size`: 作品封面图片字节数
- `work_images`: 一个作品多张图的子表，删除作品时级联清理
- DB 迁移：`lib/db.ts` 首次 DB 访问时自动 `ALTER TABLE` 加列 + `CREATE TABLE IF NOT EXISTS work_images`

## 认证流
1. 访问 `/admin/login` → 输入密钥 → POST `/api/auth/login` → setCookie
2. 或直接 `/admin?key=xxx` → proxy.ts 拦截 → setCookie → redirect `/admin`
3. proxy.ts 放行 `/admin/login` 和 `/api/auth/login`，其他 `/admin/*` 校验 cookie
4. 所有 `/api/*` 写操作调用 `verifyAuthRequest()`

## 图片上传流（预签名，绕过 4.5MB 限制）
1. 前端 POST `/api/upload/presigned` `{contentType}` → 获取 `{uploadUrl, originalKey}`
2. 前端 `fetch(uploadUrl, {method:'PUT', body:file})` 直传原图到 R2
3. 前端 POST `/api/upload/process` `{originalKey}` → 服务端下载→Sharp缩略图→上传R2 → 返回 `{imageUrl, thumbUrl}`

## 命令
```bash
npm run dev        # next dev
npm run build      # next build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run db:push    # 手动推送 schema（db.ts 已 auto migrate，通常不需要）
```

## 环境变量 (Vercel 已配，本地见 .env.local)
DATABASE_URL, DATABASE_AUTH_TOKEN, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL, ADMIN_SECRET_KEY

## 关键约束
- **永不使用 `fs.writeFile`**：Vercel 无本地文件系统
- **服务端代码隔离**：Sharp/db/r2 代码严禁出现在 `'use client'` 组件
- **Turso 用 HTTP**：不是 WebSocket，用 `@libsql/client`，别用 `better-sqlite3`
- **首页纯客户端**：`HomeClient` fetch + 30s 轮询
- **自定义光标**：纯 DOM 操作，不触发 React 渲染
- **Framer Motion**：所有动画用 spring 物理引擎 `damping:28 stiffness:200` 达到 Apple 式惯性
- **Karpathy 四原则**：先想再动手、保持简洁、精准修改、完成后验证
- **代码不加注释**
- **中文交流，代码/变量名英文**

## 易错点
- `components/lightbox.tsx` 和 `work-grid.tsx` 是死代码，前端逻辑全在 `home-client.tsx`
- Tailwind v4 `@theme inline` 定义颜色，无 `tailwind.config.ts`
- Next.js 16 用 `proxy.ts` 而非 `middleware.ts`
- Turso 用 HTTP 协议，别尝试 WebSocket
- FormState 更新用对象替换，别用函数式 updater（React 19 类型限制）
- 部署用 `vercel --prod --yes`，网络不稳时用 `git push` 触发 GitHub 联动自动部署
