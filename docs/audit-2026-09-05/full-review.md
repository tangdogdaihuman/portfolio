# 全维度审查 · 2026-09-05（第二轮）

审查目标：个人 CG 作品集（单人、低流量、面向中文受众）。目标质量属性排序：**首屏性能 > 正确性 > 架构简洁度 > 可维护性**。
方法：4 个并行证据采集 + 关键结论逐条读码/跑库复核。基线 commit `0f9a39f`。与 `f6a5175`（2026-09-05 首轮审计 14 项）去重，本文件只记录**新发现**或**首轮修复本身失效**的项。

置信度标记：`[已验证]` = 我读码或跑命令确认；`[代理采集]` = 子代理读码给出行号，我未逐行复核，按 high 置信对待但未二次确认；`[假设]` = 需运行时数据。

---

## 0. 一句话结论

真正在拖慢这个站的是**三件外部事实**：CJK 字体走 render-blocking 的 `fonts.googleapis.com`、R2 对象没有被 Cloudflare 边缘缓存、以及装饰性极光在桌面端永动 60fps。首屏 JS 248 KB(gz) 里过半是被 `LazyMotion` 配置失误重新拉进来的 framer-motion。代码正确性上有 3 个会导致**用户可见空页面**或**作品被后台锁死**的真实逻辑错误，其中首轮审计修的"毫秒单调 updated_at"经实测**完全失效**。架构上的复杂度集中在**同一件事被实现 2–3 遍**（极光 3 套、返回顶部 2 套、写路由样板 17 份）和**只写不读的持久化设施**（`audit_logs`、`details`、`schema_migrations`、R2 重试队列）。

---

## 1. 性能（按用户可感知延迟排序）

### P-01 · CJK 字体走阻塞式 Google Fonts，且该域名在大陆不稳 `[已验证]` — 高影响
- 证据：`app/layout.tsx:65-71` `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@200..900&family=Noto+Sans+SC:wght@100..900&display=swap">`；同时 `:2-24` 已用 `next/font` 自托管 Anton / Space Grotesk / JetBrains Mono 三套。
- 后果：外链 stylesheet 是**渲染阻塞**资源。字体 CSS 本身含 CJK 全字重区间（`200..900` / `100..900`），`fonts.googleapis.com` 在中国大陆可访问性不稳定 → 最坏情况白屏等超时；即使正常也至少多 1 个 RTT + 数百 KB 字体分片，且与 `next/font` 自托管路径重复。`lang="zh-CN"` 的站，正文主体字体挂在外部阻塞链上。
- 修法（择一，别混用）：① 把 Noto Serif SC / Noto Sans SC 也交给 `next/font/google`（构建期下载、自托管、`subsets: ["chinese-simplified"]`）；② 若不想引入构建期字体下载，改为 `rel="preload" as="font"` + `font-display: optional`，**绝不留 render-blocking stylesheet**。
- 验收：`WebPageTest`/Lighthouse 移动端 FCP 不再包含 `fonts.googleapis.com` 请求；`document.fonts` 里没有指向 googleapis 的 URL。
- 风险：`next/font` 构建期需要能访问 Google（Vercel 构建可以，本地 CI 需确认代理）。

### P-02 · R2 图片未被边缘缓存 + 域名分裂成两个源 `[已验证]` — 高影响
- 证据（实测线上首页）：首页缩略图 **10 个指向 `pub-1b5c7de….r2.dev`、7 个指向 `cdn.tangzihang.top`**；`curl -I` → `cf-cache-status: DYNAMIC`，**响应里没有 `Cache-Control`**；本机测 TTFB ≈ 1.09–1.37 s/张。
- 后果：`DYNAMIC` = Cloudflare 对该自定义域名**未开启边缘缓存**，每张图每次访问都回源 R2；首页 17 张缩略图 → 冷缓存时 17 次跨洋回源。域名分裂还让浏览器多建一套 TLS 连接。
- 修法：① Cloudflare 控制台给 R2 自定义域名开启 edge cache（R2 需显式 opt-in "Cache eligibility"）；② 上传侧 `PutObject`/presigned 都带 `Cache-Control: public, max-age=31536000, immutable`（对象键是 cuid，天然不可变）；③ 一次性把库里 `*.r2.dev` 的 `image_url`/`thumb_url` 改写为 `cdn.tangzihang.top`（同桶同 key，纯域名替换）。
- 连带必修：`lib/r2.ts` 的 `deleteFromR2` 只匹配 `R2_PUBLIC_URL`/`R2_ALT_PUBLIC_URLS` 前缀，不匹配就静默跳过（只记一条 metric）→ 在 P-02③ 之前，这 10 个 `r2.dev` 对象的删除**永远不会执行**。`[代理采集]`（`lib/r2.ts:36-48`、`lib/r2-delete-jobs.ts:76-79`）
- 验收：`curl -I` 出现 `cache-status: "dyn"`→`HIT` 与 `cache-control: public, max-age=31536000, immutable`；首页 HTML 里只剩一个图片域名。

### P-03 · 缩略图只有一档 1080p 且全部 `unoptimized` `[已验证]` — 中高影响
- 证据：`lib/image.ts:3-11`（`width = 1080`，webp q78，唯一调用方 `app/api/upload/process/route.ts:73`）；`unoptimized` 硬编码在 6 处 `<Image>`：`components/home-client.tsx:209`、`components/work-detail-gallery.tsx:230,346`、`components/admin/work-list.tsx:55`、`components/admin/work-form-shared.tsx:250,296`。
- 后果：`sizes="(max-width:768px) 92vw, … 44vw"` 声明了但 `unoptimized` 下**不生成 srcset**，任何视口/DPR 都下同一张 1080 webp。1x 笔记本卡片实际约 560 CSS px → 约 3.7 倍面积浪费；而 admin 里 80px 的小方块也下 1080。反过来手机 2x 需要 ~1500px 时又不够清晰。
- 修法（不要引入运行时优化器）：上传时 `generateThumbnail` 产出 **2–3 档**（如 480 / 900 / 1600）webp，存到 `thumbnails/{id}-{w}.webp`，`<Image>` 去掉 `unoptimized` 改自定义 `srcSet`；或直接让 P-02 的边缘缓存 + 一个尺寸档位解决大半。避免依赖 Vercel Image Optimization（原图可达 4.4 MB，接近优化器源图上限，且有配额/中国大陆访问问题）。
- 验收：首页图片总字节从 ~390 KB 降到 ≤150 KB，`<img srcset>` 命中 ≤ 实际渲染宽度的档位。

