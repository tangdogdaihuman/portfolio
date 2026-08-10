# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目速览

唐子航个人 CG 作品集网站：Next.js 16 App Router + React 19 + TypeScript strict + Tailwind v4，数据在 Turso(libsql)，媒体在 Cloudflare R2，部署在 Vercel。

## 权威文档：先读 AGENTS.md

本仓库的命令、架构、数据模型、上传流、鉴权、易漏点全部维护在 [AGENTS.md](./AGENTS.md)，**它是单一事实来源，工作前先读**，此处不重复。子目录另有局部约定：

- `components/admin/AGENTS.md` — 后台组件：禁引 server-only 模块、表单状态用对象整体替换
- `app/work/AGENTS.md` — 作品详情页：数据读取保持服务端，不加客户端 fetch

改动若影响这些约定，同步更新 AGENTS.md，不要把细节写进本文件。

## 验证顺序（与 CI 一致）

```bash
npm run lint && npm run typecheck && npm run test:schema && npm run build && npm run test:e2e
```

单跑一个 e2e：`npx playwright test e2e/portfolio.spec.ts`；按名过滤：`npm run test:e2e -- -g "用例名"`。

## 本机环境注意

- `npm run dev` 和 e2e 都固定用 **3000 端口**，与本机 UE MCP（localhost:3000）冲突。UE 编辑器开着时，手动起 dev 用 `npx next dev -p 3001`；跑 e2e 前先确认 3000 没被占。
- 生成产物避开搜索/编辑：`.next/`、`tsconfig.tsbuildinfo`、`test-results/`、`e2e.db*`、`.playwright-mcp/`。

## 任务执行原则

### 并行优先 (Ultracode 模式)
当用户以 ultracode 或高并行模式运行任务时，执行前必须：
1. **先拆依赖图** — 列出所有子任务，标注依赖关系
2. **独立任务并行 spawn** — 互不依赖的子代理一次性全部派发
3. **主线程只做缝合** — 不要串行跑可以并行的事

违反此原则会导致 wall-clock 时间翻倍，属于低级错误。

### 通用习惯
- 回答"能不能做"之前，先想"做了有没有价值"
- 解释技术概念时，分层说（表层→深层），每层一句话概括
- 写代码前先确认目标平台（Windows/Linux/WSL）的路径差异
