# 桌面小组件 UI 改版：视频风格可执行分步骤 Prompt

下面这些 prompt 是给 Codex / AI 编程助手直接执行用的。按顺序执行，不要跳步。每一步都必须强制对齐参考视频的卡片样式、排版、圆角、配色和动效。

参考视频证据目录：

```text
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/
```

重点参考文件：

```text
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/contact_sheet.png
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/ui_motion_notes.md
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/motion_strips/
```

项目目录：

```text
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/desktop-widget-manager/
```

---

## 总设计锁定 Prompt

先复制执行这一段，让执行者明确审美目标。

```text
你要改造的是 Electron 桌面小组件项目：
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/desktop-widget-manager/

这次不是普通玻璃拟态美化。必须严格学习这个视频里的 UI 语言：
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/contact_sheet.png

同时阅读：
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/ui_motion_notes.md
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/motion_strips/

设计目标：
1. 所有小组件都要像视频里的“空间 UI 概念卡片”，不是普通后台表单。
2. 每个小组件必须有一个明确的主视觉焦点：大数字、3D 风格对象、进度核心、时间线核心或文件夹对象。
3. 卡片必须是视频里的大圆角、玻璃、柔光、浮动、强层次：主卡 26-34px 圆角，小卡 16-22px 圆角，按钮/胶囊 999px 或 12-16px。
4. 配色必须学习视频：紫蓝、青色、电蓝、薄荷绿、珊瑚橙、暖黄，不要只用单一蓝色。
5. 排版必须学习视频：大主视觉 + 少量悬浮信息卡 + 底部 dock/胶囊控制，不要满屏表单。
6. 动效必须学习视频：卡片错峰进入、主物体轻微漂浮、数字平滑切换、进度/路径绘制、hover 轻微浮起。不要只写 hover 变色。
7. 保持桌面小组件可用：拖拽、右键菜单、透明度、大小、锁定、置顶、天气刷新、待办增删改查、日程增删改查、文件夹展开都不能坏。
8. 如果需要主视觉资产，使用真实或生成的 bitmap/WebP/PNG 资产，不要用文字、emoji、ASCII、占位方块、手写 SVG 冒充。
9. 如果无法生成资产，先用纯 CSS 渐变玻璃形体做低风险过渡，但必须把资产缺口列出来，不要假装完成视频级效果。
10. 每一步完成后必须启动或检查应用，并截图/描述视觉是否贴近视频。

先只阅读项目和参考图，不要改代码。读完后输出你对视频风格的 10 条具体设计规则，并指出项目里哪些现有 class/组件需要改。
```

---

## 第一阶段阅读结论：视频风格规则与改造对象

这一节是执行“总设计锁定 Prompt”后的阅读结论，后续 Prompt 1-13 都必须以这些规则为约束。

### 已完成的阅读范围

已按要求完成“只阅读，不改代码”。已阅读参考视频关键帧、动效条、`ui_motion_notes.md`，并对照阅读当前 Electron 小组件结构和样式。

### 10 条视频风格规则

1. 先做场景，不先做表单：每个小组件要先有一个完整“空间卡片场景”，再把数据和操作放进去。
3. 主卡必须大圆角：外层主卡接近 26-34px，小浮动卡 16-22px，dock/按钮使用胶囊或 12-16px。
4. 卡片要分层漂浮：不能只有一个平面白卡，要有主卡、悬浮数据卡、底部 dock、微小状态 chip。
5. 配色必须多色协作：紫蓝做主视觉，青色/电蓝做交互，薄荷绿做完成，珊瑚橙做提醒，暖黄做时间/警示。
6. 排版是“大对象 + 少量信息卡”：不要把所有字段摊成表格/表单，信息要围绕主视觉分布。
7. 控件要 dock 化：输入框、刷新、提交、尺寸、透明度设置都应像视频底部控制条，不像后台表单按钮。
8. 动效要有空间节奏：主卡入场、浮动卡错峰、主物体缓慢漂浮、进度/路线绘制、hover 轻微上浮。
9. 文字层级靠大小对比：大数字/大标题非常突出，小标签很轻，不靠堆很多说明文字。
10. 资产不能假装：文件夹、天气、进度核心等主视觉最好用真实 bitmap/PNG/WebP；没有资产时只能先用 CSS 软 3D 形体过渡，并标明缺口。