### P-04 · 极光在桌面端永动 60fps，滚动暂停只对粗指针生效 `[已验证]` — 高影响（续航/交互流畅度）
- 证据：`components/aurora-canvas.tsx` 中 `if (profile.coarsePointer && !profile.reducedMotion) window.addEventListener("scroll", onScrollPause, …)`（约 :610），canvas 为 `fixed inset-0 … height:100lvh`（文件末尾）。首轮移动端降帧降分辨率的设计记录在 `.trae/documents/mobile-performance-optimization.md`——**桌面端被有意留成满帧**。
- 后果：每一帧全屏合成 + `ctx.filter` blur + bloom + 额外全屏拷贝（`[代理采集]` 约 :498/:505/:531，~500 次 sprite blit）。这是所有路由上常驻的最大主线程/GPU/电池开销，而它只是背景装饰。桌面笔记本上会明显发热、掉电，并和 `backdrop-filter` 玻璃层互相放大成本。
- 修法（保留视觉、去掉永动）：桌面限到 24–30fps（帧预算节流已在 worker 路径有先例）；页面滚出可见区/标签页隐藏已处理，补**滚动中暂停 + 停手 200ms 续**这条对粗指针同样生效；把每帧 `ctx.filter` 换成预烘焙 sprite（noise 已是逐 reseed 预生成，blur 同理）。
- 验收：DevTools Performance 录 10s 静置，aurora 相关 scripting 占主线程 < 3ms/s；发热主观明显改善；`git stash` 后视觉对比可接受。

### P-05 · 每个冷 isolate 的首个请求要串行等 16 次迁移往返 `[已验证结构，量化为假设]`
- 证据：`lib/db.ts:28-48` `runMigrations()` 在 Proxy 的每个方法调用前 `await`（`:63-75`）；内部 = 1 次 `executeMultiple(BASE_SCHEMA_SQL)`（`lib/schema.ts:3-116` 含 19 条 DDL/DML + 8 条 `INSERT`）+ 7 次 `addColumnIfMissing`（每次 1–2 条语句）+ 8 次 `recordMigration`。`initializeDb`（`lib/db.ts:50`）**没有任何调用方**，仓库无 `instrumentation.ts`。
- 后果：冷启动首个用户请求在真正查询前多背约 16 次串行 HTTPS 往返。`[假设]` 单次 40–120 ms → 0.6–2 s。而 `/` 是 `revalidate: 30` 的 ISR（build 输出确认），低流量站 30 秒一次再验证会频繁落到冷 isolate，所以这条**不是理论问题**。
- 修法：加 `instrumentation.ts` 调 `initializeDb()`；或给迁移加短路（读一个 `PRAGMA user_version` / 单条 `schema_migrations` 计数，匹配则整段跳过）；`RECORDED_MIGRATIONS` 那 8 次 `INSERT OR IGNORE` 应该合成 1 条 `executeMultiple`。
- 连带：`addColumnIfMissing` 的 PRAGMA-检查-然后-ALTER 是竞态的（两个冷实例同时 ALTER → `duplicate column` 抛错），而该异常会顺着 P-06 变成白屏空页。需要容忍 duplicate-column / `SQLITE_BUSY`。`[代理采集]`
- 验收：Vercel 函数日志里首个请求的 DB 语句数从 ~19 降到 1–2。

### P-06 · 一次 DB 抖动会被缓存成"空作品集" `[已验证]` — 正确性 × 性能
- 证据：`app/page.tsx:10-37`，`try/catch` 里 catch 分支 **return** `{works: [], loadError: true}`，整个函数被 `unstable_cache(…, { revalidate: 30, tags })` 包住。
- 后果：捕获到的错误值会作为**正常成功结果写入缓存**，30 秒内（以及 `revalidatePath` 之后仍可能被 stale 供出）所有访客看到空首页 + "内容暂时加载失败"。这把一次瞬时 Turso 故障放大成全站可见事故，也掩盖 P-05 的竞态。
- 修法：错误分支改成 `throw`（让 Next 走 error.tsx / 不缓存），或把 catch 移到 `unstable_cache` 外层。顺带补 `app/error.tsx` / `app/global-error.tsx`（当前只有 `not-found.tsx`）。
- 验收：人为让首次查询失败（临时改 `DATABASE_URL`）后，`/` 返回 500 而不是缓存 30s 的空页；且下一次请求不被污染。

### P-07 · 30 秒的缓存策略对内容变更频率是 10 倍过度 `[已验证]`
- 证据：`app/page.tsx:8` `export const revalidate = 30` 与 `:37` `revalidate: 30` 双层；`app/work/[id]/page.tsx:14,45` 同样 30。build 输出：`/ Revalidate 30s Expire 1y`。
- 后果：一个每周更新 0–1 次的作品集，每 30 秒触发一次再验证 → 每次都要冷 isolate + P-05 的迁移 + 3 个查询。低流量 + 短 TTL = 命中率近似 0，纯付费冷启动。所有写路由**已经**做 `revalidatePath` + `revalidateTag`（首轮审计确认），所以长 TTL 不影响新鲜度。
- 修法：`revalidate` 300–900s（或 `expires` 策略化），保留 tag 即时失效。
- 验收：`x-vercel-cache: HIT` 比例显著上升，Vercel 函数调用数下降一个量级。

### P-08 · 首屏 248 KB(gz) JS，`LazyMotion` 配置被自己的 import 抵消 `[已验证]`
- 证据：build 实测首页 first-load JS 247,986 字节 gz / 14 chunk；`components/home-client.tsx:8-14` 从 `framer-motion` 根入口 import `LazyMotion, m, AnimatePresence, useScroll, useTransform, MotionConfig`，`:386` `<LazyMotion features={domAnimation}>`；`components/work-detail-gallery.tsx:5` 直接 import `motion`；`components/reveal.tsx:3` import `m`。
- 后果：只要从根入口 import `AnimatePresence`/`useScroll`/`motion`，完整特性包就进入首屏，`LazyMotion` + `m` 的瘦身意义全部作废（framer-motion 3 个 chunk ≈ 141 KB raw）。
- 修法：非 `m`/`LazyMotion` 的 hooks 换成 `useTransform`/`useScroll` 的 `domAnimation` 兼容版本（`framer-motion` 提供 `m` + 特性包路径）或改用 motion value + 手写 RAF；`work-detail-gallery.tsx:5` 的 `motion` → `m` 并在该页也包 `LazyMotion`。
- 验收：`next build` 首页 First Load JS 下降 ≥ 80 KB gz。

