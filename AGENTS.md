# AGENTS.md

## 项目
唐子航个人 CG 作品集网站。Next.js 16 (App Router) · React 19 · Tailwind v4 · Turso (libsql) · Cloudflare R2 (S3) · Sharp · Zod · Framer Motion · TypeScript strict

详见 `handoff.md`（用户信息、GFW问题、具体待办清单）。AGENTS.md 侧重项目结构和约束。

## 命令
```bash
npm run dev         # next dev
npm run build       # next build  
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run db:push     # 手动建表（db.ts 已 auto migrate，一般不需要）
```

## 实际目录结构
```
app/
  layout.tsx                         # Playfair+Inter 字体, 暗色, metadata+OG tags
  page.tsx                           # 服务端组件: 返回 <HomeClient />
  globals.css                        # Tailwind v4 @theme (暗色+金色), 噪点纹理, 动画
  not-found.tsx                      # 自定义 404 页面
  robots.ts                          # robots.txt
  sitemap.ts                         # sitemap.xml (动态查询 works 表)
  admin/
    layout.tsx                       # 后台顶栏（"管理后台" + 回前台）
    page.tsx                         # 5个Tab: 作品列表/新增/编辑/介绍/容量
    login/
      page.tsx                       # 密钥输入 → POST /api/auth/login
  api/
    auth/login/route.ts              # POST {key} → setCookie → {ok:true}
    intro/route.ts                   # GET / PUT (需auth)
    works/route.ts                   # GET 列表(含image_count/total_size) / POST 新增
    works/[id]/route.ts              # GET/PUT(部分更新)/DELETE(级联删work_images)
    works/[id]/images/route.ts       # GET 列表 / POST 批量添加 / DELETE 清空
    works/images/[imageId]/route.ts  # DELETE 单张
    upload/route.ts                  # 旧版 multipart (≤4.5MB)
    upload/presigned/route.ts        # POST 生成 R2 presigned PUT URL
    upload/process/route.ts          # POST 拉原图→Sharp缩略图→上传R2
components/
  home-client.tsx                    # 首页 (Hero/标签筛选/Marquee/作品网格/灯箱/About/Contact)
lib/
  db.ts                              # Turso 延迟初始化(Proxy单例) + 首次DB访问auto migrate
  r2.ts                              # S3Client + publicUrl()
  auth.ts                            # Cookie签发/验证
  image.ts                           # Sharp 800px webp quality 85
proxy.ts                             # Next.js 16 proxy 替代 middleware, 处理 /admin 密钥登录
scripts/push-schema.ts               # 手动建表
```

## 数据模型
```sql
works (id TEXT PK, title, description, tags TEXT, image_url, thumb_url, pinned, sort_order, work_date, image_size, created_at, updated_at)
work_images (id TEXT PK, work_id TEXT, image_url, thumb_url, sort_order, image_size, created_at)
intro (id INTEGER PK DEFAULT 1 CHECK(id=1), content TEXT, updated_at)
```
- `tags`: 逗号分隔, API 返回时转数组
- `works.image_url/thumb_url`: 封面图 (第一张或手动选的)
- 删除作品时级联 `DELETE FROM work_images WHERE work_id = ?`
- db.ts 首次访问自动 ALTER TABLE 加列 + CREATE work_images 表

## 认证流
1. 访问 `/admin/login` → 输入密钥 → POST `/api/auth/login` → setCookie → redirect `/admin`
2. 或 `/admin?key=xxx` → proxy.ts 拦截 → setCookie → redirect `/admin`
3. proxy.ts 放行 `/admin/login` `/api/auth/login`, 其他 `/admin/*` 校验 cookie
4. API 写操作调用 `verifyAuthRequest()` 校验

## 图片上传（预签名直传, 绕过 Vercel 4.5MB 限制）
1. 前端 POST `/api/upload/presigned` `{contentType}` → `{uploadUrl, originalKey}`
2. 前端 `fetch(uploadUrl, {method:'PUT', body:file})` 直传原图到 R2
3. 前端 POST `/api/upload/process` `{originalKey}` → 服务端下载原图→Sharp 800px webp→上传R2 → `{imageUrl, thumbUrl}`

## 环境变量 (.env.local，不入库)
DATABASE_URL / DATABASE_AUTH_TOKEN / R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL / ADMIN_SECRET_KEY

## 约束 & 易错点
- **Vercel 无本地文件系统**: 禁止 `fs.writeFile`，所有文件存 R2
- **服务端代码隔离**: Sharp/db/r2/fs 代码严禁出现在 `'use client'` 组件
- **Turso 用 HTTP**: 用 `@libsql/client`, 别用 `better-sqlite3`
- **Tailwind v4**: 无 `tailwind.config.ts`，颜色/字体在 `globals.css` `@theme inline` 中
- **Next.js 16**: 用 `proxy.ts` 而非 `middleware.ts`
- **首页纯客户端**: `HomeClient` fetch + 30s 轮询
- **自定义光标**: 纯 DOM 操作，不触发 React 渲染
- **Framer Motion**: 动画用 spring 物理引擎 `damping:28 stiffness:200`
- **FormState**: 用对象替换 setFormState，别用函数式 updater (React 19 类型限制)
- **代码不加注释，中文交流，变量名英文**

## 部署
- Vercel + GitHub 联动自动部署: `git push`→Vercel 自动构建
- 网络不稳时 CLI 部署: `vercel --prod --yes`
- 域名: `tangzihang.top` 经 Cloudflare CDN 代理 (GFW 问题)
