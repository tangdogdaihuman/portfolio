# 安全审计报告

审计日期：2026-08-09
目标：唐子航个人 CG 作品集（Next.js 16 App Router + Turso + Cloudflare R2，部署于 Vercel）
方法：三轮循环 = 静态代码审计 → 修复 → Kali 黑盒渗透（nmap / nikto / sqlmap / gobuster / 手工 API 探测）

---

## 一、漏洞发现与修复清单

### 高危

#### 1. 依赖漏洞（next / postcss / sharp / ws）
- **等级**：高
- **文件**：[package.json](file:///c:/Users/admin/Desktop/个人网站2/package.json)
- **触发**：`npm audit` 报告 `next@16.2.6`、`postcss@<8.5.26`、`sharp@0.34.5`、`ws@8.20.1` 存在已知 CVE
- **修复**：升级 `next` → 16.3.0、`eslint-config-next` → 16.3.0、`sharp` → ^0.35.3，并通过 `overrides` 强制 `postcss` → 8.5.26
- **验证**：修复后 `npm audit --registry=https://registry.npmjs.org` → **found 0 vulnerabilities**

#### 2. `/api/auth/logout` 缺失同源检查（CSRF）
- **等级**：高
- **文件**：[app/api/auth/logout/route.ts](file:///c:/Users/admin/Desktop/个人网站2/app/api/auth/logout/route.ts)
- **触发**：`POST /api/auth/logout` 无 `Origin` 校验，第三方站点可跨站强制管理员登出
- **修复**：在处理前插入 `requireSameOrigin(req)`，与全部其他写路由约定一致
- **验证**（修复后实例）：
  - 无 Origin → `403`
  - `Origin: https://evil.com` → `403`
  - 同源 Origin → `200`

### 中危

#### 3. 缺失安全响应头（CSP / X-Frame-Options / XCTO / HSTS 等）
- **等级**：中
- **文件**：[next.config.ts](file:///c:/Users/admin/Desktop/个人网站2/next.config.ts)
- **触发**：全站无 `Content-Security-Policy`、`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`Strict-Transport-Security`，易受 XSS、点击劫持、MIME 嗅探攻击
- **修复**：新增 `securityHeaders` 并应用到 `/:path*`；CSP 按需收紧（`default-src 'self'`、`object-src 'none'`、`frame-ancestors 'none'`、`base-uri 'self'`、`form-action 'self'`，生产环境不含 `unsafe-eval`）
- **验证**（修复后实例 `curl -I /`）：

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=15552000; includeSubDomains
```

### 低危

#### 4. `X-Powered-By: Next.js` 指纹泄露
- **等级**：低
- **文件**：[next.config.ts](file:///c:/Users/admin/Desktop/个人网站2/next.config.ts)（nikto 第二轮发现）
- **触发**：响应头暴露框架指纹，便于定向攻击
- **修复**：`poweredByHeader: false`
- **验证**：修复后 `curl -I /` 已无该头；nikto 复扫该项消失

---

## 二、审计中确认安全的点（无需修复）

| 检查项 | 结论 | 依据 |
|---|---|---|
| SQL 注入 | 安全 | 全部查询走 `db.execute({sql, args})` 参数化；仅两处模板拼接（`works/[id]` 的 SET 子句、`detail-sections/[id]` 的 SET 子句）均为**硬编码列名白名单**（zod 校验后按 key 映射），用户输入只进 `args` 占位符；`visits` 的 `IN (${placeholders})` 只拼接 `?` 占位符个数 |
| XSS | 安全 | 唯一 `dangerouslySetInnerHTML` 在 [layout.tsx](file:///c:/Users/admin/Desktop/个人网站2/app/layout.tsx#L84-L88)，内容为纯静态主题初始化脚本，无用户输入；React 默认转义其余渲染 |
| 越权（IDOR） | 安全 | 所有写路由统一 `requireSameOrigin` → `requireAuth`；`/admin` 由 `proxy.ts` 拦截重定向 |
| 鉴权绕过 | 安全 | HMAC 签名 token + `crypto.timingSafeEqual` 比较；登录接口 10 次/5 分钟限流（实测第 11 次返回 429） |
| CSRF | 安全（修复后） | 写方法强制 Origin 匹配 Host，缺失 Origin 直接 403 |
| SSRF | 安全 | 无服务端代请求用户可控 URL 的功能；`/http://100.100.100.200/...` 仅被 Next.js 规范化为本地路径并 404，未发生真实外联 |
| 敏感信息泄露 | 安全 | `.env`、`/.git/config`、`/package.json` 均 404；`robots.txt`/`sitemap.xml` 为预期公开 |
| 路径穿越 | 安全 | `/api/works/..%2F..%2Fadmin` → 404；上传 `originalKey` 强制 `originals/` 前缀 |
| 上传漏洞 | 安全 | presigned 需鉴权；类型/大小白名单（图片 50MB / 视频 500MB，`lib/upload-policy.ts`）；process 步校验 key 前缀且复校验大小 |
| 命令注入 | 安全 | 全仓库无 `exec/spawn/eval/new Function` 处理用户输入 |

---

## 三、渗透测试证据

目标：`http://localhost:3000`（修复后生产构建 `next start`）

### nmap
仅 3000 端口开放，无多余暴露面。

### nikto（8190 请求）
- 修复前：`X-Powered-By: Next.js`、缺 XCTO 提示
- 修复后复扫：上述两项消除；剩余条目均为信息性（`x-nextjs-*` 缓存头、`robots.txt`、`sitemap.xml`）或误报（OPTIONSBLEED 针对 Apache，`100.100.100.200` 条目实为 Next.js 路径规范化 308 → 本地 404，已手工复核）

### sqlmap（level=2 risk=1，GET URI 注入 + POST JSON）
- `GET /api/works/<id>*`：433 个 payload，**not injectable**
- `POST /api/visits`（JSON body）：753 + 813 个 payload，**not injectable**；且全部触发限流 429，未触达数据库

### gobuster（dirb/common.txt）
仅发现预期路径：`/admin`（→ 登录重定向）、`/favicon.ico`、`/robots.txt`、`/sitemap.xml`，无敏感文件泄露。

### 手工 API 探测（25 项，修复后实例全过）

| # | 用例 | 期望 | 实际 |
|---|---|---|---|
| 1 | `GET /api/works/1' OR 1=1--` | 404（非 500） | 404 |
| 2 | 路径穿越 work id | 404 | 404 |
| 3 | visits 外部 URL path | 400 | 400 |
| 4 | visits `/api/*` path | 400 | 400 |
| 5 | visits 合法 path | 201 | 201 |
| 6 | logout 无 Origin | 403 | 403 |
| 7 | logout 恶意 Origin | 403 | 403 |
| 8 | logout 同源 | 200 | 200 |
| 9 | POST /api/works 无鉴权 | 401 | 401 |
| 10 | DELETE /api/works/1 无鉴权 | 401 | 401 |
| 11 | POST /api/upload/presigned 无鉴权 | 401 | 401 |
| 12 | GET /api/visits 无鉴权 | 401 | 401 |
| 13 | 六个安全响应头 | 全部存在 | 全部存在 |
| 14 | /admin 无鉴权 | 307 → /admin/login | 307 |
| 15 | 登录爆破 12 次 | 触发 429 | 第 11 次起 429 |
| 16 | work id XSS payload | 404 | 404 |
| 17-20 | 未知 API / `.env` / `.git` / `package.json` | 404 | 404 |
| 21 | cron 无 secret | 401/403 | 403 |
| 22-25 | login 页 / totp-setup 无鉴权 / sitemap / robots | 200 / 307 / 200 / 200 | 符合预期 |

---

## 四、回归验证

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test:schema` ✅（schema-source check passed）
- `npm run build` ✅（Next.js 16.3.0 Turbopack，21 静态页 + 全部 API 路由正常生成）
- `npm run test:smoke`（SMOKE_BASE_URL=http://localhost:3000）✅ public and admin checks passed

## 五、剩余风险与建议

1. **CSP 仍含 `unsafe-inline`（script/style）**：Next.js App Router 的内联 bootstrap 脚本与主题初始化脚本需要它；彻底移除需引入 nonce 方案，改动面大，当前与 X-XSS 缓解（React 转义 + 唯一静态内联脚本）叠加后风险可接受。
2. **登录限流为每 IP 令牌桶**：分布式爆破可横向分摊；可选配置 Upstash Redis 跨实例限流（代码已支持，仅需环境变量）。
3. **TOTP 密钥与邮件验证码**：TOTP_SECRET 缺失时仅密钥登录可用；验证码存进程内存，重启失效——均为既有设计取舍，非漏洞。
4. **`/admin?key=` 书签登录**：URL 中的密钥可能进入浏览器历史/代理日志；建议仅在可信网络使用，用后及时登出轮换密钥。

## 六、轮次记录

| 轮次 | 静态审计 | 渗透测试 | 新增中/高危 |
|---|---|---|---|
| 第 1 轮 | 发现 2 高 1 中（依赖、CSRF、安全头） | 修复前基线 | 3 |
| 第 2 轮 | 确认 SQL 拼接白名单安全；nikto 发现 1 低（X-Powered-By）并修复 | nikto/sqlmap/gobuster/手工 25 项全过 | 0 |
| 第 3 轮 | 复查危险 API（eval/innerHTML/动态 SQL）无新问题；npm audit = 0 | 复扫全绿 | 0 |

连续两轮无新增中/高危发现，且渗透测试全部通过，满足停止条件。