### P-09 · `/api/works` 完全无缓存却承担轮询 `[已验证]`
- 证据：`app/api/works/route.ts` GET（约 :39-47）无 `unstable_cache`、无 `revalidate`、无 `Cache-Control`；SQL 为 `SELECT w.*, (COUNT…), CASE WHEN (SUM(image_size)…) … END total_size`（每行 3 个相关子查询）。前端 `components/home-hooks.ts:81` 每 300s 轮询 + `visibilitychange` 触发。
- 后果：轮询每次都是冷路径查询（还先吃 P-05 的迁移）。首页 `/` 已把同一批数据 SSR 出来，客户端又把全量重下一遍。
- 修法：GET 包 `unstable_cache(…, { tags: ["works"] })`；投影只留前台用的列（`[代理采集]` 约 55% 的 JSON 字段首页不渲染：`description`/`image_url`/`software`/`created_at`/`updated_at`/`image_size`/`sort_order`/`total_size`）；`total_size` 只有 admin 存储面板用 → 拆到 admin 专用端点。
- 验收：轮询响应带 `cache-control`/ISR 命中；首页 payload 缩到 < 2 KB gz。

### P-10 · 只追加、无保留期，且统计查询不可用索引 `[代理采集]`
- 证据：全仓无 `DELETE FROM visits|audit_logs|rate_limits`；`app/api/visits/route.ts:90` 用 `date(created_at,'+8 hours') = date('now','+8 hours')` → 列上套函数，`idx_visits_created_at` 用不上；`COUNT(DISTINCT ip_hash)` / `GROUP BY path` 扫全表。
- 后果：admin 统计页随历史线性变慢，一年后可预期地变成"打不开"；Turso 行无上限增长（磁盘成本 + 备份时间）。
- 修法：谓词改 sargable 区间（`created_at >= datetime('now','+8 hours','start of day','-8 hours')`）；给 `visits`/`audit_logs` 加保留期（cron 里 `DELETE … WHERE created_at < …`，或按天聚合后删原始行）。
- 验收：`EXPLAIN QUERY PLAN` 显示 `USING INDEX idx_visits_created_at`；统计表行数有上限。

### P-11 · `/work/[id]` 重复取数 + 串行往返 `[代理采集]`
- `app/work/[id]/page.tsx`：`generateMetadata`(:54) 与页面(:80) 各调一次 `getWork`，全仓无 `React.cache()`；页内两次查询串行 await（:18, :26）而非 `Promise.all`。
- 修法：`React.cache()` 包 `getWork`；并行化。省 1–2 次往返/请求。

---

## 2. 逻辑错误（正确性）

### L-01 · 首轮审计的"毫秒单调 updated_at"实测完全失效 `[已验证]` — 高优先
- 证据：`lib/db.ts:83-84` `updated_at = MAX(strftime('%Y-%m-%d %H:%M:%f','now'), datetime(updated_at,'+0.001 seconds'))`。用 Node 内置 SQLite 实测：
  - `datetime('2026-09-05 10:11:12.345','+0.001 seconds')` → `2026-09-05 10:11:12`（**毫秒被截断**）；
  - 同一秒内 `+0.001` 的结果与原值**相等**（`is_gt = 0`），即"+1ms 破平"分支永远不可能大于同秒旧值；
  - 两个不同毫秒（`.345` / `.400`）经该表达式**得到完全相同的字符串**（`same_value = 1`）。
- 后果：因为左式带 `%f` 毫秒、右式被截成整秒，字符串比较下同一秒内总是左式胜出 → `updated_at` 实际等于 `now` 的毫秒值。**若同一秒内第二次写入的毫秒数小于第一次**（快速连点 reorder/连续图片操作会发生），`updated_at` 反而**变小**，客户端手里的 `baseUpdatedAt` 比库里大 → 下一次 `/save` 误报 409，用户看到"内容已被其他操作更新"但没人改过。首轮审计声称的"毫秒单调递增"这个不变量并不成立。
- 修法：`strftime('%Y-%m-%d %H:%M:%f', updated_at, '+1 millisecond')`（实测保留毫秒并真正 +1ms）；更稳的是把版本号从"时间戳字符串"里解耦出来，加一列 `rev INTEGER` 自增，`updated_at` 只做展示。
- 验收：在 e2e 里对同一 work 连发 3 次写，断言 `updated_at` 严格递增（当前 `e2e/audit-regressions.spec.ts` 的 409 用例跨秒，测不到这个窗口）。

### L-02 · 删掉最后一张图会把作品锁死在后台 `[已验证]` — 高优先
- 证据：`app/api/works/images/[imageId]/route.ts:51-64`，删除的是封面且无剩余图片时 `UPDATE works SET image_url = '', thumb_url = ''`（`''` 能过 `NOT NULL`）。同时首页封面与 OG 图取 `works.image_url`；而 `components/admin/edit-work-form.tsx:65` 对该作品只 `GET /api/works/${id}/images`（返回 `[]`），表单校验要求至少一张图，**后台没有任何入口调 `POST /api/works/[id]/images` 补图**（全仓该 POST 只出现在 `e2e/`）。
- 后果：一次误删 → 该作品在首页和详情页变成无封面空壳，且在后台**无法自愈**（存不了也补不了图），只能直接改库。该路由的 DELETE 目前**零 e2e 覆盖**。
- 修法：① 无剩余图片时拒绝删除并返回 409/400（与 `PUT` 的 `valid.length===0` 保护一致），或 ② 允许删空但让编辑表单走 `POST /images` 补图 + 封面为空时回退到占位图。任选一，但必须补 e2e。
- 验收：新增 e2e「删到 0 张图」→ 断言状态码 + `works.image_url` 仍非空 + 后台仍可保存。