### 需要改的核心文件

- `src/styles/widget.css`：全局视觉系统、圆角、配色、玻璃层、动效、所有小组件样式。
- `src/widget.html`：外层 `.widget-card` / `.widget-content` 容器结构。
- `src/widgetRenderer.js`：右键菜单、设置面板、尺寸/透明度/锁定/置顶 UI。
- `src/widgets/clockWidget.js`：时钟小组件渲染结构。
- `src/widgets/weatherWidget.js`：天气小组件渲染结构。
- `src/widgets/todoWidget.js`：待办小组件渲染结构。
- `src/widgets/scheduleWidget.js`：日程小组件渲染结构。
- `src/widgets/floatingFolderWidget.js`：悬浮文件夹小组件渲染结构。

### 需要重点改的 class / 组件

- 全局壳层：`.widget-card`、`.widget-content`、`.widget-drag-bar`、`.window-action`
- 菜单设置：`.widget-context-menu`、`.widget-settings-popover`、`.widget-menu-group`、`.widget-size-grid`
- 时钟：`.clock-widget`、`.clock-time`、`.clock-meta`、`.clock-mode`
- 天气：`.weather-widget`、`.weather-widget-head`、`.weather-source`、`.weather-hero`、`.weather-symbol`、`.weather-metrics`、`.weather-form`、`.weather-footer`
- 待办：`.todo-widget`、`.todo-form`、`.todo-list`、`.todo-item`、`.todo-check`、`.priority-pill`、`.due-today-pill`、`.todo-actions`
- 日程：`.schedule-widget`、`.schedule-form`、`.schedule-list`、`.schedule-item`、`.schedule-time-chip`、`.schedule-remind-pill`
- 悬浮文件夹：`.floating-folder-compact`、`.floating-folder-icon`、`.floating-folder-expanded`、`.floating-folder-head`、`.floating-folder-toolbar`、`.floating-file-row`

### 当前项目判断

当前项目已有玻璃底子，但还只是“干净小组件”。真正贴近视频，需要先重构视觉语言：新增统一的 `video-scene` / `video-hero` / `video-floating-card` / `video-action-dock` 这类结构，再逐个把六个小组件从表单/列表改成空间概念卡。

---

## Prompt 1：先修复基础乱码和语法问题

目的：先把中文和模板字符串问题处理掉。否则后续视觉做得再好也会显得粗糙。

```text
请在项目中执行第一步：基础可用性修复。

项目目录：
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/desktop-widget-manager/

目标文件：
- package.json
- src/widget.html
- src/widgetRenderer.js
- src/widgets/clockWidget.js
- src/widgets/weatherWidget.js
- src/widgets/todoWidget.js
- src/widgets/scheduleWidget.js
- src/widgets/floatingFolderWidget.js

任务：
1. 检查这些文件中所有乱码中文、缺失引号、错误闭合标签、错误模板字符串。
2. 把中文文案恢复为正常简体中文。
3. 不改业务逻辑，不改 IPC，不重构服务层。
4. 保留所有 id 和 data-* attribute，避免事件绑定失效。
5. 修复 package.json 中 productName、description、artifactName 等乱码。

完成后验证：
1. npm start 能启动。
2. 打开管理窗口无语法错误。
3. 六种小组件都能打开。
4. 控制台没有因为模板字符串导致的 JS parse error。

输出：
- 列出修复的文件。
- 列出修复前最严重的乱码/语法问题。
- 明确说明没有改业务逻辑。
```

---

## Prompt 2：建立视频风格设计 Token 和基础卡片系统

目的：先做全局风格骨架，让后面的每个组件都共用同一套视频感。

