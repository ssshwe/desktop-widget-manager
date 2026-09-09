# Windows 小组件显示层级

## 模式

每个小组件在 `config.json` 的独立配置中保存 `windowMode`：

- `desktop`：默认值。窗口保持为可交互的顶层工具窗口，原生模块把它动态放在普通应用窗口之后、Windows 桌面宿主之前。
- `normal`：停止桌面层维护，按普通 Electron 窗口层级运行。
- `alwaysOnTop`：停止桌面层维护，使用 Electron `BrowserWindow.setAlwaysOnTop(true)`。

旧版 `pinned` 配置会在组件首次创建时迁移；`pinned` 字段暂时作为兼容镜像保留，新代码只应读写 `windowMode`。

## 调用链

```text
管理中心或组件设置
→ window.api.setWidgetWindowMode(widgetId, mode)
→ Preload
→ IPC 白名单校验
→ widgetWindowService（配置持久化）
→ windowModeService（三态切换和降级）
→ desktopWindowService（原生模块加载边界）
→ windows_desktop_zorder.node
→ WinEvent / TaskbarCreated / SetWindowPos
```

渲染进程不会收到或传入 HWND，也不能加载 Node.js 或原生模块。

## 原生实现

原生模块使用 C++ 与 Node-API（`NAPI_VERSION=8`），不依赖 V8 私有 ABI。它查找 `Progman`、`WorkerW` / `SHELLDLL_DefView` 所在桌面宿主，维护已登记 HWND，并用 `SetWindowPos` 将组件放到桌面宿主上方。模块不会调用 `SetParent`，也不会修改 `GWLP_HWNDPARENT`。

事件来源包括前台窗口变化、最小化、窗口显示/隐藏、`TaskbarCreated`、显示配置、系统设置和电源恢复。另有 1500ms 低频校验作为事件丢失的兜底；不存在高频抢占 Z 轴的轮询。

Explorer 重启时，隐藏的原生监控窗口接收 `TaskbarCreated`，重新查找桌面宿主，并对仍有效且处于 `desktop` 模式的 HWND 重新应用层级。窗口关闭时立即注销 HWND；应用退出时停止 WinEvent、计时器和监控线程。

## 构建与 ABI

当前 Electron 版本为 42.5.0，本机 `electron --abi` 返回 146。开发构建命令：

```powershell
npm install
npm run build:native
npm start
```

原生构建会显式下载 Electron 42.5.0 头文件并生成 x64 Node-API 模块：

```text
native/windows-desktop-zorder/build/Release/windows_desktop_zorder.node
```

安装包构建：

```powershell
npm run build
```

该命令先重建原生模块，再执行 electron-builder；`.node` 文件通过 `asarUnpack` 放到 `app.asar.unpacked`，加载器兼容开发与打包路径。

## 降级

以下情况不会终止 Electron：原生模块未编译、加载失败、架构或 ABI 不兼容、桌面宿主未找到、HWND 无效、`SetWindowPos` 失败。请求的 `desktop` 模式会变为 `normal`，窗口保留，错误写入日志与组件配置的 `windowModeError`。

## 多显示器与 DPI

窗口位置和尺寸继续使用 Electron 的 DIP 坐标。`display-added`、`display-removed`、`display-metrics-changed`、系统恢复和解锁后，窗口会与最近显示器工作区比较；仅把越界窗口移回可见区域，不重置其他组件布局。尺寸大于工作区时会收敛到工作区大小。

## 自动化验证

```powershell
npm run test:window-modes
npm run test:native-fallback
npm run test:regression
npm run test:regression:native
```

- `test:window-modes`：真实 HWND、桌面注册、顶层/无所有者、Z 轴位置、普通模式、始终置顶、无效句柄。
- `test:native-fallback`：模拟原生模块加载失败，验证保留窗口并降级。
- `test:regression`：跳过真实桌面变更的完整业务回归。
- `test:regression:native`：启用真实 Node-API 层级的六类组件完整回归。

## Windows 人工验收

1. 启动应用，打开时钟，选择“固定到桌面”。确认可点击、拖动、缩放、右键，且任务栏与 Alt+Tab 没有多余入口。
2. 打开资源管理器、浏览器和 Word，确认普通软件能覆盖组件；返回桌面时组件恢复。
3. 连续两次按 `Win + D`，再点击任务栏最右侧“显示桌面”，确认组件不会永久消失、最小化或变成置顶窗口。
4. 把模式切为“普通窗口”，确认不再维护桌面层；切为“始终置顶”，确认位于普通应用上方；再切回桌面，确认置顶完全解除。
5. 在三种模式间切换后重启应用，确认每个组件独立恢复。
6. 在任务管理器中重启 Windows 资源管理器，确认窗口不重建但桌面层恢复。
7. 插拔显示器、切换主屏、改变分辨率和缩放比例，确认组件仍在可见工作区且内容没有明显裁切。
8. 锁屏并唤醒，确认桌面模式恢复。
9. 临时移走 `.node` 文件后启动，确认应用仍启动、组件保留且桌面模式降级为普通窗口。

自动化无法代替第 2、3、6、7、8 项对真实 Windows Shell 行为的肉眼验收；这些项目在发布前必须按上述步骤执行。