### L-03 · `POST /api/works/[id]/images` 静默丢条目并泄漏 R2 对象 `[已验证]`
- 证据：`app/api/works/[id]/images/route.ts:74` `if (!parsed.success) continue;` → 5 张里 1 张字段非法就插 4 张并返回 `201 {ids: [4 个]}`，调用方无从分辨；被丢那张的 `originals/…` 与 `thumbnails/…` 已在 R2，且没有任何行引用它，也没有"无引用对象清扫器"（全仓不存在）→ 永久占位。另外 `:68` `await req.json()` 无 try/catch → 非法 JSON 抛穿处理器变 500（同文件 `PUT` 在首轮已修成 400，`POST` 漏了）。
- 修法：非法条目 → 400（整批或逐条报错，与 PUT 对齐）；`req.json()` 包 try/catch 返 400；被拒条目的 key 调 `enqueueR2DeleteInTransaction`。
- 验收：e2e 混合非法数组断言 400；断言 `r2_delete_jobs` 出现被拒 key。

### L-04 · `PUT /api/works/[id]` 在事务外读回 `updated_at` `[代理采集]` — 会静默丢更新
- `app/api/works/[id]/route.ts:94-117`：条件 UPDATE 是原子的，但 `:113` 的 `SELECT updated_at` 是独立语句。A.update / B.update / A.select 交错时，A 拿到 B 的时间戳当 `baseUpdatedAt`，于是 A 下一次 `/save` 通过 OCC 校验却仍持有 B 覆盖前的字段 → B 的编辑被无声覆盖。`save/route.ts:123-127` 的同种读取是正确的（在事务内）。
- 修法：把读回放进同一事务，或用 `RETURNING updated_at`。

### L-05 · `expectedUpdatedAt: ""` 会关掉乐观并发校验 `[代理采集]`
- `works/[id]/route.ts:90`、`save:87`、`reorder:40` 用可选串 + truthiness 判断 → 传空串等于绕过 409。加 `.min(1)`。

### L-06 · 逗号串标签/软件字段不往返 `[已验证]`
- `lib/db.ts:86-93`：`tagsToString` 直接 `join(",")`，`tagsToArray` 直接 `split(",")`。标签里含逗号（"角色, 场景" 这种带中文逗号外的输入）→ 静默变成两个标签，且筛选/计数跟着错。
- 修法：入库前 `split(/[,，]/).map(trim).filter(Boolean).join(",")` 归一化，或直接 `JSON.stringify` 存文本列。

### L-07 · 文本字段无长度上限，数值字段无符号约束 `[代理采集]`
- `works/route.ts:23-36`、`intro/route.ts:9-12`、`detail-sections/route.ts:10-14` 无 `.max()` → 数 MB 的 `description`/`content` 可入库并被 `unstable_cache` 反复序列化；`imageSize: z.number().int()` 接受负数 → 存储面板 `SUM` 变负。`detail_sections.sort_order` 接受非整数。
- 修法：统一加 `.max(2000)` / `.nonnegative()` / `.int()`。

### L-08 · 写 0 行也报成功 `[代理采集]`
- `app/api/detail-sections/[id]/route.ts:34,38,53-56`：`rowsAffected === 0` 时仍返回 `{updated:true}` / `{deleted:true}`，`saveAll` 显示成功 → 行已被别人删掉时前端状态与库不一致。

### L-09 · 验证码实际可试 6 次 `[代理采集]`
- `lib/verification-codes.ts:20-37` 先自增后比 `attempts > 5` → 边界差一。应为 `>= 5`。

### L-10 · R2 删除队列在请求路径上做 N+1 且可能被冻结 `[已验证]`
- `lib/r2-delete-jobs.ts` 的 `findReferencedUrls`(:32-45) 对**每个 URL 单独查询**，条件是 `WHERE image_url = ? OR thumb_url = ?` —— 这两个列在 `lib/schema.ts` 里**都没有索引**。而 `void processR2DeleteJobs()` 被挂在 8 处写路径上（如 `works/images/[imageId]/route.ts:19`、`images/route.ts:65`），删一个 10 图作品 ≈ 21 次查询 × 2 次全表扫，且在 Vercel 上 `void` 不 `waitUntil` 的 promise 可能被实例冻结中途丢弃。
- 修法：`WHERE image_url IN (…) OR thumb_url IN (…)` 一次查完（配 P-05 补索引），或直接改成"删除时同步 `deleteObject` + 每日一次全量清扫"（见 O-04）。

---

## 3. UX 缺陷（用户能直接感觉到的）

### U-01 · 桌面端滚动后光标消失，直到再次移动鼠标 `[已验证]`
- `components/cursor.tsx:86-89` 在 `scroll` 时把 bead 和 ring 的 `opacity` 设 0，只有 `:70-71` 的 `mousemove` 才恢复；同时 `:26` 给 `<html>` 加 `hide-native-cursor`（原生光标全局 `cursor: none`）。用滚轮/触控板/拖滚动条时鼠标是不动的 → **屏幕上没有任何光标**。
- 而且这条被测试反向掩盖了：`e2e/desktop-cursor.spec.ts` 的 helper 在轮询 opacity 的循环里**顺便移动鼠标**（`[代理采集]` :20-30 ），正是"卡到下次 mousemove"这一 bug 类不可见的原因。
- 修法：滚动后定时恢复（`setTimeout` 120–200ms）或干脆不因滚动隐藏；并修正 spec：滚动后**不移动鼠标**断言光标仍可见。

### U-02 · 加载骨架屏是死代码，重试按钮无反馈 `[已验证]`
- `components/home-hooks.ts:26` `useState(false)`，`:77` 只 `setLoadingWorks(false)` —— **没有任何地方把它设为 true** → `components/home-client.tsx:630-638` 的骨架分支永不渲染。点"重试加载"（`:645-652`）在 fetch 返回前没有任何视觉变化，连点第二次被 `refreshInFlightRef`（:35）静默吞掉。
- 修法：要么在 `refreshData` 开头 `setLoadingWorks(true)`（配合 U-03 一起重构），要么删掉这段骨架 JSX（约 9 行）与 `loadingWorks` 状态。

### U-03 · "出错"和"该分类没有作品"两种状态被挤在同一个分支 `[已验证]`
- `home-client.tsx:639-643`：`loadError` 只在 `filtered.length === 0` 内部渲染。于是：① 有数据时轮询失败 → 用户完全看不到任何提示（`home-hooks.ts:74` 已 `setLoadError(true)`）；② 选了一个合法但为空的标签，如果恰好 `loadError` 为真 → 显示"内容暂时加载失败"，误导。
- 修法：把 `loadingWorks | loadError | works.length | filtered.length` 四源塌成一个可判别状态（`{kind:"loading"} | {kind:"error"} | {kind:"empty-filter"} | {kind:"ok"}`），错误提示独立渲染在网格上方，不打断已有内容。这一改同时了结 U-02。

