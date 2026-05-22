# AGENTS.md

## 项目
唐子航个人 CG 作品集网站。Next.js 16 (App Router) · React 19 · Tailwind v4 · Turso (libsql) · Cloudflare R2 (S3) · Sharp · Zod · Framer Motion · TypeScript strict

## 命令
```bash
npm run dev         # next dev
npm run build       # next build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

## 目录结构
```
app/
  layout.tsx                         # Playfair+Inter 字体, 暗色, metadata+OG tags
  page.tsx                           # 服务端组件: 个人介绍 + Portfolio标题 + HomeClient
  globals.css                        # Tailwind v4 @theme (暗色+金色), 噪点纹理, 动画
  admin/
    layout.tsx                       # 后台顶栏
    page.tsx                         # Tab: 作品列表/新增/编辑/介绍/详情/容量
    login/page.tsx                   # 密钥输入 → POST /api/auth/login
  api/
    auth/login/route.ts              # POST {key} → HMAC setCookie → {ok:true}
    intro/route.ts                   # GET / PUT (requireAuth)
    details/route.ts                 # GET / PUT (requireAuth)
    detail-sections/route.ts         # GET / POST (requireAuth)
    detail-sections/[id]/route.ts    # PUT / DELETE (requireAuth)
    works/route.ts                   # GET 列表 / POST 新增 (requireAuth)
    works/[id]/route.ts              # GET/PUT/DELETE (requireAuth + 删R2残图)
    works/[id]/images/route.ts       # GET / POST批量 / DELETE清空 (requireAuth + 删R2)
    works/images/[imageId]/route.ts  # DELETE单张 (requireAuth + 删R2)
    upload/presigned/route.ts        # POST 生成R2 presigned PUT URL (contentType白名单)
    upload/process/route.ts          # POST 拉原图→Sharp800px webp→上传R2 (originalKey前缀校验)
components/
  home-client.tsx                    # 首页 (介绍/Hero/标签筛选/作品网格/灯箱/About/Contact)
lib/
  db.ts                              # Turso Proxy单例 + auto migrate + tagsToArray/tagsToString
  r2.ts                              # S3Client + publicUrl() + deleteFromR2()
  auth.ts                            # HMAC-SHA256 token签发/验证 + requireAuth()
  image.ts                           # Sharp 800px webp quality 85
  types.ts                           # 共享类型: Work, WorkImage, Section
  upload-client.ts                   # 前端上传: uploadImageToR2()
proxy.ts                             # Next.js 16 proxy, HMAC验证 /admin, 支持 ?key= 书签登录
```

## 数据模型
```sql
works (id TEXT PK, title, description, tags TEXT, image_url, thumb_url, pinned, sort_order, work_date, image_size, crop_x, crop_y, created_at, updated_at)
work_images (id TEXT PK, work_id TEXT, image_url, thumb_url, sort_order, image_size, crop_x, crop_y, created_at)
intro (id INTEGER PK DEFAULT 1, content TEXT, updated_at)
details (id INTEGER PK DEFAULT 1, content TEXT, updated_at)
detail_sections (id TEXT PK, title, content, sort_order, created_at, updated_at)
```
- `tags`: 逗号分隔，API用 `tagsToArray()`/`tagsToString()` 转换
- `crop_x/crop_y`: 缩略图裁切锚点，默认50（居中）
- 删除作品时级联删 work_images + 清理R2对应文件

## 认证流（HMAC-SHA256）
1. `/admin/login` → POST `/api/auth/login` `{key}` → `timingSafeEqual` 比较 → HMAC setCookie → redirect `/admin`
2. 或 `/admin?key=xxx` → proxy.ts 拦截验证 → 签发HMAC cookie → redirect `/admin`
3. proxy.ts 放行 `/admin/login` `/api/auth/login`，其他 `/admin/*` 校验 cookie
4. API 写操作统一用 `requireAuth(req)` 返回 `NextResponse|null`

## 图片上传（预签名直传，绕过 Vercel 4.5MB）
1. 前端 POST `/api/upload/presigned` `{contentType}` (仅 jpeg/png/webp/avif)
2. 前端 `fetch(uploadUrl, {method:'PUT', body:file})` 直传原图到 R2
3. 前端 POST `/api/upload/process` `{originalKey}` (必须 `originals/` 前缀)
4. 前端统一用 `uploadImageToR2(file)` 一个函数完成三步

## 环境变量 (.env.local，不入库)
DATABASE_URL / DATABASE_AUTH_TOKEN / R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL / ADMIN_SECRET_KEY

## 约束 & 易错点
- **Vercel 无本地文件系统**: 禁止 `fs.writeFile`，所有文件存 R2
- **服务端代码隔离**: Sharp/db/r2/crypto 代码严禁出现在 `'use client'` 组件
- **Turso 用 HTTP**: 用 `@libsql/client`，别用 `better-sqlite3`
- **Tailwind v4**: 无 `tailwind.config.ts`，颜色/字体在 `globals.css` `@theme inline`
- **Next.js 16**: 用 `proxy.ts` 而非 `middleware.ts`
- **首页纯客户端**: `HomeClient` fetch + 5min轮询 + visibility检测
- **自定义光标**: 纯 DOM 操作，不触发 React 渲染
- **Framer Motion**: 动画用 spring `damping:28 stiffness:200`
- **FormState**: 用对象替换 setFormState，别用函数式 updater (React 19 类型限制)
- **代码不加注释，变量名英文**

## 部署
- Vercel + GitHub 联动: `git push` → 自动构建部署
- CLI 部署: `vercel --prod --yes`
- 域名: `tangzihang.top` 经 Cloudflare CDN (GFW)
