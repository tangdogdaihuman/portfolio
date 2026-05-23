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
  用于跨实例持久化登录限流；未配置时自动回退到进程内存限流。
- `MONITORING_WEBHOOK_URL`  
  监控事件 webhook，不配置时只打本地结构化日志。
- `ADMIN_KEY`  
  `test:smoke` 优先读取；未设置时会回退到 `ADMIN_SECRET_KEY`。

## 测试说明

### `npm run test:schema`

校验数据库 schema 来源一致：`lib/db.ts` 与 `scripts/push-schema.ts` 都必须引用 `lib/schema.ts`。

### `npm run test:smoke`

HTTP 冒烟检查：

1. 首页可访问
2. `GET /api/works` 正常
3. 有作品时详情页可访问
4. 管理端登录与作品创建/更新/删除链路（需要 `ADMIN_KEY` 或 `ADMIN_SECRET_KEY`）

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