### U-04 · 视频作品在 iOS 上是空白卡片，且造成 CLS `[已验证]`
- 视频走 `thumb_url === image_url`（`app/api/upload/process/route.ts:45` 附近），`home-client.tsx:190-199` 于是渲染 `<video preload="metadata">`，**无 poster、无 width/height**，容器 `h-auto` → iOS Safari 不加载首帧 → 空白盒；元数据落地后高度突变 → 真实 CLS；每张视频卡还额外发一次 range 请求。详情页画廊同类问题（`work-detail-gallery.tsx:206-216, 332-339`）。
- 修法：上传视频时用 sharp 生成一张封面 webp（客户端已有首帧，可直接上传作为 thumb），并给 `<video>` 固定 `width`/`height` 与 `poster`。

### U-05 · 筛选气泡和网格重排在冷启动是坏的，访问过详情页之后才"变好" `[已验证配置，代理采集机制]`
- `home-client.tsx:386` 是 `features={domAnimation}`，但 `:617 layoutId="sort-bubble"`、`:665 layout`、`:117 nav-bubble` 需要 projection 特性（只存在于 `domMax`）。同时 `work-detail-gallery.tsx:5` 直接 import `motion` 会加载完整特性包 → 用户「首页 → 详情页 → 回首页」后，同一页面的动画行为发生变化。**行为随浏览历史不同而不同**，是最难排查的一类前端不一致。
- 修法（二选一，别混）：要么承认要布局动画并 `features={domMax}`（代价约 +40 KB gz，与 P-08 冲突）；要么删掉 `layoutId`/`layout`（气泡用 CSS transform 位移，网格淡入淡出），我推荐后者——**更小的包、更确定的行为**。

### U-06 · 后台首屏闪"暂无作品"，pin 按钮失败无反馈 `[代理采集]`
- `components/admin/admin-page-client.tsx:50` 初始 `works = []` + `work-list.tsx:26-28` 的空态 → 后台先显示"暂无作品"再一帧后替换成真数据（`app/admin/page.tsx` 没给初始数据，白丢一次 SSR 优势）。`togglePin`（:207-223）无 try/catch → 网络失败 = 未处理 rejection + 按钮看起来是坏的。

### U-07 · 灯箱缺焦点陷阱，`<video controls>` 嵌在 `<button>` 里 `[代理采集]`
- `work-detail-gallery.tsx:254-261` 只聚焦关闭按钮，Tab 会跑到页面背后；`:198` 的 `<button>` 内嵌 `:206` 的 `<video controls>` 是非法 HTML，Safari 会忽略内层控件 → 触屏/键盘用户点不到播放控制。

### U-08 · 筛选/排序不持久、结果数无播报、`cursor: none` 吞掉输入光标 `[代理采集]`
- 筛选与排序都是本地 state（`home-client.tsx:356-357`），刷新/后退丢失（admin 反而持久化了 `?tab=`，行为不一致）；结果数文案 `hidden md:block` 且无 `aria-live`；`globals.css:369-372` 全局 `cursor: none !important` 连输入框的 I 型光标和 `cursor-zoom-in` 一起取消，表单里只剩一个无信息的小圆点；`i % 3` 的错落偏移（`:671`）在筛选后整列重排。

### U-09 · `devicePixelRatio` 变化时主线程极光不重算分辨率 `[代理采集]`
- `aurora-canvas.tsx:569-579` 只在宽高变化时重设分辨率（worker 路径 :329 处理了 DPR）→ 浏览器缩放或拖到另一块屏后画布发糊。另 `:298` 把 `shouldUseCssFallback` 当作 `getSnapshot` 用，会在 **render 期间创建 canvas + 2D context**；`:101` 的 `cleanupSelf` 引用了声明在其后的 `scrollPauseTimer`/`resizeObserver`（TDZ 地雷）。

---

## 4. 过度设计（同一职责多实现 / 只写不读的设施）

### T-01 · 极光三套实现 ≈ 1072 行，只为一个背景 `[代理采集]`
`components/aurora-canvas.tsx` 主线程版 + `public/aurora-worker.js`（含手写 Perlin，与 `:333` 用的 `simplex-noise` 重复）+ `CssAurora` 兜底，中间靠 `cloneNode`/`dataset` 手工交接和降级看门狗连接。合并成一套（worker 优先 + CSS 兜底，删主线程重实现）可减约 700 行，用户无感知。

### T-02 · `audit_logs` 只写不读 `[已验证]`
全仓 `audit_logs` 只出现在 `lib/audit-log.ts:20` 的 INSERT。8 个写路由 `await writeAuditLog(...)` → 每次写多一次串行往返，换来一份没有任何查询和界面的数据。要么加个后台查看器（对单人站也不必要），要么删掉表和模块，保留 `reportApiError` 的结构化日志即可。

### T-03 · 死表与装饰性迁移账本 `[已验证]`
- `details`（`lib/schema.ts:40-45`）：建表 + 播种 1 行，全仓零读零写，已被 `detail_sections` 取代 → 删。
- `schema_migrations` + `RECORDED_MIGRATIONS`：8 个版本串只被 `INSERT OR IGNORE` 写入，**从不被读取来门控任何迁移**（`runMigrations` 无条件跑全套）。幂等性已由 `CREATE IF NOT EXISTS` + `addColumnIfMissing` 保证 → 这个账本是装饰品，且它自身就是 P-05 的 8 次往返。
- `scripts/check-schema-source.mjs`（17 行 CI 门）：只 grep 标识符**文本**是否出现在两个文件里，永远通过。AGENTS.md 声称它"验证 db.ts 和 push-schema.ts 共用一个 schema 源"是**夸大**——真正的保证来自两者 `import` 同一个 `lib/schema.ts`（TypeScript 已保证）。删掉这个脚本和对应的 CI 步骤。

### T-04 · 手写持久化重试队列 vs 一条生命周期规则 `[已验证规模]`
`lib/r2-delete-jobs.ts`(102) + `/api/cron/r2-delete`(45) + `r2_delete_jobs` 表 + `.github/workflows/r2-delete-cron.yml` + 8 处 `processR2DeleteJobs()` 调用 + 6 处 enqueue，为一个**一年删几十次图**的个人站提供了退避重试的 durable queue，代价是 P-10 的每请求 N+1 和一次要维护的 Secrets 工作流。等价更简的方案：删除时同步 `deleteObject`（失败就地记 1 条待办）+ 每天一次 cron 全量清扫孤儿 key。注意：现有 `e2e/r2-delete.spec.ts` 断言的是**队列机器**（INSERT 语句字符串、`r2_delete_jobs` 行），是典型的"为过度设计而写的测试"，简化时要一起重写为端到端断言"对象确实从 R2 消失"。