```text
请执行第二步：建立视频风格的全局视觉系统。

必须先打开并观察：
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/contact_sheet.png

重点学习这些帧：
- 01 / 19 / 20：白底健康仪表盘，大圆角主卡 + 浮动数据卡。
- 06 / 07 / 08：车载路线界面，景深背景 + 菱形浮动卡 + 中央主视觉。
- 15 / 16：AI Builder，左侧紫色工具栏 + 白色大画布 + 3D 球体对象。
- 24 / 25：蓝紫路线控制面板，路线线条 + 车辆主视觉 + 底部控制卡。
- 28 / 29：家居 storehouse，左侧大产品对象 + 右侧列表 + 底部 dock。

目标文件：
- src/styles/widget.css

任务：
1. 在 :root 中新增视频风格 token：
   - 空间圆角：主卡 30px，中卡 22px，小卡 16px，胶囊 999px。
   - 视频配色：violet、electric-blue、cyan、mint、coral、amber、ink、mist。
   - 玻璃背景：强玻璃、中玻璃、弱玻璃。
   - 高光边框：白色半透明边、内发光、柔和投影。
   - 动效时长：fast 160ms、base 280ms、slow 560ms。
   - ease：强 ease-out、soft spring。
2. 改造 .widget-card：
   - 大圆角。
   - 多层渐变背景。
   - 玻璃模糊。
   - 柔光高光边框。
   - 伪元素增加微妙光带和层次，但不要使用明显装饰圆球。
3. 新增通用 class：
   - .video-scene
   - .video-hero
   - .video-hero-object
   - .video-floating-card
   - .video-stat-card
   - .video-action-dock
   - .video-chip
   - .video-icon-button
   - .video-list-card
   - .video-enter-stagger
4. 新增 keyframes：
   - video-card-enter：opacity + translateY + scale。
   - video-float：微弱上下浮动。
   - video-pulse-glow：柔和光晕。
   - video-progress-sheen：进度光带移动。
5. 添加 prefers-reduced-motion 降级。

严格要求：
- 不要把页面做成普通蓝白后台卡片。
- 不要只有 box-shadow 和 backdrop-filter，必须有视频里的“主卡 + 浮动卡 + 柔光层”的基础。
- 不要改 JS 逻辑。
- 不要破坏 no-shadow、dark、glass 主题。

完成后输出：
- 新增的 token 列表。
- 新增的通用 class 列表。
- 说明这些 class 如何对应视频里的卡片/动效语言。
```

---

## Prompt 3：重做时钟小组件，作为视频风格样板

目的：用最简单组件先确立“不是普通文本时钟，而是空间时间卡”的样板。

```text
请执行第三步：重做时钟小组件 UI。

参考视频方向：
- 参考 contact_sheet 01、19、20：白色主卡、中央人物/主对象、大数字、周围浮动卡。
- 参考 17、18：大数字 + 底部 dock + 立体主视觉。

目标文件：
- src/widgets/clockWidget.js
- src/styles/widget.css

必须保留：
- #clock-time
- #clock-date
- #clock-weekday
- updateClockElements 的每秒刷新逻辑
- params.name 展示

设计要求：
1. 时钟不再只是居中文本，要变成“时间仪表盘场景”。
2. 中央主视觉是超大时间数字，背后有柔和圆环/光带/玻璃盘。
3. 日期、星期、24 小时制分别做成 3 个浮动小卡，围绕主时间摆放。
4. 卡片圆角必须大：主场景 28-32px，小卡 16-20px。
5. 配色使用白/雾灰底 + electric-blue / cyan / violet 点缀，不要单一蓝。
6. 字体层级：
   - 时间 44-72px，tabular nums。
   - 日期 12-14px。
   - 小标签 10-11px。
7. 加入入场动效：
   - 主时间 scale + fade。
   - 小卡错峰进入。
   - 背后光环缓慢 pulse。

交互/性能要求：
1. 每秒只更新 #clock-time 文本，不要每秒重建 DOM。
2. 动效不能导致数字抖动。
3. 小尺寸下日期和星期不能重叠。
4. reduced motion 下关闭漂浮和 pulse。

验收：
- 看起来像参考视频里的空间 UI 卡片，不像普通时钟。
- 透明背景桌面上仍然可读。
- light/dark/glass 三主题都能看。
```

