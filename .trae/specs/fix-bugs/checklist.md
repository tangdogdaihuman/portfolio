# Checklist

- [x] 元信息刷新失败时作品数据仍更新、首页不误报错误态
- [x] 封面图选择与删除判定使用精确匹配，不误删仍被引用的文件
- [x] `works/[id]/images` POST 批量写入在事务中，失败整体回滚
- [x] `/admin/login?key=...` 可完成登录跳转；`proxy.ts` 死代码已移除
- [x] 首页作品卡片列宽不随筛选/排序下标跳动
- [x] `requireSameOrigin` 基于规范化 hostname 比对，不盲信 `Host` 头
- [x] `works` 列表 `total_size` 在子图尺寸全为 0 时回退主图尺寸
- [x] 全量 `npm run lint` / `npm run typecheck` / `npm run build` / `npm run test:e2e` 通过