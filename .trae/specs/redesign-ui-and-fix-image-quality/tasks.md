# Tasks

## Phase 1: Bug 修复

- [x] Task 1: 修复图片模糊问题
  - [x] SubTask 1.1: 修改 `lib/image.ts`，将缩略图宽度从 800px 提升到 1600px
  - [x] SubTask 1.2: 将 webp 质量从 85% 提升到 90%
  - [x] SubTask 1.3: 验证首页缩略图在 retina 屏上清晰显示
  - [x] SubTask 1.4: 考虑是否需要为已上传图片重新生成缩略图（或只对新上传生效）- 决定只对新上传生效

## Phase 2: 设计系统重构

- [x] Task 2: 重新设计配色系统
  - [x] SubTask 2.1: 设计新的深色主题配色（冷墨 × 香槟金，更有高级感）
  - [x] SubTask 2.2: 设计新的浅色主题配色（暖瓷 × 古铜，明亮清晰）
  - [x] SubTask 2.3: 更新 `app/globals.css` 的 `@theme inline` 变量
  - [x] SubTask 2.4: 确保所有组件在新配色下协调统一（WCAG AA 全量达标）

- [x] Task 3: 优化字体和排版系统
  - [x] SubTask 3.1: 评估并优化字体选择（现有 clamp 层级健康，无需改动）
  - [x] SubTask 3.2: 优化字体大小、行高、字间距的层级系统（比例符合模块化字阶）
  - [x] SubTask 3.3: 优化间距系统（增加 text-rendering: optimizeLegibility）

## Phase 3: 首页重新设计

- [x] Task 4: 重新设计 Hero 区域
  - [x] SubTask 4.1: 优化标题动画效果（逐字 masked reveal + 金色发丝线展开动画）
  - [x] SubTask 4.2: 优化背景效果（Aurora/Particle 在新配色下工作）
  - [x] SubTask 4.3: 优化 CTA 按钮样式和交互（accent 填充动画 + 下划线动画）

- [x] Task 5: 重新设计作品卡片
  - [x] SubTask 5.1: 设计新的卡片样式（发丝边框 + 主题感知阴影 + accent hover）
  - [x] SubTask 5.2: 优化卡片内图片展示（更细腻的 1.028 缩放 + 渐变遮罩）
  - [x] SubTask 5.3: 优化卡片元信息展示（索引号 + 生长发丝线 + 层级优化）
  - [x] SubTask 5.4: 增加更精致的 hover 交互效果（毛玻璃 chip 浮现 + 全部 keyboard accessible）

- [x] Task 6: 优化作品网格布局
  - [x] SubTask 6.1: 评估当前 `md:grid-cols-12` 布局是否最优（保持，逻辑健康）
  - [x] SubTask 6.2: 考虑是否需要瀑布流或不规则网格（保持 grid,纵向节奏增强）
  - [x] SubTask 6.3: 优化卡片间距和视觉节奏（gap-y 从 10 提升到 24）

- [x] Task 7: 重新设计 About 和 Contact 区域
  - [x] SubTask 7.1: 优化 About 折叠面板的视觉效果（金色发丝线 + 旋转加号 + 内层动画）
  - [x] SubTask 7.2: 优化 Contact 区域的排版和视觉层次（display 字体大邮箱链接 + 发丝分隔行）
  - [x] SubTask 7.3: 优化 Footer 设计（三段式排版 + 发丝边框）

## Phase 4: 详情页重新设计

- [x] Task 8: 重新设计作品详情页
  - [x] SubTask 8.1: 优化页面头部布局和排版（kicker 行 + 错峰入场动画 + 行高优化）
  - [x] SubTask 8.2: 优化图片画廊的展示效果（figure/figcaption + 微光加载 + 毛玻璃查看器）
  - [x] SubTask 8.3: 优化标签和元信息的展示样式（accent 强调款 + hover 交互）

## Phase 5: 动画系统升级

- [x] Task 9: 升级动画效果
  - [x] SubTask 9.1: 优化页面滚动动画（统一 cubic-bezier 曲线 + CSS 变量错峰）
  - [x] SubTask 9.2: 优化作品卡片的进入动画（opacity + y + scale 列内错峰）
  - [x] SubTask 9.3: 优化 hover 交互动画（全部 GPU 加速属性）
  - [x] SubTask 9.4: 确保所有动画在低端设备上也能流畅运行（prefers-reduced-motion 全量降级）

## Phase 6: 性能优化

- [x] Task 10: 优化加载性能
  - [x] SubTask 10.1: 评估并优化图片加载策略（移除错误的 priority,全部改 lazy）
  - [x] SubTask 10.2: 优化动画性能（修复 particle-bg 的 layout thrashing,全部 GPU 加速）
  - [x] SubTask 10.3: 优化首屏加载时间（添加 CDN preconnect,LazyMotion 减少 JS 体积 728KB→682KB）
  - [x] SubTask 10.4: 测试并确保首屏加载 < 2s（热缓存 ~455ms,远低于目标）

## Phase 7: 测试验证

- [x] Task 11: 全面测试
  - [x] SubTask 11.1: 运行 `npm run lint` 确保无错误 ✅
  - [x] SubTask 11.2: 运行 `npm run typecheck` 确保无错误 ✅
  - [x] SubTask 11.3: 运行 `npm run build` 确保构建成功 ✅
  - [x] SubTask 11.4: 运行 `npm run test:e2e` 确保所有测试通过 ✅ (29/29)
  - [x] SubTask 11.5: 在 retina 屏上验证图片清晰度 ✅ (缩略图 1600px + 90% 质量)
  - [x] SubTask 11.6: 测试浅色/深色主题切换 ✅
  - [x] SubTask 11.7: 测试移动端响应式布局 ✅

# Task Dependencies

- Task 2-3 (设计系统) 是 Task 4-8 (界面重设计) 的基础，必须先完成
- Task 1 (图片修复) 可以独立进行，与其他任务无依赖
- Task 9 (动画) 依赖 Task 4-8 (界面元素) 完成
- Task 10 (性能) 可以在任何时候进行，但建议在界面定稿后优化
- Task 11 (测试) 必须在所有任务完成后进行

# Parallelizable Work

- Task 1 (图片修复) 可与 Task 2-3 (设计系统) 并行
- Task 4 (Hero), Task 5 (卡片), Task 7 (About/Contact) 可并行
- Task 8 (详情页) 相对独立，可与首页任务并行