---

## Prompt 4：重做天气小组件，做成视频里的 3D 天气状态卡

目的：天气最适合贴近视频里的主物体 + 信息卡结构。

```text
请执行第四步：重做天气小组件 UI。

参考视频方向：
- contact_sheet 24 / 25：蓝紫路线卡、主车辆对象、浮动天气/温度数据。
- contact_sheet 12：饮品/香氛主物体 + 右侧小图标控制。
- contact_sheet 06 / 07 / 08：场景背景 + 中央主对象 + 多个浮动状态卡。

目标文件：
- src/widgets/weatherWidget.js
- src/styles/widget.css

必须保留：
- #weather-city
- #weather-city-name
- #weather-symbol
- #weather-condition
- #weather-current-temp
- #weather-high-temp
- #weather-low-temp
- #weather-air-quality
- #weather-source
- #weather-updated-at
- #weather-city-form
- #weather-refresh-btn
- #weather-message
- 所有天气 IPC 调用和刷新逻辑

设计要求：
1. .weather-hero 改成“天气场景主卡”，不是普通两列卡片。
2. 主视觉区域：
   - 左/中放一个大型天气对象，可以是圆形玻璃天气球、云雾胶囊、太阳/月亮抽象物。
   - 如果能生成 bitmap/WebP 天气对象资产，放在 src/assets/widget-visuals/，并在 widget 中引用。
   - 如果暂时不用资产，使用 CSS 渐变玻璃形体，但必须看起来像视频里的 3D 软对象，不要像普通 icon。
3. 当前温度作为大数字贴在主视觉旁边，字号 42-66px。
4. 最高、最低、空气质量改成 3 张悬浮数据卡，不要普通 grid 块。
5. 城市输入和刷新按钮改成底部 video-action-dock：
   - 输入像胶囊搜索框。
   - 刷新是圆形/胶囊按钮。
6. source chip 放右上角，像视频里的状态标签。
7. 背景用蓝紫/青色柔光渐变，但文字区域保持白/深色可读。

动效要求：
1. 首次进入：天气对象先入场，小卡再错峰进入。
2. 刷新按钮点击：天气对象轻微上浮/旋转，温度淡入切换。
3. 浮动天气对象做 4-6s ambient float。
4. reduced motion 下关闭循环漂浮。

验收：
- 一眼能联想到视频里的空间产品卡，而不是普通天气表单。
- 输入城市、保存、刷新仍可用。
- 三个指标卡不重叠，compact 下可以自动变成横向/纵向紧凑布局。
```

---

## Prompt 6：重做待办小组件，减少表单感，做成任务空间卡

目的：把待办从“表单 + 列表”变成“今日任务主视觉 + 轻量输入 dock + 浮动列表”。

```text
请执行第六步：重做待办小组件 UI。

参考视频方向：
- contact_sheet 01 / 19 / 20：健康仪表盘，左侧数据、中央主视觉、右侧状态卡。
- contact_sheet 28 / 29：storehouse，左侧大对象，右侧列表，底部 dock。

目标文件：
- src/widgets/todoWidget.js
- src/styles/widget.css

必须保留：
- #todo-form
- #todo-edit-id
- #todo-title
- #todo-content
- #todo-priority
- #todo-due-time
- #todo-submit-btn
- #todo-cancel-edit-btn
- #todo-message
- #todo-list
- #todo-count
- 所有 data-edit-todo-id / data-delete-todo-id / data-toggle-todo-id
- 所有 create/update/delete/complete IPC 逻辑

设计要求：
1. 顶部做 todo-hero：
   - 大数字显示未完成数量。
   - 旁边显示“今日任务 / 到期状态”的小浮动卡。
   - 使用 coral/amber/mint 表达高优先级、今日到期、已完成。
2. 表单不要像大块后台表单：
   - 默认视觉像底部 action dock。
   - 标题输入是主输入。
   - 内容、优先级、截止时间可以仍显示，但要排列成轻量胶囊/小字段，不要厚重表单。
3. 列表项改成视频里的半透明浮动卡：
   - 左侧完成圆形/方圆 checkbox。
   - 中间标题和内容。
   - 右侧编辑/删除按钮改成小 icon-like 胶囊按钮。
   - 到期/优先级标签是小 pill。
4. 空状态要像一张轻柔的提示卡，不是 dashed 普通框。

动效要求：
1. 新增任务：item 从下方/上方轻微滑入并淡入。
2. 完成任务：checkbox 填充，item opacity 降低，标题删除线平滑出现。
3. 删除任务：item 向右淡出后移除。如果不方便做移除动画，至少 hover/点击有反馈。
4. 表单 focus 时 dock 轻微上浮。

验收：
- 待办仍然能新增、编辑、删除、完成。
- 表单存在但视觉上不抢主视觉。
- 列表项和视频里的 floating cards 语言一致。
```

