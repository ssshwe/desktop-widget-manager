# 快速便签同层更多菜单 Design QA

## 对照证据

- 问题截图（旧 QUICK CONTROL 大面板）：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-7a876f07-30ae-4a56-87b5-55906677d1ff.png`
- 目标样式（快捷收纳区菜单）：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-90780b0e-1b59-4a6d-a291-b47a52fea07c.png`
- 修改后快速便签菜单：`output/qa/notes-initial-size/menu.png`
- 参考与实现并排：`output/qa/notes-initial-size/menu-comparison.png`
- 正常态：`output/qa/notes-initial-size/implementation.png`
- 搜索态：`output/qa/notes-initial-size/search.png`
- 编辑态：`output/qa/notes-initial-size/editor.png`

## 视觉核对

- P0：无。菜单在快速便签窗口内部展开，不再创建或显示全局 `QUICK CONTROL / 组件控制` 大面板。
- P1：无。菜单与右上角三个点对齐，位于标题栏下方；白色微玻璃表面、蓝灰描边、15px 圆角、柔和阴影、纵向图标文字行与快捷收纳区菜单一致。
- P2：无。标准 380 × 500 窗口内菜单矩形为 `left=185, top=49, right=369, bottom=304`，六个操作项均未越出组件边界；未出现横向溢出、根节点溢出或渲染错误。

## 功能核对

- 新建便签：创建便签并打开编辑器。
- 搜索便签：关闭菜单并打开内嵌搜索栏。
- 切换紧凑模式：在 380 × 500 与 340 × 440 间切换，菜单文案同步更新。
- 固定到桌面：在桌面固定与普通窗口模式间切换。
- 恢复默认布局：恢复 380 × 500、100% 不透明、未锁定、固定桌面。
- 隐藏组件：更新组件可见状态并关闭窗口。
- 点击菜单外部或按 Esc：关闭菜单；不会影响正常便签列表、编辑器和底部快速输入。

## 自动验证

- `npm run qa:notes:initial`：通过；菜单 6 项、`withinWidgetLayer=true`、渲染错误 0。
- `npm run qa:notes`：通过；六便签滚动列表中菜单仍位于组件内部，渲染错误 0。
- `npm run test:notes`：4/4 通过。
- `npm run test:regression`：快速便签新增的“同层紧凑菜单并执行操作”测试通过；快速便签新增、编辑、自动保存、分类、置顶、搜索、刷新恢复、删除和 IPC/渲染稳定性全部通过。

## 范围外提示

- 全量回归仍有 1 项既有快捷收纳区失败：其设置面板未提供测试脚本期望的三种显示层级选项（返回空数组）。本次没有修改快捷收纳区设置面板。

final result: passed

# Clock widget design QA — 2026-07-18

## Comparison target

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-d471ace7-3ac6-4338-89c8-36975df4f322.png`
- Source comparison crop: the 986 × 655 clock card, normalized to 560 × 370.
- Implementation screenshot: `output/qa/clock-reference/implementation-560x370.png`
- Full-view comparison: `output/qa/clock-reference/comparison-reference-and-implementation.png`
- Focused regions: the supersized `10:08` time lockup and the lower weather/date columns are both legible in the full comparison, so a separate crop was not needed.
- Viewport and state: 560 × 370, glass theme, reference content (`10:08`, 晴, `26°C`, `7月18日`, 星期五).
- Responsive evidence: `output/qa/clock-reference/implementation-300x200.png`

## Findings

- No actionable P0, P1, or P2 differences remain.
- The implementation intentionally uses the current desktop background behind a translucent blue-grey surface; the source card contains a wallpaper-specific blurred reflection that is not portable to a desktop widget window.

## Comparison history

1. First pass found a P1 hierarchy drift: the time lockup was too narrow/light and the lower details sat too high. Fixed by widening the display type, increasing its optical weight, and moving the detail row to the source rhythm. Evidence: the second comparison in `comparison-reference-and-implementation.png`.
2. Second pass found P2 alignment drift in the lower columns. Fixed by independently aligning the weather content, date column, and vertical divider to the reference grid. Evidence: final comparison image above.

## Required fidelity surfaces

- Fonts and typography: Segoe UI Variable Display is used for a thin, high-contrast digital time treatment; Microsoft YaHei UI preserves clear Chinese date, weekday, and weather copy.
- Spacing and layout rhythm: large time, one horizontal divider, and balanced lower left/right columns match the reference hierarchy at 560 × 370 and remain unclipped at 300 × 200.
- Colors and visual tokens: a cool translucent blue-grey glass surface, bright edge stroke, restrained inner highlight, and low-contrast divider follow the source's desktop-glass treatment.
- Image and icon fidelity: the existing yellow weather-sun asset is used directly; no CSS-drawn or inline-SVG substitute was introduced.
- Copy and content: only time, condition, temperature, date, and weekday are displayed. Live weather comes from the existing weather cache/refresh pipeline.

## Implementation checklist

- [x] Use live `HH:mm`, date, weekday, condition, and temperature values.
- [x] Preserve continuous semantic time updates without rebuilding the time node.
- [x] Hide the in-card title/action strip and keep the component visually single-purpose.
- [x] Pass renderer layout checks at 560 × 370 and 300 × 200.
- [x] Pass `npm run test:regression` (36/36).

## Follow-up polish

- [P3] None required for handoff.

final result: passed