### T-05 · 三层限流服务 3 个端点 `[代理采集]`
`rateLimit()` 实际只保护 login、send-code(×2)、visits.track；而实现有 Upstash → Turso `rate_limits` → fail-closed 429 三层 + 独立存储模块。单人站保留 Turso 一层即可（Redis 分支和它的环境变量一起删），fail-closed 语义保留。

### T-06 · 认证有 3 条并行路径 `[代理采集]`
`?key=` 书签登录（`proxy.ts`，已能用）+ TOTP（`otplib`、`qrcode`、`/admin/totp-setup`）+ 邮箱验证码（`nodemailer`、`verification_codes`、`send-code` 双层层限流、`lib/email.ts` 里硬编码 IP 绕 DNS 污染）。后两套是为一个管理员账号建的灾备，却各自带来依赖、路由、表和 e2e。若 `?key=` 是日常入口，可考虑只留 TOTP，删邮件那一整套（含硬编码 IP 这个长期隐患）。

### T-07 · 其余重复与死代码 `[代理采集]`
- 返回顶部两份：`home-client.tsx:274-322`（内联 AnimatePresence 版）vs `components/back-to-top-button.tsx` —— 留后者。
- 写路由样板 ×17：`requireSameOrigin → requireAuth → zod → try/catch → reportApiError → fail`，一个 `withAdminWrite(handler)` 高阶函数能省数百行并把首轮那类"某个路由漏了 try/catch"（L-03）从结构上消灭。
- 无消费方：`data-hover`（24 处）、`reveal.tsx:33-41` 的 `staggerParent/staggerChild`、`theme-client.ts:72`、`globals.css:180` 的 `.glass-refraction`、`:37-41/:62-66` 的 `--blob-*`。
- `dompurify` 只在 `components/admin/detail-sections-editor.tsx:4` 的客户端跑；而唯一 `dangerouslySetInnerHTML` 是 `layout.tsx:79` 的静态主题脚本，正文渲染走转义的 `renderBoldContent` → 目前它守的是一个不存在的 XSS 汇点（服务端净化才是有效位置；客户端净化可被绕过）。
- `cuid2` 可被 `crypto.randomUUID()` 替代（省一个依赖），如果不需要短 id 的话。
- `docs/archify/` 里提交了约 **1.34 MB** 的 PNG/HTML 构建产物（含 `*.visual-check.*`）→ 移到忽略目录。
- 文档自相矛盾：AGENTS.md 说"代码不加注释"，但 `app/api/auth/login/route.ts:37`、`lib/auth.ts:23`、`lib/email.ts` 里有约 15 行中文注释/分节头；AGENTS.md 说 e2e 有 10 个 spec（对），但同时"9 specs"的历史提法已在 `9ffe2fb` 同步过——建议只留一处计数，别在文档里写易变数字。

---

## 5. 已经是对的（别顺手改坏）

- 写路由鉴权顺序与 CSRF 姿态：`requireSameOrigin → requireAuth` 在全部 17 个写路由上一致（写路由集合 == requireSameOrigin 集合，cron GET 由 `CRON_SECRET` 守）；`sameSite=lax` cookie；`proxy.ts` 缺 `ADMIN_SECRET_KEY` 返 503、`no-store`、无开放重定向、`timingSafeEqual` 前先比长度。
- 事务卫生：`db.transaction("write")`（= BEGIN IMMEDIATE）、`!transaction.closed` 保护的 rollback、`finally` 里 `close()`，7 个文件一致；`enqueueR2DeleteInTransaction` 始终在事务内；`imageId` 删除路由**在重排封面之后**才重算受保护 URL（`route.ts:73-81`）——这个顺序是对的，别调回去。
- 索引命中：`works ORDER BY pinned DESC, sort_order DESC, created_at DESC` 走 `idx_works_list_order` 反向扫；`work_images WHERE work_id ORDER BY sort_order, created_at`、`r2_delete_jobs WHERE next_run_at <= … ORDER BY next_run_at` 都与 `lib/schema.ts` 索引匹配。
- 客户端纯净度：在 20 个已构建 chunk 里字符串搜索 `@aws-sdk` / `libsql` / `sharp` / `crypto` / `nodemailer` / `zod` / `dompurify` **全部不出现**（dompurify 只在 admin 专属 chunk）——server-only 隔离这条红线守住了。
- 访问统计写路径：客户端 effect + `keepalive`、sessionStorage 去重、bot/admin 过滤、限流，不进渲染关键路径。
- 主题无闪烁（`layout.tsx:78-82` 预绘脚本 + `suppressHydrationWarning`）、`prefers-reduced-motion` 在极光/Lenis/CSS marquee 上都有尊重、`ResizeObserver` 用于两块画布与查看器宽度、乐观 reorder 在 409 时正确回滚、图片列表 key 用 `work.id` 而非 index。
- `reportMetric`/`reportApiError` 都不 `await`，不拖慢响应。

---

## 6. 修复路线图（按 ROI）