---

## Prompt 7：重做日程小组件，做成今日时间线路线卡

目的：让日程像视频里的路线/旅程卡，而不是普通提醒列表。

```text
请执行第七步：重做日程小组件 UI。

参考视频方向：
- contact_sheet 22 / 23：Board Arca 路线，底部曲线路径和节点。
- contact_sheet 30 / 31 / 32：旅行卡片，背景景深 + 大卡片轮播 + 时间/距离数据。
- contact_sheet 06 / 07 / 08：车载导航，路径和浮动状态卡。

目标文件：
- src/widgets/scheduleWidget.js
- src/styles/widget.css

必须保留：
- #schedule-form
- #schedule-edit-id
- #schedule-title
- #schedule-content
- #schedule-start-time
- #schedule-end-time
- #schedule-remind-time
- #schedule-submit-btn
- #schedule-cancel-edit-btn
- #schedule-message
- #schedule-list
- #schedule-count
- 所有 data-edit-schedule-id / data-delete-schedule-id
- 所有 create/update/delete IPC 逻辑

设计要求：
1. 顶部做“今日路线”主视觉：
   - 大标题/大数字展示今日日程数。
   - 加一条柔和曲线/竖线时间轨道，像路线图。
   - 下一项日程作为主浮动卡。
2. 日程列表改成 timeline：
   - 左侧时间节点。
   - 中间日程卡。
   - 右侧编辑/删除小按钮。
   - 待提醒 / 已提醒 pill 用 amber / mint。
3. 表单视觉改成 action dock 或轻量新增卡。
4. 时间 chip 要像视频里的路线节点，不是普通蓝底标签。

动效要求：
1. 时间线节点错峰入场。
2. 日程状态刷新时只更新对应卡，不整屏闪动。
3. 提醒状态变化时 pill pulse 一次。
4. hover 列表项轻微浮起。

验收：
- 仍可新增、编辑、删除日程。
- 30 秒刷新仍正常。
- 一眼能联想到视频里的路线/旅行/导航 UI。
```

---

## Prompt 8：重做悬浮文件夹，贴近 storehouse / carousel 卡片

目的：让文件夹成为一个精致桌面胶囊，展开后像视频里的 storehouse 文件空间。

