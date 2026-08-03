# Tasks

- [x] Task 1: 修复首页元信息刷新失败阻断作品刷新
  - [x] 1.1 重构 `components/home-hooks.ts` 的 `refreshData`：先等待并更新作品数据（`setWorks`、`setLoadError(false)`、`lastWorksRefreshAtRef`），再非阻塞地处理元信息刷新
  - [x] 1.2 元信息刷新失败改为非致命：用独立的 try/catch 包裹，失败时保留上次成功的元信息数据，不触发 `loadError`
  - [x] 1.3 验证：TypeScript 编译通过；元信息接口 5xx 时作品仍更新、页面不显示错误态

- [x] Task 2: 修复封面图匹配与删除判定
  - [x] 2.1 修改 `lib/work-images-replace.ts` 的 `chooseCoverImage`：优先匹配 image_url 精确命中，其次 thumb_url 精确命中，否则回退到 `sortOrder` 最小者
  - [x] 2.2 检查 `collectRemovedImageUrls` 的 `newUrls` 判定逻辑，确保主图/缩略图分属不同图片时不会误删仍被引用的 URL
  - [x] 2.3 验证：`npm run typecheck` 通过；`npm run test:e2e`（先跑 `work-form-state` 与 `portfolio` 相关 spec）通过

- [x] Task 3: 图片批量写入加事务
  - [x] 3.1 将 `app/api/works/[id]/images/route.ts` 的 POST 改写为 `db.transaction("write")`，把"作品存在校验、批量插入、封面更新"纳入同一事务，配合 try/catch/finally 回滚
  - [x] 3.2 保持响应结构（`ok({ ids })` 201、审计日志、revalidate）不变
  - [x] 3.3 验证：`npm run typecheck` 通过；e2e 相关路径通过

- [x] Task 4: key 登录覆盖登录页 + 清理死代码
  - [x] 4.1 调整 `proxy.ts`：将 `keyParam` 校验提前到 `/admin/login` 白名单判断之前，使 `/admin/login?key=...` 也能签发 cookie 并跳转
  - [x] 4.2 移除白名单中无法命中 matcher 的 `/api/auth/login` 死代码（仅保留 `/admin/login`）
  - [x] 4.3 验证：`npm run typecheck` 通过；`test:e2e` 中 admin 登录相关路径通过

- [x] Task 5: 作品卡片列宽不随下标跳动
  - [x] 5.1 修改 `components/home-client.tsx` 的 `colSpan` 计算，改为基于作品稳定属性（`size_weight`）而不是筛选/排序后的数组下标 `i`
  - [x] 5.2 验证：`npm run typecheck` 通过；`npm run lint` 通过

- [x] Task 6: 加固同源校验
  - [x] 6.1 修改 `lib/api-security.ts` 的 `requireSameOrigin`：对 origin 与 hostname 做规范化（忽略端口、仅比较 hostname），改为基于 hostname 的比对，避免直接信任 `Host` 头做相等比较
  - [x] 6.2 保持现有对 loopback（非生产）的放行逻辑，不改变正常请求行为
  - [x] 6.3 验证：`npm run typecheck` 通过；各写路由 e2e 通过

- [x] Task 7: 修复列表总尺寸零子图边界
  - [x] 7.1 修改 `app/api/works/route.ts` 的 GET 聚合：`CASE WHEN SUM(image_size) IS NULL OR SUM(image_size) = 0 THEN w.image_size ELSE SUM(image_size) END` 作为 `total_size`
  - [x] 7.2 验证：`npm run typecheck` 通过；`smoke` 相关覆盖通过

# Task Dependencies
- Task 1-7 相互独立，可并行实现。
- 全部任务完成后统一执行 `npm run lint` → `npm run typecheck` → `npm run test:schema` → `npm run build` → `npm run test:e2e` 做最终验证。