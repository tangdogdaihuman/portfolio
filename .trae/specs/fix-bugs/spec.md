# 项目 Bug 修复 Spec

## Why
对项目进行系统性 bug 检查。CI 流水线（lint / typecheck / test:schema / build / 29 个 e2e）全部通过，说明编译与既有测试覆盖的路径是健康的。本 spec 针对的是**测试未覆盖的逻辑级缺陷**，通过对关键代码逐行审查确认，共 6 处真实问题。

## What Changes
- 修复首页数据刷新中"元信息刷新失败会阻断作品更新并误报错误态"的逻辑缺陷。
- 修复作品封面图（cover）匹配使用 `||` 宽松匹配可能导致选错封面/误删仍在引用的文件的问题。
- 修复 `works/[id]/images` POST 多步写入未加事务导致状态不一致的问题。
- 修复 `proxy.ts` 中 `/api/auth/login` 白名单死代码，以及 `/admin/login?key=...` 无法走 key 登录的不一致。
- 修复首页作品卡片 `colSpan` 依赖数组下标导致筛选/排序时布局跳动的问题。
- 加固 `requireSameOrigin` 对 `Host` 头的信任（仅作纵深防御性加固，不改变现有行为语义）。
- 修复 `works` GET 列表 `total_size` 在子图 `image_size` 全为 0 时忽略主图尺寸的边界问题。

## Impact
- Affected specs: 首页数据刷新（home-hooks）、作品保存/图片管理（works API）、鉴权（proxy / api-security）、首页展示（home-client）。
- Affected code:
  - `components/home-hooks.ts`
  - `lib/work-images-replace.ts`
  - `app/api/works/[id]/images/route.ts`
  - `proxy.ts`
  - `lib/api-security.ts`
  - `components/home-client.tsx`
  - `app/api/works/route.ts`

## ADDED Requirements

### Requirement: 元信息刷新失败不阻断作品刷新
系统在首页自动刷新时，SHALL 在作品（works）刷新成功后立即更新作品数据，即使元信息（intro / detail-sections）刷新失败，也不得回退已加载的作品数据，也不得因此把 `loadError` 置为 true。

#### Scenario: 元信息接口异常但作品接口正常
- **WHEN** 首页触发自动刷新，`/api/works` 成功但 `/api/intro` 或 `/api/detail-sections` 返回 5xx
- **THEN** 作品列表仍被更新，页面不显示"内容暂时加载失败"，仅保留上一次成功的元信息数据

### Requirement: 封面图匹配必须精确
系统在从图片列表中确定封面图、以及计算被移除图片 URL 时，SHALL 使用"主图与缩略图同时匹配"的精确判断，避免因 `||` 宽松匹配选中错误图片或误删仍被引用的文件。

#### Scenario: 主图与缩略图分属不同图片
- **WHEN** 当前封面 `image_url` 属于图片 A，`thumb_url` 属于图片 B，且两者都在新图片列表内
- **THEN** 封面选择与删除判定不得把 A 或 B 误判为"被移除"，也不得选择错误的封面

### Requirement: 图片批量写入保持事务性
系统在 `works/[id]/images` 的批量新增图片接口中，SHALL 将"校验作品存在、批量插入 `work_images`、更新封面"等写操作放入同一事务，保证中途失败时整体回滚。

#### Scenario: 封面更新失败
- **WHEN** 批量插入图片成功但随后更新作品封面失败
- **THEN** 已插入的图片记录一并回滚，作品状态保持一致

### Requirement: key 登录在登录页同样生效
系统 SHALL 让 `/admin/login?key=<有效密钥>` 与 `/admin?key=<有效密钥>` 一样能够完成登录并跳转，并移除 `proxy.ts` 中无法被 matcher 命中的 `/api/auth/login` 白名单死代码。

#### Scenario: 登录页带 key 访问
- **WHEN** 用户访问 `/admin/login?key=<有效密钥>`
- **THEN** 直接签发 7 天 token cookie 并跳转到后台，而不是停留在登录表单

### Requirement: 作品卡片布局不随筛选下标跳动
系统在首页作品网格中，SHALL 使用作品自身的稳定属性（如 `size_weight` 与稳定顺序）决定列宽，而不是依赖筛选/排序后的数组下标，避免标签筛选或排序时列宽跳变。

#### Scenario: 切换标签筛选
- **WHEN** 用户点击某个标签筛选作品
- **THEN** 保留下来的作品卡片列宽不因位置变化而改变，布局稳定

### Requirement: 同源校验不盲信 Host 头
系统在 `requireSameOrigin` 中 SHALL 以请求本身可校验的信息（hostname 规范化、忽略端口）进行同源比对，而不是直接信任可被攻击者操控的 `Host` 头进行相等比较。

#### Scenario: 伪造 Host 头
- **WHEN** 攻击者构造 `Origin` 与 `Host` 相同但非本站的跨站请求
- **THEN** 同源校验仍能识别并拒绝（配合既有 httpOnly + sameSite=lax cookie 形成纵深防御）

### Requirement: 列表总尺寸计算正确处理零尺寸子图
系统在 `works` 列表聚合 `total_size` 时，SHALL 在子图 `image_size` 全为 0（SUM 返回 0 而非 NULL）时回退到作品主图 `image_size`。

#### Scenario: 子图尺寸全为 0
- **WHEN** 一个作品存在子图但所有子图 `image_size` 均为 0
- **THEN** `total_size` 使用作品主图 `image_size`，而不是显示 0

## MODIFIED Requirements
（无既有需求被修改；以上均为新增的健壮性/一致性修复。）