```text
请执行第八步：重做悬浮文件夹小组件 UI。

参考视频方向：
- contact_sheet 28 / 29：storehouse，左侧大产品对象，右侧列表，底部 dock。
- contact_sheet 26 / 27：横向产品卡片，强渐变背景，主物体突出。
- motion_strips/store_cards_to_travel_carousel.png：产品对象切换和卡片流动。

目标文件：
- src/widgets/floatingFolderWidget.js
- src/styles/widget.css

必须保留：
- compact / expanded 两种状态
- body class is-floating-folder-expanded
- #floating-folder-title
- #floating-folder-title-expanded
- #floating-folder-path
- #floating-folder-count
- #floating-folder-limit
- #floating-folder-list
- #floating-folder-message
- #floating-folder-choose-btn
- #floating-folder-open-btn
- data-file-index
- 选择文件夹、打开文件夹、打开文件、修改展示数量逻辑

设计要求：
1. compact 状态：
   - 做成一个立体文件夹胶囊。
   - 左侧是 3D 风格文件夹对象/图块。
   - 右侧是标题和数量。
   - 圆角 24-30px，像视频的小产品卡。
2. expanded 状态：
   - 顶部 header 像 storehouse 主卡。
   - 文件路径弱化为小字，不要压过标题。
   - 展示数量输入和打开按钮放进底部/顶部 dock。
   - 文件列表项做成玻璃浮动卡，文件类型是小 pill。
3. 如果能生成文件夹 bitmap/WebP 资产，放入 src/assets/widget-visuals/，不要用“夹”字当最终图标。

动效要求：
1. hover 展开：宽高变化之外，再加 opacity + scale + blur/translate 的轻入场。
2. compact icon 做 4-6s 微漂浮。
3. 文件列表逐项错峰进入。
4. 文件行 hover 轻微右移或浮起。

验收：
- hover 展开/收起顺滑。
- 文件相关操作都可用。
- compact 状态不显得像普通按钮，而像视频里的小型空间卡。
```

---

## Prompt 9：重做右键菜单和设置面板，统一视频卡片语言

目的：小组件主体做漂亮后，菜单不能还是普通弹窗。

```text
请执行第九步：重做小组件右键菜单和设置面板视觉。

参考视频方向：
- contact_sheet 15 / 16：左侧紫色设置面板和底部 material dock。
- contact_sheet 24 / 25：底部控制 dock。
- contact_sheet 28 / 29：底部控制栏。

目标文件：
- src/widgetRenderer.js
- src/styles/widget.css

必须保留：
- #widget-context-menu
- #widget-settings-popover
- data-menu-action
- data-settings-*
- 所有设置功能：编辑、隐藏、删除、尺寸、透明度、置顶、锁定

设计要求：
1. 右键菜单变成浮动玻璃面板：
   - 圆角 18-22px。
   - 背景有 glass blur 和高光边。
   - 分组按钮像视频里的小控制块。
2. 设置面板变成小型 settings dock：
   - 透明度 slider 做成精致控制行。
   - 尺寸按钮做成 segmented control。
   - 置顶和锁定做成 toggle row。
3. 危险操作仍用 coral/red，但不要刺眼。
4. 菜单出现时 scale 0.96 -> 1，opacity 0 -> 1。

验收：
- 所有右键功能仍可用。
- 菜单位置仍不会超出窗口。
- dark/glass 主题可读。
```

---

## Prompt 10：统一动效和状态反馈

目的：不要每个组件动效各写各的，统一成视频感节奏。

```text
请执行第十步：统一所有小组件动效和状态反馈。

参考视频动效规则：
- 大卡入场：450-700ms，strong ease-out。
- 小卡入场：250-400ms，60-120ms 错峰。
- 按钮反馈：120-220ms。
- 主对象漂浮：3-6s loop，轻微 y/rotate。
- 路径/进度绘制：800-1400ms。
- 屏幕不要快切，因为这是生产小组件，不是视频 reel。

目标文件：
- src/styles/widget.css
- 必要时少量修改 src/widgets/*.js 添加 class，不改业务逻辑

任务：
1. 给所有主容器加统一入场。
2. 给浮动卡添加 stagger 变量或 nth-child delay。
3. 给按钮、chip、列表项统一 hover/active transition。
4. 给刷新、完成、提醒、展开状态添加轻量反馈 class。
5. 添加 reduced motion 兜底。
6. 检查所有动画只用 transform / opacity / box-shadow / filter，避免 layout 抖动。

验收：
- UI 感觉更像视频，有生命感。
- 不会一直动到分散注意力。
- reduced motion 可关闭大部分动效。
- 不引入动画库。
```

---

## Prompt 11：三种尺寸适配，不要只做大图好看

目的：视频里的 UI 多是展示画面，但桌面小组件要适配 compact / comfortable / large。