| 阶段 | 内容 | 风险 | 验证 |
|---|---|---|---|
| **S1 立刻（低风险高回报）** | P-02 边缘缓存 + `Cache-Control` + 统一图片域名（含一次性 SQL 改写）；P-06 catch 改 throw；L-01 `strftime('+1 millisecond')`；L-05 `.min(1)`；L-09 `>= 5` | 低 | 线上 `curl -I` 断言头；e2e 追加同秒连写断言 |
| **S2 后台自愈性** | L-02 空封面保护 + 补 e2e；L-03 POST 400 + 被拒 key 入删除队列；U-02/U-03 状态塌成判别联合（顺带删死骨架） | 低 | 新增 3 个 e2e（删到 0 图 / 非法数组 / 错误态仍显示已有作品） |
| **S3 字体与包体（最大 LCP/交互收益）** | P-01 字体自托管；P-08 framer 根 import 清理；P-09 `/api/works` 包缓存 + 裁投影；P-07 `revalidate` 300–900s | 中（构建期需访问 Google；P-01 有视觉回归风险） | `next build` 前后 First Load JS 对比；Lighthouse 移动分 |
| **S4 动效与流畅度** | P-04 桌面限帧 + 滚动暂停；U-01 光标滚动后恢复 **且修 spec 的自掩盖**；U-04 视频 poster + 宽高；U-05 删 `layout`/`layoutId`；P-03 多档缩略图 | 中（视觉主观） | Performance 录制静置 10s；CLS = 0；光标 e2e 不移动鼠标 |
| **S5 数据层长期健康** | P-05 `instrumentation.ts` + 迁移短路；P-10 sargable 谓词 + 保留期；L-10 引用检查一次 IN 查询 + 补 `works.image_url` 索引；P-11 `React.cache()` | 中（迁移改动要过 Turso） | 冷启动日志语句计数；`EXPLAIN QUERY PLAN` |
| **S6 减复杂度（可维护性）** | T-03 删 `details`/`schema_migrations`/`check-schema-source`；T-02 删 `audit_logs`（或加读者）；T-01 极光合并；T-04 R2 队列换成同步删 + 每日清扫；T-07 `withAdminWrite` + 死样式 + 忽略 `docs/archify` 产物 | 中高（每项都动测试） | 净 LOC 下降、lint/typecheck/build/e2e 全绿；每项一个 commit 便于回滚 |

**建议不做的**：为这个体量引入 Redis/消息队列/图像微服务/前端状态库；再增加 e2e 数量去覆盖 S6 里被删的机制（那些测试是过度设计的配件，不是产品不变量）。

---

## 7. 需要真实数据才能定级的未知项

1. Turso 实例与 Vercel 函数的地理距离（决定 P-05/P-06/P-11 的真实秒数）。
2. `MONITORING_WEBHOOK_URL` / `CRON_SECRET` / `UPSTASH_REDIS_REST_*` 在 Vercel 是否真的配了（决定 T-04/T-05 是"多余"还是"根本没生效"）。
3. `visits` / `audit_logs` / `rate_limits` 当前行数（决定 P-10 的紧急度）。
4. 中国大陆真实访客的 LCP/FCP（P-01 的判断基于域名可达性常识 + render-blocking 语义，未做大陆节点实测）。
5. 是否存在 `*.r2.dev` 之外的历史域名 URL 需要一并改写。
6. 并发管理员/多标签页编辑是否真实发生（只有会发生时，L-04 / L-01 才致命）。

---

## 8. 产物

- 本文件：`docs/audit-2026-09-05/full-review.md`
- 风险关系图：`docs/audit-2026-09-05/risk-quality.dot`（Graphviz，`dot -Tsvg` 渲染）
- 证据基线：`git rev-parse HEAD` = `0f9a39f`；`next build` 实测（21 静态页、`/` Revalidate 30s Expire 1y、首页 first-load JS 247,986 字节 gz）；`node:sqlite` 实测 `datetime`/`strftime` 行为；`curl -I` 实测线上图片头与首页图片域名分布。
- 制作方式：`architecture-visualization:risk-quality-reviewer`（证据采集用 4 个并行 general-purpose 子代理，关键结论主代理逐条读码 + 跑库复核）
- 下一步：确认是否按 S1→S2 顺序开工；S3 的字体方案需要你先定"自托管 vs 保留外链"。

---

## 9. 与同日另一份报告的关系

同一天已有一份审查报告：`C:\Users\admin\Desktop\作品集网站审查报告-2026-09-05.md`（190 行，7 步路线图）。两份**互补但有重叠**，请以本节为准做取舍，不要把它们当成两份独立清单累加。

**重叠（两份都指认，结论一致，无需二次确认）**：删到 0 图致空封面崩溃链（L-02）、`TOUCH_WORK_UPDATED_AT_SQL` 毫秒被截断（L-01，对方列为小修 4d，我按"首轮修复失效"定级更高）、aurora 桌面端无滚动暂停 + 每帧全屏 blur 合成（P-04）、aurora 三份实现（T-01）、`/api/works` 零缓存轮询（P-09）、`visits` 无保留期 + 日期函数不可用索引（P-10）、R2 孤儿对象（L-03/L-07）、`loadingWorks` 恒 false 与骨架死代码（U-02）、`POST /images` 缺校验、视频封面等于原视频（U-04）、死代码一批（含 `details` 表、`initializeDb`、`staggerParent/Child`、`toggleResolvedTheme`）。

**本报告独有（对方完全未覆盖，我实测或读码确认）**：
1. **P-02 图片交付层**：`cdn.tangzihang.top` 实测 `cf-cache-status: DYNAMIC` 且响应**无 `Cache-Control`**（R2 自定义域名需显式 opt-in 边缘缓存）；首页 17 张缩略图**分裂在两个域名**（10 个 `pub-*.r2.dev` + 7 个 `cdn.tangzihang.top`）。这是首屏最大的非代码瓶颈，也是 L-07 删除静默跳过的根因。对方的报告里没有任何 `cache-control` / 边缘缓存 / 域名分布的测量。
2. **P-08 包体构成**：实测首页 first-load JS 247,986 字节 gz，并定位到 `LazyMotion features={domAnimation}` 被 `home-client.tsx:8-14` 的根入口 import（`AnimatePresence`/`useScroll`/`useTransform`/`MotionConfig`）与 `work-detail-gallery.tsx:5` 的 `motion` import 完全抵消。对方无包体分析。
3. **U-01 光标滚动后消失** + `e2e/desktop-cursor.spec.ts` 在轮询断言时移动鼠标导致该 bug 类不可见（测试自掩盖）。对方无此条。
4. **L-04 `PUT /api/works/[id]` 在事务外读回 `updated_at`** → OCC 假通过 → 静默丢更新。对方无此条。
5. **P-05 冷启动 16 次串行迁移往返**（`initializeDb` 无人调用、无 `instrumentation.ts`、`revalidate:30` 放大命中冷实例的概率）。对方把 `initializeDb` 归入死代码，未连到延迟。
6. **P-06 catch 分支结果被 `unstable_cache` 缓存** → 一次 DB 抖动全站空首页 30s+。对方无此条。
7. **U-05 `layoutId`/`layout` 在冷启动首页失效、访问过详情页后生效**（行为随浏览历史变化）。对方无此条。
8. **P-07 `revalidate = 30` 双层 30 秒 TTL 对个人站是 10 倍过度**、T-02 `audit_logs` 零读者、T-03 `check-schema-source.mjs` 永真（AGENTS.md 描述夸大）。

