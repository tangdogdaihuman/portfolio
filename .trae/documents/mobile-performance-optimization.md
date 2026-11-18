# 移动端 UI 动效性能优化计划

## 概要

用户反馈修正：**滑动滚动没问题，是 UI 动效（framer-motion 动画）非常卡**。根因不是背景 30fps 帧率限制（那只影响 canvas 自己，不影响动效），而是**主线程被背景 canvas 每帧的全屏模糊合成抢占** + **动效涉及的玻璃层实时大面积模糊**。两条修复主线（已与用户确认）：移动端玻璃模糊适度降低；移动端极光背景降帧降分辨率并去掉每帧全屏模糊通道。桌面端零改动。

## 根因分析（为什么动效卡，而不是滑动卡）

1. **canvas 每帧全屏 `ctx.filter = blur(12px)` 是主线程杀手**
   [aurora-canvas.tsx:340](file:///c:/Users/admin/Desktop/个人网站2/components/aurora-canvas.tsx#L340)。2D canvas 的 filter 模糊在多数移动端浏览器（尤其 Android Chrome / 旧 iOS WebKit）走 CPU 或昂贵的多通道 shader，全屏 × 30fps × 两道模糊（主模糊 + bloom [L347](file:///c:/Users/admin/Desktop/个人网站2/components/aurora-canvas.tsx#L347)）把主线程占满。framer-motion 的动效由主线程 rAF 驱动，主线程被占 → 动效丢帧。这就是为什么"别人炫酷效果也流畅"：高性能站点不会在主线程上逐帧做全屏模糊。

2. **玻璃模糊层参与动效时逐帧重算**
   移动菜单弹开（glass-strong blur 36px，scale/opacity 动画）、手风琴展开（.glass + height 动画）、BackToTop 出现（glass-strong）、粘性筛选栏（glass-solid blur 40px）——backdrop-filter 的元素做 transform/height 动画时，其背后的模糊要随动画逐帧重算，移动端直接掉帧。

3. **作品卡 hover 玻璃面板白占层**
   [home-client.tsx:234-239](file:///c:/Users/admin/Desktop/个人网站2/components/home-client.tsx#L234-L239) 每张卡一个 `glass-strong` 层，触屏永不触发 hover，纯增加合成负担。

### 已有优化（不重复做）
- 极光移动端已有性能档位（30fps、0.45–0.5x、后台暂停、100lvh）；Lenis 与 hero 滚动 blur 已在粗指针禁用；轮询 5 分钟且有节流；scroll 监听全部 passive + rAF；自定义光标移动端已隐藏。

## 修改方案

### 1. `components/aurora-canvas.tsx` — 解放主线程（最关键）

只调 `getPerformanceProfile()` 档位参数 + `composeFrame()` 条件模糊，不动架构：

- `getPerformanceProfile()`（L60-82）：
  - 粗指针档：`mainBlur` 12 → **0**（跳过每帧全屏主模糊，这是解放主线程的核心），`targetFps` 30 → **24**，`dynamicScale` 0.5 → **0.4**，`bloomAlpha` 0.12 → 0.16（补偿柔化）
  - 低端档：`mainBlur` 9 → **0**，`targetFps` 30 → **20**，`dynamicScale` 0.7 → **0.55**，`bloomAlpha` 0.18 → 0.22
  - 桌面档全部参数不变
- `composeFrame()`（L335-356）：`mainBlur > 0` 时才设置 `ctxB.filter`，否则直接 drawImage。效果层只有 0.4x 分辨率，放大回全屏自带柔化，配合保留的 bloom 通道维持现有柔光观感（bloom 在 0.5x 小图层上做，代价低）。
- light mode 的 `LIGHT_*` 常量不动。

### 2. `app/globals.css` — 粗指针玻璃降载

`@layer components` 之后新增 `@media (pointer: coarse)` 块（桌面零影响）：

- 模糊半径约减半、降低 saturate 倍率：
  - `.glass`：blur(28px) saturate(180%) → **blur(14px) saturate(150%)**
  - `.glass-strong`：blur(36px) saturate(190%) → **blur(18px) saturate(160%)**
  - `.glass-chip`：blur(18px) saturate(160%) → **blur(10px) saturate(140%)**
  - `.glass-solid`：blur(40px) saturate(200%) → **blur(16px) saturate(150%)**
- 同块内对 `:root, .dark` 和 `.light` 微调 `--glass-bg` / `--glass-bg-strong` / `--glass-chip-bg` 的 alpha（约 +0.1~0.14），补偿模糊降低后的通透度，保持观感接近。
- 新增 `.work-card-hover { display: none }`（仅 coarse 块内），移除触屏永不显示的 hover 模糊层。
- marquee 的 blur(6px)、深色模式 4 层 text-shadow 保持不动。

### 3. `components/home-client.tsx` — 加钩子类名

- L234 作品卡 hover 面板容器 `div` 加 className `work-card-hover`。其余结构、动画、布局不动。

### 明确不做

- 不动后端、API、类型契约；不引入 content-visibility/虚拟滚动（与 `AnimatePresence popLayout` 布局动画冲突风险）；图片保持 `unoptimized`；桌面端任何视觉/行为不变；不改 framer-motion 动画本身（主线程解放后自然恢复流畅）。

## 验证

按 AGENTS.md 顺序：`npm run lint` → `npm run typecheck` → `npm run test:schema` → `npm run build` → `npm run test:e2e`（8 个 spec 全跑，重点看 mobile-hero-effects / desktop-cursor 无回归）。

通过后按 Git 约定 commit + push（先确认当前分支；线上 tangzihang.top 只跟 master，若在 redesign 分支则按既定方式合入 master）。

真机验证（用户侧）：重点感受打开移动菜单、展开"关于我"手风琴、BackToTop 出现、首屏 hero 入场、作品卡入场这些**动效**是否顺滑，以及深浅色切换后观感。

## 2026-11-18 补充二：滚动不再暂停极光

用户反馈滚动时极光"停了"。原 scroll → paused（停手 200ms 恢复）保护移除：改为 scroll → `scrolling` 标志，滚动期间**主线程路径全设备 1/4 帧率**（`frameBudget*4` + `motionScale*4` 补偿流速；CI 双核软件渲染实测全帧率会拖慢交互）、**worker 路径粗指针半帧率**（`budget*2` + `motionScale*2`），桌面 worker 全帧率；极光为慢速环境动画，降帧后漂移仍清晰可见。`document.hidden` 暂停与 reduced-motion 静态保留。worker 帧遥测改为每 6 帧一次以便 e2e 在降帧下采样（`mobile-hero-effects.spec.ts` 新增"滚动期间极光保持动态"）。

## 2026-11-17 补充：首页平面化（preview/flat-immersive 分支样品）

用户确认新方向：参考 Elias Voss 模板平面化 + 更强沉浸感。首页 `home-client.tsx` 的玻璃层全部替换为新增平面类 `.panel` / `.panel-strong` / `.chip`（纯 alpha 合成、无 backdrop-filter，移动端零模糊开销）；`.glass*` 仅保留给后台与作品详情页。首屏新增双层透视作品墙（`.wall-*`：CSS 3D 倾斜 + 慢漂移 + 滚动差速视差，移动端隐藏远层、减弱倾斜），复用 R2 webp 缩略图；极光背景与其移动端档位不变。`ThemeToggle` 新增 `flat` prop，首页传 `flat`。本文档前述"桌面端零改动"约束已被该新方向取代。