```text
请执行第十一步：完成小组件尺寸适配。

项目里已有尺寸预设：
- compact: 260 x 180
- comfortable: 340 x 300
- large: 420 x 420

目标文件：
- src/styles/widget.css
- 必要时少量调整 src/widgets/*.js 的结构 class

任务：
1. compact：
   - 只保留核心主视觉和 1-2 个关键状态。
   - 表单、长列表、复杂 footer 要压缩或滚动。
2. comfortable：
   - 展示主视觉、关键卡片、基础操作。
3. large：
   - 展示完整列表/表单/更多指标。
4. 使用 CSS container-like 思路或媒体查询，按窗口高度/宽度调整。
5. 禁止文字重叠、按钮溢出、列表挤压主视觉。

每个组件检查：
- clock：compact 下时间不溢出。
- weather：compact 下输入 dock 不挤掉温度。
- todo：compact 下 quick add 和列表不互相压死。
- schedule：时间线在小尺寸下可读。
- floatingFolder：compact 保持小巧，expanded 保持可操作。

验收：
- 三个尺寸都能用。
- 不是只在 large 下漂亮。
```

---

## Prompt 12：视觉 QA，必须对照视频截图修

目的：防止“做完了但不像视频”。

```text
请执行第十二步：视觉 QA 和视频贴合度修正。

必须打开对照：
D:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/azhuomian/.codex_tmp/video_ui_read/74f809961a1c4ef14e7607f3ea469b84/contact_sheet.png

必须重点对照：
- 圆角：是否接近视频的大圆角卡片，而不是普通 8-14px。
- 卡片层次：是否有主卡、浮动小卡、底部 dock。
- 主视觉：每个小组件是否都有一个明显焦点。
- 配色：是否有紫蓝、青色、电蓝、薄荷绿、珊瑚橙、暖黄的组合，而不是单蓝色。
- 排版：是否是“大对象 + 少量信息卡”，不是密密麻麻表单。
- 动效：是否有错峰进入、漂浮、进度/状态反馈。
- 质感：是否有玻璃、高光边、柔和阴影、景深感。

任务：
1. 启动应用。
3. 分别检查 light/dark/glass。
4. 分别检查 compact/comfortable/large。
5. 截图或用浏览器/系统截图记录每个组件。
6. 把截图和 contact_sheet.png 放在一起看，指出不像视频的地方并继续修改。

验收标准：
- 如果只是“干净现代”，不算完成。
- 如果看起来像普通 macOS/Windows 小工具，不算完成。
- 必须有视频里的空间卡片感、圆角卡片语言、渐变配色、主视觉、浮动卡和微动效。

最终输出：
- 每个小组件 1-2 句说明它参考了视频里的哪类画面。
- 列出最终修改文件。
- 列出仍然缺失的 bitmap/3D 资产。
```

---

## Prompt 13：最终回归测试

目的：视觉改完后确认功能没有坏。

```text
请执行第十三步：最终功能回归。

测试范围：
1. 管理端：
   - 创建每一种小组件。
   - 显示/隐藏小组件。
   - 调整透明度。
   - 调整尺寸。
   - 切换 light/dark/glass。
   - 开启/关闭阴影。
2. 小组件：
   - clock：时间持续刷新。
   - weather：保存城市、刷新天气。
   - todo：新增、编辑、删除、完成、取消编辑。
   - schedule：新增、编辑、删除、提醒状态显示。
   - floatingFolder：选择文件夹、展开、打开目录、打开文件、修改展示数量。
3. 交互：
   - 拖拽小组件。
   - 锁定小组件。
   - 置顶小组件。
   - 右键菜单。
   - reduced motion。

要求：
- 发现功能问题先修功能，再微调视觉。
- 不允许为了视觉删除已有功能。
- 不允许破坏 IPC 接口。

最终输出：
- 测试通过清单。
- 失败项和修复说明。
- 最终运行方式。
```

---

## 一句话执行顺序

严格按这个顺序：

```text
总设计锁定 -> Prompt 1 -> Prompt 2 -> Prompt 3 -> Prompt 4 -> Prompt 5 -> Prompt 6 -> Prompt 7 -> Prompt 8 -> Prompt 9 -> Prompt 10 -> Prompt 11 -> Prompt 12 -> Prompt 13
```