**判断分歧（需要你来定）**：字体。对方把 render-blocking CJK 字体定为 🟡 并认为"Google 按 unicode-range 切片，实际传输可控"；我定为 P-01 高优先，理由是（a）阻塞的是 **CSS 请求本身**而非只有字体分片，(b) 中国大陆对 `fonts.googleapis.com` 的可达性不稳，白屏风险不对称，(c) `next/font` 已经在构建期自托管另外三套字体，同一页面混用两套字体加载机制没有收益。若你的访客主体在海外，对方的降级判断可以接受；若访客主体在中国大陆，应把它排进 S1/S3 首位。

**执行建议**：合并成一张单子做，顺序用本文件的 S1–S6，把对方路线图第 3 项（图片宽高入库消除 CLS）、第 5 项（R2 孤儿清理）、以及 §四·1（`avi`/`mkv` 上传后浏览器不能播放）补进 S2/S5/S6——这三条对方有、我这边没有独立验证，值得一起收。两份报告共 1 处崩溃链、2 处丢数据路径、3 处交付层浪费、以及约 1500 行可删复杂度。

---

## 10. 审查自我更正（实施阶段实测推翻的三条结论）

诚实记录：下面三条是本审查（含子代理采集）的结论，在动手时被证伪或修正。以后复用本报告时以本节为准。

### 更正 1 · P-06 附带说法错误：`app/error.tsx` 早就存在
本文件称"当前只有 `not-found.tsx`"。实际 `app/error.tsx` 已存在，且有 500 文案与"重新加载"按钮。因此"catch 结果被缓存成空首页"的修法就是简单地让它 throw，无需新建错误页。**教训**：子代理的"缺失类"结论（某某文件不存在）必须自己 Glob 一遍再采信。

### 更正 2 · P-01 推荐的具体方案不成立：`next/font` 无法自托管中文切片
本文件建议"把 Noto Serif SC / Noto Sans SC 交给 `next/font/google`，`subsets: ["chinese-simplified"]`"。实测不可行：Next 16 内置字体元数据 `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` 里 `Noto Serif SC` 的 `subsets` 只有 `["cyrillic","latin","latin-ext","vietnamese"]`，`chinese-simplified` 通不过 `validate-google-font-function-call` 的类型检查；且 `getGoogleFontsUrl(fontFamily, axes, display)` 根本不传 subset 参数，切片是按元数据里的合法子集名去 CSS 里筛的，中文没有对应子集名 → 拿不到中文字形。**可行方向只有三个**：① 正文用系统中文字体（零下载，已实施）；② 构建期脚本自行拉取 Google 中文切片并本地 `@font-face`（每字重代价数 MB）；③ 保留外部 `<link>` 但改用大陆可达镜像并做非阻塞加载。已实施 ①，并把标题字体的 ②③ 留作用户决策。

### 更正 3 · L-01 我给出的修法本身是错的：`'+1 millisecond'` 不是合法 SQLite 修饰符
本文件（以及我最初写进 `lib/db.ts` 的修复）建议改成 `strftime('%Y-%m-%d %H:%M:%f', updated_at, '+1 millisecond')`。实测该表达式返回 **NULL**：SQLite 时间修饰符的单位里没有 `millisecond`，毫秒必须写成小数秒 `'+0.001 seconds'`；而标量 `MAX(a, b)` 任一参数为 NULL 即返回 NULL，所以这个"修复"会把 `updated_at` 写成空值并撞上 NOT NULL 约束。

**正确写法（已落地并实测）**：
```sql
updated_at = MAX(strftime('%Y-%m-%d %H:%M:%f', 'now'),
                 strftime('%Y-%m-%d %H:%M:%f', updated_at, '+0.001 seconds'))
```
`node:sqlite` 实测（对同一行连续 8 次写入）：
- 旧表达式 `datetime(updated_at,'+0.001 seconds')`：8 次结果**完全相同**（毫秒被截断；同秒内若 `now` 的毫秒位小于旧值，结果还会倒退）→ 首轮审计声称的"毫秒单调递增"确实完全失效。
- 新表达式：8 次结果严格递增且互不相同，毫秒位保留；对"库里时间戳领先于 now"的情况也能逐毫秒正确推进。

通用陷阱记一条：**给 SQLite 时间列做算术要用 `strftime(..., '+N seconds')` 而不是 `datetime(...)`，后者静默丢弃毫秒**；而 `MAX()` 的 NULL 传播会让"多加了一层保护"的表达式整体失效。

### 极光实测数字（P-04 定级依据：Chromium + CDP，1440×900，桌面细指针，静置采样）
| 场景 | 主线程 Task | 其中 scripting | 页面实际 RAF |
|---|---|---|---|
| 现状（aurora 满帧动画） | **998 ms/s** | 461 ms/s | **24 fps** |
| 画布 `visibility:hidden`（JS 仍逐帧画） | 471 ms/s | 462 ms/s | 25 fps |
| 画布移出布局（JS 不再逐帧画） | 38 ms/s | 17 ms/s | 60 fps |

读法：每帧全屏 `drawImage` + `ctx.filter` blur 合成的纯 scripting 约占 **46% 单核**，含光栅化后总计约**吃满一个核心**，把页面帧率压到 24fps；摘掉它之后，剩余全部动效（Lenis、自定义光标、framer、玻璃层）合计只有 38 ms/s。也就是说桌面卡顿几乎全是极光的，而非玻璃拟态或滚动处理——这修正了同日另一份报告"三重叠加"的归因权重。

据此实施：桌面档 `targetFps 60→30`、`mainBlur 12px→6px`、滚动暂停对**所有**指针类型生效（原先只有粗指针）。bloom 层与射线密度不变，观感差异集中在光晕柔和度与漂移流畅度。

### 实施中新发现、原报告未覆盖的两条
- `DELETE /api/works/{id}/images`（清空整个作品图片）与空数组 `PUT` 会清掉 `work_images` 却把 `works.image_url` 留在原位，且该对象因仍被引用而受 R2 删除保护 → 出现"有封面、零图片"的不一致状态。不同于 L-02 的空串崩溃链，本次未改，留作后续。
- 拒绝上传批次时若只回收"非法条目"的 R2 对象，仍会泄漏同批次里合法但未被插入的对象（因为整批被拒）。已按"整批 URL 全部入队 + 删除前二次校验库内引用"处理。
