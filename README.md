# Tang Zihang Portfolio

个人 CG 作品集网站，基于 Next.js 16 App Router。

## 技术栈

- Next.js 16 + React 19 + TypeScript strict
- Tailwind CSS v4 + Framer Motion
- Turso (`@libsql/client`)
- Cloudflare R2（原图 + 缩略图）

## 本地开发

```bash
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 常用命令

```bash
npm run lint
npm run typecheck
npm run build
npm run db:push
npm run test:schema
npm run test:smoke
npm run test:smoke:prod
npm run test:e2e
```

## 环境变量

必填（见 `.env.example`）：

- `DATABASE_URL`
- `DATABASE_AUTH_TOKEN`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `ADMIN_SECRET_KEY`

可选：

- `NEXT_PUBLIC_BASE_URL`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`  
  用于跨实例持久化登录限流；未配置时使用 Turso `rate_limits` 表，多实例共享计数。
- `MONITORING_WEBHOOK_URL`  
  监控事件 webhook，不配置时只打本地结构化日志。
- `ADMIN_KEY`  
  `test:smoke` 优先读取；未设置时会回退到 `ADMIN_SECRET_KEY`。
- `CRON_SECRET`  
  仅在使用外部定时任务调用 `GET /api/cron/r2-delete` 时需要。支持 `Authorization: Bearer <secret>` 或 `x-cron-secret`。后台「容量」页的「立即清理」不依赖它。

## 测试说明

### `npm run test:schema`

校验数据库 schema 来源一致：`lib/db.ts` 与 `scripts/push-schema.ts` 都必须引用 `lib/schema.ts`。

### `npm run test:smoke`

HTTP 冒烟检查：

1. 首页可访问
2. `GET /api/works` 正常
3. 有作品时详情页可访问
4. 管理端登录与作品创建/更新/删除链路（需要 `ADMIN_KEY` 或 `ADMIN_SECRET_KEY`）

本地目标默认允许管理端 CRUD。远程或生产目标默认只检查公开页面和管理端登录，避免误写线上数据；如需对远程目标执行创建/更新/删除，显式设置 `SMOKE_ALLOW_WRITES=1`。

### `npm run test:smoke:prod`

生产冒烟检查，默认目标为 `https://tangzihang.top`。可用 `SMOKE_BASE_URL` 或 `-- --base-url=https://example.com` 覆盖目标。

### `npm run test:e2e`

Playwright 交互测试（自动起本地 Next 服务 + 本地临时 SQLite）：

覆盖首页筛选/排序、详情页灯箱、后台 CRUD/排序/并发冲突、上传策略、主题与光标等。

## 清理重试队列

默认不需要定时任务：

- 后台「容量」页提供「立即清理」按钮，调用 `POST /api/maintenance`（需登录 + 同源）。
- 打开后台或切换后台标签时，如果距上次清理超过 1 小时，会自动补一次。

如希望无人值守，也可配置外部定时任务调用：

- `GET /api/cron/r2-delete?limit=20`
- Header: `Authorization: Bearer <CRON_SECRET>`（或 `x-cron-secret`）

两者都会返回 `processed` / `succeeded` / `failed`，后台接口还会返回 `pending` 与 `retention` 计数。

仓库提供 `.github/workflows/r2-delete-cron.yml`，当前只保留手动触发；需要自动运行时自行添加 `schedule`，并在 GitHub Secrets 配置：

- `CRON_ENDPOINT`（例如 `https://your-domain.com/api/cron/r2-delete?limit=20`）
- `CRON_SECRET`

## 关键约定

- `/admin` 保护由 `proxy.ts` 负责（不是 `middleware.ts`）。
- 写操作接口统一先做 `requireSameOrigin` + `requireAuth`。
- 上传流程固定为：`/api/upload/presigned` -> PUT 原图到 R2 -> `/api/upload/process`。
- 前后台作品相关变更会触发 `revalidatePath("/")` 与 `revalidatePath("/work/[id]")` 路径刷新。

## CI

GitHub Actions (`.github/workflows/ci.yml`) 在 `push/master` 和 `PR` 上执行：

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:schema`
5. `npm run build`
6. `npm run test:e2e`
